import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lerExpressao } from '../src/regex.js';
import { determinizar, lerAutomatoTexto, minimizar, produto, removerEpsilon, thompson } from '../src/automato.js';
import { geometria, layoutAutomato, raioDo, rotulosDesenho } from '../src/desenho.js';

const afn = (re) => thompson(lerExpressao(re).arvore);

function confereDesenho(a) {
  const { rotulos } = rotulosDesenho(a);
  const pos = layoutAutomato(a, new Set(), rotulos);
  const geo = geometria(a, pos, new Set(), rotulos);
  // Nenhum par de estados se sobrepõe.
  for (let p = 0; p < a.nomes.length; p++) {
    assert.ok(Number.isFinite(pos.x[p]) && Number.isFinite(pos.y[p]));
    for (let q = p + 1; q < a.nomes.length; q++) {
      const d = Math.hypot(pos.x[p] - pos.x[q], pos.y[p] - pos.y[q]);
      assert.ok(d >= raioDo(rotulos[p]) + raioDo(rotulos[q]), `${a.nomes[p]} encosta em ${a.nomes[q]}`);
    }
  }
  // O inicial fica na primeira coluna.
  assert.equal(Math.min(...pos.x), pos.x[a.inicial]);
  // Uma curva por par (origem, destino); laços para transições do estado para ele mesmo.
  const pares = new Set();
  a.delta.forEach((m, de) => {
    for (const conj of m.values()) for (const para of conj) pares.add(`${de},${para}`);
  });
  assert.equal(geo.arestas.length, pares.size);
  for (const ar of geo.arestas) {
    assert.equal(ar.laco, ar.de === ar.para);
    assert.match(ar.d, /^M [-\d.]+ [-\d.]+ [QC] /);
  }
  // A caixa envolve todos os estados.
  for (let q = 0; q < a.nomes.length; q++) {
    const r = raioDo(rotulos[q]);
    assert.ok(pos.x[q] - r >= geo.caixa.x && pos.x[q] + r <= geo.caixa.x + geo.caixa.largura);
    assert.ok(pos.y[q] - r >= geo.caixa.y && pos.y[q] + r <= geo.caixa.y + geo.caixa.altura);
  }
  return geo;
}

test('desenhos sem sobreposição nas etapas da conversão', () => {
  for (const re of ['(a|b)*abb', '(ab|ba)*a?', 'a(ba)*|b*c', '(0|1)*1(0|1)']) {
    const e = afn(re);
    const s = removerEpsilon(e).automato;
    const d = determinizar(s).automato;
    for (const a of [e, s, d, minimizar(d).automato]) confereDesenho(a);
  }
});

test('rótulos agrupados e laços', () => {
  const a = lerAutomatoTexto('inicial q0\nfinais q1\nq0 a,b q0\nq0 a q1\nq1 b q1').automato;
  const geo = confereDesenho(a);
  const laco = geo.arestas.find((x) => x.de === 0 && x.para === 0);
  assert.equal(laco.rotulo, 'a, b');
  assert.equal(laco.laco, true);
});

test('nomes longos viram abreviações no desenho', () => {
  const ed = lerAutomatoTexto('inicial q0\nfinais q2\nq0 a,b q0\nq0 a q1\nq1 b q2\nq2 a,b q2').automato;
  const p = produto(minimizar(afn('(a|b)*abb')).automato, ed, 'intersecao');
  const { rotulos, abreviado } = rotulosDesenho(p);
  assert.equal(abreviado, true);
  assert.deepEqual(rotulos.slice(0, 3), ['p0', 'p1', 'p2']);
  confereDesenho(p);
  assert.equal(rotulosDesenho(afn('ab')).abreviado, false);
});
