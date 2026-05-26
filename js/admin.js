import { loadServerConfig } from './storage.js';
import { initSupabase, isCloudEnabled } from './supabase-client.js';
import { requireAdmin, signOut, getSession } from './auth.js';

const main = document.getElementById('adminMain');
const overlay = document.getElementById('modalOverlay');
const modal = document.getElementById('modal');

let _token = null;
let _data = { users: [], accounts: [] };
let _activeTab = 'usuarios';

async function api(method, body) {
  const res = await fetch('/api/admin-users', {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function loadData() {
  _data = await api('GET');
}

function openModal(html, onClose) {
  modal.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(onClose); };
}

function closeModal(cb) {
  overlay.style.display = 'none';
  if (cb) cb();
}

// ── Tab: Usuários ─────────────────────────────────────────────

function renderUsuarios() {
  const roleLabel = r => r === 'admin' ? '<span class="admin-badge admin">Admin</span>' : '<span class="admin-badge influ">Influenciadora</span>';

  const rows = _data.users.map(u => {
    const accNames = u.accounts.map(aid => {
      const acc = _data.accounts.find(a => a.id === aid);
      return acc ? `@${acc.username || acc.label}` : aid;
    }).join(', ') || '<span style="color:var(--text-muted)">Nenhuma</span>';

    return `<tr>
      <td><strong>${u.name || '—'}</strong><br><span style="font-size:12px;color:var(--text-secondary)">${u.email}</span></td>
      <td>${roleLabel(u.role)}</td>
      <td style="font-size:13px;">${accNames}</td>
      <td>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" onclick="window.__editUser('${u.id}')">Editar contas</button>
          <button class="btn btn-sm btn-danger" onclick="window.__deleteUser('${u.id}','${u.email}')">Remover</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  main.innerHTML = `
    <div class="admin-header">
      <h2 class="admin-title">Usuários</h2>
      <button class="btn btn-primary" id="btnNewUser">+ Novo usuário</button>
    </div>
    <div class="admin-card">
      <table class="admin-table">
        <thead><tr><th>Nome / Email</th><th>Perfil</th><th>Contas vinculadas</th><th>Ações</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhum usuário cadastrado</td></tr>'}</tbody>
      </table>
    </div>`;

  document.getElementById('btnNewUser').onclick = showCreateUserModal;
}

function showCreateUserModal() {
  const accOptions = _data.accounts.map(a =>
    `<label class="admin-check-label"><input type="checkbox" value="${a.id}" class="acc-check"> @${a.username || a.label}</label>`
  ).join('');

  openModal(`
    <h3 style="margin-bottom:20px;">Novo usuário</h3>
    <form id="createForm" style="display:flex;flex-direction:column;gap:14px;">
      <div class="auth-field"><label class="input-label">Nome</label><input id="cName" class="input-field" placeholder="Nome completo" required></div>
      <div class="auth-field"><label class="input-label">Email</label><input id="cEmail" type="email" class="input-field" placeholder="email@dominio.com" required></div>
      <div class="auth-field"><label class="input-label">Senha</label><input id="cPass" type="password" class="input-field" placeholder="mínimo 6 caracteres" required minlength="6"></div>
      <div class="auth-field">
        <label class="input-label">Perfil</label>
        <select id="cRole" class="input-field">
          <option value="influencer">Influenciadora (acesso às próprias métricas)</option>
          <option value="admin">Admin (acesso total)</option>
        </select>
      </div>
      <div class="auth-field">
        <label class="input-label">Contas Instagram vinculadas</label>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:140px;overflow-y:auto;padding:4px 0;">
          ${accOptions || '<span style="color:var(--text-muted);font-size:13px;">Nenhuma conta cadastrada ainda</span>'}
        </div>
      </div>
      <div id="cErr" class="status" style="display:none;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="btn" onclick="window.__closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="cBtn">Criar usuário</button>
      </div>
    </form>
  `);

  document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('cBtn');
    const errEl = document.getElementById('cErr');
    btn.textContent = 'Criando...'; btn.disabled = true;
    errEl.style.display = 'none';
    const accountIds = [...document.querySelectorAll('.acc-check:checked')].map(c => c.value);
    try {
      await api('POST', {
        name: document.getElementById('cName').value,
        email: document.getElementById('cEmail').value,
        password: document.getElementById('cPass').value,
        role: document.getElementById('cRole').value,
        accountIds,
      });
      closeModal(async () => { await loadData(); renderUsuarios(); });
    } catch (ex) {
      errEl.className = 'status visible error'; errEl.style.display = '';
      errEl.textContent = ex.message;
      btn.textContent = 'Criar usuário'; btn.disabled = false;
    }
  });
}

window.__editUser = (userId) => {
  const user = _data.users.find(u => u.id === userId);
  if (!user) return;

  const accOptions = _data.accounts.map(a =>
    `<label class="admin-check-label"><input type="checkbox" value="${a.id}" class="acc-check" ${user.accounts.includes(a.id) ? 'checked' : ''}> @${a.username || a.label}</label>`
  ).join('');

  openModal(`
    <h3 style="margin-bottom:8px;">Editar contas — ${user.name || user.email}</h3>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;">Selecione quais contas do Instagram esta usuária pode visualizar</p>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto;margin-bottom:20px;">
      ${accOptions || '<span style="color:var(--text-muted);">Nenhuma conta disponível</span>'}
    </div>
    <div id="eErr" class="status" style="display:none;"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn" onclick="window.__closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="eBtn">Salvar</button>
    </div>
  `);

  document.getElementById('eBtn').onclick = async () => {
    const btn = document.getElementById('eBtn');
    const errEl = document.getElementById('eErr');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    errEl.style.display = 'none';
    const accountIds = [...document.querySelectorAll('.acc-check:checked')].map(c => c.value);
    try {
      await api('PUT', { userId, accountIds });
      closeModal(async () => { await loadData(); renderUsuarios(); });
    } catch (ex) {
      errEl.className = 'status visible error'; errEl.style.display = '';
      errEl.textContent = ex.message;
      btn.textContent = 'Salvar'; btn.disabled = false;
    }
  };
};

window.__deleteUser = (userId, email) => {
  if (!confirm(`Remover o usuário ${email}? Esta ação não pode ser desfeita.`)) return;
  api('DELETE', { userId })
    .then(async () => { await loadData(); renderUsuarios(); })
    .catch(ex => alert('Erro: ' + ex.message));
};

window.__closeModal = () => closeModal();

// ── Tab: Contas ───────────────────────────────────────────────

function renderContas() {
  const rows = _data.accounts.map(a => {
    const linkedUsers = _data.users.filter(u => u.accounts.includes(a.id));
    const names = linkedUsers.map(u => u.name || u.email).join(', ') || '<span style="color:var(--text-muted)">Ninguém</span>';
    return `<tr>
      <td><strong>@${a.username || a.label || a.id}</strong></td>
      <td style="font-size:13px;">${names}</td>
    </tr>`;
  }).join('');

  main.innerHTML = `
    <div class="admin-header">
      <h2 class="admin-title">Contas Instagram</h2>
      <a href="/index.html?add=1" class="btn btn-primary">+ Adicionar conta</a>
    </div>
    <div class="admin-card">
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">Para vincular uma conta a uma influenciadora, vá em <strong>Usuários → Editar contas</strong>.</p>
      <table class="admin-table">
        <thead><tr><th>Conta</th><th>Vinculada a</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);padding:32px;">Nenhuma conta cadastrada</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────

async function init() {
  await loadServerConfig();
  await initSupabase();

  if (!isCloudEnabled()) { window.location.href = '/dashboard.html'; return; }

  const auth = await requireAdmin();
  if (!auth) return;

  _token = auth.session.access_token;

  document.getElementById('btnLogout').onclick = signOut;

  document.getElementById('tabUsuarios').onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    _activeTab = 'usuarios';
    renderUsuarios();
  };

  document.getElementById('tabContas').onclick = (e) => {
    e.preventDefault();
    document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
    e.target.classList.add('active');
    _activeTab = 'contas';
    renderContas();
  };

  await loadData();
  renderUsuarios();
}

init();
