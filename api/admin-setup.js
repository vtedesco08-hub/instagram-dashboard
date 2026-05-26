const https = require('https');

function supabaseReq(method, path, body, useServiceRole = true) {
  return new Promise((resolve, reject) => {
    const base = new URL(process.env.SUPABASE_URL);
    const key = useServiceRole
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.SUPABASE_ANON_KEY;
    const bodyStr = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: base.hostname,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada' }));
    return;
  }

  if (req.method === 'GET') {
    const r = await supabaseReq('GET', '/rest/v1/user_profiles?role=eq.admin&select=id&limit=1');
    const hasAdmin = Array.isArray(r.data) && r.data.length > 0;
    res.writeHead(200);
    res.end(JSON.stringify({ hasAdmin }));
    return;
  }

  if (req.method === 'POST') {
    const check = await supabaseReq('GET', '/rest/v1/user_profiles?role=eq.admin&select=id&limit=1');
    if (Array.isArray(check.data) && check.data.length > 0) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Admin já existe. Faça login normalmente.' }));
      return;
    }

    const { name, email, password } = await readBody(req);

    const created = await supabaseReq('POST', '/auth/v1/admin/users', {
      email, password, email_confirm: true,
    });

    if (!created.data?.id) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: created.data?.msg || 'Erro ao criar usuário' }));
      return;
    }

    await supabaseReq('POST', '/rest/v1/user_profiles', {
      id: created.data.id,
      role: 'admin',
      name: name || email,
    });

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405); res.end();
};
