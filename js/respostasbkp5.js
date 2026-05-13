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
  .pagina {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    /* Margens conforme Manual de Redação do GDF */
    padding: 30mm 20mm 20mm 30mm;
    background: #fff;
  }
  p, .item, li { text-align: justify; }

  /* Cabeçalho institucional — brasão + textos */
  .cabecalho-inst {
    display: flex;
    align-items: center;
    gap: 14px;
    border-bottom: 1.5px solid #000;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }
  .cab-brasao {
    width: 60px;
    height: 60px;
    flex-shrink: 0;
  }
  .cab-brasao img {
    width: 60px;
    height: 60px;
    object-fit: contain;
  }
  .cab-textos { text-align: left; }
  .cab-textos p { font-size: 9pt; line-height: 1.5; color: #000; text-align: left; }
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
    margin-top: 30px;
    border-top: 1px solid #c8d4e8;
    padding-top: 8px;
    font-size: 8pt;
    color: #777;
    text-align: center;
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
  @media print {
    body { background: #fff !important; }
    .pagina { padding: 15mm 15mm 10mm; width: 100%; }
    .no-print { display: none !important; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
<div class="pagina">

  <!-- ── Cabeçalho institucional — brasão + hierarquia GDF ── -->
  <div class="cabecalho-inst">
    <div class="cab-brasao">
      <img src="data:image/jpeg;base64,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83++++++6SA+VZXoHwiQBE4+++++++M84d++++++q28LKLMt3Zzpy+L/APvvvvvrf/vvvvvvvvOzLbgf25ww6aUV3Pvvvvvvlr/vvvvvvl+RGassG0LEW040/vvvvvvvu3PvvvvvvvjA5wxTV6SywQa8/vvvvvvvuVPvvvvvvqleED+PgHHcRCwVvvvvvvvvqd/vvvvvvvhwQcw0WcsSDwpjfvvvvvvvvlvvvvvvvvjwO6DZSyyTSOnPvvvvvvvvvnfvvvvvvvvjffeRClt05LPPvvvvvvvvrffvvvvvvvvvvvvvqBPvvvvvvvvvvvvvu8Pvvvvvvvvvvvvu3f8A37777777777776in777777763/8A/wDf/vjnf/8A9z777777776v77777777777777777777777777777tXzP77777777vRX/jDLD7nDD77777776zzy/X777777l8b73/5yRRYQ577777775fzzxr777776/v7tf/8A+7NWuO+++++++r8888sc+++++/k2Io//APvbFhjfvvvvvu3PPPPPL9fvvvvu3kqvLOLnXVvvvvvvudfPPPPPPHt/vvvvvP8A7777777777777n3zzzzzzzzwrP777777777777777777u3zzzzzzzzzzyzj/AO++++++++++++++rc88888888888888tR1++++++++++78v888888888888888888fO79x++1zw+d8888888888/8QAPxEAAgIABAMEBgYKAgIDAAAAAQIDBAAFERIGITETIjBRBxQyQWFxECBSgZGhFiM0QEJUc5KxwVNyFdEzYmP/2gAIAQIBAT8A8KOGWVtsaMx8gNcQZFck0LlYx8TqcRcP1V/+SR3P4DCZXQTpXU/Pn/nC14E9mFB8lGAAMaA4aCB/aiQ/NRh8roP1roPly/xiXIKjew7ofxGJshtpqY2WQfgcSwTQtpJGyn4j9zq0rNo6RISPex5AYq5DBHo07GRvLouI4441CogUeQGnhuiOpV1DDyI1xayKtJqYSY2/FcWqFqqf1id33MOY8dI3kcIilmPQDFHIlXR7PM/YHT78KqooVVAA6AeOQGBBAIPUYvZHG+r1tEb7HuOJYpInKSKVYdQfEqU5rcmyMfNvcMUqEFRNEGrHq56n9zt0oLabZF5+5h1GLtGanJtcaqfZYdD4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" alt="Brasão do GDF">
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
    <p>AR 13 — Área Especial 08 — Quadra 03 — Setor Administrativo — Sobradinho | Tel.: (61) 3773-7649 | www.sedes.df.gov.br</p>
    <div class="aviso-lgpd">
      Este documento contém exclusivamente dados agregados e anônimos. Nenhum dado pessoal identificável foi incluído, em conformidade com a Lei nº 13.709/2018 (LGPD).
    </div>
  </div>

</div>

<script>
  // Abrir diálogo de impressão automaticamente
  window.onload = function() { window.print(); };
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
