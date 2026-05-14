// ═══════════════════════════════════════════════════════════
//  respostas.js — Página de respostas e análise
// ═══════════════════════════════════════════════════════════

let _resCarregado = false;

// ── PASSO 2: Inicialização ───────────────────────────────
async function renderRespostas() {
  if (!_resCarregado) {
    await carregarRespostas();
  } else {
    aplicarFiltrosRes();
  }

  // Datas padrão na primeira vez
  const dataIni = document.getElementById('res-f-data-ini');
  if (dataIni && !dataIni.value) {
    const hoje = new Date(), ini = new Date();
    ini.setDate(hoje.getDate() - 30);
    document.getElementById('res-f-data-fim').value = hoje.toISOString().split('T')[0];
    dataIni.value = ini.toISOString().split('T')[0];
    await recarregarEFiltrar();
  }
}

async function carregarRespostas() {
  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.res.todos = Array.isArray(rows) ? rows : [];
    _resCarregado = true; // ← corrigido: era false
    aplicarFiltrosRes();
  } catch(e) {
    console.error('Erro ao carregar respostas:', e);
  }
}

async function recarregarEFiltrar() {
  const btn = document.querySelector('#sec-respostas .btn-filtrar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Buscando…';
  }
  _resCarregado = false;
  await carregarRespostas();
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Filtrar';
  }
}

// ── PASSO 3: Filtros corrigidos ──────────────────────────
function aplicarFiltrosRes() {
  const dataIni  = document.getElementById('res-f-data-ini')?.value || '';
  const dataFim  = document.getElementById('res-f-data-fim')?.value || '';
  const refeicao = document.getElementById('res-f-refeicao')?.value || '';
  const aval     = document.getElementById('res-f-avaliacao')?.value || '';
  const notaMin  = document.getElementById('res-f-nota-min')?.value || '';

  const ordemNota = { ruim:1, regular:2, bom:3, otimo:4 };
  const minVal    = ordemNota[notaMin] || 0;

  STATE.res.filtrados = STATE.res.todos.filter(r => {
    // Filtro de data
    const dr = r.created_at?.substring(0, 10) || '';
    if (dataIni && dr < dataIni) return false;
    if (dataFim && dr > dataFim) return false;

    // CORREÇÃO: normalizar periodo antes de comparar
    const periodoNorm = normPeriodo(r.periodo);
    if (refeicao && periodoNorm !== refeicao) return false;

    // Filtro de avaliação
    if (aval) {
      const map = {
        otimo:   ['Ótima','Ótimo'],
        bom:     ['Boa','Bom'],
        regular: ['Regular'],
        ruim:    ['Ruim'],
      };
      const alvos = map[aval] || [];
      if (![r.refeicao, r.atendimento, r.ambiente].some(v => alvos.includes(v))) return false;
    }

    // Filtro de nota mínima
    if (minVal > 0) {
      const notas = [r.refeicao, r.atendimento, r.ambiente].filter(notaValida);
      const ord   = { 'Ruim':1, 'Regular':2, 'Boa':3, 'Bom':3, 'Ótima':4, 'Ótimo':4 };
      if (!notas.length || !notas.every(v => (ord[v] || 0) >= minVal)) return false;
    }

    return true;
  });

  STATE.res.pagina = 1;
  renderStatsRes();
  renderGraficosRes();
  renderTabelaRes();
  renderPaginacaoRes();
}

function limparFiltrosRes() {
  const hoje = new Date(), ini = new Date();
  ini.setDate(hoje.getDate() - 30);
  ['res-f-refeicao', 'res-f-avaliacao', 'res-f-nota-min'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('res-f-data-fim').value = hoje.toISOString().split('T')[0];
  document.getElementById('res-f-data-ini').value = ini.toISOString().split('T')[0];
  recarregarEFiltrar();
}

// ── PASSO 4: Stats com cálculos corrigidos ───────────────
function renderStatsRes() {
  const d = STATE.res.filtrados;

  // Conta apenas notas válidas (ignora null, EMPTY, string vazia)
  const totalAv = d.reduce((a, r) =>
    a + [r.refeicao, r.atendimento, r.ambiente].filter(notaValida).length, 0);

  const pos = d.reduce((a, r) =>
    a + [r.refeicao, r.atendimento, r.ambiente]
      .filter(n => ['Ótima','Ótimo','Boa','Bom'].includes(n)).length, 0);
  const reg = d.reduce((a, r) =>
    a + [r.refeicao, r.atendimento, r.ambiente]
      .filter(n => n === 'Regular').length, 0);
  const neg = d.reduce((a, r) =>
    a + [r.refeicao, r.atendimento, r.ambiente]
      .filter(n => n === 'Ruim').length, 0);
  const obs = d.filter(r =>
    r.observacoes && r.observacoes.trim() && r.observacoes !== 'null').length;

  setEl('res-st-total',     d.length);
  setEl('res-st-positivas', pctStr(pos, totalAv));
  setEl('res-st-regulares', pctStr(reg, totalAv));
  setEl('res-st-negativas', pctStr(neg, totalAv));
  setEl('res-st-obs',       obs);
  setEl('res-badge-total',  `${d.length} registros`);
}

// ── PASSO 5: Gráficos corrigidos ────────────────────────
function renderGraficosRes() {
  const d = STATE.res.filtrados;

  // ── Pizza distribuição ──
  const cvPizza = document.getElementById('res-chart-pizza');
  if (cvPizza) {
    destroyChart('res-chart-pizza');
    const cont = { 'Ótimo':0, 'Bom':0, 'Regular':0, 'Ruim':0 };
    d.forEach(r => [r.refeicao, r.atendimento, r.ambiente].forEach(n => {
      if (!notaValida(n)) return;
      if (['Ótima','Ótimo'].includes(n)) cont['Ótimo']++;
      else if (['Boa','Bom'].includes(n)) cont['Bom']++;
      else if (n === 'Regular') cont['Regular']++;
      else if (n === 'Ruim') cont['Ruim']++;
    }));
    const totalN = Object.values(cont).reduce((a,b) => a+b, 0);

    new Chart(cvPizza.getContext('2d'), {
      type: 'doughnut',
      data: { datasets: [{ data: [cont['Ótimo'],cont['Bom'],cont['Regular'],cont['Ruim']],
        backgroundColor: ['#059669','#10b981','#d97706','#e11d48'],
        borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false, // ← evita loop
        cutout: '65%',
        plugins: { legend: { display: false } }
      }
    });

    setEl('res-pizza-total', totalN);
  const _pValores = [cont['Ótimo'],cont['Bom'],cont['Regular'],cont['Ruim']];
  const _pCores   = ['#059669','#10b981','#d97706','#e11d48'];
  const _pNomes   = ['Ótimo','Bom','Regular','Ruim'];
  const _pPcts    = pctMultiplo(_pValores, totalN);
  setHTML('res-leg-pizza', _pNomes.map((nome,i) =>
    `<div class="leg-item">
      <div class="leg-cor" style="background:${_pCores[i]}"></div>
      <span class="leg-txt">${nome}</span>
      <span class="leg-val">${_pValores[i]}</span>
      <span class="leg-pct">(${totalN ? _pPcts[i]+'%' : '—'})</span>
    </div>`
  ).join(''));
  }

  // ── Donut por refeição — CORREÇÃO: usa normPeriodo ──
  const cvRef = document.getElementById('res-chart-ref');
  if (cvRef) {
    destroyChart('res-chart-ref');
    const porRef = { cafe:0, almoco:0, jantar:0 };
    d.forEach(r => {
      // CORREÇÃO: normalizar periodo antes de contar
      const k = normPeriodo(r.periodo);
      if (k && porRef[k] !== undefined) porRef[k]++;
    });
    const totalRef = porRef.almoco + porRef.cafe + porRef.jantar;

    new Chart(cvRef.getContext('2d'), {
      type: 'doughnut',
      data: { datasets: [{ data: [porRef.almoco, porRef.cafe, porRef.jantar],
        backgroundColor: ['#2563eb','#ea580c','#7c3aed'],
        borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false, // ← evita loop
        cutout: '65%',
        plugins: { legend: { display: false } }
      }
    });

    setEl('res-ref-total', totalRef);
  const _rValores = [porRef.almoco, porRef.cafe, porRef.jantar];
  const _rNomes   = ['Almoço','Café da Manhã','Jantar'];
  const _rCores   = ['#2563eb','#ea580c','#7c3aed'];
  const _rPcts    = pctMultiplo(_rValores, totalRef);
  setHTML('res-leg-ref', _rNomes.map((nome,i) =>
    `<div class="leg-item">
      <div class="leg-cor" style="background:${_rCores[i]}"></div>
      <span class="leg-txt">${nome}</span>
      <span class="leg-val">${_rValores[i]}</span>
      <span class="leg-pct">(${totalRef ? _rPcts[i]+'%' : '—'})</span>
    </div>`
  ).join(''));
  }

  // ── Médias por categoria ──
  const mAtend = calcMediaCat(d, 'atendimento');
  const mAmb   = calcMediaCat(d, 'ambiente');
  const mRef   = calcMediaCat(d, 'refeicao');
  const mGeral = calcMedia(d);

  setEl('res-media-atend', mAtend !== null ? mAtend.toFixed(2).replace('.', ',') : '—');
  setEl('res-media-amb',   mAmb   !== null ? mAmb.toFixed(2).replace('.', ',')   : '—');
  setEl('res-media-ref',   mRef   !== null ? mRef.toFixed(2).replace('.', ',')   : '—');
  setEl('res-media-geral', mGeral !== null ? mGeral.toFixed(2).replace('.', ',') : '—');
}

// ── PASSO 6: Tabela ──────────────────────────────────────
function renderTabelaRes() {
  const ini  = (STATE.res.pagina - 1) * STATE.res.porPagina;
  const page = STATE.res.filtrados.slice(ini, ini + STATE.res.porPagina);

  setHTML('res-tabela-corpo', page.length
    ? page.map((r, i) => {
        const periodo  = normPeriodo(r.periodo);
        const nome = r.nome?.trim() || 'Anônimo';
        const tel  = r.telefone?.trim()
          ? `<br><small style="color:var(--tx3)">${r.telefone}</small>` : '';
        return `<tr>
          <td class="td-data">${fmtData(r.created_at)}</td>
          <td><span class="ref-badge ${classeRef(periodo)}">${nomePeriodo(periodo)}</span></td>
          <td>${celulaNota(r.refeicao)}</td>
          <td>${celulaNota(r.atendimento)}</td>
          <td>${celulaNota(r.ambiente)}</td>
          <td class="td-data col-restrito">${nome}${tel}</td>
          <td class="td-obs-txt" title="${r.observacoes || ''}">${r.observacoes || '<em class="vazio">—</em>'}</td>
          <td class="td-acoes">
            <button class="btn-menu" onclick="verDetalhesRes(${ini + i})" title="Ver detalhes">⋮</button>
          </td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="empty">Nenhuma resposta encontrada com os filtros aplicados.</td></tr>'
  );
}

// ── Paginação ─────────────────────────────────────────────
function renderPaginacaoRes() {
  const total   = STATE.res.filtrados.length;
  const totalPg = Math.ceil(total / STATE.res.porPagina);
  const ini     = (STATE.res.pagina - 1) * STATE.res.porPagina + 1;
  const fim     = Math.min(STATE.res.pagina * STATE.res.porPagina, total);

  setEl('res-pg-info', total
    ? `Mostrando ${ini}–${fim} de ${total}`
    : '0 registros');

  const container = document.getElementById('res-pg-btns');
  if (!container || totalPg <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  const pages = [];
  if (STATE.res.pagina > 1) pages.push({ l:'‹', p: STATE.res.pagina - 1 });
  for (let p = 1; p <= totalPg; p++) {
    if (p === 1 || p === totalPg || Math.abs(p - STATE.res.pagina) <= 1)
      pages.push({ l: String(p), p, a: p === STATE.res.pagina });
    else if (Math.abs(p - STATE.res.pagina) === 2)
      pages.push({ l:'…', p: null });
  }
  if (STATE.res.pagina < totalPg) pages.push({ l:'›', p: STATE.res.pagina + 1 });

  container.innerHTML = [...new Map(pages.map(p => [p.l + p.p, p])).values()]
    .map(p => `<button class="pg-btn${p.a ? ' ativo' : ''}"
      ${!p.p ? 'disabled' : `onclick="irPaginaRes(${p.p})"`}>${p.l}</button>`)
    .join('');
}

function irPaginaRes(p) {
  STATE.res.pagina = p;
  renderTabelaRes();
  renderPaginacaoRes();
}

function mudarPorPaginaRes() {
  STATE.res.porPagina = parseInt(document.getElementById('res-sel-pag').value);
  STATE.res.pagina    = 1;
  renderTabelaRes();
  renderPaginacaoRes();
}

// ── Modal detalhes ────────────────────────────────────────
function verDetalhesRes(idx) {
  const r = STATE.res.filtrados[idx];
  if (!r) return;
  const row = (l, v) =>
    `<div class="modal-row">
      <div class="modal-lbl">${l}</div>
      <div class="modal-val">${v}</div>
    </div>`;

  const periodo = normPeriodo(r.periodo);
  setHTML('res-modal-body', `
    ${row('Data/Hora',  fmtData(r.created_at))}
    ${row('Refeição',   `<span class="ref-badge ${classeRef(periodo)}">${nomePeriodo(periodo)}</span>`)}
    ${row('Avaliação',   celulaNota(r.refeicao))}
    ${row('Atendimento', celulaNota(r.atendimento))}
    ${row('Ambiente',    celulaNota(r.ambiente))}
    ${!document.body.classList.contains('perfil-visualizador')
        ? row('Nome',     r.nome     || '<em class="vazio">Anônimo</em>')
        : ''}
    ${!document.body.classList.contains('perfil-visualizador')
        ? row('Telefone', r.telefone || '<em class="vazio">—</em>')
        : ''}
    ${row('Observação',  r.observacoes || '<em class="vazio">—</em>')}
  `);
  document.getElementById('res-modal').classList.add('show');
}

function fecharModalRes() {
  document.getElementById('res-modal')?.classList.remove('show');
}


// ═══════════════════════════════════════════════════════════
//  Relatório Técnico de Satisfação — geração PDF
//  Dados agregados apenas (sem nome/telefone — LGPD)
// ═══════════════════════════════════════════════════════════
function gerarRelatorioRes() {
  // Bloqueio de perfil
  if (document.body.classList.contains('perfil-visualizador')) return;

  const d       = STATE.res.filtrados;
  const dataIni = document.getElementById('res-f-data-ini')?.value || '—';
  const dataFim = document.getElementById('res-f-data-fim')?.value || '—';
  const fmtFiltro = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
  const periodo   = document.getElementById('res-f-refeicao')?.value;
  const periodoTxt = periodo ? nomePeriodo(periodo) : 'Todos os períodos';
  const hoje = new Date().toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'});
  const agora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'});

  // ── Calcular indicadores agregados ────────────────────────
  const total    = d.length;
  const totalAv  = d.reduce((a,r) =>
    a + [r.refeicao,r.atendimento,r.ambiente].filter(notaValida).length, 0);

  const contar = (fn) => d.reduce((a,r) =>
    a + [r.refeicao,r.atendimento,r.ambiente].filter(fn).length, 0);

  const nOtimo   = contar(n => ['Ótima','Ótimo'].includes(n));
  const nBom     = contar(n => ['Boa','Bom'].includes(n));
  const nRegular = contar(n => n === 'Regular');
  const nRuim    = contar(n => n === 'Ruim');

  const pctsNotas = pctMultiplo([nOtimo, nBom, nRegular, nRuim], totalAv);

  const mAtend = calcMediaCat(d, 'atendimento');
  const mAmb   = calcMediaCat(d, 'ambiente');
  const mRef   = calcMediaCat(d, 'refeicao');
  const mGeral = calcMedia(d);
  const fmt2   = v => v !== null ? v.toFixed(2).replace('.',',') : '—';

  const porRef = {cafe:0, almoco:0, jantar:0};
  d.forEach(r => { const k = normPeriodo(r.periodo); if (k && porRef[k]!==undefined) porRef[k]++; });
  const pctsRef = pctMultiplo([porRef.almoco, porRef.cafe, porRef.jantar],
    porRef.almoco + porRef.cafe + porRef.jantar);

  // ── Top observações ───────────────────────────────────────
  const stop = new Set(['de','a','o','e','em','para','com','que','do','da','no','na',
    'um','uma','os','as','se','foi','por','mais','mas','não','já','bem','como',
    'esse','ao','dos','das','pelo','pela','este','esta','quando','sobre','sua','seu']);
  const freq = {};
  d.forEach(r => {
    if (!r.observacoes?.trim()) return;
    r.observacoes.toLowerCase()
      .replace(/[^a-záàâãéèêíïóôõöúüç\s]/gi,' ').split(/\s+/)
      .filter(w => w.length > 3 && !stop.has(w))
      .forEach(w => { freq[w] = (freq[w]||0)+1; });
  });
  const topObs = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const obsComTexto = d.filter(r => r.observacoes?.trim() && r.observacoes !== 'null');

  // ── Gerar barra HTML ──────────────────────────────────────
  const barra = (pct, cor) =>
    `<div style="display:inline-block;width:${Math.max(pct,1)}%;height:12px;background:${cor};border-radius:2px;vertical-align:middle"></div>`;

  // ── Classificação de média ────────────────────────────────
  const classificar = v => {
    if (v === null) return '—';
    if (v >= 3.5)  return 'Excelente';
    if (v >= 3.0)  return 'Bom';
    if (v >= 2.5)  return 'Regular — atenção';
    return 'Crítico — ação imediata';
  };

  // ── Insights automáticos ──────────────────────────────────
  const insights = [];
  const pctPos = calcPctPos(d), pctNeg = calcPctNeg(d);
  if (pctPos !== null) {
    if (pctPos >= 80) insights.push('Satisfação geral elevada (' + pctPos + '% positivas). Manter padrão operacional.');
    else if (pctPos >= 60) insights.push('Satisfação moderada (' + pctPos + '% positivas). Investigar pontos de queda.');
    else insights.push('Satisfação crítica (' + pctPos + '% positivas). Plano de ação necessário.');
  }
  if (mRef !== null && mRef < 2.5) insights.push('Qualidade da refeição com média crítica (' + fmt2(mRef) + '). Revisar cardápio e preparo.');
  if (mAtend !== null && mAtend < 2.5) insights.push('Atendimento com média crítica (' + fmt2(mAtend) + '). Avaliar capacitação da equipe.');
  if (mAmb !== null && mAmb < 2.5) insights.push('Ambiente com média crítica (' + fmt2(mAmb) + '). Verificar limpeza e infraestrutura.');
  if (pctNeg !== null && pctNeg > 10) insights.push(pctNeg + '% das avaliações são "Ruim". Identificar causa raiz com urgência.');
  if (!insights.length) insights.push('Indicadores dentro dos parâmetros esperados no período analisado.');

  // ── HTML do relatório ─────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<title>Relatório Técnico — RC Sobradinho</title>
<style>
  /* Manual de Redação do GDF:
     Margens: Superior 3cm | Inferior 2cm | Esquerda 3cm | Direita 2cm
     Fonte: Arial 12pt | Texto justificado | Espaçamento 1,5 */
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
    padding: 0;
  }
  /* Margens via @page — se aplicam a TODAS as páginas inclusive a 2ª+ */
  .pagina {
    width: 100%;
    background: #fff;
  }
  p, .item, li { text-align: justify; }

  /* Cabeçalho: brasão fixo à esquerda, textos centralizados na página */
  .cabecalho-inst {
    position: relative;
    display: flex;
    align-items: center;
    border-bottom: 1.5px solid #000;
    padding-bottom: 10px;
    margin-bottom: 20px;
    min-height: 70px;
  }
  .cab-brasao {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 60px;
    flex-shrink: 0;
  }
  .cab-brasao img {
    width: 60px;
    height: auto;
    object-fit: contain;
  }
  /* Texto ocupa toda a largura e centraliza */
  .cab-textos {
    flex: 1;
    text-align: center;
    padding: 0 70px; /* espaço para o brasão não sobrepor */
  }
  .cab-textos p { font-size: 9pt; line-height: 1.6; color: #000; text-align: center; }
  .cab-textos p:first-child { font-weight: bold; font-size: 10pt; }
  /* Título principal */
  .titulo-relatorio {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 20px 0 6px;
    color: #1a3a6e;
    letter-spacing: 0.5px;
  }

  /* Metadados */
  .meta { margin-bottom: 18px; }
  .meta p { font-size: 12pt; margin-bottom: 4px; }
  .meta strong { color: #1a3a6e; }
  /* Seções */
  .secao {
    margin-bottom: 20px;
    page-break-inside: avoid;
  }
  .secao-titulo {
    background: #1a3a6e;
    color: #fff;
    font-size: 10pt;
    font-weight: bold;
    padding: 5px 10px;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .secao-body { padding: 0 4px; }
  .item { margin-bottom: 6px; font-size: 12pt; line-height: 1.5; }
  /* Tabelas */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11pt;
    margin-bottom: 10px;
  }
  th {
    background: #e8edf5;
    color: #1a3a6e;
    font-weight: bold;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid #c8d4e8;
  }
  td {
    padding: 5px 8px;
    border: 1px solid #ddd;
    vertical-align: middle;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  .num { text-align: right; font-weight: bold; }
  .pct { text-align: right; color: #555; }
  /* Indicadores em destaque */
  .kpi-row {
    display: flex;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .kpi {
    flex: 1;
    min-width: 100px;
    border: 1px solid #c8d4e8;
    border-top: 3px solid #1a3a6e;
    border-radius: 4px;
    padding: 8px 10px;
    text-align: center;
  }
  .kpi-val {
    font-size: 18pt;
    font-weight: bold;
    color: #1a3a6e;
    display: block;
  }
  .kpi-lbl { font-size: 8pt; color: #666; }
  /* Alertas */
  .alerta {
    padding: 5px 10px;
    border-left: 3px solid #d97706;
    background: #fffbeb;
    margin-bottom: 6px;
    font-size: 10pt;
  }
  .alerta.critico { border-color: #e11d48; background: #fff1f2; }
  .alerta.positivo { border-color: #059669; background: #f0fdf4; }
  /* Barra de progresso */
  .barra-wrap {
    background: #f1f5f9;
    border-radius: 3px;
    height: 12px;
    overflow: hidden;
    display: inline-block;
    width: 120px;
    vertical-align: middle;
    margin: 0 6px;
  }
  .barra-fill { height: 100%; border-radius: 3px; }
  /* Rodapé */
  .rodape {
    margin-top: 20px;
    border-top: 1px solid #c8d4e8;
    padding-top: 8px;
    font-size: 8pt;
    color: #555;
    text-align: center;
    page-break-inside: avoid;
  }
  .aviso-lgpd {
    font-size: 8pt;
    color: #888;
    font-style: italic;
    text-align: center;
    margin-top: 6px;
    padding: 4px;
    border: 1px dashed #ccc;
    border-radius: 3px;
  }
  /* Assinatura */
  .assinatura {
    margin-top: 30px;
    display: flex;
    justify-content: flex-end;
  }
  .assinatura-bloco {
    text-align: center;
    width: 220px;
    border-top: 1px solid #333;
    padding-top: 6px;
    font-size: 9pt;
  }
  /* Margens consistentes em TODAS as páginas (inclusive 2ª+) */
  @page {
    size: A4;
    margin: 30mm 20mm 25mm 30mm;
    /* Numeração de página no canto inferior direito */
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #555;
    }
    @bottom-center {
      content: "";
    }
  }
  @media print {
    body { background: #fff !important; }
    .pagina { padding: 0; width: 100%; }
    .no-print { display: none !important; }
    .rodape { display: none !important; } /* rodapé no @page, não no HTML */
  }
  @media screen {
    body { background: #e5e5e5; }
    .pagina {
      width: 210mm;
      min-height: 297mm;
      margin: 10mm auto;
      padding: 30mm 20mm 25mm 30mm;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
  }
</style>
</head>
<body>
<div class="pagina">

  <!-- ── Cabeçalho institucional — brasão + hierarquia GDF ── -->
  <div class="cabecalho-inst">
    <div class="cab-brasao">
      <img src="data:image/png;base64,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" alt="Brasão do GDF">
    </div>
    <div class="cab-textos">
      <p>Governo do Distrito Federal</p>
      <p>Secretaria de Estado de Desenvolvimento Social do Distrito Federal</p>
      <p>Diretoria de Gestão de Equipamentos de Segurança Alimentar e Nutricional</p>
      <p>Gerência Regional de Segurança Alimentar e Nutricional de Sobradinho</p>
    </div>
  </div>

  <div class="titulo-relatorio">Relatório Técnico de Monitoramento da Satisfação dos Usuários</div>

  <!-- ── Identificação ── -->
  <div class="meta">
    <p><strong>Unidade:</strong> Restaurante Comunitário de Sobradinho</p>
    <p><strong>Período analisado:</strong> ${fmtFiltro(dataIni)} a ${fmtFiltro(dataFim)}</p>
    <p><strong>Refeição:</strong> ${periodoTxt}</p>
    <p><strong>Total de respostas no período:</strong> ${total}</p>
    <p><strong>Data de geração:</strong> ${hoje} às ${agora}</p>
  </div>

  <!-- ── 1. Relatório ── -->
  <div class="secao">
    <div class="secao-titulo">1. Relatório</div>
    <div class="secao-body">
      <p class="item">1.1. Trata-se de relatório técnico elaborado pela Gerência Regional de Segurança Alimentar e Nutricional de Sobradinho – GERSANSOB, em atendimento às diretrizes institucionais relativas ao monitoramento da satisfação dos usuários dos Restaurantes Comunitários, com vistas à avaliação da qualidade dos serviços prestados pela empresa contratada.</p>
      <p class="item">1.2. A coleta de dados foi realizada por meio de formulário digital de pesquisa de opinião, contemplando a avaliação da qualidade da refeição, do atendimento e do ambiente, com as classificações: Ótimo, Bom, Regular e Ruim, além de campo destinado a observações livres.</p>
      <p class="item">1.3. No período de <strong>${fmtFiltro(dataIni)}</strong> a <strong>${fmtFiltro(dataFim)}</strong>, foram registradas <strong>${total} avaliações</strong>, totalizando <strong>${totalAv} notas válidas</strong> distribuídas entre os três critérios avaliados.</p>
    </div>
  </div>

  <!-- ── 2. Análise dos Resultados ── -->
  <div class="secao">
    <div class="secao-titulo">2. Análise dos Resultados</div>
    <div class="secao-body">
      <p class="item">2.1. Procedeu-se à consolidação das informações obtidas no período, conforme apresentado a seguir:</p>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi">
          <span class="kpi-val">${total}</span>
          <span class="kpi-lbl">Total de Avaliações</span>
        </div>
        <div class="kpi" style="border-top-color:#059669">
          <span class="kpi-val" style="color:#059669">${pctPos !== null ? pctPos + '%' : '—'}</span>
          <span class="kpi-lbl">Positivas (Ótimo+Bom)</span>
        </div>
        <div class="kpi" style="border-top-color:#d97706">
          <span class="kpi-val" style="color:#d97706">${pctStr(nRegular, totalAv)}</span>
          <span class="kpi-lbl">Regulares</span>
        </div>
        <div class="kpi" style="border-top-color:#e11d48">
          <span class="kpi-val" style="color:#e11d48">${pctNeg !== null ? pctNeg + '%' : '—'}</span>
          <span class="kpi-lbl">Negativas (Ruim)</span>
        </div>
      </div>

      <!-- Tabela distribuição das notas -->
      <p class="item"><strong>2.1.1. Distribuição das avaliações por nota:</strong></p>
      <table>
        <tr>
          <th>Classificação</th>
          <th class="num">Qtd. de notas</th>
          <th class="pct">Percentual</th>
          <th>Representação</th>
        </tr>
        <tr>
          <td><strong style="color:#059669">Ótimo</strong></td>
          <td class="num">${nOtimo}</td>
          <td class="pct">${pctsNotas[0]}%</td>
          <td><div class="barra-wrap"><div class="barra-fill" style="width:${pctsNotas[0]}%;background:#059669"></div></div></td>
        </tr>
        <tr>
          <td><strong style="color:#10b981">Bom</strong></td>
          <td class="num">${nBom}</td>
          <td class="pct">${pctsNotas[1]}%</td>
          <td><div class="barra-wrap"><div class="barra-fill" style="width:${pctsNotas[1]}%;background:#10b981"></div></div></td>
        </tr>
        <tr>
          <td><strong style="color:#d97706">Regular</strong></td>
          <td class="num">${nRegular}</td>
          <td class="pct">${pctsNotas[2]}%</td>
          <td><div class="barra-wrap"><div class="barra-fill" style="width:${pctsNotas[2]}%;background:#d97706"></div></div></td>
        </tr>
        <tr>
          <td><strong style="color:#e11d48">Ruim</strong></td>
          <td class="num">${nRuim}</td>
          <td class="pct">${pctsNotas[3]}%</td>
          <td><div class="barra-wrap"><div class="barra-fill" style="width:${pctsNotas[3]}%;background:#e11d48"></div></div></td>
        </tr>
        <tr style="background:#e8edf5;font-weight:bold">
          <td>Total de notas válidas</td>
          <td class="num">${totalAv}</td>
          <td class="pct">100%</td>
          <td></td>
        </tr>
      </table>

      <!-- Tabela médias por categoria -->
      <p class="item"><strong>2.1.2. Médias por critério de avaliação (escala 1 = Ruim a 4 = Ótimo):</strong></p>
      <table>
        <tr>
          <th>Critério</th>
          <th class="num">Média</th>
          <th>Classificação</th>
        </tr>
        <tr>
          <td>Qualidade da Refeição</td>
          <td class="num">${fmt2(mRef)}</td>
          <td>${classificar(mRef)}</td>
        </tr>
        <tr>
          <td>Qualidade do Atendimento</td>
          <td class="num">${fmt2(mAtend)}</td>
          <td>${classificar(mAtend)}</td>
        </tr>
        <tr>
          <td>Qualidade do Ambiente</td>
          <td class="num">${fmt2(mAmb)}</td>
          <td>${classificar(mAmb)}</td>
        </tr>
        <tr style="background:#e8edf5;font-weight:bold">
          <td>Média Geral</td>
          <td class="num">${fmt2(mGeral)}</td>
          <td>${classificar(mGeral)}</td>
        </tr>
      </table>

      <!-- Distribuição por refeição -->
      <p class="item"><strong>2.1.3. Distribuição por período de refeição:</strong></p>
      <table>
        <tr>
          <th>Período</th>
          <th class="num">Avaliações</th>
          <th class="pct">Participação</th>
        </tr>
        <tr>
          <td>Almoço</td>
          <td class="num">${porRef.almoco}</td>
          <td class="pct">${pctsRef[0]}%</td>
        </tr>
        <tr>
          <td>Café da Manhã</td>
          <td class="num">${porRef.cafe}</td>
          <td class="pct">${pctsRef[1]}%</td>
        </tr>
        <tr>
          <td>Jantar</td>
          <td class="num">${porRef.jantar}</td>
          <td class="pct">${pctsRef[2]}%</td>
        </tr>
      </table>

      <p class="item">2.2. Da análise dos dados, verificou-se que ${
        pctPos !== null
          ? pctPos >= 70
            ? `predominaram avaliações positivas, com ${pctPos}% das notas classificadas como Ótimo ou Bom, indicando satisfação adequada dos usuários no período.`
            : pctPos >= 50
              ? `houve equilíbrio entre avaliações positivas e negativas/regulares (${pctPos}% positivas), demandando atenção quanto à qualidade dos serviços.`
              : `há presença relevante de avaliações negativas e regulares (${100 - pctPos}% do total), o que requer atenção imediata por parte da empresa contratada.`
          : 'não foi possível calcular os percentuais para o período selecionado.'
      }</p>
    </div>
  </div>

  <!-- ── 3. Principais Manifestações ── -->
  <div class="secao">
    <div class="secao-titulo">3. Principais Manifestações dos Usuários</div>
    <div class="secao-body">
      <p class="item">3.1. Com base nas observações registradas nos formulários (${obsComTexto.length} registros com comentários), foram identificados os seguintes termos mais frequentes nas manifestações dos usuários:</p>
      ${topObs.length ? `
      <table>
        <tr><th>Termo identificado</th><th class="num">Frequência</th></tr>
        ${topObs.map(([w,n]) => `<tr><td>${w}</td><td class="num">${n}</td></tr>`).join('')}
      </table>` : '<p class="item">Não foram identificadas observações textuais no período selecionado.</p>'}
      <p class="item">3.2. As manifestações acima foram extraídas anonimamente dos campos de observação livre dos formulários, preservando a privacidade dos usuários em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
    </div>
  </div>

  <!-- ── 4. Análise Automática / Não Conformidades ── -->
  <div class="secao">
    <div class="secao-titulo">4. Análise e Pontos de Atenção</div>
    <div class="secao-body">
      <p class="item">4.1. A partir da análise dos dados do período, foram identificados os seguintes pontos:</p>
      ${insights.map((ins, i) => {
        const critico = ins.toLowerCase().includes('crítico') || ins.toLowerCase().includes('urgência') || ins.toLowerCase().includes('negativas');
        const positivo = ins.toLowerCase().includes('elevada') || ins.toLowerCase().includes('parâmetros');
        return `<div class="alerta ${critico ? 'critico' : positivo ? 'positivo' : ''}">
          <strong>4.1.${i+1}.</strong> ${ins}
        </div>`;
      }).join('')}
      <p class="item" style="margin-top:8px">4.2. Ressalta-se que os apontamentos acima deverão ser avaliados pela empresa contratada, com vistas à adoção de medidas corretivas e preventivas quando aplicável.</p>
    </div>
  </div>

  <!-- ── 5. Conclusão ── -->
  <div class="secao">
    <div class="secao-titulo">5. Conclusão</div>
    <div class="secao-body">
      <p class="item">5.1. Verificou-se que o monitoramento da satisfação dos usuários constitui ferramenta relevante para avaliação da execução contratual, permitindo a identificação de fragilidades e subsidiando a melhoria contínua dos serviços ofertados.</p>
      <p class="item" style="text-align:right;margin-bottom:12px">Brasília-DF, ${hoje}</p>
      <p class="item">5.2. Diante do exposto, entende-se necessária a ciência da empresa contratada acerca dos resultados apresentados, bem como a apresentação de manifestação formal contendo plano de ação com prazos definidos para tratamento das inconsistências identificadas, quando aplicável.</p>
    </div>
  </div>

  <!-- ── 6. Encaminhamento ── -->
  <div class="secao">
    <div class="secao-titulo">6. Encaminhamento</div>
    <div class="secao-body">
      <p class="item">6.1. Encaminhem-se os autos à empresa contratada para ciência e manifestação, devendo ser apresentado plano de ação contemplando medidas corretivas e preventivas, no prazo de 5 (cinco) dias úteis, a contar do recebimento deste documento.</p>
    </div>
  </div>



  <!-- ── Rodapé ── -->
  <div class="rodape">
    <p>AR 13 — Área Especial 08 — Quadra 03 — Região Administrativa de Sobradinho | Tel.: (61) 3773-7649 | www.sedes.df.gov.br</p>
    <div class="aviso-lgpd">
      Este documento contém exclusivamente dados agregados e anônimos. Nenhum dado pessoal identificável foi incluído, em conformidade com a Lei nº 13.709/2018 (LGPD).
    </div>
  </div>

</div>

<script>
  window.onload = function() {
    // Calcular total de páginas aproximado e mostrar no rodapé da tela
    // (no print o @page cuida disso automaticamente)
    window.print();
  };
</script>
</body>
</html>`;

  // Abrir em nova janela
  const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!win) {
    alert('Por favor, permita pop-ups para este site para gerar o relatório.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ── Exportar CSV ──────────────────────────────────────────
function exportarCSVRes() {
  // Bloqueio extra: visualizador não pode exportar mesmo que chame a função direto
  if (document.body.classList.contains('perfil-visualizador')) {
    console.warn('Acesso negado: perfil visualizador não pode exportar dados.');
    return;
  }
  const d   = STATE.res.filtrados;
  const cab = ['Data/Hora','Refeição','Avaliação','Atendimento','Ambiente','Nome','Telefone','Observações'];
  const lin = d.map(r => {
    const periodo = normPeriodo(r.periodo);
    return [
      fmtData(r.created_at), nomePeriodo(periodo),
      r.refeicao||'', r.atendimento||'', r.ambiente||'',
      r.nome||'Anônimo', r.telefone||'', r.observacoes||''
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv = '\uFEFF' + [cab.join(','), ...lin].join('\n');
  const a   = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = `respostas_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click();
}

// ── Utilitários locais ────────────────────────────────────
function setEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}
