// Faux serveur Supabase (API admin Auth + REST) pour tester scripts/admin.mjs.
// Réservé aux tests : il n'applique aucune sécurité réelle, mais il reproduit
// la règle d'authentification de Supabase sur les clés.
import { createServer } from 'node:http';

export function startFakeSupabase({ key = 'sb_secret_TEST', legacy = false } = {}) {
  const state = { users: [], admins: [], calls: [] };
  const json = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = await new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => resolve(raw ? JSON.parse(raw) : null));
    });
    const apikey = req.headers.apikey;
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    state.calls.push({ method: req.method, path: url.pathname, apikey, bearer, body });

    // Règle de Supabase : une clé récente (sb_…) n'est pas un jeton JWT.
    // Présentée dans Authorization, la plateforme la refuse.
    if (apikey !== key) return json(res, 401, { message: 'Invalid API key' });
    if (bearer && bearer.startsWith('sb_')) return json(res, 401, { message: 'Invalid JWT' });
    if (legacy && bearer !== key) return json(res, 401, { message: 'Invalid JWT' });

    if (url.pathname === '/auth/v1/admin/users' && req.method === 'POST') {
      if (String(body.password ?? '').length < 6) return json(res, 422, { message: 'Password too short' });
      const user = { id: `u-${state.users.length + 1}`, email: body.email, password: body.password };
      state.users.push(user);
      return json(res, 200, user);
    }
    if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') {
      return json(res, 200, { users: state.users });
    }
    const match = /^\/auth\/v1\/admin\/users\/(.+)$/.exec(url.pathname);
    if (match && req.method === 'PUT') {
      const user = state.users.find((u) => u.id === match[1]);
      if (!user) return json(res, 404, { message: 'User not found' });
      Object.assign(user, body);
      return json(res, 200, user);
    }
    if (url.pathname === '/rest/v1/admins') {
      if (req.method === 'POST') {
        state.admins.push(body);
        return json(res, 201, [body]);
      }
      return json(res, 200, state.admins);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'content-range': '0-0/0' });
      return res.end('[]');
    }
    json(res, 404, { message: 'not found' });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
