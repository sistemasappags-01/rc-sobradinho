// ═══════════════════════════════════════════════════════════
//  auth.js — Autenticação + Roteador SPA
// ═══════════════════════════════════════════════════════════

// Flags de controle
let _iniciando  = false;
let _carregando = false;
let _navegando  = false;

// ── Inicializar aplicação ────────────────────────────────
async function initApp() {
  if (_iniciando) return;
  _iniciando = true;

  showOverlay('Verificando acesso…');

  // Inicializar Supabase — simples e confiável
  if (!window.supabase) {
    showOverlay('❌ Biblioteca não carregou. Recarregue a página.', true);
    return;
  }

  STATE.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  // Verificar autenticação
  const ok = await checkAuth();
  if (!ok) return;

  // Mostrar layout
  hideOverlay();
  const layout = document.getElementById('app-layout');
  if (layout) layout.style.display = 'flex';

  // Restaurar estado da sidebar
  if (STORE.get('sidebar-colapsada') === '1') {
    const sidebar = document.getElementById('sidebar');
    const content = document.querySelector('.content');
    sidebar?.classList.add('colapsada');
    if (content) content.style.marginLeft = '64px';
  }

  // Carregar dados e navegar
  await carregarTodosOsDados();
  atualizarTagHora(); // hora da carga inicial
  const hash = location.hash.replace('#', '') || 'dashboard';
  navigate(hash, false);

  // Auto-refresh silencioso a cada 5 minutos
  setInterval(atualizarDadosSilencioso, CONFIG.REFRESH_INTERVAL_MS);

  // Suporte ao botão voltar/avançar
  window.addEventListener('popstate', () => {
    navigate(location.hash.replace('#', '') || 'dashboard', false);
  });
}

// ── Verificar autenticação ───────────────────────────────
async function checkAuth() {
  let session = null;
  try {
    const { data, error } = await STATE.sb.auth.getSession();
    if (error) throw error;
    session = data?.session ?? null;
  } catch(e) {
    showOverlay('❌ Erro de conexão.<br><small>' + e.message + '</small>', true);
    document.getElementById('overlay-btn').style.display = 'inline-block';
    document.getElementById('overlay-btn').onclick = () => location.reload();
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
      const rows = await fetchREST('perfis?id=eq.' + session.user.id + '&select=*');
      if (rows?.length) { perfil = rows[0]; break; }
    } catch(e) {
      if (t < 3) await new Promise(r => setTimeout(r, 600));
    }
  }

  if (!perfil) {
    showOverlay('⚠️ Perfil não encontrado.<br><small>ID: ' + session.user.id + '</small>', true);
    const btn = document.getElementById('overlay-btn');
    btn.style.display = 'inline-block';
    btn.textContent = '🔐 Voltar ao login';
    btn.onclick = async () => { await STATE.sb.auth.signOut(); location.href = 'login.html'; };
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

// ── Renderizar nav com dados do usuário ──────────────────
function renderNav() {
  const p = STATE.perfil;

  // Rodapé sidebar — dados do usuário
  setEl('nav-user-name',    p.nome);
  setEl('nav-user-unidade', p.unidade || CONFIG.UNIDADE_PADRAO);
  setEl('nav-badge',        p.perfil.toUpperCase());

  // Avatar com iniciais
  const iniciais = p.nome.split(' ')
    .filter(s => s.length > 0).slice(0, 2)
    .map(s => s[0].toUpperCase()).join('');
  setEl('sb-avatar', iniciais || '?');

  // Admin: mostrar item Usuários
  if (p.perfil === 'admin') {
    const el = document.getElementById('nav-admin-item');
    if (el) el.style.display = 'flex';
  }

  // Visualizador: ocultar botões restritos e sinalizar para a tabela
  if (p.perfil === 'visualizador') {
    // Ocultar botões de ação restritos
    document.querySelectorAll('.res-btn-restrito').forEach(el => {
      el.style.display = 'none';
    });
    // Marcar o body para CSS ocultar coluna Nome
    document.body.classList.add('perfil-visualizador');
  }
}

// ── Carregar dados do banco ──────────────────────────────
async function carregarTodosOsDados() {
  if (_carregando) return;
  _carregando = true;
  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();
  } catch(e) {
    console.warn('Erro ao carregar dados:', e.message);
  } finally {
    _carregando = false;
  }
}

// ── Refresh silencioso (sem re-render de charts) ─────────
async function atualizarDadosSilencioso() {
  if (_carregando || _navegando) return;
  try {
    const rows = await fetchREST('respostas?select=*&order=created_at.desc');
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();

    // Re-renderizar a seção ativa sem animações
    switch (STATE.secao) {
      case 'dashboard': renderDashboard(); break;
      case 'respostas': aplicarFiltrosRes(); break;
    }

    // Indicação visual sutil de que os dados foram atualizados
    atualizarTagHora();
    const tag = document.getElementById('tag-periodo-desk');
    if (tag) { tag.style.opacity='0.4'; setTimeout(()=>{tag.style.opacity='1';}, 500); }
    const btn = document.getElementById('btn-refresh');
    if (btn) {
      btn.classList.add('refresh-ok');
      setTimeout(() => btn.classList.remove('refresh-ok'), 1500);
    }
    console.log('[auto-refresh] dados atualizados —', STATE.dados.length, 'registros');
  } catch(e) {
    console.warn('[auto-refresh] falhou:', e.message);
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

  // Atualizar tags de período
  const txt = iniAt.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})
    + ' – ' + hoje.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
  ['tag-periodo', 'tag-periodo-desk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
}

// ── Mudar filtro de dias ─────────────────────────────────
function setDias(n) {
  STATE.diasFiltro = n;
  document.querySelectorAll('.btn-periodo').forEach(b => {
    b.classList.toggle('ativo', parseInt(b.dataset.dias) === n);
  });
  calcularPeriodos();
  navigate(STATE.secao, false);
}

// ── Roteador SPA ────────────────────────────────────────
const SECOES = ['dashboard', 'respostas', 'admin'];

async function navigate(secao, pushState = true) {
  if (_navegando) return;
  if (!SECOES.includes(secao)) secao = 'dashboard';
  if (secao === 'admin' && STATE.perfil?.perfil !== 'admin') secao = 'dashboard';

  _navegando = true;
  STATE.secao = secao;

  try {
    // Atualizar título topbar mobile
    const titulos = { dashboard:'Dashboard', respostas:'Respostas', admin:'Usuários' };
    setEl('topbar-titulo', titulos[secao] || 'Dashboard');

    // Mostrar/ocultar seções
    SECOES.forEach(id => {
      const el = document.getElementById('sec-' + id);
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById('sec-' + secao);
    if (target) target.style.display = 'block';

    // Atualizar link ativo
    document.querySelectorAll('.sb-link[data-secao]').forEach(link => {
      link.classList.toggle('ativo', link.dataset.secao === secao);
    });

    // Subitens: mostrar só os da seção ativa
    ['dashboard', 'respostas'].forEach(id => {
      const sub = document.getElementById('sub-' + id);
      if (sub) sub.style.display = id === secao ? 'block' : 'none';
    });

    // Atualizar URL
    if (pushState) history.pushState(null, '', '#' + secao);

    // Renderizar conteúdo
    switch (secao) {
      case 'dashboard': renderDashboard(); break;
      case 'respostas': renderRespostas(); break;
      case 'admin':     renderAdmin();     break;
    }

    fecharMobileMenu();

  } finally {
    _navegando = false;
  }
}

// ── Overlay ──────────────────────────────────────────────
function showOverlay(msg, isErro = false) {
  const ov  = document.getElementById('overlay');
  const el  = document.getElementById('overlay-msg');
  const btn = document.getElementById('overlay-btn');
  if (!ov) return;
  ov.classList.remove('oculto', 'erro');
  if (isErro) ov.classList.add('erro');
  if (el)  el.innerHTML = msg;
  if (btn) btn.style.display = isErro ? 'inline-block' : 'none';
}

function hideOverlay() {
  document.getElementById('overlay')?.classList.add('oculto');
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

// ── Sidebar colapsar/expandir ────────────────────────────
function toggleSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const content   = document.querySelector('.content');
  const colapsada = sidebar?.classList.toggle('colapsada');
  if (content) content.style.marginLeft = colapsada ? '64px' : '220px';
  STORE.set('sidebar-colapsada', colapsada ? '1' : '0');
}

// ── Sair ─────────────────────────────────────────────────
async function sair() {
  await STATE.sb.auth.signOut();
  location.href = 'login.html';
}

// ── Utilitário ───────────────────────────────────────────
function setEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ── Tooltips: click para mobile ──────────────────────────
document.addEventListener('click', function(e) {
  const ico = e.target.closest('.tooltip-ico');
  if (ico) {
    e.stopPropagation();
    const wrap = ico.closest('.tooltip-wrap');
    // Verificar se fica perto da borda direita
    const rect = wrap.getBoundingClientRect();
    if (rect.left + 130 > window.innerWidth - 20) {
      wrap.classList.add('tooltip-esq');
    } else {
      wrap.classList.remove('tooltip-esq');
    }
    // Toggle ativo
    const ativo = wrap.classList.toggle('ativo');
    // Fechar outros abertos
    document.querySelectorAll('.tooltip-wrap.ativo').forEach(w => {
      if (w !== wrap) w.classList.remove('ativo');
    });
    return;
  }
  // Fechar qualquer tooltip aberto ao clicar fora
  document.querySelectorAll('.tooltip-wrap.ativo').forEach(w => {
    w.classList.remove('ativo');
  });
});


// ── Atualizar tag de última atualização ─────────────────
function atualizarTagHora() {
  const tag = document.getElementById('tag-atualizacao');
  if (!tag) return;
  const agora = new Date();
  const hora  = agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  tag.textContent = ' · Atualizado às ' + hora;
}
// ── Atualizar dados manualmente ──────────────────────────
async function atualizarManual() {
  const btn = document.getElementById('btn-refresh');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('refresh-spin');
  }
  await carregarTodosOsDados();
  switch (STATE.secao) {
    case 'dashboard': renderDashboard(); break;
    case 'respostas': aplicarFiltrosRes(); break;
  }
  atualizarTagHora();
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('refresh-spin');
    btn.classList.add('refresh-ok');
    setTimeout(() => btn.classList.remove('refresh-ok'), 1500);
  }
}
