// ═══════════════════════════════════════════════════════════
//  auth.js — Autenticação + Roteador SPA
// ═══════════════════════════════════════════════════════════

// ── Inicializar aplicação ────────────────────────────────
async function initApp() {
  // Supabase
  STATE.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  // Mostrar overlay imediatamente — layout fica oculto até auth OK
  showOverlay('Verificando acesso…');

  // Verificar autenticação
  const ok = await checkAuth();
  if (!ok) return;

  // Esconder overlay e mostrar layout após auth confirmada
  hideOverlay();
  const layout = document.getElementById('app-layout');
  if (layout) layout.style.display = 'flex';

  // Carregar dados iniciais (silencioso — layout já visível)
  await carregarTodosOsDados(false);

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
  // Não duplicar o showOverlay — initApp já chamou

  let session = null;
  try {
    const { data } = await STATE.sb.auth.getSession();
    session = data?.session ?? null;
  } catch(e) {
    showOverlay('❌ Erro de conexão. Verifique sua internet e tente novamente.', true);
    return false;
  }

  if (!session) {
    location.href = 'login.html';
    return false;
  }

  STATE.token = session.access_token;

  // Buscar perfil com até 3 tentativas
  let perfil = null;
  for (let t = 1; t <= 3; t++) {
    try {
      const rows = await fetchREST(`perfis?id=eq.${session.user.id}&select=*`);
      if (rows?.length) { perfil = rows[0]; break; }
    } catch(e) {
      if (t < 3) await new Promise(r => setTimeout(r, 600));
    }
  }

  if (!perfil) {
    showOverlay(
      `⚠️ Perfil não encontrado.<br>
       <small style="color:#999">Verifique se seu usuário foi cadastrado na tabela perfis.<br>
       ID: ${session.user.id}</small>`,
      true
    );
    const btn = document.getElementById('overlay-btn');
    if (btn) {
      btn.textContent = '🔐 Voltar ao login';
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

// ── Renderizar informações do usuário na nav ─────────────
function renderNav() {
  const p = STATE.perfil;
  // Preencher todos os elementos de nome/unidade na sidebar
  ['nav-user-name', 'nav-user-name2'].forEach(id => setEl(id, p.nome));
  ['nav-user-unidade', 'nav-user-unidade2'].forEach(id => setEl(id, p.unidade || CONFIG.UNIDADE_PADRAO));
  setEl('nav-badge', p.perfil.toUpperCase());

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

  // Atualizar título da topbar
  const titulos = { dashboard: 'Dashboard', respostas: 'Respostas', admin: 'Usuários' };
  setEl('topbar-titulo', titulos[secao] || 'Dashboard');

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
  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();
    STATE.dash.primeiraCaptura = false;

    // Re-renderizar seção em refresh silencioso
    if (silencioso) navigate(STATE.secao, false);

  } catch(err) {
    console.warn('Erro ao carregar dados:', err.message);
    // Só mostra erro se for a primeira captura (tela em branco)
    if (STATE.dash.primeiraCaptura) {
      showOverlay(`❌ Não foi possível carregar os dados.<br><small>${err.message}</small>`, true);
      const btn = document.getElementById('overlay-btn');
      if (btn) {
        btn.textContent = '🔄 Tentar novamente';
        btn.style.display = 'inline-block';
        btn.onclick = () => carregarTodosOsDados(false);
      }
    }
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
