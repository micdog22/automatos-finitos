// Posições dos estados e geometria das transições para o desenho em SVG (sem DOM).
//
// Layout em camadas: cada estado vai para a coluna da sua distância (em
// transições) a partir do inicial; dentro de cada coluna, a ordem é ajustada
// pela média das posições dos vizinhos (heurística do baricentro), o que
// diminui os cruzamentos. As transições são curvas quadráticas: retas quando
// nada atrapalha, curvadas quando há transição de volta ou um estado no meio.

import { EPS } from './regex.js';

export const RAIO = 22;
const PASSO_X = 150;
const PASSO_Y = 96;
const MARGEM = 56;

export function raioDo(nome) {
  return Math.max(RAIO, Array.from(nome).length * 4.4 + 10);
}

function vizinhos(a) {
  const lista = a.nomes.map(() => new Set());
  a.delta.forEach((m, q) => {
    for (const conj of m.values()) for (const p of conj) if (p !== q) lista[q].add(p);
  });
  return lista;
}

/**
 * Rótulos para o desenho: nomes longos (pares do produto, conjuntos) viram
 * p0, p1, ... e a tabela mostra o nome completo.
 */
export function rotulosDesenho(a, limite = 8) {
  const abreviado = a.nomes.some((n) => Array.from(n).length > limite);
  return { rotulos: abreviado ? a.nomes.map((_, q) => `p${q}`) : [...a.nomes], abreviado };
}

/** Posições iniciais { x[], y[] } dos estados. `ocultos` não entram no desenho. */
export function layoutAutomato(a, ocultos = new Set(), rotulos = a.nomes) {
  const n = a.nomes.length;
  const camada = new Array(n).fill(-1);
  const viz = vizinhos(a);
  const fila = [a.inicial];
  camada[a.inicial] = 0;
  const ordemBusca = [a.inicial];
  while (fila.length) {
    const q = fila.shift();
    for (const p of [...viz[q]].sort((x, y) => x - y)) {
      if (camada[p] < 0 && !ocultos.has(p)) {
        camada[p] = camada[q] + 1;
        fila.push(p);
        ordemBusca.push(p);
      }
    }
  }
  let ultima = Math.max(0, ...camada);
  for (let q = 0; q < n; q++) {
    if (camada[q] < 0 && !ocultos.has(q)) {
      camada[q] = ultima + 1;
      ordemBusca.push(q);
    }
  }
  ultima = Math.max(0, ...camada);
  const colunas = Array.from({ length: ultima + 1 }, () => []);
  for (const q of ordemBusca) colunas[camada[q]].push(q);

  // Baricentro: algumas varreduras para a direita e para a esquerda.
  const posicaoNaColuna = new Array(n).fill(0);
  const atualizar = () => colunas.forEach((c) => c.forEach((q, i) => (posicaoNaColuna[q] = i)));
  atualizar();
  const reordenar = (c, ref) => {
    const peso = new Map(c.map((q) => {
      const vs = [...viz[q]].filter((p) => camada[p] === ref);
      return [q, vs.length ? vs.reduce((s, p) => s + posicaoNaColuna[p], 0) / vs.length : posicaoNaColuna[q]];
    }));
    c.sort((x, y) => peso.get(x) - peso.get(y) || posicaoNaColuna[x] - posicaoNaColuna[y]);
  };
  for (let volta = 0; volta < 3; volta++) {
    for (let k = 1; k < colunas.length; k++) {
      reordenar(colunas[k], k - 1);
      atualizar();
    }
    for (let k = colunas.length - 2; k >= 0; k--) {
      reordenar(colunas[k], k + 1);
      atualizar();
    }
  }

  // Espaçamento que se adapta ao tamanho dos círculos.
  const raios = rotulos.map((r) => raioDo(r));
  const maiorRaio = Math.max(RAIO, ...raios);
  const passoY = Math.max(PASSO_Y, 2 * maiorRaio + 40);
  const maior = Math.max(...colunas.map((c) => c.length));
  const x = new Array(n).fill(0);
  const y = new Array(n).fill(0);
  let xAtual = MARGEM + 40 - PASSO_X;
  let raioAnterior = RAIO;
  colunas.forEach((c, k) => {
    const raioColuna = Math.max(RAIO, ...c.map((q) => raios[q]));
    xAtual += k === 0 ? PASSO_X : Math.max(PASSO_X, raioAnterior + raioColuna + 90);
    raioAnterior = raioColuna;
    const deslocamento = ((maior - c.length) * passoY) / 2;
    c.forEach((q, i) => {
      x[q] = xAtual;
      y[q] = MARGEM + 30 + deslocamento + i * passoY;
    });
  });
  return { x, y };
}

const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const soma = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
const escala = (p, k) => ({ x: p.x * k, y: p.y * k });
const norma = (p) => Math.hypot(p.x, p.y) || 1;
const unit = (p) => escala(p, 1 / norma(p));

function distanciaAoSegmento(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return norma(sub(p, soma(a, escala(ab, t))));
}

const f = (v) => Math.round(v * 10) / 10;

/**
 * Geometria do desenho: caminhos das transições (agrupando símbolos com a
 * mesma origem e o mesmo destino), posição dos rótulos, seta do inicial e a
 * caixa que envolve tudo.
 */
export function geometria(a, pos, ocultos = new Set(), rotulos = a.nomes) {
  const visivel = (q) => !ocultos.has(q);
  const centro = (q) => ({ x: pos.x[q], y: pos.y[q] });
  const raio = (q) => raioDo(rotulos[q]);
  const grupos = new Map();
  a.delta.forEach((m, de) => {
    if (!visivel(de)) return;
    for (const s of [EPS, ...a.alfabeto]) {
      for (const para of m.get(s) ?? []) {
        if (!visivel(para)) continue;
        const k = `${de},${para}`;
        if (!grupos.has(k)) grupos.set(k, { de, para, simbolos: [] });
        grupos.get(k).simbolos.push(s);
      }
    }
  });
  // Direção (em radianos) mais afastada das transições que saem ou chegam no estado.
  const ladoLivre = (q) => {
    const angulos = [];
    for (const g of grupos.values()) {
      if (g.de === g.para) continue;
      if (g.de === q) angulos.push(Math.atan2(pos.y[g.para] - pos.y[q], pos.x[g.para] - pos.x[q]));
      if (g.para === q) angulos.push(Math.atan2(pos.y[g.de] - pos.y[q], pos.x[g.de] - pos.x[q]));
    }
    if (q === a.inicial) angulos.push(Math.PI);  // a seta do inicial vem da esquerda
    const candidatos = [-Math.PI / 2, Math.PI / 2, 0, Math.PI];  // cima, baixo, direita, esquerda
    let melhor = candidatos[0];
    let folga = -1;
    for (const c of candidatos) {
      let minimo = Math.PI;
      for (const x of angulos) {
        const diferenca = Math.abs(Math.atan2(Math.sin(c - x), Math.cos(c - x)));
        minimo = Math.min(minimo, diferenca);
      }
      if (minimo > folga + 1e-9) {
        folga = minimo;
        melhor = c;
      }
    }
    return melhor;
  };
  const arestas = [];
  const limites = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const incluir = (x, y, folga = 0) => {
    limites.x0 = Math.min(limites.x0, x - folga);
    limites.y0 = Math.min(limites.y0, y - folga);
    limites.x1 = Math.max(limites.x1, x + folga);
    limites.y1 = Math.max(limites.y1, y + folga);
  };
  a.nomes.forEach((_, q) => {
    if (visivel(q)) incluir(pos.x[q], pos.y[q], raio(q) + 4);
  });
  for (const g of grupos.values()) {
    const rotulo = g.simbolos.join(', ');
    const P = centro(g.de);
    const r = raio(g.de);
    if (g.de === g.para) {
      // Laço do lado mais livre do estado (de preferência em cima).
      const dir = ladoLivre(g.de);
      const giro = (ang) => ({ x: Math.cos(dir + ang), y: Math.sin(dir + ang) });
      const em = (v, raio) => soma(P, escala(v, raio));
      const s = em(giro(-0.52), r);
      const e = em(giro(0.52), r + 2);
      const c1 = em(giro(-0.75), r + 52);
      const c2 = em(giro(0.75), r + 52);
      const L = em(giro(0), r + 50);
      arestas.push({
        de: g.de, para: g.para, rotulo, laco: true,
        d: `M ${f(s.x)} ${f(s.y)} C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(e.x)} ${f(e.y)}`,
        lx: f(L.x), ly: f(L.y),
      });
      incluir(L.x, L.y, 20);
      continue;
    }
    const Q = centro(g.para);
    const volta = grupos.has(`${g.para},${g.de}`);
    const atrapalha = a.nomes.some((_, k) => visivel(k) && k !== g.de && k !== g.para && distanciaAoSegmento(centro(k), P, Q) < raio(k) + 8);
    const d = sub(Q, P);
    // Arestas longas que desviam de estados curvam mais, para não se amontoarem.
    const curva = volta ? 26 : atrapalha ? 30 + 0.18 * norma(d) : 0;
    const normal = unit({ x: -d.y, y: d.x });
    const C = soma(escala(soma(P, Q), 0.5), escala(normal, curva));
    const S = soma(P, escala(unit(sub(C, P)), r));
    const E = sub(Q, escala(unit(sub(Q, C)), raio(g.para) + 2));
    const meio = soma(soma(escala(S, 0.25), escala(C, 0.5)), escala(E, 0.25));
    const lado = curva !== 0 ? 1 : -1;
    const L = soma(meio, escala(normal, 11 * lado));
    arestas.push({ de: g.de, para: g.para, rotulo, laco: false, d: `M ${f(S.x)} ${f(S.y)} Q ${f(C.x)} ${f(C.y)} ${f(E.x)} ${f(E.y)}`, lx: f(L.x), ly: f(L.y) });
    incluir(L.x, L.y, 18);
    incluir(C.x, C.y, 4);
  }
  // Seta do inicial, vindo da esquerda.
  const ini = centro(a.inicial);
  const ri = raio(a.inicial);
  const seta = { d: `M ${f(ini.x - ri - 36)} ${f(ini.y)} L ${f(ini.x - ri - 2)} ${f(ini.y)}` };
  incluir(ini.x - ri - 40, ini.y, 4);
  const margem = 14;
  return {
    arestas,
    seta,
    caixa: {
      x: f(limites.x0 - margem),
      y: f(limites.y0 - margem),
      largura: f(limites.x1 - limites.x0 + 2 * margem),
      altura: f(limites.y1 - limites.y0 + 2 * margem),
    },
  };
}
