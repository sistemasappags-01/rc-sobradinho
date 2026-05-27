// ═══════════════════════════════════════════════════════════
//  admin.js — Gestão de usuários
// ═══════════════════════════════════════════════════════════

// Cache local de usuários para navegação sem re-fetch
let _adm_usuarios = [];

async function renderAdmin() {
  if (STATE.perfil?.perfil !== 'admin') { navigate('dashboard'); return; }
  await carregarUsuarios();
}

async function carregarUsuarios() {
  try {
    const rows = await fetchREST('perfis?select=*&order=created_at.desc');
    _adm_usuarios = Array.isArray(rows) ? rows : [];
    renderListaUsuarios(_adm_usuarios);
  } catch(e) {
    setHTML('adm-lista', '<div class="empty">Erro ao carregar usuários: ' + e.message + '</div>');
  }
}

function renderListaUsuarios(usuarios) {
  const el = document.getElementById('adm-lista');
  if (!el) return;

  if (!usuarios.length) {
    el.innerHTML = '<div class="empty">Nenhum usuário cadastrado.</div>';
    return;
  }

  const badgePerfil = { admin:'otimo', gestor:'bom', visualizador:'regular' };

  el.innerHTML = '<div class="tabela-scroll"><table class="tab-aten" style="width:100%">'
    + '<thead><tr>'
    + '<th>Nome</th><th>E-mail</th><th>Perfil</th>'
    + '<th>Status</th><th>Último acesso</th><th>Ações</th>'
    + '</tr></thead>'
    + '<tbody>'
    + usuarios.map((u, idx) => {
        const ultimoAcesso = u.ultimo_acesso
          ? new Date(u.ultimo_acesso).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})
            + ' ' + new Date(u.ultimo_acesso).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})
          : '—';

        return '<tr>'
          + '<td style="font-weight:600">' + (u.nome || '—') + '</td>'
          + '<td class="td-data">' + (u.email || '—') + '</td>'
          + '<td><span class="nota-badge ' + (badgePerfil[u.perfil] || 'bom') + '">'
          +   (u.perfil || '—')
          + '</span></td>'
          + '<td><span class="nota-badge ' + (u.ativo ? 'otimo' : 'ruim') + '">'
          +   (u.ativo ? '✓ Ativo' : '✗ Inativo')
          + '</span></td>'
          + '<td class="td-data" style="font-size:11.5px;color:var(--tx3)">' + ultimoAcesso + '</td>'
          + '<td>'
          +   '<button class="btn-det" onclick="abrirEdicao(' + idx + ')">Editar</button>'
          +   '<button class="btn-det" style="margin-left:4px" onclick="toggleAtivo(' + "'" + u.id + "'" + ',' + u.ativo + ')">'
          +     (u.ativo ? 'Desativar' : 'Ativar')
          +   '</button>'
          + '</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table></div>';
}

async function toggleAtivo(id, atualAtivo) {
  if (!confirm((atualAtivo ? 'Desativar' : 'Ativar') + ' este usuário?')) return;
  try {
    await fetchREST_WRITE('PATCH', 'perfis?id=eq.' + id, { ativo: !atualAtivo });
    await carregarUsuarios();
  } catch(e) { alert('Erro ao atualizar usuário: ' + e.message); }
}

// ── A1 — Abrir modal de edição (por índice no cache) ──────────
function abrirEdicao(idx) {
  const u = _adm_usuarios[idx];
  if (!u) return;

  document.getElementById('adm-edit-id').value       = u.id;
  document.getElementById('adm-edit-nome').value     = u.nome || '';
  document.getElementById('adm-edit-email').value    = u.email || '';
  document.getElementById('adm-edit-unidade').value  = u.unidade || '';
  document.getElementById('adm-edit-perfil').value   = u.perfil || 'visualizador';
  document.getElementById('adm-edit-ativo').checked  = !!u.ativo;
  // Atualizar e-mail na aba senha
  const emailEl = document.getElementById('adm-senha-email');
  if (emailEl) emailEl.textContent = u.email || '—';
  // Resetar para aba Dados
  trocarAba('dados');
  setHTML('adm-edit-msg', '');
  setHTML('adm-senha-msg', '');
  document.getElementById('adm-modal-edicao').classList.add('show');
}

function fecharEdicao() {
  document.getElementById('adm-modal-edicao').classList.remove('show');
}

async function salvarEdicao() {
  const id      = document.getElementById('adm-edit-id').value;
  const nome    = document.getElementById('adm-edit-nome').value.trim();
  const unidade = document.getElementById('adm-edit-unidade').value.trim();
  const perfil  = document.getElementById('adm-edit-perfil').value;
  const ativo   = document.getElementById('adm-edit-ativo').checked;

  if (!nome) {
    setHTML('adm-edit-msg', '<span style="color:var(--vermelho)">Nome obrigatório.</span>');
    return;
  }

  const btn = document.getElementById('adm-edit-btn-salvar');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  try {
    await fetchREST_WRITE('PATCH', 'perfis?id=eq.' + id, { nome, unidade, perfil, ativo });
    fecharEdicao();
    await carregarUsuarios();
  } catch(e) {
    setHTML('adm-edit-msg', '<span style="color:var(--vermelho)">Erro: ' + e.message + '</span>');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
  }
}

// ── Convidar novo usuário ──────────────────────────────────────
// Fluxo: inserir em 'perfis' com ativo=false + enviar resetPassword
// (Supabase envia email de redefinição de senha que serve como convite)
async function convidar() {
  const email   = document.getElementById('adm-email')?.value?.trim();
  const nome    = document.getElementById('adm-nome')?.value?.trim();
  const unidade = document.getElementById('adm-unidade')?.value?.trim() || '';
  const perfil  = document.getElementById('adm-perfil')?.value;

  setHTML('adm-msg-convite', '');

  if (!email || !nome) {
    setHTML('adm-msg-convite',
      '<div class="adm-msg-erro">⚠️ Preencha nome e e-mail.</div>');
    return;
  }

  // Validar formato de email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setHTML('adm-msg-convite',
      '<div class="adm-msg-erro">⚠️ E-mail inválido.</div>');
    return;
  }

  // Verificar duplicata
  const existente = _adm_usuarios.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (existente) {
    setHTML('adm-msg-convite',
      '<div class="adm-msg-erro">❌ E-mail já cadastrado (' + existente.nome + ').</div>');
    return;
  }

  const btn = document.getElementById('adm-btn-convidar');
  if (btn) { btn.disabled = true; btn.textContent = 'Processando…'; }

  try {
    // 1. Inserir perfil com ativo=false (aguardando primeiro acesso)
    // pre_cadastros só recebe email, nome, perfil (schema básico)
    await fetchREST_WRITE('POST', 'pre_cadastros', { email, nome, perfil });

    // 2. Tentar enviar convite via Supabase Auth (resetPasswordForEmail)
    //    O usuário receberá um link para definir a senha
    if (STATE.sb) {
      await STATE.sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
          + window.location.pathname.replace(/[^/]*$/, '') + 'app.html',
      });
    }

    setHTML('adm-msg-convite',
      '<div class="adm-msg-ok">'
      + '✅ Pré-cadastro criado para <strong>' + email + '</strong>.<br>'
      + '<small>O usuário precisa ser criado no Supabase Auth e então fará login normalmente.</small>'
      + '</div>'
    );

    document.getElementById('adm-email').value   = '';
    document.getElementById('adm-nome').value    = '';
    document.getElementById('adm-unidade').value = '';
    await carregarUsuarios();

  } catch(e) {
    setHTML('adm-msg-convite',
      '<div class="adm-msg-erro">❌ Erro: ' + e.message + '</div>');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar convite'; }
  }
}

function setEl(id, txt)  { const el = document.getElementById(id); if (el) el.textContent = txt; }
function setHTML(id, html){ const el = document.getElementById(id); if (el) el.innerHTML  = html; }

// ── Abas do modal de edição ────────────────────────────
function trocarAba(aba) {
  ['dados', 'senha'].forEach(a => {
    const tab = document.getElementById('adm-tab-' + a);
    const btn = document.getElementById('adm-aba-' + a);
    if (tab) tab.style.display = a === aba ? 'flex' : 'none';
    if (btn) btn.classList.toggle('ativo', a === aba);
  });
}

// ── Redefinir senha via e-mail ─────────────────────────
async function resetarSenha() {
  const emailEl = document.getElementById('adm-senha-email');
  const email   = emailEl?.textContent?.trim();
  const msgEl   = document.getElementById('adm-senha-msg');
  const btn     = document.getElementById('adm-btn-reset-senha');

  if (!email || email === '—') {
    setHTML('adm-senha-msg',
      '<div class="adm-msg-erro">E-mail não encontrado.</div>');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  setHTML('adm-senha-msg', '');

  try {
    if (!STATE.sb) throw new Error('Supabase não inicializado.');

    // Sem redirectTo customizado — usar URL configurada no Supabase Auth Settings
    const { error } = await STATE.sb.auth.resetPasswordForEmail(email);

    if (error) throw error;

    setHTML('adm-senha-msg',
      '<div class="adm-msg-ok">✅ E-mail de redefinição enviado para <strong>'
      + email + '</strong>.</div>');
  } catch(e) {
    setHTML('adm-senha-msg',
      '<div class="adm-msg-erro">❌ Erro: ' + e.message + '</div>');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Enviar link de redefinição';
    }
  }
}
