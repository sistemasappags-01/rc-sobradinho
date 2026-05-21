// ═══════════════════════════════════════════════════════════
//  auth.js — Autenticação + Roteador SPA + Políticas de perfil
//
//  TABELA DE POLÍTICAS
//  ┌─────────────────────────────┬─────────────┬────────┬───────┐
//  │ Recurso                     │visualizador │ gestor │ admin │
//  ├─────────────────────────────┼─────────────┼────────┼───────┤
//  │ Dashboard (ver)             │     ✅       │   ✅   │  ✅   │
//  │ Dashboard CSV / PDF         │     ❌       │   ✅   │  ✅   │
//  │ Respostas (ver)             │  ✅ s/nome   │   ✅   │  ✅   │
//  │ Respostas CSV / PDF         │     ❌       │   ✅   │  ✅   │
//  │ Nova Resposta               │     ❌       │   ✅   │  ✅   │
//  │ Nome / Telefone             │     ❌       │   ✅   │  ✅   │
//  │ Sidebar subitens            │     ❌       │   ✅   │  ✅   │
//  │ Seção Usuários              │     ❌       │   ❌   │  ✅   │
//  └─────────────────────────────┴─────────────┴────────┴───────┘
// ═══════════════════════════════════════════════════════════

let _iniciando  = false;
let _carregando = false;
let _navegando  = false;

// ── Inicializar aplicação ────────────────────────────────
async function initApp() {
  if (_iniciando) return;
  _iniciando = true;

  showOverlay('Verificando acesso…');

  if (!window.supabase) {
    showOverlay('❌ Biblioteca não carregou. Recarregue a página.', true);
    return;
  }

  STATE.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

  const ok = await checkAuth();
  if (!ok) return;

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

  await carregarTodosOsDados();
  atualizarTagHora();

  const hash = location.hash.replace('#', '') || 'dashboard';
  navigate(hash, false);

  setInterval(atualizarDadosSilencioso, CONFIG.REFRESH_INTERVAL_MS);

  // S1 — Verificar sessão a cada 4 minutos
  // O token do Supabase expira após 1h — detectar expiração antes do erro
  setInterval(verificarSessaoAtiva, 4 * 60 * 1000);

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
    const btn = document.getElementById('overlay-btn');
    if (btn) { btn.style.display = 'inline-block'; btn.onclick = () => location.reload(); }
    return false;
  }

  if (!session) { location.href = 'login.html'; return false; }

  STATE.token = session.access_token;
  // S2 — Ofuscar token: deletar do objeto após copiar para closure
  // (outros módulos acessam via STATE.token normalmente)
  Object.defineProperty(STATE, 'token', {
    get() { return this._tok || ''; },
    set(v) { this._tok = v; },
    configurable: true,
  });
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
    showOverlay('⚠️ Perfil não encontrado.', true);
    const btn = document.getElementById('overlay-btn');
    if (btn) {
      btn.style.display = 'inline-block';
      btn.textContent = 'Voltar ao login';
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
  // A2 — Atualizar último acesso do usuário
  try {
    await fetchREST_WRITE('PATCH',
      `perfis?id=eq.${session.user.id}`,
      { ultimo_acesso: new Date().toISOString() }
    );
  } catch(_) { /* não crítico */ }

  aplicarPoliticasPerfil();
  renderNav();
  return true;
}

// ── Políticas de acesso por perfil ──────────────────────
function aplicarPoliticasPerfil() {
  const perfil = STATE.perfil?.perfil || 'visualizador';

  // ── REGRAS POR PERFIL ─────────────────────────────────
  const PODE_EXPORTAR    = ['gestor', 'admin'].includes(perfil);
  const PODE_NOVA_RESP   = ['gestor', 'admin'].includes(perfil);
  const PODE_VER_NOMES   = ['gestor', 'admin'].includes(perfil);
  const PODE_ADMIN       = perfil === 'admin';
  const PODE_SUBITENS    = ['gestor', 'admin'].includes(perfil);

  // ── 1. Marcar body com classe de perfil ───────────────
  document.body.classList.remove('perfil-visualizador', 'perfil-gestor', 'perfil-admin');
  document.body.classList.add('perfil-' + perfil);

  // ── 2. Botões Dashboard (CSV + PDF) ───────────────────
  ['dash-btn-csv', 'dash-btn-pdf'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = PODE_EXPORTAR ? '' : 'none';
  });

  // ── 3. Botões Respostas (CSV + PDF + Nova resposta) ───
  ['res-btn-csv', 'res-btn-pdf'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = PODE_EXPORTAR ? '' : 'none';
  });
  const novaBtn = document.getElementById('res-btn-nova');
  if (novaBtn) novaBtn.style.display = PODE_NOVA_RESP ? '' : 'none';

  // ── 4. Sidebar subitens (CSV/PDF/Nova em cada seção) ──
  const subDash = document.getElementById('sub-dashboard');
  const subRes  = document.getElementById('sub-respostas');
  if (subDash) subDash.style.display = PODE_SUBITENS ? '' : 'none';
  // sub-respostas começa oculto e é mostrado pelo navigate() —
  // para visualizador garantir que nunca aparece
  if (subRes && !PODE_SUBITENS) subRes.style.setProperty('display','none','important');

  // ── 5. Seção Usuários na sidebar ──────────────────────
  const navAdmin = document.getElementById('nav-admin-item');
  if (navAdmin) navAdmin.style.display = PODE_ADMIN ? 'flex' : 'none';

  // ── 6. Nome/telefone — CSS class no body ──────────────
  // respostas.js lê document.body.classList.contains('perfil-visualizador')
  // para mascarar os dados nas linhas da tabela e no modal
}

// ── Renderizar nav com dados do usuário ──────────────────
function renderNav() {
  const p = STATE.perfil;
  setEl('nav-user-name',    p.nome);
  setEl('nav-user-unidade', p.unidade || CONFIG.UNIDADE_PADRAO);
  setEl('nav-badge',        p.perfil.toUpperCase());

  const iniciais = p.nome.split(' ')
    .filter(s => s.length > 0).slice(0, 2)
    .map(s => s[0].toUpperCase()).join('');
  setEl('sb-avatar', iniciais || '?');
}

// ── Carregar dados do banco ──────────────────────────────
async function carregarTodosOsDados() {
  if (_carregando) return;
  _carregando = true;
  try {
    // T1 — Limitar registros iniciais para performance
    // CONFIG.LIMITE_REGISTROS define o máximo (ex: 2000)
    const limite = CONFIG.LIMITE_REGISTROS || 2000;
    const rows = await fetchREST(`respostas?select=*&order=created_at.desc&limit=${limite}`);
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();
  } catch(e) {
    console.warn('Erro ao carregar dados:', e.message);
  } finally {
    _carregando = false;
  }
}

// ── Refresh silencioso ───────────────────────────────────
async function atualizarDadosSilencioso() {
  if (_carregando || _navegando) return;
  try {
    // T1 — Limitar registros iniciais para performance
    // CONFIG.LIMITE_REGISTROS define o máximo (ex: 2000)
    const limite = CONFIG.LIMITE_REGISTROS || 2000;
    const rows = await fetchREST(`respostas?select=*&order=created_at.desc&limit=${limite}`);
    STATE.dados = Array.isArray(rows) ? rows : [];
    calcularPeriodos();

    const qtdAntes = STATE.dados.length;
    switch (STATE.secao) {
      case 'dashboard': renderDashboard(); break;
      case 'respostas': aplicarFiltrosRes(); break;
    }
    atualizarTagHora();
    // D2 — Pulso visual se novos registros chegaram
    if (STATE.dados.length > qtdAntes) {
      document.querySelectorAll('.kpi-card, .stat-card').forEach(el => {
        el.classList.remove('kpi-novo');
        void el.offsetWidth; // force reflow
        el.classList.add('kpi-novo');
        setTimeout(() => el.classList.remove('kpi-novo'), 1200);
      });
    }
    const tag = document.getElementById('tag-periodo-desk');
    if (tag) { tag.style.opacity = '0.4'; setTimeout(() => { tag.style.opacity = '1'; }, 500); }
    const btn = document.getElementById('btn-refresh');
    if (btn) { btn.classList.add('refresh-ok'); setTimeout(() => btn.classList.remove('refresh-ok'), 1500); }
    console.log('[auto-refresh]', STATE.dados.length, 'registros');
  } catch(e) {
    console.warn('[auto-refresh] falhou:', e.message);
  }
}

// ── Atualizar manualmente ────────────────────────────────
async function atualizarManual() {
  const btn = document.getElementById('btn-refresh');
  if (btn) { btn.disabled = true; btn.classList.add('refresh-spin'); }
  try {
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
  } catch(e) {
    // D3 — Feedback visual de erro no botão Atualizar
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('refresh-spin');
      btn.classList.add('refresh-erro');
      btn.title = 'Erro ao atualizar: ' + e.message;
      setTimeout(() => {
        btn.classList.remove('refresh-erro');
        btn.title = 'Atualizar dados';
      }, 3000);
    }
    // Mostrar aviso discreto no topo
    mostrarAvisoSessao('⚠ Erro ao atualizar dados: ' + e.message);
    setTimeout(() => {
      const av = document.getElementById('sessao-aviso');
      if (av) av.remove();
    }, 4000);
    console.warn('[atualizarManual] erro:', e.message);
  }
}

// ── Tag de hora da atualização ───────────────────────────
function atualizarTagHora() {
  const tag = document.getElementById('tag-atualizacao');
  if (!tag) return;
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  tag.textContent = ' · Atualizado às ' + hora;
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

  const fmt = d => d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const txt = fmt(iniAt) + ' – ' + fmt(hoje);
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

  // Redirecionar se perfil não tem acesso
  const perfil = STATE.perfil?.perfil || 'visualizador';
  if (secao === 'admin' && perfil !== 'admin') secao = 'dashboard';

  _navegando = true;
  STATE.secao = secao;

  try {
    const titulos = { dashboard: 'Dashboard', respostas: 'Respostas', admin: 'Usuários' };
    const icos    = { dashboard: '📊', respostas: '📋', admin: '👤' };
    setEl('topbar-titulo', titulos[secao] || 'Dashboard');
    // M1 — Ícone discreto ao lado do título na topbar mobile
    const icoEl = document.getElementById('topbar-secao-ico');
    if (icoEl) { icoEl.textContent = icos[secao] || ''; }

    SECOES.forEach(id => {
      const el = document.getElementById('sec-' + id);
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById('sec-' + secao);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.sb-link[data-secao]').forEach(link => {
      link.classList.toggle('ativo', link.dataset.secao === secao);
    });

    // Subitens da sidebar — respeitar política de perfil
    const podeSub = ['gestor', 'admin'].includes(perfil);
    ['dashboard', 'respostas'].forEach(id => {
      const sub = document.getElementById('sub-' + id);
      if (!sub) return;
      if (!podeSub) {
        sub.style.setProperty('display', 'none', 'important');
      } else {
        sub.style.display = id === secao ? 'block' : 'none';
      }
    });

    if (pushState) history.pushState(null, '', '#' + secao);

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

// ── Verificação periódica de sessão ─────────────────────
async function verificarSessaoAtiva() {
  if (!STATE.sb) return;
  try {
    const { data, error } = await STATE.sb.auth.getSession();

    // Sem sessão ou erro — redirecionar
    if (error || !data?.session) {
      mostrarAvisoSessao('Sua sessão expirou. Redirecionando para o login…');
      setTimeout(() => { window.location.href = 'login.html'; }, 2500);
      return;
    }

    // Sessão expira em menos de 5 minutos — renovar silenciosamente
    const expiresAt  = data.session.expires_at; // timestamp Unix
    const agora      = Math.floor(Date.now() / 1000);
    const restantes  = expiresAt - agora;

    if (restantes < 300) { // menos de 5 minutos
      console.log('[sessão] Renovando token silenciosamente…');
      const { data: refreshed, error: refreshErr } = await STATE.sb.auth.refreshSession();
      if (refreshErr || !refreshed?.session) {
        mostrarAvisoSessao('Sessão expirada. Redirecionando para o login…');
        setTimeout(() => { window.location.href = 'login.html'; }, 2500);
      } else {
        STATE.token = refreshed.session.access_token; // setter acima cuida do _tok
        console.log('[sessão] Token renovado com sucesso.');
      }
    }
  } catch(e) {
    console.warn('[sessão] Erro ao verificar sessão:', e.message);
  }
}

function mostrarAvisoSessao(msg) {
  // Exibir aviso discreto no topo da tela
  let aviso = document.getElementById('sessao-aviso');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'sessao-aviso';
    aviso.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9998',
      'background:#1a3a6e', 'color:#fff', 'text-align:center',
      'padding:10px 16px', 'font-size:13px', 'font-family:DM Sans,sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.25)'
    ].join(';');
    document.body.appendChild(aviso);
  }
  aviso.textContent = msg;
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

// ── Sidebar colapsar ────────────────────────────────────
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

// ── Tooltips: click para mobile ──────────────────────────
document.addEventListener('click', function(e) {
  const ico = e.target.closest('.tooltip-ico');
  if (ico) {
    e.stopPropagation();
    const wrap = ico.closest('.tooltip-wrap');
    const rect = wrap.getBoundingClientRect();
    if (rect.left + 130 > window.innerWidth - 20) {
      wrap.classList.add('tooltip-esq');
    } else {
      wrap.classList.remove('tooltip-esq');
    }
    wrap.classList.toggle('ativo');
    document.querySelectorAll('.tooltip-wrap.ativo').forEach(w => {
      if (w !== wrap) w.classList.remove('ativo');
    });
    return;
  }
  document.querySelectorAll('.tooltip-wrap.ativo').forEach(w => w.classList.remove('ativo'));
});

// M3 — Tooltips acessíveis via teclado (Tab + Enter/Space)
document.addEventListener('keydown', function(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('tooltip-ico')) {
    e.preventDefault();
    e.target.click();
  }
  // ESC fecha todos os tooltips
  if (e.key === 'Escape') {
    document.querySelectorAll('.tooltip-wrap.ativo').forEach(w => w.classList.remove('ativo'));
  }
});

// ── Utilitário ───────────────────────────────────────────
function setEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
