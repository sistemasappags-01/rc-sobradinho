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
    setHTML('res-leg-pizza', [
      { nome:'Ótimo',   val:cont['Ótimo'],   cor:'#059669' },
      { nome:'Bom',     val:cont['Bom'],     cor:'#10b981' },
      { nome:'Regular', val:cont['Regular'], cor:'#d97706' },
      { nome:'Ruim',    val:cont['Ruim'],    cor:'#e11d48' },
    ].map(({ nome, val, cor }) =>
      `<div class="leg-item">
        <div class="leg-cor" style="background:${cor}"></div>
        <span class="leg-txt">${nome}</span>
        <span class="leg-val">${val}</span>
        <span class="leg-pct">(${pctStr(val, totalN)})</span>
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
    setHTML('res-leg-ref', [
      ['Almoço',        porRef.almoco, '#2563eb'],
      ['Café da Manhã', porRef.cafe,   '#ea580c'],
      ['Jantar',        porRef.jantar, '#7c3aed'],
    ].map(([nome, val, cor]) =>
      `<div class="leg-item">
        <div class="leg-cor" style="background:${cor}"></div>
        <span class="leg-txt">${nome}</span>
        <span class="leg-val">${val}</span>
        <span class="leg-pct">(${pctStr(val, totalRef)})</span>
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
        const nome = r.nome?.trim() || 'Anônimo';
        const tel  = r.telefone?.trim()
          ? `<br><small style="color:var(--tx3)">${r.telefone}</small>` : '';
        const periodo = normPeriodo(r.periodo); // CORREÇÃO: normalizar
        return `<tr>
          <td class="td-data">${fmtData(r.created_at)}</td>
          <td><span class="ref-badge ${classeRef(periodo)}">${nomePeriodo(periodo)}</span></td>
          <td>${celulaNota(r.refeicao)}</td>
          <td>${celulaNota(r.atendimento)}</td>
          <td>${celulaNota(r.ambiente)}</td>
          <td class="td-data">${nome}${tel}</td>
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
    ${row('Nome',        r.nome    || '<em class="vazio">Anônimo</em>')}
    ${row('Telefone',    r.telefone || '<em class="vazio">—</em>')}
    ${row('Observação',  r.observacoes || '<em class="vazio">—</em>')}
  `);
  document.getElementById('res-modal').classList.add('show');
}

function fecharModalRes() {
  document.getElementById('res-modal')?.classList.remove('show');
}

// ── Exportar CSV ──────────────────────────────────────────
function exportarCSVRes() {
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
