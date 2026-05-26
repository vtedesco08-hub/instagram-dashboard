const https = require('https');

function getHost() {
  return (process.env.SUPABASE_URL || '').replace(/^https?:\/\//, '').split('/')[0];
}

function supabaseReq(method, path, body, bearerToken, useServiceRole = false) {
  return new Promise((resolve, reject) => {
    const hostname = getHost();
    const apiKey = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
    const auth = useServiceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : bearerToken;
    const bodyStr = body ? JSON.stringify(body) : null;

    const opts = {
      hostname,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${auth}`,
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
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const host = getHost();
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!host || !svcKey) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Variaveis de ambiente faltando', hasUrl: !!process.env.SUPABASE_URL, hasSvcKey: !!svcKey }));
    return;
  }

  const userToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!userToken) { res.writeHead(401); res.end(JSON.stringify({ error: 'Nao autenticado' })); return; }

  try {
    const userRes = await supabaseReq('GET', '/auth/v1/user', null, userToken, false);
    if (!userRes.data?.id) { res.writeHead(401); res.end(JSON.stringify({ error: 'Token invalido' })); return; }

    const callerId = userRes.data.id;
    const profileRes = await supabaseReq('GET', `/rest/v1/user_profiles?id=eq.${callerId}&select=role`, null, null, true);
    if (!Array.isArray(profileRes.data) || profileRes.data[0]?.role !== 'admin') {
      res.writeHead(403); res.end(JSON.stringify({ error: 'Acesso negado' })); return;
    }
  } catch (err) {
    res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return;
  }

  if (req.method === 'GET') {
    try {
      const [usersRes, profilesRes, linksRes, accountsRes] = await Promise.all([
        supabaseReq('GET', '/auth/v1/admin/users?per_page=200', null, null, true),
        supabaseReq('GET', '/rest/v1/user_profiles?select=*', null, null, true),
        supabaseReq('GET', '/rest/v1/user_accounts?select=*', null, null, true),
        supabaseReq('GET', '/rest/v1/accounts?select=id,label,username', null, null, true),
      ]);

      const users = (usersRes.data?.users || []).map(u => ({
        id: u.id,
        email: u.email,
        role: profilesRes.data?.find(p => p.id === u.id)?.role || 'influencer',
        name: profilesRes.data?.find(p => p.id === u.id)?.name || '',
        accounts: linksRes.data?.filter(l => l.user_id === u.id).map(l => l.account_id) || [],
      }));

      res.writeHead(200);
      res.end(JSON.stringify({ users, accounts: accountsRes.data || [] }));
    } catch (err) {
      res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const body = await readBody(req);

  if (req.method === 'POST') {
    try {
      const { email, password, name, role, accountIds = [] } = body;
      const created = await supabaseReq('POST', '/auth/v1/admin/users', { email, password, email_confirm: true }, null, true);
      if (!created.data?.id) { res.writeHead(400); res.end(JSON.stringify({ error: created.data?.msg || 'Erro ao criar usuario' })); return; }

      const userId = created.data.id;
      const ops = [supabaseReq('POST', '/rest/v1/user_profiles', { id: userId, role: role || 'influencer', name: name || '' }, null, true)];
      if (accountIds.length) ops.push(supabaseReq('POST', '/rest/v1/user_accounts', accountIds.map(aid => ({ user_id: userId, account_id: aid })), null, true));
      await Promise.all(ops);

      res.writeHead(200); res.end(JSON.stringify({ ok: true, id: userId }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const { userId, accountIds = [] } = body;
      await supabaseReq('DELETE', `/rest/v1/user_accounts?user_id=eq.${userId}`, null, null, true);
      if (accountIds.length) await supabaseReq('POST', '/rest/v1/user_accounts', accountIds.map(aid => ({ user_id: userId, account_id: aid })), null, true);
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const { userId } = body;
      await Promise.all([
        supabaseReq('DELETE', `/rest/v1/user_accounts?user_id=eq.${userId}`, null, null, true),
        supabaseReq('DELETE', `/rest/v1/user_profiles?id=eq.${userId}`, null, null, true),
      ]);
      await supabaseReq('DELETE', `/auth/v1/admin/users/${userId}`, null, null, true);
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    return;
  }

  res.writeHead(405); res.end();
};
