import { beforeEach, afterEach, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';

// Modalità autonoma (Cloudflare): SELF_HOSTED=1, nessun header oai-* e codice di setup.
let sql: DatabaseSync;
let env: any;
const origin = 'https://gymtrack.test';
const owner = 'giacomotanduo004@gmail.com';
const setupCode = 'codice-di-setup-lungo-1234';
function request(path: string, body?: unknown, opts: { cookie?: string; method?: string; ip?: string; headers?: Record<string, string> } = {}) {
  return new Request(origin + '/api/' + path, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers: {
      'cf-connecting-ip': opts.ip || '203.0.113.7',
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const call = (path: string, body?: unknown, opts: any = {}) => api(request(path, body, opts), env);
async function activate() {
  const r = await call('auth/setup', { password: 'owner-password-123', setupCode });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + f, 'utf8'));
  env = {
    SELF_HOSTED: '1',
    SETUP_CODE: setupCode,
    DB: {
      prepare: (q: string) => {
        let args: any[] = [];
        const statement = {
          bind: (...a: any[]) => { args = a; return statement; },
          first: async () => sql.prepare(q).get(...args),
          all: async () => ({ results: sql.prepare(q).all(...args) }),
          run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...args).changes) } }),
        };
        return statement;
      },
      batch: async (a: any[]) => { sql.exec('BEGIN'); try { const r = []; for (const s of a) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
    },
  };
});
afterEach(() => sql.close());

it('works without any platform identity header and announces that a setup code is required', async () => {
  const me = await (await call('auth/me')).json();
  expect(me.user).toBeNull();
  expect(me.setup).toBe(true);
  expect(me.setupCodeRequired).toBe(true);
});
it('refuses the first activation without the right setup code, then allows it once', async () => {
  expect((await call('auth/setup', { password: 'owner-password-123' })).status).toBe(403);
  expect((await call('auth/setup', { password: 'owner-password-123', setupCode: 'sbagliato' })).status).toBe(403);
  const cookie = await activate();
  expect((await call('auth/setup', { password: 'another-password-123', setupCode })).status).toBe(409);
  const me = await (await call('auth/me', undefined, { cookie })).json();
  expect(me.user.role).toBe('SuperAdmin');
  expect(me.platformOwner).toBe(true);
  expect(me.setup).toBe(false);
  expect(me.setupCodeRequired).toBeUndefined();
});
it('refuses activation when SETUP_CODE is missing or too short', async () => {
  env.SETUP_CODE = 'corto';
  expect((await call('auth/setup', { password: 'owner-password-123', setupCode: 'corto' })).status).toBe(503);
  delete env.SETUP_CODE;
  expect((await call('auth/setup', { password: 'owner-password-123', setupCode: '' })).status).toBe(503);
});
it('ignores forged platform identity headers in standalone mode', async () => {
  const forged = { 'oai-authenticated-user-id': 'x', 'oai-authenticated-user-email': owner };
  expect((await call('auth/setup', { password: 'owner-password-123' }, { headers: forged })).status).toBe(403);
  const me = await (await call('auth/me', undefined, { headers: forged })).json();
  expect(me.platformOwner).toBe(false);
});
it('throttles wrong setup codes per client address', async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call('auth/setup', { password: 'owner-password-123', setupCode: 'sbagliato' })).status;
  expect(last).toBe(429);
  expect((await call('auth/setup', { password: 'owner-password-123', setupCode }, { ip: '198.51.100.9' })).status).toBe(200);
});
it('lets the owner create users who can sign in and cannot manage accounts', async () => {
  const cookie = await activate();
  expect((await call('users', { name: 'Cliente', email: 'cliente@example.com', username: 'cliente', role: 'User', password: 'a-secure-password-123' }, { cookie })).status).toBe(201);
  const login = await call('auth/login', { identifier: 'cliente', password: 'a-secure-password-123' });
  expect(login.status).toBe(200);
  const clientCookie = login.headers.get('set-cookie')!.split(';')[0];
  expect((await (await call('auth/me', undefined, { cookie: clientCookie })).json()).user.role).toBe('User');
  expect((await call('users', undefined, { cookie: clientCookie })).status).toBe(403);
});
it('throttles repeated wrong passwords per client address', async () => {
  await activate();
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call('auth/login', { identifier: owner, password: 'sbagliata-123' })).status;
  expect(last).toBe(429);
});
it('disables the server copy for the account-less space and keeps account copies available', async () => {
  const cookie = await activate();
  env.BUCKET = {};
  const device = await call('archive?scope=device', undefined, { cookie });
  expect(device.status).toBe(403);
  const account = await call('archive?scope=account', undefined, { cookie });
  expect(account.status).toBe(200);
});
it('shows the owner email only during activation or to the signed-in owner', async () => {
  expect((await (await call('auth/me')).json()).ownerEmail).toBe(owner);
  const cookie = await activate();
  const anonymous = await (await call('auth/me')).json();
  expect(anonymous.ownerEmail).toBeUndefined();
  expect(JSON.stringify(anonymous)).not.toContain(owner);
  expect((await (await call('auth/me', undefined, { cookie })).json()).ownerEmail).toBe(owner);
});
it('lets the owner reset a forgotten password only with the setup code and signs out old sessions', async () => {
  expect((await (await call('auth/me')).json()).ownerReset).toBeUndefined();
  expect((await call('auth/owner-reset', { password: 'new-owner-password-1', setupCode })).status).toBe(409);
  const oldCookie = await activate();
  expect((await (await call('auth/me')).json()).ownerReset).toBe('code');
  expect((await call('auth/owner-reset', { password: 'new-owner-password-1' })).status).toBe(403);
  expect((await call('auth/owner-reset', { password: 'new-owner-password-1', setupCode: 'sbagliato' })).status).toBe(403);
  expect((await call('auth/owner-reset', { password: 'corta', setupCode })).status).toBe(400);
  expect((await call('auth/login', { identifier: owner, password: 'owner-password-123' })).status).toBe(200);
  const reset = await call('auth/owner-reset', { password: 'new-owner-password-1', setupCode });
  expect(reset.status).toBe(200);
  const cookie = reset.headers.get('set-cookie')!.split(';')[0];
  expect((await (await call('auth/me', undefined, { cookie })).json()).user.role).toBe('SuperAdmin');
  expect((await (await call('auth/me', undefined, { cookie: oldCookie })).json()).user).toBeNull();
  expect((await call('auth/login', { identifier: owner, password: 'owner-password-123' })).status).toBe(401);
  expect((await call('auth/login', { identifier: owner, password: 'new-owner-password-1' })).status).toBe(200);
});
it('throttles wrong setup codes on the owner reset and refuses it without SETUP_CODE', async () => {
  await activate();
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await call('auth/owner-reset', { password: 'new-owner-password-1', setupCode: 'sbagliato' })).status;
  expect(last).toBe(429);
  delete env.SETUP_CODE;
  expect((await call('auth/owner-reset', { password: 'new-owner-password-1', setupCode: '' }, { ip: '198.51.100.9' })).status).toBe(503);
});
