import { test } from 'node:test';
import assert from 'node:assert/strict';

import { expressaoParaTexto, lerExpressao, simplificar } from '../src/regex.js';
import {
  EPS,
  aceita,
  automatoParaJSON,
  automatoParaTexto,
  codificarParaLink,
  complemento,
  decodificarLink,
  determinizar,
  eliminarEstados,
  equivalentes,
  estadosUteis,
  exemplosAceitos,
  lerAutomatoJSON,
  lerAutomatoTexto,
  minimizar,
  palavrasAte,
  produto,
  removerEpsilon,
  removerMortos,
  simular,
  thompson,
  tipoAutomato,
  transicoes,
} from '../src/automato.js';

const arvore = (texto, opcoes) => {
  const r = lerExpressao(texto, opcoes);
  assert.equal(r.erro, null, `${texto}: ${r.erro}`);
  return r.arvore;
};
const afnDe = (texto, opcoes) => thompson(arvore(texto, opcoes));
const nomesDestino = (a, q, s) => [...(a.delta[q].get(s) ?? [])].map((p) => a.nomes[p]);

test('leitura de expressões: precedência, + configurável e escapes', () => {
  assert.equal(expressaoParaTexto(arvore('ab|c*')), 'ab|c*');
  assert.equal(expressaoParaTexto(arvore('(a|b)*abb')), '(a|b)*abb');
  assert.equal(expressaoParaTexto(arvore('((a))((b))')), 'ab');
  assert.equal(expressaoParaTexto(arvore('a ( b | c ) ?')), 'a(b|c)?');
  assert.deepEqual(arvore('a+'), { tipo: 'mais', a: { tipo: 'simbolo', c: 'a' } });
  assert.equal(arvore('a+b', { uniao: '+' }).tipo, 'uniao');
  assert.equal(expressaoParaTexto(arvore('a+b', { uniao: '+' }), { uniao: '+' }), 'a+b');
  assert.equal(arvore('&').tipo, 'eps');
  assert.equal(arvore('()').tipo, 'eps');
  assert.equal(arvore('∅').tipo, 'nada');
  assert.deepEqual(arvore('\\*a'), { tipo: 'conc', a: { tipo: 'simbolo', c: '*' }, b: { tipo: 'simbolo', c: 'a' } });
  assert.equal(expressaoParaTexto(arvore('\\*a')), '\\*a');
});

test('erros de expressão com a posição', () => {
  const casos = [
    ['(a|b', 1, 'não foi fechado'],
    ['a|', 2, 'depois de |'],
    ['|a', 1, 'antes de |'],
    ['*a', 1, 'precisa de algo antes'],
    ['a)', 2, 'sem ter sido aberto'],
    ['', 1, 'vazia'],
    ['ab\\', 3, 'no fim'],
  ];
  for (const [texto, posicao, trecho] of casos) {
    const r = lerExpressao(texto);
    assert.equal(r.arvore, null, texto);
    assert.equal(r.posicao, posicao, texto);
    assert.ok(r.erro.includes(trecho), `${texto}: ${r.erro}`);
  }
});

test('Thompson: quantidade de estados', () => {
  const casos = { a: 2, ab: 3, 'a|b': 6, 'a*': 4, '(a|b)*': 8, '(a|b)*abb': 11, 'ε': 2, '∅': 2, 'a?': 4, 'a+': 4, 'abc': 4, '(ab|c)*d': 10 };
  for (const [re, n] of Object.entries(casos)) assert.equal(afnDe(re).nomes.length, n, re);
});

test('Thompson: fórmula de contagem em expressões aleatórias', () => {
  // 2 estados por símbolo, ε, ∅, união, *, ? e +; cada concatenação funde dois.
  let semente = 7;
  const rand = (n) => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente % n;
  };
  const gerar = (prof) => {
    if (prof === 0 || rand(3) === 0) return ['a', 'b', 'c', 'ε'][rand(4)];
    const x = gerar(prof - 1);
    switch (rand(5)) {
      case 0: return `(${x}|${gerar(prof - 1)})`;
      case 1: return `(${x})(${gerar(prof - 1)})`;
      case 2: return `(${x})*`;
      case 3: return `(${x})?`;
      default: return `(${x})+`;
    }
  };
  for (let k = 0; k < 200; k++) {
    const re = gerar(5);
    const t = arvore(re);
    let operandos = 0;
    let concats = 0;
    const contar = (n) => {
      if (n.tipo === 'conc') concats++;
      else operandos++;
      if (n.a) contar(n.a);
      if (n.b) contar(n.b);
    };
    contar(t);
    const a = thompson(t);
    assert.equal(a.nomes.length, 2 * operandos - concats, re);
    assert.equal(a.finais.size, 1);
    // O inicial não recebe transições e o final não tem saídas.
    assert.ok(transicoes(a).every((x) => x.para !== a.inicial), re);
    const [f] = [...a.finais];
    assert.ok(transicoes(a).every((x) => x.de !== f), re);
  }
});

test('subconjuntos direto do AFN-ε: o exemplo clássico (a|b)*abb', () => {
  const { automato: d, subconjuntos } = determinizar(afnDe('(a|b)*abb'));
  assert.deepEqual(d.nomes, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(subconjuntos.map((s) => s.conjunto.length), [5, 7, 6, 7, 7]);
  const tabela = d.nomes.map((_, q) => [nomesDestino(d, q, 'a')[0], nomesDestino(d, q, 'b')[0]]);
  assert.deepEqual(tabela, [['B', 'C'], ['B', 'D'], ['B', 'C'], ['B', 'E'], ['B', 'C']]);
  assert.deepEqual([...d.finais].map((q) => d.nomes[q]), ['E']);
});

test('subconjuntos a partir de AFN sem ε (explosão exponencial)', () => {
  // Penúltimo símbolo é 1: o AFN tem 3 estados e o AFD, 4.
  const n2 = lerAutomatoTexto('inicial q0\nfinais q2\nq0 0,1 q0\nq0 1 q1\nq1 0,1 q2').automato;
  const d2 = determinizar(n2);
  assert.equal(d2.automato.nomes.length, 4);
  assert.deepEqual(d2.subconjuntos.map((s) => s.conjunto.join(' ')), ['q0', 'q0 q1', 'q0 q2', 'q0 q1 q2']);
  // Antepenúltimo é 1: 8 estados no AFD, e todos são necessários.
  const n3 = lerAutomatoTexto('inicial q0\nfinais q3\nq0 0,1 q0\nq0 1 q1\nq1 0,1 q2\nq2 0,1 q3').automato;
  assert.equal(determinizar(n3).automato.nomes.length, 8);
  assert.equal(minimizar(n3).automato.nomes.length, 8);
});

test('remoção de ε', () => {
  const r = removerEpsilon(afnDe('(a|b)*abb'));
  assert.equal(tipoAutomato(r.automato), 'AFN');
  assert.ok(r.fechos.find((f) => f.estado === 'q0').fecho.length === 5);
  // Sobram o inicial e um estado por ocorrência de símbolo (5): o autômato de posições.
  assert.equal(r.automato.nomes.length, 6);
  assert.equal(r.removidos.length, 5);
  for (const re of ['a', 'ab', '(a|b)*', 'a(ba)*|b*c', '(ab|ba)*a?b+']) {
    const ocorrencias = Array.from(re).filter((c) => /[a-z]/.test(c)).length;
    assert.equal(removerEpsilon(afnDe(re)).automato.nomes.length, ocorrencias + 1, re);
  }
  // O resultado sem ε determinizado também dá 5 estados.
  assert.equal(determinizar(r.automato).automato.nomes.length, 5);
});

test('minimização: estados e partições por rodada', () => {
  const m = minimizar(determinizar(afnDe('(a|b)*abb')).automato);
  assert.equal(m.automato.nomes.length, 4);
  assert.equal(m.morto, -1);
  assert.deepEqual(m.rodadas.map((r) => r.map((b) => b.join('')).sort()), [
    ['ABCD', 'E'],
    ['ABC', 'D', 'E'],
    ['AC', 'B', 'D', 'E'],
  ]);
  assert.deepEqual(m.automato.nomes, ['A,C', 'B', 'D', 'E']);
  // Pares: A e C nunca são separados; D e E saem na rodada 0.
  const par = (p, q) => m.pares.find((x) => x.p === p && x.q === q).rodada;
  assert.equal(par('A', 'C'), null);
  assert.equal(par('D', 'E'), 0);
  assert.equal(par('C', 'D'), 1);
  assert.equal(par('A', 'B'), 2);
  // Contando o estado morto; ε e ∅ têm alfabeto vazio, então sobra um estado só.
  const casos = { 'a*b*': 3, '(ab)*': 3, '(b*ab*a)*b*': 2, 'a|b': 3, 'ε': 1, '∅': 1, '(a|b)*': 1 };
  for (const [re, n] of Object.entries(casos)) {
    const r = minimizar(afnDe(re));
    assert.equal(r.automato.nomes.length, n, re);
  }
  assert.equal(estadosUteis(minimizar(afnDe('a*b*')).automato), 2);
});

test('minimização de um AFD redundante (múltiplos de 3 em binário)', () => {
  // 6 estados, cada resto aparece duas vezes: o mínimo tem 3.
  const texto = `inicial r0
finais r0 s0
r0 0 s0
r0 1 r1
s0 0 r0
s0 1 s1
r1 0 r2
r1 1 s0
s1 0 s2
s1 1 r0
r2 0 s1
r2 1 r2
s2 0 r1
s2 1 s2`;
  const a = lerAutomatoTexto(texto).automato;
  const m = minimizar(a).automato;
  assert.equal(m.nomes.length, 3);
  for (let n = 0; n < 200; n++) assert.equal(aceita(m, n.toString(2)), n % 3 === 0, String(n));
});

test('todas as etapas aceitam as mesmas palavras', () => {
  for (const re of ['(a|b)*abb', 'a(ba)*|b*', '(ab|ba)*a?', '((a|ε)b)*', 'a*b*a*', '∅|a']) {
    const e = afnDe(re);
    const n = removerEpsilon(e).automato;
    const d = determinizar(n).automato;
    const m = minimizar(d).automato;
    for (const w of palavrasAte(['a', 'b'], 8)) {
      const esperado = aceita(e, w);
      assert.equal(aceita(n, w), esperado, `${re} / ${w}`);
      assert.equal(aceita(d, w), esperado, `${re} / ${w}`);
      assert.equal(aceita(m, w), esperado, `${re} / ${w}`);
    }
  }
});

test('aceitação de palavras', () => {
  const a = afnDe('(a|b)*abb');
  for (const w of ['abb', 'aabb', 'babb', 'abababb']) assert.equal(aceita(a, w), true, w);
  for (const w of ['', 'ab', 'abba', 'bbb', 'abc']) assert.equal(aceita(a, w), false, w);
  assert.deepEqual(exemplosAceitos(minimizar(a).automato, 4), ['abb', 'aabb', 'babb', 'aaabb']);
});

test('simulação passo a passo', () => {
  const d = minimizar(afnDe('(a|b)*abb')).automato;
  const r = simular(d, 'aabb');
  assert.equal(r.aceita, true);
  assert.equal(r.passos.length, 5);
  assert.deepEqual(r.passos.map((p) => p.lido), ['', 'a', 'aa', 'aab', 'aabb']);
  assert.deepEqual(r.passos.map((p) => d.nomes[p.estados[0]]), ['A,C', 'B', 'B', 'D', 'E']);
  const parcial = lerAutomatoTexto('inicial p\nfinais q\np a q').automato;
  const morre = simular(parcial, 'ab');
  assert.equal(morre.morreu, true);
  assert.deepEqual(morre.passos.at(-1).estados, []);
  // AFN-ε: o primeiro passo já traz o fecho-ε do inicial.
  assert.equal(simular(afnDe('(a|b)*abb'), '').passos[0].estados.length, 5);
});

test('equivalência com contraexemplo', () => {
  assert.equal(equivalentes(afnDe('a(ba)*'), afnDe('(ab)*a')).equivalentes, true);
  assert.equal(equivalentes(afnDe('(a|b)*'), afnDe('(a*b*)*')).equivalentes, true);
  assert.equal(equivalentes(afnDe('(a|b)*abb'), minimizar(afnDe('(a|b)*abb')).automato).equivalentes, true);
  const r = equivalentes(afnDe('a*'), afnDe('a*a'));
  assert.deepEqual(r, { equivalentes: false, contraexemplo: '', aceitaA: true, aceitaB: false });
  const s = equivalentes(afnDe('(a|b)*abb'), afnDe('(a|b)*bb'));
  assert.equal(s.contraexemplo, 'bb');
  assert.equal(s.aceitaB, true);
  // Alfabetos diferentes: c só existe em um dos lados.
  const t = equivalentes(afnDe('a*'), afnDe('a*|c'));
  assert.equal(t.contraexemplo, 'c');
});

test('complemento, união e interseção (construção do produto)', () => {
  const pares = afnDe('(b*ab*a)*b*');  // número par de a
  const fimB = afnDe('(a|b)*b');      // termina em b
  const comp = complemento(pares);
  const uniao = produto(pares, fimB, 'uniao');
  const inter = produto(pares, fimB, 'intersecao');
  for (const w of palavrasAte(['a', 'b'], 8)) {
    const par = (w.match(/a/g) ?? []).length % 2 === 0;
    const termina = w.endsWith('b');
    assert.equal(aceita(comp, w), !par, w);
    assert.equal(aceita(uniao, w), par || termina, w);
    assert.equal(aceita(inter, w), par && termina, w);
  }
  assert.equal(tipoAutomato(uniao), 'AFD');
  // Com os AFDs mínimos de entrada, o produto tem 2 x 2 = 4 estados.
  const pequeno = produto(minimizar(pares).automato, minimizar(fimB).automato, 'intersecao');
  assert.equal(pequeno.nomes.length, 4);
  assert.ok(pequeno.nomes.every((n) => /^\(.+; .+\)$/.test(n)));
  // AFN determinizado dentro de uma operação: os estados ganham o nome do conjunto.
  const nfa = lerAutomatoTexto('inicial p\nfinais q\np a p\np a q').automato;
  assert.deepEqual(complemento(nfa).nomes, ['{p}', '{p,q}']);
});

test('eliminação de estados devolve uma expressão equivalente (todas as palavras até tamanho 8)', () => {
  const fontes = [
    afnDe('(a|b)*abb'),
    afnDe('a(ba)*|b*'),
    afnDe('(ab|ba)*'),
    afnDe('(b*ab*a)*b*'),
    afnDe('a*b?a*'),
    lerAutomatoTexto('inicial q0\nfinais q0\nq0 0 q0\nq0 1 q1\nq1 0 q2\nq1 1 q0\nq2 0 q1\nq2 1 q2').automato,  // múltiplos de 3
    lerAutomatoTexto('inicial p\nfinais r\np a q\np ε r\nq b p\nq b r').automato,  // AFN com ε
  ];
  for (const fonte of fontes) {
    for (const origem of [fonte, minimizar(fonte).automato]) {
      const r = eliminarEstados(origem);
      const volta = thompson(lerExpressao(r.texto).arvore, origem.alfabeto);
      for (const w of palavrasAte(origem.alfabeto, 8)) {
        assert.equal(aceita(volta, w), aceita(origem, w), `${r.texto} / "${w}"`);
      }
      assert.equal(r.passos.length, origem.nomes.length);
    }
  }
  assert.equal(eliminarEstados(minimizar(afnDe('a*')).automato).texto, 'a*');
  assert.equal(eliminarEstados(minimizar(afnDe('ab')).automato).texto, 'ab');
  assert.equal(eliminarEstados(lerAutomatoTexto('inicial p\nfinais q\np a p').automato).texto, '∅');
});

test('simplificação de expressões', () => {
  const s = (t) => expressaoParaTexto(simplificar(arvore(t)));
  assert.equal(s('∅|a'), 'a');
  assert.equal(s('a∅b'), '∅');
  assert.equal(s('εaε'), 'a');
  assert.equal(s('(a*)*'), 'a*');
  assert.equal(s('ε|a*'), 'a*');
  assert.equal(s('ε|ab'), '(ab)?');
  assert.equal(s('a|a|b'), 'a|b');
  assert.equal(s('∅*'), 'ε');
  assert.equal(s('ε|bb*'), 'b*');
  assert.equal(s('(b*b)?'), 'b*');
  assert.equal(s('(abab*)?'), '(abab*)?');
});

test('editor em texto: leitura, erros e ida e volta', () => {
  const r = lerAutomatoTexto(`# comentário
inicial q0
finais q1
q0 a,b q0
q0 a q1
q1 & q0`);
  assert.deepEqual(r.erros, []);
  assert.equal(tipoAutomato(r.automato), 'AFN-ε');
  assert.deepEqual(r.automato.alfabeto, ['a', 'b']);
  const texto = automatoParaTexto(r.automato);
  assert.equal(texto, 'inicial q0\nfinais q1\nq0 a,b q0\nq0 a q1\nq1 ε q0');
  assert.equal(automatoParaTexto(lerAutomatoTexto(texto).automato), texto);
  assert.match(lerAutomatoTexto('q0 a q1').erros[0], /falta a linha "inicial/);
  assert.match(lerAutomatoTexto('inicial q0\nq0 a').erros[0], /linha 2: esperava "origem símbolo destino"/);
  assert.match(lerAutomatoTexto('inicial q0\nq0 ab q1').erros[0], /linha 2: o símbolo "ab"/);
  assert.equal(tipoAutomato(lerAutomatoTexto('inicial q0\nq0 a q0').automato), 'AFD');
  assert.equal(tipoAutomato(lerAutomatoTexto('inicial q0\nq0 a q0\nq0 b q1').automato), 'AFD parcial');
});

test('JSON: exportar, importar e validar', () => {
  const m = minimizar(afnDe('(a|b)*abb')).automato;
  const json = automatoParaJSON(m);
  assert.equal(json.tipo, 'AFD');
  assert.deepEqual(json.estados, ['A,C', 'B', 'D', 'E']);
  const volta = lerAutomatoJSON(JSON.parse(JSON.stringify(json)));
  assert.deepEqual(volta.erros, []);
  assert.equal(equivalentes(volta.automato, m).equivalentes, true);
  assert.match(lerAutomatoJSON({ estados: ['a'], inicial: 'b' }).erros[0], /inicial/);
  assert.match(lerAutomatoJSON({ estados: ['a', 'a'], inicial: 'a' }).erros[0], /mesmo nome/);
  assert.match(lerAutomatoJSON({ estados: ['a'], inicial: 'a', transicoes: [{ de: 'a', simbolo: 'xy', para: 'a' }] }).erros[0], /transição 1/);
  assert.match(lerAutomatoJSON(null).erros[0], /objeto/);
  // Transições com ε também vão e voltam.
  const comEps = lerAutomatoTexto('inicial p\nfinais q\np ε q').automato;
  assert.equal(lerAutomatoJSON(automatoParaJSON(comEps)).automato.delta[0].get(EPS).size, 1);
});

test('remoção de estados mortos', () => {
  const m = minimizar(afnDe('a*b*')).automato;
  assert.equal(m.nomes.length, 3);
  const sem = removerMortos(m);
  assert.equal(sem.nomes.length, 2);
  assert.equal(tipoAutomato(sem), 'AFD parcial');
  assert.equal(equivalentes(sem, m).equivalentes, true);
  const vazio = removerMortos(minimizar(afnDe('∅')).automato);
  assert.equal(vazio.nomes.length, 1);
  assert.equal(vazio.finais.size, 0);
});

test('palavras até um tamanho e link', () => {
  assert.equal([...palavrasAte(['a', 'b'], 8)].length, 511);
  assert.deepEqual([...palavrasAte(['0', '1'], 2)], ['', '0', '1', '00', '01', '10', '11']);
  const texto = 'inicial q0\nfinais q1\nq0 ε q1\n# ação';
  assert.equal(decodificarLink(codificarParaLink(texto)), texto);
  assert.equal(decodificarLink('***'), null);
});
