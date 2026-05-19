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
  const stop = new Set([
    // Artigos, preposições, contrações
    'de','a','o','e','em','para','com','que','do','da','no','na','ao','um','uma',
    'os','as','dos','das','nos','nas','pelo','pela','pelos','pelas','num','numa',
    // Pronomes
    'se','eu','tu','ele','ela','nós','eles','elas','me','te','lhe','nos','meu',
    'minha','sua','seu','esse','esta','esta','esse','isso','isto','aqui',
    // Verbos auxiliares
    'foi','ser','ter','tem','são','está','era','são','há','tinha','sendo',
    // Conjunções e advérbios sem valor analítico
    'mas','mais','não','já','bem','como','sim','também','ainda','assim',
    'então','quando','sobre','porque','pois','porém','logo','contudo',
    // Palavras genéricas sem valor analítico em observações de restaurante
    'além','disso','muito','pouco','sempre','nunca','todo','toda','todos','todas',
    'mesmo','mesma','cada','qual','outro','outra','onde','tanto','até','desde',
    'este','esta','esse','essa','esses','essas','estes','estas',
  ]);
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
    if (v >= 3.0)  return 'Satisfatório';
    if (v >= 2.5)  return 'Regular — requer atenção';
    if (v >= 2.0)  return 'Crítico — requer ação imediata';
    return 'Grave — intervenção urgente';
  };

  // ── Insights automáticos ──────────────────────────────────
  // Indicadores do período anterior para comparação
  const dAnt = STATE.dadosAnt || [];
  const pctPosAnt = calcPctPos(dAnt);
  const mGeralAnt = calcMedia(dAnt);

  const insights = [];
  const pctPos = calcPctPos(d), pctNeg = calcPctNeg(d);

  // Satisfação geral com comparação ao período anterior
  if (pctPos !== null) {
    let ins = '';
    if (pctPos >= 80)      ins = 'Verificou-se que ' + pctPos + '% das avaliações foram classificadas como positivas (Ótimo ou Bom), indicando satisfação geral elevada no período.';
    else if (pctPos >= 60) ins = 'Verificou-se que ' + pctPos + '% das avaliações foram classificadas como positivas (Ótimo ou Bom), evidenciando satisfação moderada e demandando atenção continuada.';
    else                   ins = 'Constatou-se baixo índice de satisfação no período, com apenas ' + pctPos + '% das avaliações classificadas como positivas (Ótimo ou Bom), o que requer adoção imediata de plano de ação.';
    if (pctPosAnt !== null && dAnt.length >= 5) {
      const diff = pctPos - pctPosAnt;
      if (Math.abs(diff) >= 3) {
        ins += diff > 0
          ? ' Registrou-se melhora de ' + Math.abs(diff) + ' pontos percentuais em relação ao período anterior (' + pctPosAnt + '%).'
          : ' Registrou-se queda de ' + Math.abs(diff) + ' pontos percentuais em relação ao período anterior (' + pctPosAnt + '%).';
      }
    }
    insights.push(ins);
  }

  // Média geral com comparação
  if (mGeral !== null) {
    if (mGeral < 2.5) {
      let ins = 'A média geral das avaliações (' + fmt2(mGeral) + ') encontra-se em nível crítico.';
      if (mGeralAnt !== null && dAnt.length >= 5) {
        const diff = parseFloat((mGeral - mGeralAnt).toFixed(2));
        ins += diff > 0
          ? ' Há evolução positiva de ' + Math.abs(diff).toFixed(2).replace('.',',') + ' pontos em relação ao período anterior.'
          : diff < 0
            ? ' Verifica-se queda de ' + Math.abs(diff).toFixed(2).replace('.',',') + ' pontos em relação ao período anterior.'
            : ' O desempenho manteve-se estável em relação ao período anterior.';
      }
      insights.push(ins);
    }
  }

  // Critérios específicos
  // Critérios individuais tratados em detalhe no item 4.2 — sem duplicar aqui
  if (pctNeg !== null && pctNeg > 10) insights.push('Verificou-se que ' + pctNeg + '% das notas registradas foram "Ruim", percentual que demanda identificação imediata da causa raiz.');
  if (!insights.length) insights.push('Verificou-se que os indicadores do período encontram-se dentro dos parâmetros esperados, sem registro de ocorrências críticas.');

  // ── HTML do relatório ─────────────────────────────────────

  // ── Pré-calcular textos das seções analíticas ─────────────
  // (evita backticks aninhados no template literal do HTML)

  // ── Texto 2.2 — Síntese geral ─────────────────────────────
  let texto22 = '';
  if (pctPos === null) {
    texto22 = 'não foi possível calcular os percentuais para o período selecionado.';
  } else if (pctPos >= 70) {
    texto22 = 'predominaram avaliações positivas, com ' + pctPos + '% das notas'
      + ' classificadas como Ótimo ou Bom, indicando satisfação adequada dos usuários no período.';
  } else if (pctPos >= 50) {
    texto22 = 'Verificou-se predominância moderada de avaliações positivas (' + pctPos + '%), '
      + 'porém com expressiva parcela de avaliações regulares e negativas (' + (100 - pctPos) + '%), '
      + 'o que demanda atenção continuada quanto à qualidade dos serviços.';
  } else {
    texto22 = 'Constata-se presença expressiva de avaliações negativas e regulares ('
      + (100 - pctPos) + '% do total), o que requer atenção imediata por parte da empresa contratada.';
  }


  // (evita backticks aninhados no template literal do HTML)

  // ── Texto 2.3 — Análise por critério ──────────────────────
  let texto23 = '';
  {
    const cats = [
      { nome: 'Qualidade da Refeição',    v: mRef   },
      { nome: 'Qualidade do Atendimento', v: mAtend },
      { nome: 'Qualidade do Ambiente',    v: mAmb   },
    ].filter(c => c.v !== null).sort((a,b) => b.v - a.v);

    if (!cats.length) {
      texto23 = 'Não há dados suficientes para análise por critério.';
    } else {
      const melhor = cats[0];
      const pior23 = cats[cats.length - 1];
      const dif    = (melhor.v - pior23.v).toFixed(2).replace('.', ',');
      const classPior = pior23.v >= 3.0 ? 'Bom'
        : pior23.v >= 2.5 ? 'Regular — requer atenção'
        : 'Crítica — requer ação imediata';

      texto23 = 'Dentre os critérios avaliados, "' + melhor.nome + '" apresentou o melhor desempenho'
        + ' (média ' + fmt2(melhor.v) + '), enquanto "' + pior23.nome + '" registrou a menor média'
        + ' (' + fmt2(pior23.v) + '), classificada na faixa "' + classPior + '". ';

      if (parseFloat(dif.replace(',', '.')) >= 0.20) {
        texto23 += 'A diferença de ' + dif + ' pontos entre o melhor e o pior critério indica'
          + ' desempenho desigual entre os aspectos avaliados.';
      } else {
        texto23 += 'A variação de ' + dif + ' pontos entre os critérios indica desempenho'
  + ' pontos entre os critérios, estando todos na mesma faixa de classificação,'
  + ' o que indica desempenho uniformemente insatisfatório no período.';
      }

      if (pior23.v < 2.5) {
        if (pior23.nome.includes('Refeição'))
          texto23 += ' Recomenda-se verificar a temperatura de distribuição e o tempo entre o preparo e o serviço.';
        if (pior23.nome.includes('Atendimento'))
          texto23 += ' Recomenda-se avaliação da postura e cordialidade dos colaboradores.';
        if (pior23.nome.includes('Ambiente'))
          texto23 += ' Recomenda-se verificar as condições de limpeza e funcionamento dos sanitários.';
      }

      const todosCriticos = cats.every(c => c.v < 3.0);
      if (todosCriticos) {
        texto23 += ' Ressalta-se que todos os critérios avaliados situaram-se abaixo da faixa'
          + ' satisfatória (média inferior a 3,00), indicando necessidade de plano de ação integrado.';
      }
    }
  }

  // ── Texto 2.4 — Análise por período ───────────────────────
  let texto24 = '';
  {
    const totalRef24 = porRef.almoco + porRef.cafe + porRef.jantar;
    if (totalRef24 < 1) {
      texto24 = 'Não há dados suficientes para análise por período de refeição.';
    } else {
      const periodos24 = [
        { nome: 'Almoço',        val: porRef.almoco, pct: pctsRef[0] },
        { nome: 'Café da Manhã', val: porRef.cafe,   pct: pctsRef[1] },
        { nome: 'Jantar',        val: porRef.jantar, pct: pctsRef[2] },
      ].filter(p => p.val > 0).sort((a,b) => b.val - a.val);

      const maior24 = periodos24[0];
      const segundo = periodos24[1];
      const menor24 = periodos24[periodos24.length - 1];

      texto24 = 'O período de "' + maior24.nome + '" concentrou o maior volume de avaliações ('
        + maior24.val + ' registros — ' + maior24.pct + '% do total)';

      if (segundo && segundo !== maior24) {
        texto24 += ', seguido de "' + segundo.nome + '" (' + segundo.val + ' — ' + segundo.pct + '%).';
      } else {
        texto24 += '.';
      }

      if (menor24 !== maior24 && menor24.pct <= 15) {
        texto24 += ' O período de "' + menor24.nome + '" registrou participação reduzida'
          + ' (' + menor24.val + ' avaliações — ' + menor24.pct + '%), o que pode indicar'
          + ' menor fluxo de usuários nesse turno ou necessidade de verificar o funcionamento do ponto de coleta.';
      }

      if (menor24.val < 10) {
        texto24 += ' Em virtude do volume reduzido de registros, os dados desse período'
          + ' devem ser interpretados com cautela.';
      }
    }
  }

  // ── Texto 4.2 — Critério mais crítico ─────────────────────
  let texto42 = '';
  {
    const cats42 = [
      { nome: 'Qualidade da Refeição',    v: mRef,   campo: 'refeicao'    },
      { nome: 'Qualidade do Atendimento', v: mAtend, campo: 'atendimento' },
      { nome: 'Qualidade do Ambiente',    v: mAmb,   campo: 'ambiente'    },
    ].filter(c => c.v !== null).sort((a,b) => a.v - b.v);

    if (!cats42.length) {
      texto42 = 'Não há dados suficientes para análise por critério.';
    } else {
      const pior42 = cats42[0];
      const ruimCampo = d.reduce((acc, reg) => {
        return acc + (reg[pior42.campo] === 'Ruim' ? 1 : 0);
      }, 0);
      // Denominador = notas válidas desse critério específico (mais informativo)
      const notasCampo = d.reduce((acc, reg) => {
        return acc + (notaValida(reg[pior42.campo]) ? 1 : 0);
      }, 0);
      const pctRuimCampo = notasCampo > 0 ? Math.round(ruimCampo / notasCampo * 100) : 0;

      const nivel42 = pior42.v < 2.5
        ? 'em nível crítico, o que requer adoção de medidas corretivas imediatas pela empresa contratada'
        : pior42.v < 3.0
          ? 'abaixo da faixa satisfatória, o que requer atenção e monitoramento continuado'
          : 'dentro da faixa aceitável, porém com espaço para melhoria';

      let recom42 = '';
      if (pior42.campo === 'refeicao')
        recom42 = 'Recomenda-se verificar a temperatura de distribuição, o tempo entre o preparo e o serviço, bem como o porcionamento das preparações.';
      if (pior42.campo === 'atendimento')
        recom42 = 'Recomenda-se avaliação da postura, pontualidade e cordialidade dos colaboradores no atendimento aos usuários.';
      if (pior42.campo === 'ambiente')
        recom42 = 'Recomenda-se verificar as condições de limpeza do salão, organização das mesas e funcionamento dos sanitários.';

      texto42 = 'O critério "' + pior42.nome + '" registrou a menor média do período'
        + ' (' + fmt2(pior42.v) + '), situando-se ' + nivel42 + '. '
        + 'Foram contabilizadas ' + ruimCampo + ' notas "Ruim" nesse critério'
        + ' (' + pctRuimCampo + '% das avaliações desse critério). ' + recom42;
    }
  }

  // ── Texto 4.3 — Análise das observações ───────────────────
  let texto43 = '';
  {
    if (!topObs.length) {
      texto43 = 'Não foram registradas observações textuais no período selecionado.';
    } else {
      const obsNeg43 = d.filter(reg =>
        reg.observacoes && reg.observacoes.trim() &&
        [reg.refeicao, reg.atendimento, reg.ambiente].some(n => ['Regular','Ruim'].includes(n))
      ).length;
      const pctObsNeg43 = obsComTexto.length > 0
        ? Math.round(obsNeg43 / obsComTexto.length * 100) : 0;

      const top3 = topObs.slice(0, 3).map(([w]) => '"' + w + '"').join(', ');

      const palavras43 = topObs.map(([w]) => w.toLowerCase());
      const temas43 = [];
      if (palavras43.some(w => ['frio','quente','temperatura','morno'].includes(w)))
        temas43.push('irregularidades na temperatura de distribuição das refeições');
      if (palavras43.some(w => ['banheiro','sanitário','limpeza','sujo','higiene'].includes(w)))
        temas43.push('condições higiênico-sanitárias inadequadas no ambiente');
      if (palavras43.some(w => ['atendimento','demora','fila','espera','tempo','lento'].includes(w)))
        temas43.push('tempo de espera prolongado e qualidade do atendimento');
      if (palavras43.some(w => ['porção','pouco','quantidade','aguado','insosso'].includes(w)))
        temas43.push('porcionamento irregular e qualidade sensorial das preparações');

      texto43 = 'Das ' + obsComTexto.length + ' observações textuais registradas, '
        + obsNeg43 + ' (' + pctObsNeg43 + '%) acompanharam avaliações negativas ou regulares. '
        + 'Os termos mais frequentes foram ' + top3 + ', sugerindo que as principais preocupações dos usuários estão relacionadas a ';

      if (temas43.length > 1) {
        texto43 += temas43.slice(0, -1).join(', ') + ' e ' + temas43[temas43.length - 1] + '.';
      } else if (temas43.length === 1) {
        texto43 += temas43[0] + '.';
      } else {
        texto43 += 'a necessidade de investigação mais detalhada junto aos usuários.';
      }
    }
  }

  // ── Texto 4.4 — Período mais crítico ──────────────────────
  let texto44 = '';
  {
    const totalRef44 = porRef.almoco + porRef.cafe + porRef.jantar;
    if (totalRef44 < 10) {
      texto44 = 'Volume de dados insuficiente para análise de desempenho por período de refeição.';
    } else {
      const negPer44 = ['cafe','almoco','jantar'].map(p => {
        const regPer = d.filter(reg => normPeriodo(reg.periodo) === p);
        if (regPer.length < 5) return { p, pct: null, total: regPer.length };
        const totAp = regPer.reduce((a,reg) =>
          a + [reg.refeicao,reg.atendimento,reg.ambiente].filter(notaValida).length, 0);
        const negAp = regPer.reduce((a,reg) =>
          a + [reg.refeicao,reg.atendimento,reg.ambiente].filter(n=>n==='Ruim').length, 0);
        return { p, pct: totAp > 0 ? Math.round(negAp/totAp*100) : 0, total: regPer.length };
      }).filter(x => x.pct !== null).sort((a,b) => b.pct - a.pct);

      if (!negPer44.length) {
        texto44 = 'Não há dados suficientes em todos os períodos para comparação. Recomenda-se ampliar o período de coleta para análise mais representativa.';
      } else if (negPer44.every(x => x.pct === 0)) {
        texto44 = 'Nenhum dos períodos registrou avaliações "Ruim" no período analisado, indicando ausência de insatisfação extrema entre os usuários.';
      } else {
        const piorPer = negPer44[0];
        texto44 = 'O período de "' + nomePeriodo(piorPer.p) + '" registrou a maior proporção'
          + ' de notas "Ruim" (' + piorPer.pct + '% das notas válidas desse turno — '
          + piorPer.total + ' avaliações). ';
        if (piorPer.pct > 15)
          texto44 += 'O percentual acima de 15% ultrapassa o parâmetro de referência adotado, configurando situação que demanda atenção prioritária às condições de serviço nesse turno.';
        else if (piorPer.pct > 5)
          texto44 += 'O percentual indica necessidade de monitoramento continuado nesse período.';
        else
          texto44 += 'O percentual encontra-se dentro de limites aceitáveis, mas merece acompanhamento.';
      }
    }
  }

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
    min-height: 28mm;
  }
  .cab-brasao {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 25mm;
    flex-shrink: 0;
  }
  .cab-brasao img {
    width: 25mm;
    height: 26mm;
    object-fit: contain;
    background: transparent;
  }
  /* Texto ocupa toda a largura e centraliza */
  .cab-textos {
    flex: 1;
    text-align: center;
    /* espaço à esquerda para o brasão de 25mm não sobrepor o texto */
    padding: 0 20px 0 28mm;
  }
  .cab-textos p {
    font-size: 10pt;
    font-weight: normal;
    line-height: 1.65;
    color: #000;
    text-align: center;
    white-space: nowrap; /* impede quebra de linha no meio do nome */
  }
  /* Escala automática se o texto for mais largo que o container */
  @media print {
    .cab-textos p { white-space: normal; font-size: 9.5pt; }
  }
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
    margin: 20mm;
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
    /* Rodapé visível e protegido na última página */
    .rodape {
      display: block !important;
      margin-top: 20px;
      page-break-inside: avoid;
    }

  }
  @media screen {
    body { background: #e5e5e5; }
    .pagina {
      width: 210mm;
      min-height: 297mm;
      margin: 10mm auto;
      padding: 20mm;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
  }

  /* Tabela de assinaturas — sem bordas de tabela padrão */
  .tab-ass, .tab-ass tr, .tab-ass td {
    border: none !important;
    background: transparent !important;
  }
  @media print {
    .tab-ass { page-break-inside: avoid; }
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


  <!-- Linha em branco + processo -->
  <p style="margin:0">&nbsp;</p>
  <p style="font-size:12pt;font-weight:normal;text-align:left;margin-bottom:16px"><strong>Processo nº:</strong> 00431-00008473/2026-87</p>

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
      <p class="item">1.2. A coleta de dados foi realizada por meio de formulário digital de pesquisa de opinião, contemplando a avaliação da qualidade da refeição, do atendimento e do ambiente, com as classificações: Ótimo, Bom, Regular e Ruim, além de campo aberto destinado ao registro de observações e sugestões dos usuários.</p>
      <p class="item">1.3. No período de <strong>${fmtFiltro(dataIni)}</strong> a <strong>${fmtFiltro(dataFim)}</strong>, foram registradas <strong>${total} avaliações</strong>, totalizando <strong>${totalAv} notas válidas</strong> distribuídas entre os três critérios avaliados.</p>
    </div>
  </div>

  <!-- ── 2. Análise dos Resultados ── -->
  <div class="secao">
    <div class="secao-titulo">2. Análise dos Resultados</div>
    <div class="secao-body">
      <p class="item">2.1. Procedeu-se à consolidação das informações obtidas no período, conforme apresentado a seguir:</p>

      <!-- KPIs com referência de meta -->
      <div class="kpi-row">
        <div class="kpi">
          <span class="kpi-val">${total}</span>
          <span class="kpi-lbl">Total de Avaliações</span>
          <span style="font-size:7.5pt;color:#888;display:block;margin-top:3px">no período filtrado</span>
        </div>
        <div class="kpi" style="border-top-color:#059669">
          <span class="kpi-val" style="color:${pctPos !== null && pctPos >= 70 ? '#059669' : '#e11d48'}">${pctPos !== null ? pctPos + '%' : '—'}</span>
          <span class="kpi-lbl">Positivas (Ótimo+Bom)</span>
          <span style="font-size:7.5pt;color:#888;display:block;margin-top:3px">meta: ≥ 70%</span>
        </div>
        <div class="kpi" style="border-top-color:#d97706">
          <span class="kpi-val" style="color:#d97706">${pctStr(nRegular, totalAv)}</span>
          <span class="kpi-lbl">Regulares</span>
          <span style="font-size:7.5pt;color:#888;display:block;margin-top:3px">referência: ≤ 20%</span>
        </div>
        <div class="kpi" style="border-top-color:#e11d48">
          <span class="kpi-val" style="color:${pctNeg !== null && pctNeg > 10 ? '#e11d48' : '#059669'}">${pctNeg !== null ? pctNeg + '%' : '—'}</span>
          <span class="kpi-lbl">Negativas (Ruim)</span>
          <span style="font-size:7.5pt;color:#888;display:block;margin-top:3px">alerta: > 10%</span>
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
        ${[
          { nome: 'Qualidade da Refeição',    v: mRef   },
          { nome: 'Qualidade do Atendimento', v: mAtend },
          { nome: 'Qualidade do Ambiente',    v: mAmb   },
        ].map(c => {
          const menorMedia = Math.min(
            ...[mRef,mAtend,mAmb].filter(x=>x!==null)
          );
          const ePior = c.v !== null && c.v === menorMedia;
          const bgStyle = ePior && c.v < 3.0
            ? 'background:#fff8f0'
            : '';
          const suffixPior = ePior && c.v < 3.0 ? ' ⚠' : '';
          return '<tr style="' + bgStyle + '">'
            + '<td>' + c.nome + suffixPior + '</td>'
            + '<td class="num">' + (c.v !== null ? fmt2(c.v) : '—') + '</td>'
            + '<td>' + classificar(c.v) + '</td>'
            + '</tr>';
        }).join('')}
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

      <p class="item">2.2. ${texto22}</p>

      <!-- ── 2.3 Análise por critério ── -->
      <p class="item">2.3. ${texto23}</p>

      <!-- ── 2.4 Análise por período ── -->
      <p class="item">2.4. ${texto24}</p>
    </div>
  </div>

  <!-- ── 3. Principais Manifestações    </div>
  </div>

  <!-- ── 3. Principais Manifestações ── -->
  <div class="secao">
    <div class="secao-titulo">3. Principais Manifestações dos Usuários</div>
    <div class="secao-body">
      <p class="item">3.1. Com base nas observações registradas nos formulários (${obsComTexto.length} registros com comentários), foram identificados os seguintes termos mais recorrentes nas manifestações registradas pelos usuários, apresentados por ordem de frequência:</p>
      ${topObs.length ? `
      <table>
        <tr><th>Termo identificado</th><th class="num">Frequência</th></tr>
        ${topObs.map(([w,n]) => `<tr><td>${w}</td><td class="num">${n}</td></tr>`).join('')}
      </table>` : '<p class="item">Não foram identificadas observações textuais no período selecionado.</p>'}
      <p class="item">3.2. As manifestações acima foram extraídas de forma anônima dos campos de observação livre dos formulários, preservando a privacidade dos usuários em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</p>
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
      <!-- ── 4.2 Critério mais crítico ── -->
      <p class="item" style="margin-top:10px">4.2. ${texto42}</p>

      <!-- ── 4.3 Análise das observações ── -->
      <p class="item">4.3. ${texto43}</p>

      <!-- ── 4.4 Período mais crítico ── -->
      <p class="item">4.4. ${texto44}</p>

            <p class="item" style="margin-top:10px">4.5. Ressalta-se que os apontamentos acima deverão ser avaliados pela empresa contratada, com vistas à adoção de medidas corretivas e preventivas.</p>
    </div>
  </div>

  <!-- ── 5. Conclusão ── -->
  <div class="secao">
    <div class="secao-titulo">5. Conclusão</div>
    <div class="secao-body">
      <p class="item">5.1. Verificou-se que o monitoramento da satisfação dos usuários constitui ferramenta relevante para avaliação da execução contratual, permitindo a identificação de fragilidades e subsidiando a melhoria contínua dos serviços ofertados, com suporte do sistema digital de pesquisa implantado na unidade.</p>
      <p class="item">5.2. Diante do exposto, os resultados ora apresentados deverão ser formalmente comunicados à empresa contratada, para fins de ciência e adoção das providências cabíveis, em especial quanto aos critérios com desempenho abaixo da faixa satisfatória.</p>
    </div>
  </div>

  <!-- ── 6. Encaminhamento + Assinaturas (mesma página) ── -->
  <div style="page-break-inside: avoid">
  <div class="secao">
    <div class="secao-titulo">6. Encaminhamento</div>
    <div class="secao-body">
      <p class="item">6.1. Encaminhem-se os autos à empresa contratada para ciência e manifestação, devendo ser apresentado <strong>plano de ação</strong> contemplando medidas corretivas e preventivas, com cronograma e <strong>prazos definidos</strong>, no prazo de <strong>5 (cinco) dias úteis</strong>, a contar do recebimento deste documento.</p>
    </div>
  </div>



  <!-- ── Data + Assinaturas ── -->
  <div style="margin-top:28px">
    <p style="font-size:12pt;text-align:right;margin-bottom:28px">Brasília-DF, ${hoje}</p>

    <table style="width:100%;border:none;margin-bottom:0;table-layout:fixed" class="tab-ass">
      <tr>
        <!-- Emissor — alinhado pelo topo -->
        <td style="width:47%;border:none;vertical-align:top;padding:0 20px 0 0">
          <div style="border-top:2px solid #000;padding-top:8px">
            <p style="font-size:10pt;font-weight:bold;margin:0 0 6px">GERSANSOB</p>
            <p style="font-size:9pt;color:#333;margin:0 0 4px">Nome: _________________________________</p>
            <p style="font-size:9pt;color:#333;margin:0 0 4px">Matrícula: ____________________________</p>
            <p style="font-size:9pt;color:#333;margin:0">Data: ___/___/______</p>
          </div>
        </td>
        <!-- Espaçador -->
        <td style="width:6%;border:none"></td>
        <!-- Recebimento — mesma estrutura, alinhado pelo topo -->
        <td style="width:47%;border:none;vertical-align:top;padding:0 0 0 20px">
          <div style="border-top:2px solid #000;padding-top:8px">
            <p style="font-size:10pt;font-weight:bold;margin:0 0 4px">Empresa Contratada</p>
            <p style="font-size:9pt;color:#333;margin:0 0 4px">Nome: _________________________________</p>
            <p style="font-size:9pt;color:#333;margin:0 0 8px">Cargo: ________________________________</p>
            <p style="font-size:9pt;color:#333;margin:0">Data: ___/___/______</p>
          </div>
        </td>
      </tr>
    </table>
  </div>

  </div><!-- /encaminhamento+assinaturas -->

  <!-- ── Rodapé ── -->
  <div class="rodape">
    <p>AR 13 — Área Especial 08 — Quadra 03 — Região Administrativa de Sobradinho | Tel.: (61) 3773-7649 | www.sedes.df.gov.br</p>
    <p style="margin-top:3px;font-size:8pt">Processo nº: 00431-00008473/2026-87 | Gerado em: ${hoje} às ${agora}</p>
    <div class="aviso-lgpd">
      Este documento contém exclusivamente dados agregados e anônimos. Nenhum dado pessoal identificável foi incluído, em conformidade com a Lei nº 13.709/2018 (LGPD).
    </div>
  </div>

</div>

<script>
  window.onload = function() {
    // Define o título = nome padrão do arquivo PDF no navegador
    const mesAno = new Date().toLocaleDateString('pt-BR', {month:'short', year:'numeric'})
      .replace(' de ','').replace('.','')
      .split('/').reverse().join('')
      .replace(/^(\w)/,(m)=>m.toUpperCase());
    document.title = 'RC-Sobradinho-Relatorio-' + mesAno;
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
// ── Exportar CSV — duas versões por perfil ───────────────────────
// ANALÍTICA (padrão): sem nome/telefone — adequada à LGPD
// NOMINAL (somente admin, com confirmação): inclui dados pessoais
function exportarCSVRes() {
  if (document.body.classList.contains('perfil-visualizador')) {
    console.warn('Acesso negado: visualizador não pode exportar.');
    return;
  }
  const isAdmin = STATE.perfil?.perfil === 'admin';
  if (isAdmin) {
    // Admin escolhe entre versão analítica ou nominal
    const modal = document.createElement('div');
    modal.id = 'csv-modal-escolha';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:\'DM Sans\',sans-serif';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 32px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.18)">' +
        '<h3 style="font-family:\'Sora\',sans-serif;font-size:16px;font-weight:800;color:#0f2650;margin:0 0 8px">Exportar CSV</h3>' +
        '<p style="font-size:13px;color:#475569;margin:0 0 20px">Escolha o tipo de exportação:</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">' +
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;cursor:pointer">' +
            '<input type="radio" name="csv-tipo" value="analitica" checked style="margin-top:3px;flex-shrink:0">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:#1a3a6e">Analítica (recomendada)</div>' +
              '<div style="font-size:12px;color:#64748b;margin-top:2px">Data, Período, Notas, Classificação e Observações — sem Nome ou Telefone. Adequada à LGPD para relatórios e análises.</div>' +
            '</div>' +
          '</label>' +
          '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1.5px solid #fecdd3;border-radius:10px;cursor:pointer;background:#fff1f2">' +
            '<input type="radio" name="csv-tipo" value="nominal" style="margin-top:3px;flex-shrink:0">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:700;color:#e11d48">Nominal (restrita)</div>' +
              '<div style="font-size:12px;color:#64748b;margin-top:2px">Inclui Nome e Telefone. Uso restrito — somente para fiscalização contratual documentada.</div>' +
            '</div>' +
          '</label>' +
        '</div>' +
        '<div id="csv-aviso-nominal" style="display:none;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:#9f1239">' +
          '&#9888; Ao exportar dados nominais, você assume responsabilidade pelo uso adequado conforme a Lei n&#186; 13.709/2018 (LGPD). O arquivo deve ser mantido em ambiente seguro.' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px">' +
          '<button onclick="document.getElementById(\'csv-modal-escolha\').remove()" style="padding:9px 18px;border-radius:9px;border:1.5px solid #e2e8f0;background:#fff;font-size:13px;font-weight:600;cursor:pointer;color:#64748b">Cancelar</button>' +
          '<button onclick="confirmarExportCSV()" style="padding:9px 18px;border-radius:9px;border:none;background:#1a3a6e;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Exportar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('input[name="csv-tipo"]').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var aviso = document.getElementById('csv-aviso-nominal');
        if (aviso) aviso.style.display = inp.value === 'nominal' ? 'block' : 'none';
      });
    });
  } else {
    // Gestor: sempre analítica, sem diálogo
    _gerarCSV(false);
  }
}

function confirmarExportCSV() {
  var sel = document.querySelector('#csv-modal-escolha input[name="csv-tipo"]:checked');
  var nominal = sel && sel.value === 'nominal';
  var el = document.getElementById('csv-modal-escolha');
  if (el) el.remove();
  _gerarCSV(nominal);
}

function _gerarCSV(incluirDadosPessoais) {
  var d     = STATE.res.filtrados;
  var user  = STATE.perfil ? STATE.perfil.nome : 'usuário';
  var perf  = STATE.perfil ? STATE.perfil.perfil.toUpperCase() : '';
  var agora = new Date().toLocaleString('pt-BR');

  // Normalizar notas para consistência no Excel
  function normNota(v) {
    if (!v) return '';
    if (v === 'Ótima' || v === 'Ótimo') return 'Ótimo';
    if (v === 'Boa'   || v === 'Bom')   return 'Bom';
    return v;
  }

  // Classificação geral do registro
  function classifGeral(r) {
    var notas = [r.refeicao, r.atendimento, r.ambiente].filter(notaValida);
    if (!notas.length) return '';
    if (notas.some(function(n){ return n === 'Ruim'; }))    return 'Negativa';
    if (notas.some(function(n){ return n === 'Regular'; })) return 'Regular';
    if (notas.every(function(n){ return n === 'Ótimo' || n === 'Bom'; })) return 'Positiva';
    return 'Mista';
  }

  // Escape CSV
  function esc(v) {
    return '"' + String(v || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '').trim() + '"';
  }

  // Metadados no topo do arquivo
  var aviso = incluirDadosPessoais
    ? 'DOCUMENTO DE USO RESTRITO - CONTÉM DADOS PESSOAIS (LGPD)'
    : 'DOCUMENTO ANALÍTICO - DADOS SEM IDENTIFICAÇÃO PESSOAL';
  var meta = [
    esc(aviso),
    esc('Exportado por: ' + user + ' (' + perf + ')'),
    esc('Data/hora: ' + agora),
    esc('Registros: ' + d.length),
    esc('Período: ' + (document.getElementById('res-f-data-ini') ? document.getElementById('res-f-data-ini').value : '-') + ' a ' + (document.getElementById('res-f-data-fim') ? document.getElementById('res-f-data-fim').value : '-')),
    esc('Lei n. 13.709/2018 (LGPD) - Uso exclusivo para gestao contratual'),
    '',
  ];

  // Colunas
  var cab = incluirDadosPessoais
    ? ['"N"','"Data/Hora"','"Período"','"Avaliação (Refeição)"','"Atendimento"','"Ambiente"','"Classificação Geral"','"Nome"','"Telefone"','"Observações"']
    : ['"N"','"Data/Hora"','"Período"','"Avaliação (Refeição)"','"Atendimento"','"Ambiente"','"Classificação Geral"','"Observações"'];

  // Linhas
  var lin = d.map(function(r, i) {
    var periodo = normPeriodo(r.periodo);
    var base = [
      esc(i + 1),
      esc(fmtData(r.created_at)),
      esc(nomePeriodo(periodo)),
      esc(normNota(r.refeicao)),
      esc(normNota(r.atendimento)),
      esc(normNota(r.ambiente)),
      esc(classifGeral(r)),
    ];
    if (incluirDadosPessoais) {
      base.push(esc(r.nome || 'Anônimo'));
      base.push(esc(r.telefone || ''));
    }
    base.push(esc(r.observacoes || ''));
    return base.join(',');
  });

  var csv  = '\uFEFF' + meta.join('\n') + '\n' + cab.join(',') + '\n' + lin.join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var a    = document.createElement('a');
  var tipo = incluirDadosPessoais ? 'nominal' : 'analitico';
  var data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  a.href     = URL.createObjectURL(blob);
  a.download = 'RC-Sobradinho-' + tipo + '-' + data + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
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
