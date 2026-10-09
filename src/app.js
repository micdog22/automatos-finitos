// Interface da página: etapas da conversão, grafos arrastáveis, simulação,
// editor, operações e eliminação de estados.
import { EPS, expressaoParaTexto, lerExpressao } from './regex.js';
import {
  automatoParaJSON,
  automatoParaTexto,
  codificarParaLink,
  complemento,
  decodificarLink,
  determinizar,
  eliminarEstados,
  equivalentes,
  estadosUteis,
  ehMorto,
  exemplosAceitos,
  lerAutomatoJSON,
  lerAutomatoTexto,
  minimizar,
  produto,
  removerEpsilon,
  removerMortos,
  simular,
  thompson,
  tipoAutomato,
  transicoes,
} from './automato.js';
import { geometria, layoutAutomato, raioDo, rotulosDesenho } from './desenho.js';

const EXEMPLOS = ['(a|b)*abb', 'a(ba)*|b*', '(ab|ba)*', '(0|1)*1(0|1)', '(b*ab*a)*b*', 'ab*c?'];
const EDITOR_INICIAL = `# AFN: palavras que contêm ab
inicial q0
finais q2
q0 a,b q0
q0 a q1
q1 b q2
q2 a,b q2`;
const CHAVES = { expressao: 'automatos-finitos:expressao', uniao: 'automatos-finitos:uniao', editor: 'automatos-finitos:editor' };
const MAX_DESENHO = 60;
const SVG = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const estado = { uniao: '|', A: null, B: null, sim: null };
const graficos = new Map();

// ---------------------------------------------------------------- utilidades

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue;
    e.append(typeof f === 'string' ? document.createTextNode(f) : f);
  }
  return e;
}

function svgEl(tag, atributos = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
  return e;
}

function limpar(no) {
  while (no.firstChild) no.removeChild(no.firstChild);
}

function ler(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento local: segue sem salvar
  }
}

function status(msg) {
  const s = $('status');
  s.textContent = msg;
  setTimeout(() => {
    if (s.textContent === msg) s.textContent = '';
  }, 3500);
}

const palavraTexto = (w) => (w === '' ? 'ε (a palavra vazia)' : `"${w}"`);
const conjuntoTexto = (a, estados) => {
  const { rotulos } = rotulosDesenho(a);
  return `{${estados.map((q) => rotulos[q]).join(', ')}}`;
};

// ---------------------------------------------------------------- grafos

function desenhar(container, automato, opcoes = {}) {
  limpar(container);
  graficos.delete(container);
  if (!automato) return;
  if (automato.nomes.length > MAX_DESENHO) {
    container.append(el('p', { class: 'muted', text: `Com ${automato.nomes.length} estados o desenho ficaria ilegível; veja a tabela.` }));
    return;
  }
  const ocultos = opcoes.ocultos ?? new Set();
  const { rotulos, abreviado } = rotulosDesenho(automato);
  const g = { automato, ocultos, rotulos, abreviado, destaque: opcoes.destaque ?? new Set(), pos: layoutAutomato(automato, ocultos, rotulos), descricao: opcoes.descricao ?? 'Grafo do autômato' };
  graficos.set(container, g);
  montar(container, g);
}

function montar(container, g) {
  limpar(container);
  const a = g.automato;
  const geo = geometria(a, g.pos, g.ocultos, g.rotulos);
  const svg = svgEl('svg', {
    viewBox: `${geo.caixa.x} ${geo.caixa.y} ${geo.caixa.largura} ${geo.caixa.altura}`,
    width: Math.ceil(geo.caixa.largura),
    height: Math.ceil(geo.caixa.altura),
    role: 'img',
    'aria-label': `${g.descricao}: ${a.nomes.length} estados. Arraste os estados para reorganizar.`,
  });
  const idSeta = `ponta-${container.id}`;
  const defs = svgEl('defs');
  const marcador = svgEl('marker', { id: idSeta, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marcador.append(svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'ponta' }));
  defs.append(marcador);
  svg.append(defs);
  const seta = svgEl('path', { d: geo.seta.d, class: 'transicao', 'marker-end': `url(#${idSeta})` });
  svg.append(seta);
  const arestas = geo.arestas.map((ar) => {
    const caminho = svgEl('path', { d: ar.d, class: 'transicao', 'marker-end': `url(#${idSeta})` });
    const rotulo = svgEl('text', { x: ar.lx, y: ar.ly, class: 'rotulo' });
    rotulo.textContent = ar.rotulo;
    svg.append(caminho);
    return { caminho, rotulo };
  });
  // Rótulos depois das curvas, para ficarem por cima.
  for (const x of arestas) svg.append(x.rotulo);
  const nos = new Map();
  a.nomes.forEach((nomeCompleto, q) => {
    if (g.ocultos.has(q)) return;
    const nome = g.rotulos[q];
    const r = raioDo(nome);
    const grupo = svgEl('g', {
      class: `estado${g.destaque.has(q) ? ' ativo' : ''}`,
      transform: `translate(${g.pos.x[q]} ${g.pos.y[q]})`,
      tabindex: 0,
      'aria-label': `estado ${nomeCompleto}${q === a.inicial ? ', inicial' : ''}${a.finais.has(q) ? ', final' : ''}`,
    });
    grupo.append(svgEl('circle', { r, class: 'externo' }));
    if (a.finais.has(q)) grupo.append(svgEl('circle', { r: r - 4 }));
    const t = svgEl('text', {});
    t.textContent = nome;
    grupo.append(t);
    svg.append(grupo);
    nos.set(q, grupo);
    ativarArraste(svg, grupo, q, container, g);
  });
  g.elementos = { svg, seta, arestas, nos };
  if (g.abreviado) container.append(el('p', { class: 'muted small', text: 'Nomes longos aparecem abreviados no desenho (p0, p1, ...); a tabela mostra o nome completo.' }));
  container.append(svg);
}

// Recalcula só a geometria das transições (usado enquanto um estado é arrastado).
function reposicionar(g) {
  const geo = geometria(g.automato, g.pos, g.ocultos, g.rotulos);
  g.elementos.seta.setAttribute('d', geo.seta.d);
  geo.arestas.forEach((ar, i) => {
    const x = g.elementos.arestas[i];
    if (!x) return;
    x.caminho.setAttribute('d', ar.d);
    x.rotulo.setAttribute('x', ar.lx);
    x.rotulo.setAttribute('y', ar.ly);
  });
  for (const [q, grupo] of g.elementos.nos) grupo.setAttribute('transform', `translate(${g.pos.x[q]} ${g.pos.y[q]})`);
}

function ativarArraste(svg, grupo, q, container, g) {
  let arrastando = false;
  const ponto = (ev) => {
    const p = svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };
  grupo.addEventListener('pointerdown', (ev) => {
    arrastando = true;
    try {
      grupo.setPointerCapture(ev.pointerId);
    } catch {
      // ponteiro que não pode ser capturado: o arraste segue sem captura
    }
    ev.preventDefault();
  });
  grupo.addEventListener('pointermove', (ev) => {
    if (!arrastando) return;
    const p = ponto(ev);
    g.pos.x[q] = p.x;
    g.pos.y[q] = p.y;
    reposicionar(g);
  });
  const soltar = () => {
    if (!arrastando) return;
    arrastando = false;
    montar(container, g);  // reajusta a área do desenho
  };
  grupo.addEventListener('pointerup', soltar);
  grupo.addEventListener('pointercancel', soltar);
  // Teclado: setas movem o estado em foco.
  grupo.addEventListener('keydown', (ev) => {
    const passo = ev.shiftKey ? 40 : 10;
    const delta = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[ev.key];
    if (!delta) return;
    ev.preventDefault();
    g.pos.x[q] += delta[0];
    g.pos.y[q] += delta[1];
    montar(container, g);
    g.elementos.nos.get(q)?.focus();
  });
}

function destacar(container, conjunto) {
  const g = graficos.get(container);
  if (!g) return;
  g.destaque = conjunto;
  for (const [q, grupo] of g.elementos.nos) grupo.classList.toggle('ativo', conjunto.has(q));
}

// ---------------------------------------------------------------- tabelas

function tabelaTransicoes(tabela, a, opcoes = {}) {
  limpar(tabela);
  if (!a) return;
  const ocultos = opcoes.ocultos ?? new Set();
  const comEps = transicoes(a).some((t) => t.simbolo === EPS);
  const simbolos = comEps ? [EPS, ...a.alfabeto] : a.alfabeto;
  const conjuntos = opcoes.conjuntos ? new Map(opcoes.conjuntos.map((c) => [c.estado, c.conjunto])) : null;
  const { rotulos, abreviado } = rotulosDesenho(a);
  tabela.append(
    el('caption', { class: 'sr-only', text: 'Tabela de transições: → marca o estado inicial e * os finais' }),
    el('thead', {}, el('tr', {},
      el('th', { scope: 'col', text: 'Estado' }),
      abreviado ? el('th', { scope: 'col', text: 'Nome completo' }) : null,
      conjuntos ? el('th', { scope: 'col', text: 'Conjunto' }) : null,
      simbolos.map((s) => el('th', { scope: 'col', text: s })),
    )),
    el('tbody', {}, a.nomes.map((nome, q) => {
      if (ocultos.has(q)) return null;
      const marca = `${q === a.inicial ? '→ ' : ''}${a.finais.has(q) ? '* ' : ''}`;
      return el('tr', {},
        el('th', { scope: 'row', text: `${marca}${rotulos[q]}` }),
        abreviado ? el('td', { class: 'esquerda', text: nome }) : null,
        conjuntos ? el('td', { class: 'esquerda', text: `{${(conjuntos.get(nome) ?? []).join(', ')}}` }) : null,
        simbolos.map((s) => {
          const dest = [...(a.delta[q].get(s) ?? [])].filter((p) => !ocultos.has(p)).sort((x, y) => x - y);
          return dest.length
            ? el('td', { text: dest.map((p) => rotulos[p]).join(', ') })
            : el('td', { class: 'vazio', text: '∅' });
        }),
      );
    })),
  );
}

function info(id, texto) {
  $(id).textContent = texto;
}

// ---------------------------------------------------------------- expressão (A)

function mostrarErroExpressao(texto, r) {
  const caixa = $('erro-expressao');
  limpar(caixa);
  caixa.append(
    el('strong', { text: `Posição ${r.posicao}: ` }), r.erro,
    el('span', { class: 'marca', 'aria-hidden': 'true', text: `${texto}\n${' '.repeat(Math.max(0, r.posicao - 1))}^` }),
  );
  caixa.hidden = false;
  $('expressao').setAttribute('aria-invalid', 'true');
}

function limparEtapas() {
  for (const id of ['grafo-thompson', 'grafo-sem-eps', 'grafo-afd', 'grafo-minimo']) desenhar($(id), null);
  for (const id of ['tabela-thompson', 'tabela-fechos', 'tabela-sem-eps', 'tabela-afd', 'tabela-minimo', 'tabela-pares', 'rodadas', 'resumo-expressao']) limpar($(id));
  for (const id of ['info-thompson', 'info-sem-eps', 'info-afd', 'info-minimo']) info(id, '');
}

function atualizarExpressao() {
  const texto = $('expressao').value;
  gravar(CHAVES.expressao, texto);
  gravar(CHAVES.uniao, estado.uniao);
  const r = lerExpressao(texto, { uniao: estado.uniao });
  marcarExemplo(texto);
  if (r.erro) {
    estado.A = null;
    mostrarErroExpressao(texto, r);
    limparEtapas();
    atualizarSimulacao();
    return;
  }
  $('erro-expressao').hidden = true;
  $('expressao').removeAttribute('aria-invalid');
  try {
    const t = thompson(r.arvore);
    const s = removerEpsilon(t);
    const d = determinizar(s.automato);
    const m = minimizar(d.automato);
    estado.A = { arvore: r.arvore, thompson: t, semEps: s, afd: d, minimo: m };
  } catch (e) {
    estado.A = null;
    limparEtapas();
    const caixa = $('erro-expressao');
    caixa.textContent = `Não deu para construir o AFD: ${e.message}.`;
    caixa.hidden = false;
    atualizarSimulacao();
    return;
  }
  renderEtapas();
  atualizarSimulacao();
}

function renderEtapas() {
  const { arvore, thompson: t, semEps, afd, minimo } = estado.A;
  const resumo = $('resumo-expressao');
  limpar(resumo);
  const aceitas = exemplosAceitos(minimo.automato, 8, 8);
  resumo.append(el('ul', { class: 'resumo' },
    el('li', {}, 'Lida como ', el('code', { text: expressaoParaTexto(arvore, { uniao: estado.uniao }) }), ` sobre o alfabeto {${t.alfabeto.join(', ')}}`),
    el('li', { text: `Estados: ${t.nomes.length} no AFN-ε, ${semEps.automato.nomes.length} sem ε, ${afd.automato.nomes.length} no AFD e ${minimo.automato.nomes.length} no mínimo.` }),
    el('li', { text: aceitas.length ? `Primeiras palavras aceitas: ${aceitas.map((w) => (w === '' ? 'ε' : w)).join(', ')}` : 'Nenhuma palavra de até 8 símbolos é aceita.' }),
  ));

  const nEps = transicoes(t).filter((x) => x.simbolo === EPS).length;
  info('info-thompson', `${t.nomes.length} estados e ${transicoes(t).length} transições (${nEps} com ε).`);
  desenhar($('grafo-thompson'), t, { descricao: 'AFN-ε de Thompson' });
  tabelaTransicoes($('tabela-thompson'), t);

  const fechos = $('tabela-fechos');
  limpar(fechos);
  fechos.append(
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Estado' }), el('th', { scope: 'col', text: 'Fecho-ε' }))),
    el('tbody', {}, semEps.fechos.map((f) => el('tr', {}, el('th', { scope: 'row', text: f.estado }), el('td', { class: 'esquerda', text: `{${f.fecho.join(', ')}}` })))),
  );
  info('info-sem-eps', `${semEps.automato.nomes.length} estados${semEps.removidos.length ? `; inalcançáveis removidos: ${semEps.removidos.join(', ')}` : ''}.`);
  desenhar($('grafo-sem-eps'), semEps.automato, { descricao: 'AFN sem transições ε' });
  tabelaTransicoes($('tabela-sem-eps'), semEps.automato);

  info('info-afd', `${afd.automato.nomes.length} estados; ${tipoAutomato(afd.automato) === 'AFD' ? 'todas as transições existem' : 'onde não há transição, a palavra é rejeitada'}.`);
  desenhar($('grafo-afd'), afd.automato, { descricao: 'AFD da construção de subconjuntos' });
  tabelaTransicoes($('tabela-afd'), afd.automato, { conjuntos: afd.subconjuntos });

  const rodadas = $('rodadas');
  limpar(rodadas);
  minimo.rodadas.forEach((r, k) => {
    const texto = r.map((bloco) => `{${bloco.join(', ')}}`).join(' ');
    rodadas.append(el('li', { text: k === 0 ? `${texto}  (finais e não finais)` : texto }));
  });
  rodadas.append(el('li', { class: 'muted', text: 'Nada mudou: cada bloco vira um estado do AFD mínimo.' }));
  renderPares(minimo);
  renderMinimo();
}

function renderPares(minimo) {
  const tabela = $('tabela-pares');
  limpar(tabela);
  const nomes = minimo.completado.nomes;
  const rodada = new Map(minimo.pares.map((p) => [`${p.p}|${p.q}`, p.rodada]));
  tabela.append(
    el('caption', { class: 'sr-only', text: 'Rodada em que cada par de estados foi separado; ≡ marca pares equivalentes' }),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: '' }), nomes.slice(0, -1).map((n) => el('th', { scope: 'col', text: n })))),
    el('tbody', {}, nomes.slice(1).map((q, i) => el('tr', {},
      el('th', { scope: 'row', text: q }),
      nomes.slice(0, -1).map((p, j) => {
        if (j > i) return el('td', { text: '' });
        const r = rodada.get(`${p}|${q}`);
        return r === null ? el('td', { class: 'par-sim', text: '≡' }) : el('td', { text: String(r) });
      }),
    ))),
  );
}

function renderMinimo() {
  if (!estado.A) return;
  const { minimo } = estado.A;
  const a = minimo.automato;
  const mortos = new Set(a.nomes.map((_, q) => q).filter((q) => q !== a.inicial && ehMorto(a, q)));
  const ocultos = $('mostrar-morto').checked ? new Set() : mortos;
  const uteis = estadosUteis(a);
  info('info-minimo', `${a.nomes.length} estados${uteis !== a.nomes.length ? ` (${uteis} sem contar o estado morto)` : ''}${minimo.removidos.length ? `; inalcançáveis removidos antes: ${minimo.removidos.join(', ')}` : ''}.`);
  desenhar($('grafo-minimo'), a, { ocultos, descricao: 'AFD mínimo' });
  tabelaTransicoes($('tabela-minimo'), a);
}

function marcarExemplo(texto) {
  for (const b of $('exemplos').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.expressao === texto && estado.uniao === '|'));
}

// ---------------------------------------------------------------- simulação

function automatoDaSimulacao() {
  const qual = $('simular-em').value;
  if (qual === 'editor') return estado.B;
  if (!estado.A) return null;
  return { thompson: estado.A.thompson, semEps: estado.A.semEps.automato, afd: estado.A.afd.automato, minimo: estado.A.minimo.automato }[qual];
}

function atualizarSimulacao() {
  const a = automatoDaSimulacao();
  if (!a) {
    estado.sim = null;
    desenhar($('grafo-simulacao'), null);
    $('sim-estado').textContent = $('simular-em').value === 'editor' ? 'O editor (B) tem erros.' : 'Corrija a expressão para simular.';
    atualizarBotoes();
    return;
  }
  const palavra = $('palavra').value;
  const r = simular(a, palavra);
  estado.sim = { a, r, i: 0, simbolos: Array.from(palavra) };
  desenhar($('grafo-simulacao'), a, { descricao: 'Autômato da simulação' });
  mostrarPasso();
}

function mostrarPasso() {
  const { a, r, i, simbolos } = estado.sim;
  const passo = r.passos[i];
  destacar($('grafo-simulacao'), new Set(passo.estados));
  const alvo = $('sim-estado');
  limpar(alvo);
  const fim = i === r.passos.length - 1;
  alvo.append(
    'Lido: ', el('span', { class: 'lido', text: passo.lido || 'ε' }),
    passo.simbolo !== null
      ? el('span', {}, '  ·  Próximo: ', el('span', { class: 'proximo', text: passo.simbolo }), simbolos.length > i + 1 ? `  ·  Depois: ${simbolos.slice(i + 1).join('') || 'ε'}` : '')
      : '  (fim da palavra)',
    `  ·  Ativos: ${passo.estados.length ? conjuntoTexto(a, passo.estados) : '∅'}`,
  );
  if (fim || passo.estados.length === 0) {
    const veredito = passo.estados.length === 0
      ? `Rejeitada: depois de "${passo.lido}" não há transição possível.`
      : r.aceita ? 'Aceita: terminou em estado final.' : 'Rejeitada: terminou sem estado final.';
    alvo.append(el('br'), el('strong', { text: veredito }));
  }
  atualizarBotoes();
}

function atualizarBotoes() {
  const sim = estado.sim;
  const total = sim ? sim.r.passos.length : 0;
  $('sim-inicio').disabled = !sim || sim.i === 0;
  $('sim-voltar').disabled = !sim || sim.i === 0;
  $('sim-avancar').disabled = !sim || sim.i >= total - 1 || sim.r.passos[sim.i].estados.length === 0;
  $('sim-fim').disabled = !sim || sim.i >= total - 1;
}

function irPara(i) {
  if (!estado.sim) return;
  const ultimo = estado.sim.r.passos.length - 1;
  // Se a simulação morreu, não há passos úteis depois do conjunto vazio.
  const vazio = estado.sim.r.passos.findIndex((p) => p.estados.length === 0);
  const limite = vazio >= 0 ? vazio : ultimo;
  estado.sim.i = Math.max(0, Math.min(i, limite));
  mostrarPasso();
}

// ---------------------------------------------------------------- editor (B)

function atualizarEditor() {
  const texto = $('editor').value;
  gravar(CHAVES.editor, texto);
  const r = lerAutomatoTexto(texto);
  const erros = $('erros-editor');
  limpar(erros);
  for (const e of r.erros) erros.append(el('li', { text: e }));
  estado.B = r.automato;
  if (!r.automato) {
    info('info-editor', '');
    desenhar($('grafo-editor'), null);
    limpar($('tabela-editor'));
  } else {
    const a = r.automato;
    info('info-editor', `${tipoAutomato(a)} com ${a.nomes.length} estados sobre {${a.alfabeto.join(', ')}}.`);
    desenhar($('grafo-editor'), a, { descricao: 'Autômato do editor' });
    tabelaTransicoes($('tabela-editor'), a);
  }
  if ($('simular-em').value === 'editor') atualizarSimulacao();
}

function exportarJSON() {
  if (!estado.B) {
    status('Corrija o editor antes de exportar.');
    return;
  }
  const blob = new Blob([`${JSON.stringify(automatoParaJSON(estado.B), null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: 'automato.json' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('JSON exportado.');
}

async function importarJSON(ev) {
  const arquivo = ev.target.files?.[0];
  ev.target.value = '';
  if (!arquivo) return;
  let dados;
  try {
    dados = JSON.parse(await arquivo.text());
  } catch {
    status('O arquivo não é um JSON válido.');
    return;
  }
  const r = lerAutomatoJSON(dados);
  if (r.erros.length) {
    const erros = $('erros-editor');
    limpar(erros);
    for (const e of r.erros) erros.append(el('li', { text: `JSON: ${e}` }));
    return;
  }
  $('editor').value = automatoParaTexto(r.automato);
  atualizarEditor();
  status('Autômato importado.');
}

// ---------------------------------------------------------------- operações

function resultadoOperacao(classe, ...conteudo) {
  const alvo = $('resultado-operacao');
  limpar(alvo);
  alvo.className = `resultado ${classe}`;
  alvo.append(...conteudo);
}

function precisaAeB() {
  if (!estado.A || !estado.B) {
    resultadoOperacao('nao', !estado.A ? 'Corrija a expressão (A) primeiro.' : 'Corrija o editor (B) primeiro.');
    desenhar($('grafo-operacao'), null);
    limpar($('tabela-operacao'));
    return false;
  }
  return true;
}

function mostrarAutomatoResultado(a, descricao) {
  desenhar($('grafo-operacao'), a, { descricao });
  tabelaTransicoes($('tabela-operacao'), a);
}

function operacao(tipo) {
  if (tipo === 'complemento-a' || tipo === 'complemento-b') {
    const fonte = tipo === 'complemento-a' ? estado.A?.minimo.automato : estado.B;
    if (!fonte) {
      resultadoOperacao('nao', tipo === 'complemento-a' ? 'Corrija a expressão (A) primeiro.' : 'Corrija o editor (B) primeiro.');
      return;
    }
    const sigma = [...new Set([...(estado.A?.minimo.automato.alfabeto ?? []), ...(estado.B?.alfabeto ?? [])])].sort();
    const c = complemento(fonte, sigma);
    const m = minimizar(c).automato;
    resultadoOperacao('sim', `Complemento de ${tipo === 'complemento-a' ? 'A' : 'B'} em relação a Σ = {${sigma.join(', ')}}: ${c.nomes.length} estados (o mínimo tem ${m.nomes.length}). Exemplos aceitos: ${exemplosAceitos(c, 6, 6).map((w) => (w === '' ? 'ε' : w)).join(', ') || 'nenhum'}.`);
    mostrarAutomatoResultado(c, 'Complemento');
    return;
  }
  if (!precisaAeB()) return;
  const A = estado.A.minimo.automato;
  if (tipo === 'equivalencia') {
    const r = equivalentes(A, estado.B);
    if (r.equivalentes) {
      resultadoOperacao('sim', 'Equivalentes: A e B aceitam exatamente as mesmas palavras.');
    } else {
      resultadoOperacao('nao', `Não são equivalentes: a palavra ${palavraTexto(r.contraexemplo)} é ${r.aceitaA ? 'aceita por A e rejeitada por B' : 'aceita por B e rejeitada por A'} (é o menor contraexemplo).`);
    }
    desenhar($('grafo-operacao'), null);
    limpar($('tabela-operacao'));
    return;
  }
  const p = produto(A, estado.B, tipo);
  const m = minimizar(p).automato;
  resultadoOperacao('sim', `${tipo === 'uniao' ? 'A ∪ B' : 'A ∩ B'}: ${p.nomes.length} pares alcançáveis (o AFD mínimo tem ${m.nomes.length} estados). Exemplos aceitos: ${exemplosAceitos(p, 6, 6).map((w) => (w === '' ? 'ε' : w)).join(', ') || 'nenhum'}.`);
  mostrarAutomatoResultado(p, tipo === 'uniao' ? 'Produto para a união' : 'Produto para a interseção');
}

// ---------------------------------------------------------------- eliminação de estados

function eliminacao(qual) {
  const passos = $('passos-eliminacao');
  limpar(passos);
  const alvo = $('resultado-eliminacao');
  const fonte = qual === 'a' ? (estado.A ? removerMortos(estado.A.minimo.automato) : null) : estado.B;
  if (!fonte) {
    alvo.className = 'resultado nao';
    alvo.textContent = qual === 'a' ? 'Corrija a expressão (A) primeiro.' : 'Corrija o editor (B) primeiro.';
    return;
  }
  const r = eliminarEstados(fonte, { uniao: estado.uniao });
  passos.append(el('li', { text: `Novo início ligado por ε a ${fonte.nomes[fonte.inicial]}; cada final ligado por ε ao novo fim.` }));
  for (const p of r.passos) {
    passos.append(el('li', {},
      `Eliminando ${p.estado}${p.laco ? ` (laço: ` : ''}`, p.laco ? el('code', { text: p.laco }) : '', p.laco ? ')' : '',
      p.mudancas.length ? el('ul', {}, p.mudancas.map((m) => el('li', {}, el('code', { text: m })))) : ' (não liga ninguém)',
    ));
  }
  const volta = lerExpressao(r.texto, { uniao: estado.uniao });
  const confere = volta.arvore && equivalentes(thompson(volta.arvore, fonte.alfabeto), fonte).equivalentes;
  limpar(alvo);
  alvo.className = `resultado ${confere ? 'sim' : 'nao'}`;
  alvo.append('Expressão: ', el('code', { text: r.texto }), confere ? '  (conferido: aceita exatamente as mesmas palavras que o autômato)' : '  (atenção: a conferência falhou)');
}

// ---------------------------------------------------------------- link e início

async function copiarLink() {
  const base = location.href.split('#')[0];
  const link = `${base}#e=${codificarParaLink($('expressao').value)}&u=${estado.uniao === '+' ? 'mais' : 'barra'}&b=${codificarParaLink($('editor').value)}`;
  history.replaceState(null, '', link);
  try {
    if (!navigator.clipboard) throw new Error('sem área de transferência');
    await Promise.race([
      navigator.clipboard.writeText(link),
      new Promise((_, rejeita) => setTimeout(() => rejeita(new Error('sem resposta')), 1000)),
    ]);
    status('Link copiado.');
  } catch {
    status('Não deu para copiar automaticamente; o link está na barra de endereço.');
  }
}

function lerEndereco() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has('e') && !p.has('b')) return null;
  return {
    expressao: p.has('e') ? decodificarLink(p.get('e')) : null,
    uniao: p.get('u') === 'mais' ? '+' : '|',
    editor: p.has('b') ? decodificarLink(p.get('b')) : null,
  };
}

function iniciar() {
  for (const ex of EXEMPLOS) $('exemplos').append(el('button', { type: 'button', 'data-expressao': ex, 'aria-pressed': 'false', text: ex }));
  $('exemplos').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    estado.uniao = '|';
    document.querySelector('input[name="uniao"][value="|"]').checked = true;
    $('expressao').value = b.dataset.expressao;
    atualizarExpressao();
  });

  const endereco = lerEndereco();
  const salvaUniao = endereco?.uniao ?? ler(CHAVES.uniao);
  estado.uniao = salvaUniao === '+' ? '+' : '|';
  document.querySelector(`input[name="uniao"][value="${estado.uniao === '+' ? '+' : '|'}"]`).checked = true;
  $('expressao').value = endereco?.expressao ?? ler(CHAVES.expressao) ?? EXEMPLOS[0];
  $('editor').value = endereco?.editor ?? ler(CHAVES.editor) ?? EDITOR_INICIAL;

  let espera = 0;
  $('expressao').addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(atualizarExpressao, 250);
  });
  for (const r of document.querySelectorAll('input[name="uniao"]')) {
    r.addEventListener('change', () => {
      estado.uniao = r.value;
      atualizarExpressao();
    });
  }
  let esperaEditor = 0;
  $('editor').addEventListener('input', () => {
    clearTimeout(esperaEditor);
    esperaEditor = setTimeout(atualizarEditor, 250);
  });
  $('mostrar-morto').addEventListener('change', renderMinimo);
  $('simular-em').addEventListener('change', atualizarSimulacao);
  $('palavra').addEventListener('input', atualizarSimulacao);
  $('sim-inicio').addEventListener('click', () => irPara(0));
  $('sim-voltar').addEventListener('click', () => irPara(estado.sim.i - 1));
  $('sim-avancar').addEventListener('click', () => irPara(estado.sim.i + 1));
  $('sim-fim').addEventListener('click', () => irPara(Infinity));
  $('copiar-minimo').addEventListener('click', () => {
    if (!estado.A) return;
    $('editor').value = `# AFD mínimo de ${$('expressao').value}\n${automatoParaTexto(removerMortos(estado.A.minimo.automato))}`;
    atualizarEditor();
    status('AFD mínimo copiado para o editor.');
  });
  $('exportar-json').addEventListener('click', exportarJSON);
  $('importar-json').addEventListener('change', importarJSON);
  $('op-equivalencia').addEventListener('click', () => operacao('equivalencia'));
  $('op-uniao').addEventListener('click', () => operacao('uniao'));
  $('op-intersecao').addEventListener('click', () => operacao('intersecao'));
  $('op-complemento-a').addEventListener('click', () => operacao('complemento-a'));
  $('op-complemento-b').addEventListener('click', () => operacao('complemento-b'));
  $('eliminar-a').addEventListener('click', () => eliminacao('a'));
  $('eliminar-b').addEventListener('click', () => eliminacao('b'));
  $('copiar-link').addEventListener('click', copiarLink);

  atualizarEditor();
  atualizarExpressao();
}

iniciar();
