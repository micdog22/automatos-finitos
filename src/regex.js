// Expressões regulares de sala de aula: leitura, impressão e simplificação.
//
// Sintaxe: união com | (ou +, se configurado), concatenação por justaposição,
// * (zero ou mais), ? (zero ou um), + (um ou mais, quando a união é |),
// parênteses, ε ou & para a palavra vazia e ∅ para a linguagem vazia.
// Espaços são ignorados; \ torna literal o caractere seguinte.

export const EPS = 'ε';
export const VAZIO = '∅';

const ESPECIAIS = new Set(['|', '+', '*', '?', '(', ')', 'ε', '&', '∅', '\\']);

// Construtores da árvore.
export const simbolo = (c) => ({ tipo: 'simbolo', c });
export const epsilon = () => ({ tipo: 'eps' });
export const nada = () => ({ tipo: 'nada' });
export const uniao = (a, b) => ({ tipo: 'uniao', a, b });
export const conc = (a, b) => ({ tipo: 'conc', a, b });
export const estrela = (a) => ({ tipo: 'estrela', a });
export const opcional = (a) => ({ tipo: 'opcional', a });
export const mais = (a) => ({ tipo: 'mais', a });

class ErroExpressao extends Error {
  constructor(mensagem, posicao) {
    super(mensagem);
    this.posicao = posicao;
  }
}

/**
 * Lê a expressão. Devolve { arvore } ou { erro, posicao } (posição a partir de 1).
 * opcoes.uniao: '|' (padrão; aí + é "um ou mais") ou '+' (+ e | são união).
 */
export function lerExpressao(texto, opcoes = {}) {
  const operadorUniao = opcoes.uniao === '+' ? '+' : '|';
  const chars = Array.from(texto);
  let i = 0;
  const pular = () => {
    while (i < chars.length && /\s/.test(chars[i])) i++;
  };
  const atual = () => {
    pular();
    return i < chars.length ? chars[i] : null;
  };
  const ehUniao = (c) => c === '|' || (operadorUniao === '+' && c === '+');
  const ehPosfixo = (c) => c === '*' || c === '?' || (operadorUniao === '|' && c === '+');

  function lerUniao() {
    const inicio = i;
    let esquerda = lerConcatenacao();
    while (ehUniao(atual())) {
      const pos = i;
      i++;
      if (atual() === null || ehUniao(atual()) || atual() === ')') {
        throw new ErroExpressao(`falta uma alternativa depois de ${chars[pos]} (use ε para a palavra vazia)`, pos + 1);
      }
      esquerda = uniao(esquerda, lerConcatenacao());
    }
    if (esquerda === null) throw new ErroExpressao('expressão vazia (use ε para a palavra vazia)', inicio + 1);
    return esquerda;
  }

  function lerConcatenacao() {
    let resultado = null;
    for (;;) {
      const c = atual();
      if (c === null || c === ')' || ehUniao(c)) break;
      const fator = lerPosfixo();
      resultado = resultado === null ? fator : conc(resultado, fator);
    }
    if (resultado === null) {
      const c = atual();
      if (ehUniao(c)) throw new ErroExpressao(`falta uma alternativa antes de ${c} (use ε para a palavra vazia)`, i + 1);
      if (c === ')') throw new ErroExpressao('parêntese fechado sem ter sido aberto', i + 1);
    }
    return resultado;
  }

  function lerPosfixo() {
    let base = lerAtomo();
    while (ehPosfixo(atual())) {
      const c = chars[i++];
      base = c === '*' ? estrela(base) : c === '?' ? opcional(base) : mais(base);
    }
    return base;
  }

  function lerAtomo() {
    const c = atual();
    const pos = i;
    if (c === '(') {
      i++;
      if (atual() === ')') {
        i++;
        return epsilon();
      }
      const dentro = lerUniao();
      if (atual() !== ')') throw new ErroExpressao('parêntese aberto aqui não foi fechado', pos + 1);
      i++;
      return dentro;
    }
    if (c === 'ε' || c === '&') {
      i++;
      return epsilon();
    }
    if (c === '∅') {
      i++;
      return nada();
    }
    if (c === '\\') {
      if (i + 1 >= chars.length) throw new ErroExpressao('\\ no fim da expressão', pos + 1);
      i += 2;
      return simbolo(chars[i - 1]);
    }
    if (c === '*' || c === '?' || c === '+') {
      throw new ErroExpressao(`o operador ${c} precisa de algo antes dele`, pos + 1);
    }
    i++;
    return simbolo(c);
  }

  try {
    if (atual() === null) throw new ErroExpressao('expressão vazia (use ε para a palavra vazia)', 1);
    const arvore = lerUniao();
    if (atual() !== null) {
      throw new ErroExpressao(atual() === ')' ? 'parêntese fechado sem ter sido aberto' : `caractere inesperado ${atual()}`, i + 1);
    }
    return { arvore, erro: null, posicao: 0 };
  } catch (e) {
    if (e instanceof ErroExpressao) return { arvore: null, erro: e.message, posicao: e.posicao };
    throw e;
  }
}

/** Símbolos usados pela expressão, em ordem. */
export function alfabetoDe(arvore) {
  const s = new Set();
  const visitar = (n) => {
    if (n.tipo === 'simbolo') s.add(n.c);
    if (n.a) visitar(n.a);
    if (n.b) visitar(n.b);
  };
  visitar(arvore);
  return [...s].sort();
}

const PRECEDENCIA = { uniao: 1, conc: 2, estrela: 3, opcional: 3, mais: 3, simbolo: 4, eps: 4, nada: 4 };

/** Texto da expressão com o mínimo de parênteses. */
export function expressaoParaTexto(n, opcoes = {}) {
  const operadorUniao = opcoes.uniao === '+' ? '+' : '|';
  const separador = opcoes.espacos ? ` ${operadorUniao} ` : operadorUniao;
  const texto = (no, minimo) => {
    const s = cru(no);
    return PRECEDENCIA[no.tipo] < minimo ? `(${s})` : s;
  };
  const cru = (no) => {
    switch (no.tipo) {
      case 'simbolo':
        return ESPECIAIS.has(no.c) || /\s/.test(no.c) ? `\\${no.c}` : no.c;
      case 'eps':
        return EPS;
      case 'nada':
        return VAZIO;
      case 'uniao':
        return `${texto(no.a, 1)}${separador}${texto(no.b, 1)}`;
      case 'conc':
        return `${texto(no.a, 2)}${texto(no.b, 2)}`;
      case 'estrela':
        return `${texto(no.a, 4)}*`;
      case 'opcional':
        return `${texto(no.a, 4)}?`;
      case 'mais':
        return operadorUniao === '|' ? `${texto(no.a, 4)}+` : `${texto(no.a, 4)}${texto(no.a, 4)}*`;
      default:
        return '?';
    }
  };
  return cru(n);
}

const chave = (n) => JSON.stringify(n);

function alternativas(n) {
  return n.tipo === 'uniao' ? [...alternativas(n.a), ...alternativas(n.b)] : [n];
}

function fatores(n) {
  return n.tipo === 'conc' ? [...fatores(n.a), ...fatores(n.b)] : [n];
}

/**
 * Simplifica sem mudar a linguagem: ∅ some de uniões e anula concatenações,
 * ε some de concatenações, alternativas repetidas saem, ∅* = ε* = ε,
 * (r*)* = r*, (r?)* = r* e (ε | r*) = r*.
 */
export function simplificar(n) {
  switch (n.tipo) {
    case 'uniao': {
      let lista = [];
      for (const alt of alternativas(n)) lista.push(...alternativas(simplificar(alt)));
      lista = lista.filter((x) => x.tipo !== 'nada');
      const vistos = new Set();
      lista = lista.filter((x) => {
        const k = chave(x);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
      // ε é redundante se outra alternativa já aceita a palavra vazia.
      if (lista.some((x) => x.tipo === 'eps') && lista.some((x) => x.tipo !== 'eps' && aceitaVazia(x))) {
        lista = lista.filter((x) => x.tipo !== 'eps');
      }
      if (lista.length === 0) return nada();
      const semEps = lista.filter((x) => x.tipo !== 'eps');
      if (semEps.length < lista.length && semEps.length === 1) return simplificar(opcional(semEps[0]));
      return lista.reduce((acc, x) => uniao(acc, x));
    }
    case 'conc': {
      let lista = [];
      for (const f of fatores(n)) lista.push(...fatores(simplificar(f)));
      if (lista.some((x) => x.tipo === 'nada')) return nada();
      lista = lista.filter((x) => x.tipo !== 'eps');
      if (lista.length === 0) return epsilon();
      return lista.reduce((acc, x) => conc(acc, x));
    }
    case 'estrela': {
      const a = simplificar(n.a);
      if (a.tipo === 'nada' || a.tipo === 'eps') return epsilon();
      if (a.tipo === 'estrela') return a;
      if (a.tipo === 'opcional' || a.tipo === 'mais') return estrela(a.a);
      return estrela(a);
    }
    case 'opcional': {
      const a = simplificar(n.a);
      if (a.tipo === 'nada' || a.tipo === 'eps') return epsilon();
      if (aceitaVazia(a)) return a;
      if (a.tipo === 'mais') return estrela(a.a);
      // (x x*)? = (x* x)? = x*
      if (a.tipo === 'conc') {
        const fs = fatores(a);
        const juntar = (lista) => lista.reduce((acc, x) => conc(acc, x));
        const primeiro = fs[0];
        const ultimo = fs[fs.length - 1];
        if (ultimo.tipo === 'estrela' && chave(juntar(fs.slice(0, -1))) === chave(ultimo.a)) return ultimo;
        if (primeiro.tipo === 'estrela' && chave(juntar(fs.slice(1))) === chave(primeiro.a)) return primeiro;
      }
      return opcional(a);
    }
    case 'mais': {
      const a = simplificar(n.a);
      if (a.tipo === 'nada') return nada();
      if (a.tipo === 'eps') return epsilon();
      return mais(a);
    }
    default:
      return n;
  }
}

/** A expressão aceita a palavra vazia? */
export function aceitaVazia(n) {
  switch (n.tipo) {
    case 'eps':
    case 'estrela':
    case 'opcional':
      return true;
    case 'uniao':
      return aceitaVazia(n.a) || aceitaVazia(n.b);
    case 'conc':
      return aceitaVazia(n.a) && aceitaVazia(n.b);
    case 'mais':
      return aceitaVazia(n.a);
    default:
      return false;
  }
}

/** Quantidade de nós (para comparar o tamanho de expressões). */
export function tamanho(n) {
  return 1 + (n.a ? tamanho(n.a) : 0) + (n.b ? tamanho(n.b) : 0);
}
