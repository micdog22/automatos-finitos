// Autômatos finitos: Thompson, remoção de ε, construção de subconjuntos,
// minimização, simulação, equivalência, complemento, produto, eliminação de
// estados, editor em texto e JSON. Módulo sem DOM, usado pela página e pelos testes.

import { EPS, conc, epsilon, estrela, expressaoParaTexto, nada, simbolo, simplificar, uniao } from './regex.js';

export { EPS };

/**
 * Autômato: estados 0..n-1.
 *   nomes: string[]          nome de cada estado
 *   alfabeto: string[]       símbolos (sem ε), em ordem
 *   inicial: number
 *   finais: Set<number>
 *   delta: Map<string, Set<number>>[]   delta[q].get(símbolo) = destinos ('ε' para transições vazias)
 */
export function novoAutomato(nomes, alfabeto, inicial = 0) {
  return { nomes: [...nomes], alfabeto: [...alfabeto], inicial, finais: new Set(), delta: nomes.map(() => new Map()) };
}

export function adicionarTransicao(a, de, s, para) {
  if (!a.delta[de].has(s)) a.delta[de].set(s, new Set());
  a.delta[de].get(s).add(para);
}

export function destinos(a, q, s) {
  return a.delta[q].get(s) ?? new Set();
}

/** Todas as transições como lista { de, simbolo, para }, em ordem. */
export function transicoes(a) {
  const out = [];
  a.delta.forEach((mapa, de) => {
    for (const s of [EPS, ...a.alfabeto]) {
      for (const para of [...(mapa.get(s) ?? [])].sort((x, y) => x - y)) out.push({ de, simbolo: s, para });
    }
  });
  return out;
}

export function temEpsilon(a) {
  return a.delta.some((m) => (m.get(EPS)?.size ?? 0) > 0);
}

/** 'AFN-ε', 'AFN', 'AFD' (completo) ou 'AFD parcial'. */
export function tipoAutomato(a) {
  if (temEpsilon(a)) return 'AFN-ε';
  let parcial = false;
  for (const m of a.delta) {
    for (const s of a.alfabeto) {
      const n = m.get(s)?.size ?? 0;
      if (n > 1) return 'AFN';
      if (n === 0) parcial = true;
    }
  }
  return parcial ? 'AFD parcial' : 'AFD';
}

export function ehDeterministico(a) {
  const t = tipoAutomato(a);
  return t === 'AFD' || t === 'AFD parcial';
}

// ---------------------------------------------------------------- Thompson

/**
 * Construção de Thompson, como no livro de Aho, Lam, Sethi e Ullman: cada
 * símbolo vira 2 estados; união, estrela, ? e + criam um início e um fim novos
 * ligados por ε; na concatenação, o fim do primeiro pedaço e o início do
 * segundo viram um único estado. Assim (a|b)*abb tem 11 estados.
 */
export function thompson(arvore, alfabetoExtra = []) {
  const arestas = new Map();
  let proximo = 0;
  const novo = () => {
    arestas.set(proximo, []);
    return proximo++;
  };
  const liga = (de, s, para) => arestas.get(de).push([s, para]);
  // O início de um pedaço nunca recebe transições, e o fim nunca sai: dá para fundir.
  const fundir = (fica, sai) => {
    for (const [s, p] of arestas.get(sai)) liga(fica, s, p);
    arestas.delete(sai);
  };
  const construir = (no) => {
    switch (no.tipo) {
      case 'simbolo':
      case 'eps':
      case 'nada': {
        const i = novo();
        const f = novo();
        if (no.tipo === 'simbolo') liga(i, no.c, f);
        if (no.tipo === 'eps') liga(i, EPS, f);
        return { i, f };
      }
      case 'conc': {
        const A = construir(no.a);
        const B = construir(no.b);
        fundir(A.f, B.i);
        return { i: A.i, f: B.f };
      }
      case 'uniao': {
        const A = construir(no.a);
        const B = construir(no.b);
        const i = novo();
        const f = novo();
        liga(i, EPS, A.i);
        liga(i, EPS, B.i);
        liga(A.f, EPS, f);
        liga(B.f, EPS, f);
        return { i, f };
      }
      default: {
        // estrela, opcional e mais
        const A = construir(no.a);
        const i = novo();
        const f = novo();
        liga(i, EPS, A.i);
        if (no.tipo !== 'mais') liga(i, EPS, f);
        if (no.tipo !== 'opcional') liga(A.f, EPS, A.i);
        liga(A.f, EPS, f);
        return { i, f };
      }
    }
  };
  const { i, f } = construir(arvore);
  // Renumera em largura a partir do início: q0 é o inicial.
  const ordem = [];
  const indice = new Map();
  const visitar = (q) => {
    if (indice.has(q)) return;
    indice.set(q, ordem.length);
    ordem.push(q);
  };
  visitar(i);
  for (let k = 0; k < ordem.length; k++) for (const [, p] of arestas.get(ordem[k])) visitar(p);
  for (const q of [...arestas.keys()].sort((x, y) => x - y)) visitar(q);  // estados inalcançáveis (∅)
  const alfabeto = new Set(alfabetoExtra);
  for (const lista of arestas.values()) for (const [s] of lista) if (s !== EPS) alfabeto.add(s);
  const a = novoAutomato(ordem.map((_, k) => `q${k}`), [...alfabeto].sort(), 0);
  for (const q of ordem) for (const [s, p] of arestas.get(q)) adicionarTransicao(a, indice.get(q), s, indice.get(p));
  a.finais.add(indice.get(f));
  return a;
}

// ---------------------------------------------------------------- ε

/** Fecho-ε: os estados alcançáveis só por transições ε (incluindo os próprios). */
export function fechoEpsilon(a, estados) {
  const fecho = new Set(estados);
  const pilha = [...estados];
  while (pilha.length) {
    const q = pilha.pop();
    for (const p of destinos(a, q, EPS)) {
      if (!fecho.has(p)) {
        fecho.add(p);
        pilha.push(p);
      }
    }
  }
  return fecho;
}

function mover(a, conjunto, s) {
  const out = new Set();
  for (const q of conjunto) for (const p of destinos(a, q, s)) out.add(p);
  return out;
}

/**
 * Remove as transições ε: δ'(q, a) = δ(fecho(q), a), ou seja, primeiro anda
 * por ε e depois lê o símbolo; o fecho depois da leitura fica para o passo
 * seguinte. q é final se o fecho dele tem algum final. Depois tira os estados
 * inalcançáveis: num AFN de Thompson sobram só o inicial e os estados em que
 * se chega lendo um símbolo (um por ocorrência de símbolo na expressão).
 */
export function removerEpsilon(a) {
  const fechos = a.nomes.map((_, q) => fechoEpsilon(a, [q]));
  const b = novoAutomato(a.nomes, a.alfabeto, a.inicial);
  a.nomes.forEach((_, q) => {
    for (const s of a.alfabeto) {
      for (const p of mover(a, fechos[q], s)) adicionarTransicao(b, q, s, p);
    }
    if ([...fechos[q]].some((p) => a.finais.has(p))) b.finais.add(q);
  });
  const { automato, removidos } = removerInalcancaveis(b);
  return {
    automato,
    fechos: fechos.map((f, q) => ({ estado: a.nomes[q], fecho: [...f].sort((x, y) => x - y).map((p) => a.nomes[p]) })),
    removidos,
  };
}

/** Mantém só os estados alcançáveis a partir do inicial (na ordem original). */
export function removerInalcancaveis(a) {
  const alcancados = new Set([a.inicial]);
  const pilha = [a.inicial];
  while (pilha.length) {
    const q = pilha.pop();
    for (const conj of a.delta[q].values()) {
      for (const p of conj) {
        if (!alcancados.has(p)) {
          alcancados.add(p);
          pilha.push(p);
        }
      }
    }
  }
  const manter = a.nomes.map((_, q) => q).filter((q) => alcancados.has(q));
  const novoIndice = new Map(manter.map((q, k) => [q, k]));
  const b = novoAutomato(manter.map((q) => a.nomes[q]), a.alfabeto, novoIndice.get(a.inicial));
  for (const q of manter) {
    for (const [s, conj] of a.delta[q]) for (const p of conj) adicionarTransicao(b, novoIndice.get(q), s, novoIndice.get(p));
    if (a.finais.has(q)) b.finais.add(novoIndice.get(q));
  }
  return { automato: b, removidos: a.nomes.filter((_, q) => !alcancados.has(q)) };
}

// ---------------------------------------------------------------- subconjuntos

/** Nomes A, B, ..., Z, AA, AB, ... como nas planilhas. */
export function nomeLetra(k) {
  let s = '';
  let n = k + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Construção de subconjuntos: cada estado do AFD é um conjunto de estados do
 * AFN. O inicial é o fecho-ε do inicial; de um conjunto T, lendo a, vai para
 * fecho(mover(T, a)). Conjuntos vazios não viram estado (o AFD fica parcial).
 */
export function determinizar(a, opcoes = {}) {
  const limite = opcoes.limite ?? 5000;
  const inicial = fechoEpsilon(a, [a.inicial]);
  const chave = (c) => [...c].sort((x, y) => x - y).join(',');
  const conjuntos = [inicial];
  const indice = new Map([[chave(inicial), 0]]);
  const arestas = [];
  for (let k = 0; k < conjuntos.length; k++) {
    if (conjuntos.length > limite) throw new Error(`o AFD passou de ${limite} estados`);
    for (const s of a.alfabeto) {
      const u = fechoEpsilon(a, mover(a, conjuntos[k], s));
      if (u.size === 0) continue;
      const ck = chave(u);
      if (!indice.has(ck)) {
        indice.set(ck, conjuntos.length);
        conjuntos.push(u);
      }
      arestas.push([k, s, indice.get(ck)]);
    }
  }
  // Letras como nos livros, ou o próprio conjunto ({q0,q1}) quando pedido.
  const nomes = opcoes.nomesPorConjunto
    ? conjuntos.map((c) => `{${[...c].sort((x, y) => x - y).map((q) => a.nomes[q]).join(',')}}`)
    : conjuntos.map((_, k) => nomeLetra(k));
  const d = novoAutomato(nomes, a.alfabeto, 0);
  for (const [de, s, para] of arestas) adicionarTransicao(d, de, s, para);
  conjuntos.forEach((c, k) => {
    if ([...c].some((q) => a.finais.has(q))) d.finais.add(k);
  });
  return {
    automato: d,
    subconjuntos: conjuntos.map((c, k) => ({ estado: d.nomes[k], conjunto: [...c].sort((x, y) => x - y).map((q) => a.nomes[q]) })),
  };
}

/**
 * Completa um AFD: onde faltar transição, vai para um estado "morto" que não
 * é final e volta para si mesmo com todo símbolo. Devolve { automato, morto }.
 */
export function completar(a, alfabeto = a.alfabeto) {
  const sigma = [...new Set([...a.alfabeto, ...alfabeto])].sort();
  const b = novoAutomato(a.nomes, sigma, a.inicial);
  a.delta.forEach((m, q) => {
    for (const [s, conj] of m) for (const p of conj) adicionarTransicao(b, q, s, p);
  });
  for (const q of a.finais) b.finais.add(q);
  let morto = -1;
  const precisa = b.delta.some((m) => sigma.some((s) => (m.get(s)?.size ?? 0) === 0));
  if (precisa) {
    morto = b.nomes.length;
    let nome = '∅';
    while (b.nomes.includes(nome)) nome += "'";
    b.nomes.push(nome);
    b.delta.push(new Map());
    for (let q = 0; q < b.nomes.length; q++) {
      for (const s of sigma) if ((b.delta[q].get(s)?.size ?? 0) === 0) adicionarTransicao(b, q, s, morto);
    }
  }
  return { automato: b, morto };
}

function destinoUnico(a, q, s) {
  const c = a.delta[q].get(s);
  return c && c.size ? c.values().next().value : -1;
}

// ---------------------------------------------------------------- minimização

/**
 * Minimização por refinamento de partições (a versão em partições do
 * algoritmo de preenchimento de tabela): começa separando finais de não
 * finais; a cada rodada, dois estados do mesmo bloco só continuam juntos se,
 * para todo símbolo, vão para o mesmo bloco. Para quando nada muda.
 * Antes, tira os inalcançáveis e completa o AFD com um estado morto.
 */
export function minimizar(entrada) {
  const det = ehDeterministico(entrada) ? entrada : determinizar(entrada).automato;
  const { automato: alcancavel, removidos } = removerInalcancaveis(det);
  const { automato: a, morto } = completar(alcancavel);
  const n = a.nomes.length;
  let classe = a.nomes.map((_, q) => (a.finais.has(q) ? 1 : 0));
  const normalizar = (c) => {
    const mapa = new Map();
    return c.map((x) => {
      if (!mapa.has(x)) mapa.set(x, mapa.size);
      return mapa.get(x);
    });
  };
  classe = normalizar(classe);
  const blocos = (c) => {
    const lista = [];
    c.forEach((b, q) => {
      if (!lista[b]) lista[b] = [];
      lista[b].push(q);
    });
    return lista;
  };
  const rodadas = [blocos(classe)];
  const marcadoEm = new Map();
  const marcar = (c, rodada) => {
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (!marcadoEm.has(`${p},${q}`) && c[p] !== c[q]) marcadoEm.set(`${p},${q}`, rodada);
      }
    }
  };
  marcar(classe, 0);
  for (;;) {
    const assinatura = a.nomes.map((_, q) => `${classe[q]}|${a.alfabeto.map((s) => classe[destinoUnico(a, q, s)]).join(',')}`);
    const nova = normalizar(assinatura);
    const quantos = (c) => new Set(c).size;
    if (quantos(nova) === quantos(classe)) break;
    classe = nova;
    rodadas.push(blocos(classe));
    marcar(classe, rodadas.length - 1);
  }
  // AFD mínimo: um estado por bloco, numerados em largura a partir do inicial.
  const lista = blocos(classe);
  const ordem = [];
  const posicao = new Map();
  const visitar = (b) => {
    if (posicao.has(b)) return;
    posicao.set(b, ordem.length);
    ordem.push(b);
  };
  visitar(classe[a.inicial]);
  for (let k = 0; k < ordem.length; k++) {
    const rep = lista[ordem[k]][0];
    for (const s of a.alfabeto) visitar(classe[destinoUnico(a, rep, s)]);
  }
  const nomeBloco = (b) => lista[b].map((q) => a.nomes[q]).join(',');
  const m = novoAutomato(ordem.map(nomeBloco), a.alfabeto, 0);
  ordem.forEach((b, k) => {
    const rep = lista[b][0];
    for (const s of a.alfabeto) adicionarTransicao(m, k, s, posicao.get(classe[destinoUnico(a, rep, s)]));
    if (a.finais.has(rep)) m.finais.add(k);
  });
  const mortoMin = morto >= 0 ? posicao.get(classe[morto]) : ordem.findIndex((b) => ehMorto(m, posicao.get(b)));
  const nomesPorRodada = rodadas.map((r) => r.map((bloco) => bloco.map((q) => a.nomes[q])));
  const pares = [];
  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) pares.push({ p: a.nomes[p], q: a.nomes[q], rodada: marcadoEm.has(`${p},${q}`) ? marcadoEm.get(`${p},${q}`) : null });
  }
  return { automato: m, rodadas: nomesPorRodada, pares, morto: mortoMin, removidos, completado: a };
}

/** Estado não final do qual não se chega a nenhum final. */
export function ehMorto(a, q) {
  if (a.finais.has(q)) return false;
  const vistos = new Set([q]);
  const pilha = [q];
  while (pilha.length) {
    const x = pilha.pop();
    for (const conj of a.delta[x].values()) {
      for (const p of conj) {
        if (a.finais.has(p)) return false;
        if (!vistos.has(p)) {
          vistos.add(p);
          pilha.push(p);
        }
      }
    }
  }
  return true;
}

/**
 * Tira os estados mortos (dos quais nenhum final é alcançável) e as transições
 * para eles. A linguagem não muda; o autômato pode ficar parcial. O inicial
 * sempre fica, mesmo morto (linguagem vazia).
 */
export function removerMortos(a) {
  const manter = a.nomes.map((_, q) => q).filter((q) => q === a.inicial || !ehMorto(a, q));
  const novoIndice = new Map(manter.map((q, k) => [q, k]));
  const b = novoAutomato(manter.map((q) => a.nomes[q]), a.alfabeto, novoIndice.get(a.inicial));
  for (const q of manter) {
    for (const [s, conj] of a.delta[q]) for (const p of conj) if (novoIndice.has(p)) adicionarTransicao(b, novoIndice.get(q), s, novoIndice.get(p));
    if (a.finais.has(q)) b.finais.add(novoIndice.get(q));
  }
  return b;
}

/** Número de estados sem contar estados mortos. */
export function estadosUteis(a) {
  return a.nomes.filter((_, q) => !ehMorto(a, q)).length;
}

// ---------------------------------------------------------------- simulação

/**
 * Simula a palavra passo a passo. Cada passo traz o conjunto de estados ativos
 * (já com o fecho-ε) e o símbolo que será lido em seguida.
 */
export function simular(a, palavra) {
  const simbolos = Array.from(palavra);
  let atual = fechoEpsilon(a, [a.inicial]);
  const passos = [{ lido: '', simbolo: simbolos[0] ?? null, estados: [...atual].sort((x, y) => x - y) }];
  for (let k = 0; k < simbolos.length; k++) {
    atual = fechoEpsilon(a, mover(a, atual, simbolos[k]));
    passos.push({ lido: simbolos.slice(0, k + 1).join(''), simbolo: simbolos[k + 1] ?? null, estados: [...atual].sort((x, y) => x - y) });
  }
  return { passos, aceita: [...atual].some((q) => a.finais.has(q)), morreu: atual.size === 0 };
}

export function aceita(a, palavra) {
  return simular(a, palavra).aceita;
}

/** Palavras em ordem de tamanho e depois alfabética, até o tamanho dado. */
export function* palavrasAte(alfabeto, tamanhoMaximo) {
  let camada = [''];
  for (let t = 0; t <= tamanhoMaximo; t++) {
    yield* camada;
    if (t === tamanhoMaximo) break;
    const proxima = [];
    for (const w of camada) for (const s of alfabeto) proxima.push(w + s);
    camada = proxima;
  }
}

/** Primeiras palavras aceitas (para mostrar exemplos da linguagem). */
export function exemplosAceitos(a, quantidade = 10, tamanhoMaximo = 8) {
  const out = [];
  for (const w of palavrasAte(a.alfabeto, tamanhoMaximo)) {
    if (aceita(a, w)) out.push(w);
    if (out.length >= quantidade) break;
  }
  return out;
}

// ---------------------------------------------------------------- operações

function deterministicoCompleto(a, alfabeto) {
  const d = temEpsilon(a) || tipoAutomato(a) === 'AFN' ? determinizar(a, { nomesPorConjunto: true }).automato : a;
  return completar(d, alfabeto).automato;
}

/**
 * Equivalência: percorre em largura os pares (estado de A, estado de B) dos
 * dois AFDs completos. Se algum par alcançável tem um final e um não final, a
 * palavra que leva até ele é um contraexemplo (a menor possível).
 */
export function equivalentes(a, b) {
  const sigma = [...new Set([...a.alfabeto, ...b.alfabeto])].sort();
  const da = deterministicoCompleto(a, sigma);
  const db = deterministicoCompleto(b, sigma);
  const inicio = `${da.inicial},${db.inicial}`;
  const anterior = new Map([[inicio, null]]);
  const fila = [[da.inicial, db.inicial]];
  while (fila.length) {
    const [p, q] = fila.shift();
    const fa = da.finais.has(p);
    const fb = db.finais.has(q);
    if (fa !== fb) {
      const simbolos = [];
      for (let k = `${p},${q}`; anterior.get(k); k = anterior.get(k).de) simbolos.push(anterior.get(k).s);
      return { equivalentes: false, contraexemplo: simbolos.reverse().join(''), aceitaA: fa, aceitaB: fb };
    }
    for (const s of sigma) {
      const np = destinoUnico(da, p, s);
      const nq = destinoUnico(db, q, s);
      const k = `${np},${nq}`;
      if (!anterior.has(k)) {
        anterior.set(k, { de: `${p},${q}`, s });
        fila.push([np, nq]);
      }
    }
  }
  return { equivalentes: true, contraexemplo: null };
}

/** Complemento em relação ao alfabeto dado: completa o AFD e troca finais por não finais. */
export function complemento(a, alfabeto = a.alfabeto) {
  const d = deterministicoCompleto(a, alfabeto);
  const c = novoAutomato(d.nomes, d.alfabeto, d.inicial);
  d.delta.forEach((m, q) => {
    for (const [s, conj] of m) for (const p of conj) adicionarTransicao(c, q, s, p);
    if (!d.finais.has(q)) c.finais.add(q);
  });
  return c;
}

/**
 * Construção do produto: estados são pares (p, q) alcançáveis; lendo a, vai de
 * (p, q) para (δA(p, a), δB(q, a)). Na união o par é final se um dos dois é;
 * na interseção, se os dois são.
 */
export function produto(a, b, operacao) {
  const sigma = [...new Set([...a.alfabeto, ...b.alfabeto])].sort();
  const da = deterministicoCompleto(a, sigma);
  const db = deterministicoCompleto(b, sigma);
  const pares = [[da.inicial, db.inicial]];
  const indice = new Map([[`${da.inicial},${db.inicial}`, 0]]);
  const arestas = [];
  for (let k = 0; k < pares.length; k++) {
    const [p, q] = pares[k];
    for (const s of sigma) {
      const alvo = [destinoUnico(da, p, s), destinoUnico(db, q, s)];
      const ch = alvo.join(',');
      if (!indice.has(ch)) {
        indice.set(ch, pares.length);
        pares.push(alvo);
      }
      arestas.push([k, s, indice.get(ch)]);
    }
  }
  const r = novoAutomato(pares.map(([p, q]) => `(${da.nomes[p]}; ${db.nomes[q]})`), sigma, 0);
  for (const [de, s, para] of arestas) adicionarTransicao(r, de, s, para);
  pares.forEach(([p, q], k) => {
    const fa = da.finais.has(p);
    const fb = db.finais.has(q);
    if (operacao === 'uniao' ? fa || fb : fa && fb) r.finais.add(k);
  });
  return r;
}

// ---------------------------------------------------------------- eliminação de estados

/**
 * AFD (ou AFN) para expressão regular por eliminação de estados. Acrescenta um
 * início i e um fim f novos, ligados por ε, e as arestas passam a ter
 * expressões. Ao eliminar k, cada caminho p -> k -> q vira
 *     R(p, q) | R(p, k) R(k, k)* R(k, q).
 * No fim sobra só a aresta i -> f, com a expressão da linguagem.
 */
export function eliminarEstados(a, opcoes = {}) {
  const n = a.nomes.length;
  const I = n;
  const F = n + 1;
  const R = new Map();
  const ch = (p, q) => `${p},${q}`;
  const get = (p, q) => R.get(ch(p, q)) ?? nada();
  const put = (p, q, e) => {
    const s = simplificar(e);
    if (s.tipo === 'nada') R.delete(ch(p, q));
    else R.set(ch(p, q), s);
  };
  put(I, a.inicial, epsilon());
  for (const q of a.finais) put(q, F, uniao(get(q, F), epsilon()));
  a.delta.forEach((m, p) => {
    for (const [s, conj] of m) {
      for (const q of conj) put(p, q, uniao(get(p, q), s === EPS ? epsilon() : simbolo(s)));
    }
  });
  const nome = (q) => (q === I ? 'início' : q === F ? 'fim' : a.nomes[q]);
  const texto = (e) => expressaoParaTexto(e, opcoes);
  const passos = [];
  const restantes = new Set(a.nomes.map((_, q) => q));
  while (restantes.size) {
    // Elimina primeiro quem tem menos combinações entrada x saída (expressões menores).
    let melhor = -1;
    let custo = Infinity;
    for (const k of restantes) {
      let entra = 0;
      let sai = 0;
      for (const chave of R.keys()) {
        const [p, q] = chave.split(',').map(Number);
        if (q === k && p !== k) entra++;
        if (p === k && q !== k) sai++;
      }
      if (entra * sai < custo) {
        custo = entra * sai;
        melhor = k;
      }
    }
    const k = melhor;
    restantes.delete(k);
    const laco = get(k, k);
    const entradas = [];
    const saidas = [];
    for (const [chave, e] of R) {
      const [p, q] = chave.split(',').map(Number);
      if (q === k && p !== k) entradas.push([p, e]);
      if (p === k && q !== k) saidas.push([q, e]);
    }
    const mudancas = [];
    for (const [p, ep] of entradas) {
      for (const [q, eq] of saidas) {
        put(p, q, uniao(get(p, q), conc(conc(ep, estrela(laco)), eq)));
        mudancas.push(`${nome(p)} → ${nome(q)}: ${texto(get(p, q))}`);
      }
    }
    for (const chave of [...R.keys()]) {
      const [p, q] = chave.split(',').map(Number);
      if (p === k || q === k) R.delete(chave);
    }
    passos.push({ estado: a.nomes[k], laco: laco.tipo === 'nada' ? null : texto(laco), mudancas });
  }
  const resultado = simplificar(get(I, F));
  return { expressao: resultado, texto: texto(resultado), passos };
}

// ---------------------------------------------------------------- texto e JSON

/**
 * Formato de texto do editor:
 *   inicial q0
 *   finais q2 q3
 *   q0 a q1        (transição; vários símbolos: q0 a,b q1; vazio: q0 ε q1 ou q0 & q1)
 * Linhas começando com # são comentários.
 */
export function lerAutomatoTexto(texto) {
  const erros = [];
  const nomes = [];
  const indice = new Map();
  const estado = (n) => {
    if (!indice.has(n)) {
      indice.set(n, nomes.length);
      nomes.push(n);
    }
    return indice.get(n);
  };
  let inicial = null;
  const finais = [];
  const lista = [];
  texto.split(/\r?\n/).forEach((original, k) => {
    const linha = original.trim();
    const numero = k + 1;
    if (!linha || linha.startsWith('#')) return;
    const partes = linha.split(/\s+/);
    const palavra = partes[0].toLowerCase();
    if (palavra === 'inicial') {
      if (partes.length !== 2) erros.push(`linha ${numero}: use "inicial <estado>"`);
      else inicial = partes[1];
      return;
    }
    if (palavra === 'final' || palavra === 'finais') {
      if (partes.length < 2) erros.push(`linha ${numero}: use "finais <estado> <estado> ..."`);
      else finais.push(...partes.slice(1));
      return;
    }
    if (partes.length !== 3) {
      erros.push(`linha ${numero}: esperava "origem símbolo destino", como q0 a q1`);
      return;
    }
    const [de, simbolos, para] = partes;
    for (const s of simbolos.split(',').filter(Boolean)) {
      const sim = s === '&' || s === 'ε' || s.toLowerCase() === 'eps' ? EPS : s;
      if (Array.from(sim).length !== 1) {
        erros.push(`linha ${numero}: o símbolo "${s}" deveria ter um caractere só`);
        continue;
      }
      lista.push([de, sim, para]);
    }
  });
  if (inicial === null) erros.push('falta a linha "inicial <estado>"');
  if (erros.length) return { automato: null, erros };
  estado(inicial);
  for (const [de, , para] of lista) {
    estado(de);
    estado(para);
  }
  for (const f of finais) estado(f);
  const alfabeto = [...new Set(lista.map(([, s]) => s).filter((s) => s !== EPS))].sort();
  const a = novoAutomato(nomes, alfabeto, indice.get(inicial));
  for (const [de, s, para] of lista) adicionarTransicao(a, indice.get(de), s, indice.get(para));
  for (const f of finais) a.finais.add(indice.get(f));
  return { automato: a, erros: [] };
}

export function automatoParaTexto(a) {
  const linhas = [`inicial ${a.nomes[a.inicial]}`];
  if (a.finais.size) linhas.push(`finais ${[...a.finais].sort((x, y) => x - y).map((q) => a.nomes[q]).join(' ')}`);
  // Agrupa símbolos com a mesma origem e o mesmo destino: q0 a,b q1.
  const grupos = new Map();
  for (const t of transicoes(a)) {
    const k = `${t.de} ${t.para}`;
    if (!grupos.has(k)) grupos.set(k, { ...t, simbolos: [] });
    grupos.get(k).simbolos.push(t.simbolo);
  }
  for (const g of grupos.values()) linhas.push(`${a.nomes[g.de]} ${g.simbolos.join(',')} ${a.nomes[g.para]}`);
  return linhas.join('\n');
}

export function automatoParaJSON(a) {
  return {
    tipo: tipoAutomato(a),
    alfabeto: [...a.alfabeto],
    estados: [...a.nomes],
    inicial: a.nomes[a.inicial],
    finais: [...a.finais].sort((x, y) => x - y).map((q) => a.nomes[q]),
    transicoes: transicoes(a).map((t) => ({ de: a.nomes[t.de], simbolo: t.simbolo, para: a.nomes[t.para] })),
  };
}

export function lerAutomatoJSON(dados) {
  const erros = [];
  if (!dados || typeof dados !== 'object') return { automato: null, erros: ['o JSON precisa ser um objeto'] };
  const { estados, inicial, finais = [], transicoes: lista = [], alfabeto = [] } = dados;
  if (!Array.isArray(estados) || estados.some((e) => typeof e !== 'string' || !e.trim())) erros.push('"estados" precisa ser uma lista de nomes');
  if (erros.length) return { automato: null, erros };
  const nomes = estados.map((e) => e.trim());
  if (new Set(nomes).size !== nomes.length) erros.push('há estados com o mesmo nome');
  const indice = new Map(nomes.map((n, k) => [n, k]));
  if (!indice.has(inicial)) erros.push('"inicial" precisa ser um dos estados');
  if (!Array.isArray(finais) || finais.some((f) => !indice.has(f))) erros.push('"finais" precisa listar estados existentes');
  if (!Array.isArray(lista)) erros.push('"transicoes" precisa ser uma lista');
  if (erros.length) return { automato: null, erros };
  const simbolos = new Set(Array.isArray(alfabeto) ? alfabeto.filter((s) => typeof s === 'string' && s !== EPS) : []);
  lista.forEach((t, k) => {
    if (!t || !indice.has(t.de) || !indice.has(t.para) || typeof t.simbolo !== 'string' || Array.from(t.simbolo).length !== 1) {
      erros.push(`transição ${k + 1} inválida (precisa de "de", "simbolo" com um caractere e "para")`);
    } else if (t.simbolo !== EPS) {
      simbolos.add(t.simbolo);
    }
  });
  if (erros.length) return { automato: null, erros };
  const a = novoAutomato(nomes, [...simbolos].sort(), indice.get(inicial));
  for (const t of lista) adicionarTransicao(a, indice.get(t.de), t.simbolo, indice.get(t.para));
  for (const f of finais) a.finais.add(indice.get(f));
  return { automato: a, erros: [] };
}

// ---------------------------------------------------------------- link

export function codificarParaLink(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodificarLink(codigo) {
  try {
    const b64 = codigo.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
