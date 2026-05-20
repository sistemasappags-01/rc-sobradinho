// ═══════════════════════════════════════════════════════════
//  admin.js — Gestão de usuários
// ═══════════════════════════════════════════════════════════

async function renderAdmin() {
  if (STATE.perfil?.perfil !== 'admin') { navigate('dashboard'); return; }
  await carregarUsuarios();
}

async function carregarUsuarios() {
  try {
    const rows = await fetchREST('perfis?select=*&order=created_at.desc');
    renderListaUsuarios(Array.isArray(rows) ? rows : []);
  } catch(e) {
    setHTML('adm-lista', '<div class="empty">Erro ao carregar usuários.</div>');
  }
}

function renderListaUsuarios(usuarios) {
  const el = document.getElementById('adm-lista');
  if (!el) return;

  if (!usuarios.length) {
    el.innerHTML = '<div class="empty">Nenhum usuário cadastrado.</div>';
    return;
  }

  el.innerHTML = `<table class="tab-aten" style="width:100%">
    <thead><tr>
      <th>Nome</th><th>E-mail</th><th>Perfil</th>
      <th>Unidade</th><th>Status</th><th>Ações</th>
    </tr></thead>
    <tbody>
    ${usuarios.map(u => `
      <tr>
        <td style="font-weight:600">${u.nome||'—'}</td>
        <td class="td-data">${u.email||'—'}</td>
        <td><span class="nota-badge ${u.perfil==='admin'?'otimo':'bom'}">${u.perfil||'—'}</span></td>
        <td class="td-data">${u.unidade||CONFIG.UNIDADE_PADRAO}</td>
        <td>
          <span class="nota-badge ${u.ativo?'otimo':'ruim'}">
            ${u.ativo?'✓ Ativo':'✗ Inativo'}
          </span>
        </td>
        <td>
          <button class="btn-det" onclick="toggleAtivo('${u.id}', ${u.ativo})">
            ${u.ativo?'Desativar':'Ativar'}
          </button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

async function toggleAtivo(id, atualAtivo) {
  if (!confirm(`${atualAtivo?'Desativar':'Ativar'} este usuário?`)) return;
  try {
    await fetchREST_WRITE('PATCH', `perfis?id=eq.${id}`, { ativo: !atualAtivo });
    await carregarUsuarios();
  } catch(e) { alert('Erro ao atualizar usuário: ' + e.message); }
}

async function convidar() {
  const email = document.getElementById('adm-email')?.value?.trim();
  const nome  = document.getElementById('adm-nome')?.value?.trim();
  const perfil= document.getElementById('adm-perfil')?.value;

  if (!email || !nome) { alert('Preencha nome e e-mail.'); return; }

  const btn = document.getElementById('adm-btn-convidar');
  if (btn) { btn.disabled=true; btn.textContent='Enviando…'; }

  try {
    // Pré-cadastra na tabela para a Edge Function processar
    await fetchREST_WRITE('POST', 'pre_cadastros', { email, nome, perfil });

    // Chamar Edge Function de convite
    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/functions/v1/hyper-service`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${STATE.token}`,
        },
        body: JSON.stringify({ email, nome, perfil }),
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    setHTML('adm-msg-convite',
      `<div style="color:var(--verde);font-weight:600;padding:8px 0">
        ✅ Convite enviado para ${email}
      </div>`
    );
    document.getElementById('adm-email').value  = '';
    document.getElementById('adm-nome').value   = '';
    await carregarUsuarios();

  } catch(e) {
    setHTML('adm-msg-convite',
      `<div style="color:var(--vermelho);font-weight:600;padding:8px 0">
        ❌ Erro: ${e.message}
      </div>`
    );
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Enviar convite'; }
  }
}

function setEl(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;}
function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
