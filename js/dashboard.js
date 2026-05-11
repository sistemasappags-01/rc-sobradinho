// ═══════════════════════════════════════════════════════════
//  dashboard.js — Painel principal de indicadores
// ═══════════════════════════════════════════════════════════

// Detector de loop — identifica chamadas rápidas repetidas
let _rdCount = 0, _rdLast = 0;

function renderDashboard() {
  const now = Date.now();
  if (now - _rdLast < 1000) {
    _rdCount++;
    if (_rdCount > 2) {
      console.error('[LOOP] renderDashboard chamado ' + _rdCount + 'x em 1s. Stack:', new Error().stack);
      return; // interrompe o loop
    }
  } else {
    _rdCount = 0;
  }
  _rdLast = now;
  console.log('[dash] renderDashboard chamado — stack:', new Error().stack.split('\n').slice(1,4).join(' | '));

  try {
  const d  = STATE.dadosAtual;
  const da = STATE.dadosAnt;

  renderKPIs(d, da);
  renderEvolucao(d);
  renderDonutRef(d);
  renderMediaCat(d);
  renderDistrib(d);
  renderNegDia(d);
  renderPeriodo(d);
  renderTopObs(d);
  renderInsights(d, da);
  renderAlertas(d, da);
  renderAtencao(d);
  renderUltimasNeg(d);

  const el = document.getElementById('dash-data-atual');
  if (el) el.textContent =
    new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  } catch(e) { console.error('renderDashboard error:', e); }
}

// ── KPIs ─────────────────────────────────────────────────
function renderKPIs(d, da) {
  const sat  = calcPctPos(d);    const satA  = calcPctPos(da);
  const med  = calcMedia(d);     const medA  = calcMedia(da);
  const neg  = calcPctNeg(d);    const negA  = calcPctNeg(da);

  setEl('dash-kpi-sat',       sat  !== null ? sat+'%'  : '—');
  setEl('dash-kpi-media',     med  !== null ? med.toFixed(2).replace('.',',') : '—');
  setEl('dash-kpi-total',     d.length);
  setEl('dash-kpi-neg',       neg  !== null ? neg+'%'  : '—');

  setHTML('dash-kpi-sat-var',   varTag(sat, satA));
  setHTML('dash-kpi-media-var', varTag(med ? +med.toFixed(2) : null, medA ? +medA.toFixed(2) : null));
  setHTML('dash-kpi-total-var', varTag(d.length, da.length));
  setHTML('dash-kpi-neg-var',   varTag(neg, negA, true));

  // Sparklines
  const dias   = diasRange(STATE.diasFiltro);
  const porDia = agruparPorDia(d);
  renderSparkline('dash-spark-sat',   dias, g => calcPctPos(g??[]), porDia, '#059669');
  renderSparkline('dash-spark-media', dias, g => { const v=calcMedia(g??[]); return v?+v.toFixed(2):null; }, porDia, '#7c3aed');
  renderSparkline('dash-spark-total', dias, g => (g??[]).length, porDia, '#1a3a6e');
  renderSparkline('dash-spark-neg',   dias, g => calcPctNeg(g??[]), porDia, '#e11d48');
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function renderSparkline(id, dias, fn, porDia, cor) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: dias, datasets: [{ data: dias.map(d => fn(porDia[d])),
      borderColor: cor, borderWidth: 1.5, fill: true, backgroundColor: cor+'22',
      pointRadius: 0, tension: 0.4 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{enabled:false} },
      scales: { x:{display:false}, y:{display:false, beginAtZero:true} },
      animation: false }
  });
}

// ── Evolução da satisfação ───────────────────────────────
function renderEvolucao(d) {
  destroyChart('dash-chart-evolucao');
  const _cv = document.getElementById('dash-chart-evolucao');
  if (!_cv) return;
  const dias   = diasRange(STATE.diasFiltro);
  const porDia = agruparPorDia(d);
  const labels = dias.map(d => d.substring(5).replace('-', '/'));

  new Chart(_cv.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Satisfação % (Ótimo+Bom)',
        data: dias.map(d => calcPctPos(porDia[d]??[])),
        borderColor:'#059669', backgroundColor:'#05966922', borderWidth:2,
        fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#059669', yAxisID:'y1' },
      { label: 'Média (1-4)',
        data: dias.map(d => { const v=calcMedia(porDia[d]??[]); return v?+v.toFixed(2):null; }),
        borderColor:'#1a3a6e', backgroundColor:'transparent', borderWidth:1.5,
        borderDash:[4,3], tension:0.4, pointRadius:3, pointBackgroundColor:'#1a3a6e', yAxisID:'y2' }
    ] },
    options: { responsive:true, maintainAspectRatio:false,
      animation: { duration: typeof _refreshSilencioso !== 'undefined' && _refreshSilencioso ? 0 : 600 },
      interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{ display:true, position:'top',
        labels:{ boxWidth:10, font:{size:11}, color:'#475569' } } },
      scales:{
        y1:{ type:'linear', position:'left', beginAtZero:true, max:100,
          ticks:{ callback:v=>v+'%', font:{size:10}, color:'#94a3b8' },
          grid:{ color:'rgba(0,0,0,0.05)' } },
        y2:{ type:'linear', position:'right', min:1, max:4,
          ticks:{ font:{size:10}, color:'#94a3b8' }, grid:{display:false} },
        x:{ ticks:{ font:{size:10}, color:'#94a3b8' }, grid:{display:false} }
      }
    }
  });
}

// ── Donut por refeição ───────────────────────────────────
function renderDonutRef(d) {
  destroyChart('dash-chart-ref');
  const cont  = { cafe:0, almoco:0, jantar:0 };
  d.forEach(r => { if (cont[r.periodo]!==undefined) cont[r.periodo]++; });
  const total = d.length;

  const _c_dash_chart_ref = document.getElementById('dash-chart-ref'); if (!_c_dash_chart_ref) return;
  new Chart(_c_dash_chart_ref.getContext('2d'), {
    type: 'doughnut',
    data: { datasets: [{ data:[cont.almoco,cont.cafe,cont.jantar],
      backgroundColor:['#2563eb','#ea580c','#7c3aed'],
      borderWidth:2, borderColor:'#fff', hoverOffset:4 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins:{ legend:{display:false} } }
  });

  setEl('dash-ref-total', total);
  setHTML('dash-leg-ref', [
    ['Almoço', cont.almoco, '#2563eb'],
    ['Café da Manhã', cont.cafe, '#ea580c'],
    ['Jantar', cont.jantar, '#7c3aed'],
  ].map(([n,v,c]) =>
    `<div class="leg-item"><div class="leg-cor" style="background:${c}"></div>
     <span class="leg-txt">${n}</span><span class="leg-val">${v}</span>
     <span class="leg-pct">(${pctStr(v,total)})</span></div>`
  ).join(''));
}

// ── Média por categoria ──────────────────────────────────
function renderMediaCat(d) {
  const cats = [
    { nome:'Atendimento', campo:'atendimento', cor:'#2563eb' },
    { nome:'Ambiente',    campo:'ambiente',    cor:'#059669' },
    { nome:'Refeição',    campo:'refeicao',    cor:'#7c3aed' },
  ];
  setHTML('dash-cat-lista', cats.map(c => {
    const v = calcMediaCat(d, c.campo);
    const w = v !== null ? (v/4*100) : 0;
    return `<div class="cat-item">
      <span class="cat-nome">${c.nome}</span>
      <div class="cat-barra-wrap"><div class="cat-barra" style="width:${w}%;background:${c.cor}"></div></div>
      <span class="cat-val">${v !== null ? v.toFixed(2).replace('.',',') : '—'}</span>
      <span class="cat-star">★</span></div>`;
  }).join(''));
}

// ── Distribuição ─────────────────────────────────────────
function renderDistrib(d) {
  destroyChart('dash-chart-distrib');
  const cont = {'Ótimo':0,'Bom':0,'Regular':0,'Ruim':0};
  d.forEach(r => [r.refeicao,r.atendimento,r.ambiente].forEach(n => {
    if (!notaValida(n)) return;
    if (['Ótima','Ótimo'].includes(n)) cont['Ótimo']++;
    else if (['Boa','Bom'].includes(n)) cont['Bom']++;
    else if (n==='Regular') cont['Regular']++;
    else if (n==='Ruim') cont['Ruim']++;
  }));
  const total = Object.values(cont).reduce((a,b)=>a+b,0);

  const _c_dash_chart_distrib = document.getElementById('dash-chart-distrib'); if (!_c_dash_chart_distrib) return;
  new Chart(_c_dash_chart_distrib.getContext('2d'), {
    type: 'doughnut',
    data: { datasets: [{ data:[cont['Ótimo'],cont['Bom'],cont['Regular'],cont['Ruim']],
      backgroundColor:['#059669','#10b981','#d97706','#e11d48'],
      borderWidth:2, borderColor:'#fff', hoverOffset:3 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'62%',
      animation: { duration: typeof _refreshSilencioso !== 'undefined' && _refreshSilencioso ? 0 : 500 },
      plugins:{ legend:{display:false} } }
  });

  setEl('dash-distrib-total', total);
  setHTML('dash-leg-distrib', [
    ['Ótimo',cont['Ótimo'],'#059669'],['Bom',cont['Bom'],'#10b981'],
    ['Regular',cont['Regular'],'#d97706'],['Ruim',cont['Ruim'],'#e11d48'],
  ].map(([n,v,c]) =>
    `<div class="leg-item"><div class="leg-cor" style="background:${c}"></div>
     <span class="leg-txt">${n}</span><span class="leg-val">${v}</span>
     <span class="leg-pct">(${pctStr(v,total)})</span></div>`
  ).join(''));
}

// ── Negativas por dia ────────────────────────────────────
function renderNegDia(d) {
  destroyChart('dash-chart-neg-dia');
  const dias   = diasRange(STATE.diasFiltro);
  const porDia = agruparPorDia(d);
  const negDia = dias.map(dia =>
    (porDia[dia]??[]).reduce((a,r) =>
      a + [r.refeicao,r.atendimento,r.ambiente].filter(n=>n==='Ruim').length, 0)
  );

  const _c_dash_chart_neg_dia = document.getElementById('dash-chart-neg-dia'); if (!_c_dash_chart_neg_dia) return;
  new Chart(_c_dash_chart_neg_dia.getContext('2d'), {
    type: 'line',
    data: { labels: dias.map(d=>d.substring(5).replace('-','/')),
      datasets: [{ data:negDia, borderColor:'#e11d48', backgroundColor:'#e11d4822',
        borderWidth:2, fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#e11d48' }] },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ y:{beginAtZero:true,ticks:{stepSize:1,font:{size:9},color:'#94a3b8'},grid:{color:'rgba(0,0,0,0.05)'}},
        x:{ticks:{font:{size:9},color:'#94a3b8'},grid:{display:false}} } }
  });
}

// ── Por período ──────────────────────────────────────────
function renderPeriodo(d) {
  const per = { cafe:0, almoco:0, jantar:0 };
  d.forEach(r => { if (per[r.periodo]!==undefined) per[r.periodo]++; });
  const total = d.length;

  setHTML('dash-per-lista', [
    { nome:'Manhã (06h–11h)', chave:'cafe',   cor:'#2563eb' },
    { nome:'Tarde (11h–17h)', chave:'almoco', cor:'#059669' },
    { nome:'Noite (17h–22h)', chave:'jantar', cor:'#7c3aed' },
  ].map(p => {
    const v = per[p.chave], w = pct(v, total);
    return `<div class="per-item">
      <span class="per-nome">${p.nome}</span>
      <div class="per-barra-wrap"><div class="per-barra" style="width:${w}%;background:${p.cor}">${w>10?w+'%':''}</div></div>
      <span class="per-val">${v} (${w}%)</span></div>`;
  }).join(''));
}

// ── Top observações ──────────────────────────────────────
function renderTopObs(d) {
  const stop = new Set(['de','a','o','e','em','para','com','que','do','da','no','na',
    'um','uma','os','as','se','foi','por','mais','mas','não','já','bem',
    'este','esta','como','quando','sobre','sua','seu','ela','ele','me','te',
    'nos','lhe','também','ainda','assim','então','muito','tem','são','isso',
    'esse','ao','dos','das','às','numa','neste','nessa','pelo','pela']);

  const freq = {};
  d.forEach(r => {
    if (!r.observacoes?.trim()) return;
    r.observacoes.toLowerCase()
      .replace(/[^a-záàâãéèêíïóôõöúüç\s]/gi,' ').split(/\s+/)
      .filter(w => w.length > 3 && !stop.has(w))
      .forEach(w => { freq[w] = (freq[w]||0)+1; });
  });

  const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = top[0]?.[1] || 1;

  setHTML('dash-obs-lista', top.length
    ? top.map(([w,cnt]) =>
        `<div class="obs-item">
          <span class="obs-palavra">${w}</span>
          <div class="obs-barra-wrap"><div class="obs-barra" style="width:${pct(cnt,max)}%"></div></div>
          <span class="obs-cnt">${cnt}</span></div>`
      ).join('')
    : '<div class="empty">Sem observações no período</div>'
  );
}

// ── Insights ─────────────────────────────────────────────
function renderInsights(d, da) {
  const insights = [];
  const sat = calcPctPos(d), satA = calcPctPos(da);
  if (sat!==null && satA!==null) {
    const diff = sat-satA;
    insights.push({ icon: diff>=0?'📈':'📉',
      txt: diff>=0
        ? `A satisfação geral aumentou ${diff}% em comparação ao período anterior.`
        : `A satisfação geral caiu ${Math.abs(diff)}% em comparação ao período anterior.` });
  }

  const mediasRef = ['cafe','almoco','jantar']
    .map(p => ({ p, v: calcMedia(d.filter(r=>r.periodo===p)) }))
    .filter(x=>x.v!==null).sort((a,b)=>b.v-a.v);
  if (mediasRef.length)
    insights.push({ icon:'🏆',
      txt:`${nomePeriodo(mediasRef[0].p)} tem o melhor desempenho (média ${mediasRef[0].v.toFixed(2).replace('.',',')}).` });

  const neg = calcPctNeg(d), negA = calcPctNeg(da);
  if (neg!==null && negA!==null && neg>negA)
    insights.push({ icon:'⚠️',
      txt:`As avaliações negativas aumentaram ${neg-negA}% e merecem atenção.` });

  const cats = [
    {nome:'Atendimento',v:calcMediaCat(d,'atendimento')},
    {nome:'Ambiente',   v:calcMediaCat(d,'ambiente')},
    {nome:'Refeição',   v:calcMediaCat(d,'refeicao')},
  ].filter(c=>c.v!==null).sort((a,b)=>a.v-b.v);
  if (cats.length && cats[0].v<2.5)
    insights.push({ icon:'🔍',
      txt:`"${cats[0].nome}" tem a menor média (${cats[0].v.toFixed(2).replace('.',',')}). Atenção necessária.` });

  if (!insights.length)
    insights.push({ icon:'✅', txt:'Nenhum alerta crítico no período.' });

  setHTML('dash-insight-lista', insights.map(i =>
    `<div class="insight-item"><div class="insight-icone">${i.icon}</div>
     <div class="insight-txt">${i.txt}</div></div>`
  ).join(''));
}

// ── Alertas ──────────────────────────────────────────────
function renderAlertas(d, da) {
  const alertas = [];

  ['cafe','almoco','jantar'].forEach(p => {
    const g = d.filter(r=>r.periodo===p);
    const neg = calcPctNeg(g);
    if (neg!==null && neg>15)
      alertas.push({ tipo:'critico', icon:'🔴',
        titulo:`Avaliações ruins — ${nomePeriodo(p)}`,
        desc:`${neg}% das avaliações de ${nomePeriodo(p)} são "Ruim".` });
  });

  const ambAt=calcMediaCat(d,'ambiente'), ambAnt=calcMediaCat(da,'ambiente');
  if (ambAt!==null && ambAnt!==null && ambAt<ambAnt)
    alertas.push({ tipo:'atencao', icon:'🟡',
      titulo:'Queda na avaliação do Ambiente',
      desc:`A média do ambiente caiu ${(ambAnt-ambAt).toFixed(2).replace('.',',')} pontos.` });

  const obsNeg = d.filter(r =>
    r.observacoes?.trim() &&
    [r.refeicao,r.atendimento,r.ambiente].some(n=>['Regular','Ruim'].includes(n))
  ).length;
  if (obsNeg>=5)
    alertas.push({ tipo:'info', icon:'🔵',
      titulo:'Volume de observações',
      desc:`${obsNeg} respostas com comentários sobre problemas.` });

  if (!alertas.length)
    alertas.push({ tipo:'info', icon:'✅',
      titulo:'Nenhum alerta no período',
      desc:'Indicadores dentro dos limites esperados.' });

  setHTML('dash-alerta-lista', alertas.map(a =>
    `<div class="alerta-item ${a.tipo}">
       <div class="alerta-icone">${a.icon}</div>
       <div class="alerta-corpo">
         <div class="alerta-titulo">${a.titulo}</div>
         <div class="alerta-desc">${a.desc}</div>
       </div>
       <button class="btn-det" onclick="navigate('respostas')">Ver detalhes</button>
     </div>`
  ).join(''));
}

// ── Atenção imediata ─────────────────────────────────────
function renderAtencao(d) {
  const neg = d.filter(r =>
    r.observacoes?.trim() &&
    [r.refeicao,r.atendimento,r.ambiente].some(n=>['Regular','Ruim'].includes(n))
  ).slice(0,10);

  setEl('dash-badge-aten', neg.length);
  setHTML('dash-tab-aten', neg.length
    ? neg.map(r => `<tr>
        <td class="td-data">${fmtData(r.created_at)}</td>
        <td><span class="ref-badge ${classeRef(r.periodo)}">${nomePeriodo(r.periodo)}</span></td>
        <td>${celulaNota(r.refeicao)}</td><td>${celulaNota(r.atendimento)}</td><td>${celulaNota(r.ambiente)}</td>
        <td class="td-obs-txt" title="${r.observacoes||''}">${r.observacoes||'—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">Nenhuma ocorrência no período ✅</td></tr>'
  );
}

// ── Últimas negativas ────────────────────────────────────
function renderUltimasNeg(d) {
  const neg = d.filter(r =>
    [r.refeicao,r.atendimento,r.ambiente].some(n=>n==='Ruim')
  ).slice(0,15);

  setEl('dash-badge-neg', neg.length);
  setHTML('dash-tab-neg', neg.length
    ? neg.map(r => `<tr>
        <td class="td-data">${fmtData(r.created_at)}</td>
        <td><span class="ref-badge ${classeRef(r.periodo)}">${nomePeriodo(r.periodo)}</span></td>
        <td>${celulaNota(r.refeicao)}</td><td>${celulaNota(r.atendimento)}</td><td>${celulaNota(r.ambiente)}</td>
        <td class="td-data">${r.nome||'Anônimo'}</td>
        <td class="td-obs-txt" title="${r.observacoes||''}">${r.observacoes||'—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="empty">Nenhuma avaliação "Ruim" ✅</td></tr>'
  );
}

// ── Exportar CSV ─────────────────────────────────────────
function exportarCSV() {
  const d = STATE.dadosAtual;
  const cab = ['Data/Hora','Refeição','Avaliação','Atendimento','Ambiente','Nome','Observações'];
  const linhas = d.map(r =>
    [fmtData(r.created_at),nomePeriodo(r.periodo),r.refeicao||'',r.atendimento||'',
     r.ambiente||'',r.nome||'Anônimo',r.observacoes||'']
    .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')
  );
  const csv  = '\uFEFF' + [cab.join(','),...linhas].join('\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`dashboard_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`;
  a.click(); URL.revokeObjectURL(url);
}
