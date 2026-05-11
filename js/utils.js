// ═══════════════════════════════════════════════════════════
//  utils.js — Estado global e funções compartilhadas
// ═══════════════════════════════════════════════════════════

// ── Estado global da aplicação ───────────────────────────
const STATE = {
  sb:      null,   // Cliente Supabase
  token:   '',     // Token de autenticação
  perfil:  null,   // Perfil do usuário logado
  secao:   'dashboard', // Seção ativa

  // Dados compartilhados
  dados:        [],  // Todos os registros
  dadosAtual:   [],  // Período atual filtrado
  dadosAnt:     [],  // Período anterior (para comparação)
  diasFiltro:   7,

  // Respostas
  res: {
    todos:     [],
    filtrados: [],
    pagina:    1,
    porPagina: CONFIG.POR_PAGINA_PADRAO,
    charts:    {},
  },

  // Charts do dashboard
  dash: { charts: {}, primeiraCaptura: true },
};

// ── Validação de nota ────────────────────────────────────
function notaValida(n) {
  return n && n !== 'null' && n !== 'EMPTY' && n !== '' &&
    ['Ótima','Ótimo','Boa','Bom','Regular','Ruim'].includes(n);
}

// ── Score numérico (escala 1–4) ──────────────────────────
function scoreNota(n) {
  if (!notaValida(n)) return null;
  return { 'Ótima':4,'Ótimo':4,'Boa':3,'Bom':3,'Regular':2,'Ruim':1 }[n] ?? null;
}

// ── Classe CSS do badge ──────────────────────────────────
function classeNota(n) {
  if (!notaValida(n)) return '';
  if (['Ótima','Ótimo'].includes(n)) return 'otimo';
  if (['Boa','Bom'].includes(n))     return 'bom';
  if (n === 'Regular')               return 'regular';
  return 'ruim';
}

// ── Classe CSS da refeição ───────────────────────────────
function classeRef(p) {
  return { cafe:'cafe', almoco:'almoco', jantar:'jantar' }[p] || '';
}

// ── Nome legível da refeição ─────────────────────────────
function nomePeriodo(p) {
  return { cafe:'Café da Manhã', almoco:'Almoço', jantar:'Jantar' }[p] || p || '—';
}

// ── HTML do badge de nota ────────────────────────────────
function celulaNota(v) {
  if (!notaValida(v)) return '<em class="vazio">—</em>';
  return `<span class="nota-badge ${classeNota(v)}">${v}</span>`;
}

// ── Formatação de data ───────────────────────────────────
function fmtData(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
    + ', ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

// ── Percentual inteiro ───────────────────────────────────
function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
function pctStr(a, b) { return b > 0 ? pct(a,b) + '%' : '—'; }

// ── Cálculo de média (escala 1–4) ────────────────────────
function calcMedia(dados) {
  const vals = dados
    .flatMap(r => [r.refeicao, r.atendimento, r.ambiente])
    .filter(notaValida).map(scoreNota).filter(v => v !== null);
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
}

function calcMediaCat(dados, campo) {
  const vals = dados.map(r => r[campo])
    .filter(notaValida).map(scoreNota).filter(v => v !== null);
  return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
}

// ── Cálculo de % positivas ───────────────────────────────
function calcPctPos(dados) {
  const totalAv = dados.reduce((a,r) =>
    a + [r.refeicao, r.atendimento, r.ambiente].filter(notaValida).length, 0);
  const pos = dados.reduce((a,r) =>
    a + [r.refeicao, r.atendimento, r.ambiente]
      .filter(n => ['Ótima','Ótimo','Boa','Bom'].includes(n)).length, 0);
  return totalAv > 0 ? pct(pos, totalAv) : null;
}

// ── Cálculo de % negativas ───────────────────────────────
function calcPctNeg(dados) {
  const totalAv = dados.reduce((a,r) =>
    a + [r.refeicao, r.atendimento, r.ambiente].filter(notaValida).length, 0);
  const neg = dados.reduce((a,r) =>
    a + [r.refeicao, r.atendimento, r.ambiente].filter(n => n === 'Ruim').length, 0);
  return totalAv > 0 ? pct(neg, totalAv) : null;
}

// ── Tag HTML de variação ─────────────────────────────────
function varTag(atual, ant, menorMelhor = false) {
  if (atual === null || ant === null)
    return '<span class="kpi-var neu">— sem dados anteriores</span>';
  const diff  = atual - ant;
  const sinal = diff >= 0 ? '↑' : '↓';
  const cls   = (diff >= 0) === !menorMelhor ? 'up' : 'down';
  const abs   = Math.abs(diff);
  const fmtN  = Number.isInteger(abs) ? abs : abs.toFixed(2);
  return `<span class="kpi-var ${cls}">${sinal} ${fmtN} vs período anterior</span>`;
}

// ── Agrupar dados por dia ────────────────────────────────
function agruparPorDia(dados) {
  const g = {};
  dados.forEach(r => {
    const d = r.created_at?.substring(0, 10);
    if (!d) return;
    if (!g[d]) g[d] = [];
    g[d].push(r);
  });
  return g;
}

// ── Gerar array de datas (últimos N dias) ────────────────
function diasRange(n) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().split('T')[0]);
  }
  return dias;
}

// ── Destruir chart pelo ID do canvas ────────────────────
function destroyChart(id) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ch = Chart.getChart(canvas);
  if (ch) ch.destroy();
}

// ── Fetch autenticado via REST API ───────────────────────
async function fetchREST(path, params = '') {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/${path}${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey':        CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${STATE.token}`,
      'Accept':        'application/json',
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Fetch autenticado com método e body ──────────────────
async function fetchREST_WRITE(method, path, body = null) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey':        CONFIG.SUPABASE_KEY,
      'Authorization': `Bearer ${STATE.token}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => null);
}
