import { loadServerConfig } from './storage.js';
import { initSupabase, isCloudEnabled } from './supabase-client.js';
import { signIn, getSession } from './auth.js';

const app = document.getElementById('app');

function renderCard(inner) {
  app.innerHTML = `
    <div class="wizard-container" style="max-width:420px;width:100%;">
      <div class="wizard-header" style="text-align:center;margin-bottom:32px;">
        <h1 class="wizard-title">Instagram Dashboard</h1>
      </div>
      ${inner}
    </div>`;
}

function showLogin() {
  renderCard(`
    <form id="form" style="display:flex;flex-direction:column;gap:16px;">
      <div class="auth-field">
        <label class="input-label">Email</label>
        <input type="email" id="email" class="input-field" placeholder="seu@email.com" required>
      </div>
      <div class="auth-field">
        <label class="input-label">Senha</label>
        <input type="password" id="pass" class="input-field" placeholder="••••••••" required>
      </div>
      <div id="err" class="status" style="display:none;"></div>
      <button type="submit" class="btn btn-primary btn-lg" id="btn">Entrar</button>
    </form>
  `);

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn');
    const err = document.getElementById('err');
    btn.textContent = 'Entrando...'; btn.disabled = true;
    err.style.display = 'none';
    try {
      await signIn(document.getElementById('email').value, document.getElementById('pass').value);
      window.location.href = '/dashboard.html';
    } catch (ex) {
      err.className = 'status visible error';
      err.style.display = '';
      err.textContent = ex.message;
      btn.textContent = 'Entrar'; btn.disabled = false;
    }
  });
}

function showSetup() {
  renderCard(`
    <p class="wizard-subtitle" style="text-align:center;margin-bottom:24px;">Primeiro acesso — crie a conta de administrador</p>
    <form id="form" style="display:flex;flex-direction:column;gap:16px;">
      <div class="auth-field">
        <label class="input-label">Nome</label>
        <input type="text" id="name" class="input-field" placeholder="Seu nome" required>
      </div>
      <div class="auth-field">
        <label class="input-label">Email</label>
        <input type="email" id="email" class="input-field" placeholder="seu@email.com" required>
      </div>
      <div class="auth-field">
        <label class="input-label">Senha</label>
        <input type="password" id="pass" class="input-field" placeholder="mínimo 6 caracteres" required minlength="6">
      </div>
      <div id="err" class="status" style="display:none;"></div>
      <button type="submit" class="btn btn-primary btn-lg" id="btn">Criar conta admin</button>
    </form>
  `);

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn');
    const err = document.getElementById('err');
    btn.textContent = 'Criando...'; btn.disabled = true;
    err.style.display = 'none';
    try {
      const res = await fetch('/api/admin-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value,
          email: document.getElementById('email').value,
          password: document.getElementById('pass').value,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await signIn(document.getElementById('email').value, document.getElementById('pass').value);
      window.location.href = '/dashboard.html';
    } catch (ex) {
      err.className = 'status visible error';
      err.style.display = '';
      err.textContent = ex.message;
      btn.textContent = 'Criar conta admin'; btn.disabled = false;
    }
  });
}

async function init() {
  renderCard('<p style="text-align:center;color:var(--text-secondary)">Carregando...</p>');
  await loadServerConfig();
  await initSupabase();

  if (!isCloudEnabled()) {
    renderCard(`<p style="text-align:center;color:var(--negative);line-height:1.6">
      Supabase não conectou.<br>
      <span style="font-size:13px;color:var(--text-secondary)">Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão configuradas na Vercel.</span>
    </p>`);
    return;
  }

  const session = await getSession();
  if (session) { window.location.href = '/dashboard.html'; return; }

  try {
    const r = await fetch('/api/admin-setup');
    const json = await r.json();
    json.hasAdmin ? showLogin() : showSetup();
  } catch {
    showSetup();
  }
}

init();
