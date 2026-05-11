// ═══════════════════════════════════════════════════════════
//  auth.js — Autenticação + Roteador SPA
// ═══════════════════════════════════════════════════════════

// ── Inicializar aplicação ────────────────────────────────
async function initApp() {
  // Inicializar Supabase
  STATE.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  // Verificar autenticação
  const ok = await checkAuth();
  if (!ok) return;

  // Carregar dados iniciais
  await carregarTodosOsDados();

  // Navegar para seção inicial (hash ou dashboard)
  const hash = location.hash.replace('#', '') || 'dashboard';
  navigate(hash);

  // Auto-refresh silencioso
  setInterval(() => carregarTodosOsDados(true), CONFIG.REFRESH_INTERVAL_MS);

  // Suporte ao botão voltar/avançar do browser
  window.addEventListener('popstate', () => {
    navigate(location.hash.replace('#', '') || 'dashboard', false);
  });
}

// ── Verificar autenticação ───────────────────────────────
async function checkAuth() {
  showOverlay('Verificando acesso…');

  const { data: { session } } = await STATE.sb.auth.getSession();
  if (!session) { location.href = 'login.html'; return false; }

  STATE.token = session.access_token;

  // Buscar perfil com até 3 tentativas
  let perfil = null;
  for (let t = 1; t <= 3; t++) {
    try {
      const rows = await fetchREST(
        `perfis?id=eq.${session.user.id}&select=*`
      );
      if (rows?.length) { perfil = rows[0]; break; }
    } catch(e) { await new Promise(r => setTimeout(r, 500)); }
  }

  if (!perfil) {
    showOverlay(`⚠️ Perfil não encontrado.<br><small>ID: ${session.user.id}</small>`, true);
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

// ── Renderizar informações do usuário na nav ─────────────
function renderNav() {
  const p = STATE.perfil;
  setEl('nav-user-name',    p.nome);
  setEl('nav-badge',        p.perfil.toUpperCase());
  setEl('nav-user-unidade', p.unidade || CONFIG.UNIDADE_PADRAO);

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

// ── Roteador SPA ────────────────────────────────────────
const SECOES = ['dashboard', 'respostas', 'admin'];

function navigate(secao, pushState = true) {
  // Validar seção
  if (!SECOES.includes(secao)) secao = 'dashboard';

  // Verificar permissão admin
  if (secao === 'admin' && STATE.perfil?.perfil !== 'admin') secao = 'dashboard';

  STATE.secao = secao;

  // Ocultar todas as seções
  SECOES.forEach(id => {
    const el = document.getElementById(`sec-${id}`);
    if (el) el.style.display = 'none';
  });

  // Mostrar seção ativa
  const target = document.getElementById(`sec-${secao}`);
  if (target) target.style.display = 'block';

  // Atualizar nav ativa
  document.querySelectorAll('[data-secao]').forEach(link => {
    link.classList.toggle('ativo', link.dataset.secao === secao);
  });

  // Atualizar URL
  if (pushState) history.pushState(null, '', `#${secao}`);

  // Carregar conteúdo da seção
  switch (secao) {
    case 'dashboard': renderDashboard(); break;
    case 'respostas': renderRespostas(); break;
    case 'admin':     renderAdmin();     break;
  }

  // Fechar menu mobile se aberto
  fecharMobileMenu();
}

// ── Carregar todos os dados ──────────────────────────────
async function carregarTodosOsDados(silencioso = false) {
  if (!silencioso) showOverlay('Conectando ao banco de dados…');

  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();

    if (!silencioso) hideOverlay();
    STATE.dash.primeiraCaptura = false;

    // Re-renderizar seção ativa em refresh silencioso
    if (silencioso) navigate(STATE.secao, false);

  } catch(err) {
    if (!silencioso) showOverlay(`❌ Erro ao carregar dados.<br><small>${err.message}</small>`, true);
    console.warn('Refresh silencioso falhou:', err.message);
  }
}

// ── Calcular períodos atual e anterior ──────────────────
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

  // Atualizar tag de período
  const tag = document.getElementById('tag-periodo');
  if (tag) tag.textContent =
    iniAt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' – ' +
    hoje.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
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
  const ov  = document.getElementById('overlay');
  const msg_el = document.getElementById('overlay-msg');
  const btn = document.getElementById('overlay-btn');
  if (!ov) return;
  ov.classList.remove('oculto', 'erro');
  if (isErro) ov.classList.add('erro');
  if (msg_el) msg_el.innerHTML = msg;
  if (btn) btn.style.display = isErro ? 'inline-block' : 'none';
}

function hideOverlay() {
  const ov = document.getElementById('overlay');
  if (ov) ov.classList.add('oculto');
}

// ── Menu mobile ──────────────────────────────────────────
function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar?.classList.toggle('mobile-aberta');
  overlay?.classList.toggle('visivel');
}

function fecharMobileMenu() {
  document.getElementById('sidebar')?.classList.remove('mobile-aberta');
  document.getElementById('sidebar-overlay')?.classList.remove('visivel');
}

// ── Sair ─────────────────────────────────────────────────
async function sair() {
  await STATE.sb.auth.signOut();
  location.href = 'login.html';
}
