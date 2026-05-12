// ═══════════════════════════════════════════════════════════
//  auth.js — Autenticação + Roteador SPA
// ═══════════════════════════════════════════════════════════

// Flags de controle — evitam chamadas simultâneas
let _iniciando     = false;
let _carregando    = false;
let _navegando     = false;
let _refreshSilencioso = false;

// ── Inicializar aplicação ────────────────────────────────
async function initApp() {
  if (_iniciando) return;
  _iniciando = true;

  // Criar cliente Supabase com storage personalizado
  // (funciona mesmo quando Edge bloqueia localStorage de terceiros)
  const supabaseStorage = {
    getItem:    (k) => STORE.get(k),
    setItem:    (k, v) => STORE.set(k, v),
    removeItem: (k) => STORE.remove(k),
  };
  STATE.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: {
      storage: supabaseStorage,
      persistSession: _storageOk, // só persiste se localStorage disponível
      autoRefreshToken: true,
    }
  });

  showOverlay('Verificando acesso\u2026');

  const ok = await checkAuth();
  if (!ok) return;

  hideOverlay();
  const layout = document.getElementById('app-layout');
  if (layout) layout.style.display = 'flex';

  await carregarTodosOsDados();

  // Navegar para seção inicial (hash ou dashboard)
  const hash = location.hash.replace('#', '') || 'dashboard';
  navigate(hash, false); // false = não fazer pushState na carga inicial

  // Auto-refresh silencioso a cada 5 minutos — só dados, sem re-render
  setInterval(atualizarDadosSilencioso, CONFIG.REFRESH_INTERVAL_MS);
}

// ── Verificar autenticação ───────────────────────────────
async function checkAuth() {
  let session = null;
  try {
    const { data } = await STATE.sb.auth.getSession();
    session = data?.session ?? null;
  } catch(e) {
    showOverlay('\u274c Erro de conexão. Verifique sua internet.', true);
    const btn = document.getElementById('overlay-btn');
    if (btn) { btn.textContent = '\ud83d\udd04 Tentar novamente'; btn.style.display='inline-block'; btn.onclick=()=>location.reload(); }
    return false;
  }

  if (!session) { location.href = 'login.html'; return false; }

  STATE.token = session.access_token;

  // Buscar perfil com até 3 tentativas
  let perfil = null;
  for (let t = 1; t <= 3; t++) {
    try {
      const rows = await fetchREST('perfis?id=eq.' + session.user.id + '&select=*');
      if (rows?.length) { perfil = rows[0]; break; }
    } catch(e) {
      if (t < 3) await new Promise(r => setTimeout(r, 600));
    }
  }

  if (!perfil) {
    showOverlay('\u26a0\ufe0f Perfil não encontrado.<br><small style="color:#999">ID: ' + session.user.id + '</small>', true);
    const btn = document.getElementById('overlay-btn');
    if (btn) {
      btn.textContent = '\ud83d\udd10 Voltar ao login';
      btn.style.display = 'inline-block';
      btn.onclick = async () => { await STATE.sb.auth.signOut(); location.href = 'login.html'; };
    }
    return false;
  }

  if (!perfil.ativo) {
    await STATE.sb.auth.signOut();
    location.href = 'login.html?erro=inativo';
    return false;
  }

  STATE.perfil = perfil;
  renderNav();
  return true;
}

// ── Renderizar nav ───────────────────────────────────────
function renderNav() {
  const p = STATE.perfil;

  // Rodapé: dados do usuário logado
  setEl('nav-user-name',    p.nome);
  setEl('nav-user-unidade', p.unidade || CONFIG.UNIDADE_PADRAO);
  setEl('nav-badge',        p.perfil.toUpperCase());

  // Avatar: iniciais
  const iniciais = p.nome.split(' ')
    .filter(s => s.length > 0).slice(0, 2)
    .map(s => s[0].toUpperCase()).join('');
  setEl('sb-avatar', iniciais || '?');

  // Admin: mostrar Usuários
  if (p.perfil === 'admin') {
    ['nav-admin-item', 'nav-mobile-admin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'flex';
    });
  }
}

function setEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ── Carregar todos os dados (inicial) ────────────────────
async function carregarTodosOsDados() {
  if (_carregando) return;
  _carregando = true;

  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();
    STATE.dash.primeiraCaptura = false;
  } catch(err) {
    console.warn('Erro ao carregar dados:', err.message);
    if (STATE.dash.primeiraCaptura) {
      showOverlay('\u274c Não foi possível carregar os dados.<br><small>' + err.message + '</small>', true);
      const btn = document.getElementById('overlay-btn');
      if (btn) { btn.textContent = '\ud83d\udd04 Tentar novamente'; btn.style.display='inline-block'; btn.onclick=()=>{ _carregando=false; carregarTodosOsDados(); }; }
    }
  } finally {
    _carregando = false;
  }
}

// ── Refresh silencioso — só atualiza dados, NÃO re-renderiza ─
async function atualizarDadosSilencioso() {
  if (_carregando || _navegando) return;
  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();
    // Indicador visual sutil de atualização (sem re-animar charts)
    const tag = document.getElementById('tag-periodo-desk');
    if (tag) {
      tag.style.opacity = '0.5';
      setTimeout(() => { tag.style.opacity = '1'; }, 500);
    }
  } catch(e) {
    console.warn('Refresh silencioso falhou:', e.message);
  }
}

// ── Roteador SPA ─────────────────────────────────────────
const SECOES = ['dashboard', 'respostas', 'admin'];

function navigate(secao, pushState = true) {
  if (_navegando) return;
  _navegando = true;

  try {
    if (!SECOES.includes(secao)) secao = 'dashboard';
    if (secao === 'admin' && STATE.perfil?.perfil !== 'admin') secao = 'dashboard';

    STATE.secao = secao;
    console.log('[nav] navigate(' + secao + ') chamado de:', new Error().stack.split('\n').slice(2,4).join(' | '));

    // Título topbar mobile
    const titulos = { dashboard: 'Dashboard', respostas: 'Respostas', admin: 'Usuários' };
    setEl('topbar-titulo', titulos[secao] || 'Dashboard');

    // Mostrar/ocultar seções
    SECOES.forEach(id => {
      const el = document.getElementById('sec-' + id);
      if (el) el.style.display = id === secao ? 'block' : 'none';
    });

    // Subitens da sidebar
    ['dashboard', 'respostas'].forEach(id => {
      const sub = document.getElementById('sub-' + id);
      if (sub) sub.style.display = id === secao ? 'block' : 'none';
    });

    // Link ativo na sidebar
    document.querySelectorAll('.sb-link[data-secao]').forEach(link => {
      link.classList.toggle('ativo', link.dataset.secao === secao);
    });

    // Atualizar URL (sem recarregar)
    if (pushState) history.pushState({ secao }, '', '#' + secao);

    // Renderizar conteúdo
    switch (secao) {
      case 'dashboard': renderDashboard(); break;
      case 'respostas': renderRespostas(); break;
      case 'admin':     renderAdmin();     break;

    // Re-inicializar ícones Lucide após render
    if (window.lucide) lucide.createIcons();
    }

    fecharMobileMenu();

  } finally {
    _navegando = false;
  }
}

// ── Calcular períodos ────────────────────────────────────
function calcularPeriodos() {
  const hoje   = new Date();
  const iniAt  = new Date(); iniAt.setDate(hoje.getDate() - STATE.diasFiltro);
  const iniAnt = new Date(); iniAnt.setDate(hoje.getDate() - STATE.diasFiltro * 2);

  const hojeStr   = hoje.toISOString().split('T')[0];
  const iniAtStr  = iniAt.toISOString().split('T')[0];
  const iniAntStr = iniAnt.toISOString().split('T')[0];

  STATE.dadosAtual = STATE.dados.filter(r => {
    const d = r.created_at?.substring(0, 10);
    return d >= iniAtStr && d <= hojeStr;
  });
  STATE.dadosAnt = STATE.dados.filter(r => {
    const d = r.created_at?.substring(0, 10);
    return d >= iniAntStr && d < iniAtStr;
  });

  const tagTxt =
    iniAt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' \u2013 ' +
    hoje.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

  ['tag-periodo', 'tag-periodo-desk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = tagTxt;
  });
}

// ── Mudar filtro de dias ─────────────────────────────────
function setDias(n) {
  STATE.diasFiltro = n;
  document.querySelectorAll('.btn-periodo').forEach(b => {
    b.classList.toggle('ativo', b.dataset.dias == n);
  });
  calcularPeriodos();
  navigate(STATE.secao, false);
}

// ── Overlay ──────────────────────────────────────────────
function showOverlay(msg, isErro = false) {
  const ov     = document.getElementById('overlay');
  const msg_el = document.getElementById('overlay-msg');
  const btn    = document.getElementById('overlay-btn');
  if (!ov) return;
  ov.classList.remove('oculto', 'erro');
  if (isErro) ov.classList.add('erro');
  if (msg_el) msg_el.innerHTML = msg;
  if (btn)    btn.style.display = 'none';
}

function hideOverlay() {
  const ov = document.getElementById('overlay');
  if (ov) ov.classList.add('oculto');
}

// ── Menu mobile ──────────────────────────────────────────
function toggleMobileMenu() {
  document.getElementById('sidebar')?.classList.toggle('mobile-aberta');
  document.getElementById('sidebar-overlay')?.classList.toggle('visivel');
}

function fecharMobileMenu() {
  document.getElementById('sidebar')?.classList.remove('mobile-aberta');
  document.getElementById('sidebar-overlay')?.classList.remove('visivel');
}

// ── Sidebar colapsar ─────────────────────────────────────
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const content  = document.querySelector('.content');
  const colapsada = sidebar?.classList.toggle('colapsada');
  if (content) content.style.marginLeft = colapsada ? '64px' : '220px';
  STORE.set('sidebar-colapsada', colapsada ? '1' : '0');
}

// Restaurar estado da sidebar
document.addEventListener('DOMContentLoaded', function () {
  if (STORE.get('sidebar-colapsada') === '1') {
    const sidebar = document.getElementById('sidebar');
    const content = document.querySelector('.content');
    sidebar?.classList.add('colapsada');
    if (content) content.style.marginLeft = '64px';
  }
});

// ── Sair ─────────────────────────────────────────────────
async function sair() {
  await STATE.sb.auth.signOut();
  location.href = 'login.html';
}
