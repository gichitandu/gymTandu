import { beforeEach, afterEach, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';

// Link di invito all'app sul Worker in modalità autonoma: dati sintetici, database in memoria.
let sql: DatabaseSync;
let env: any;
const origin = 'https://gymtrack.test';
const setupCode = 'codice-di-setup-lungo-1234';
function request(path: string, body?: unknown, opts: { cookie?: string; ip?: string } = {}) {
  return new Request(origin + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'cf-connecting-ip': opts.ip || '203.0.113.7', ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const call = (path: string, body?: unknown, opts: any = {}) => api(request(path, body, opts), env);
const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0];
const friend = (i: number, invite: string) => ({ name: 'Amico ' + i, email: `amico${i}@example.test`, username: 'amico' + i, password: 'password-amico', appInvite: invite });
let owner: string;
async function createInvite(cookie = owner) {
  const r = await call('app-invites', {}, { cookie });
  expect(r.status).toBe(201);
  return (await r.json() as any).invite;
}
beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + f, 'utf8'));
  env = {
    SELF_HOSTED: '1', SETUP_CODE: setupCode,
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
  owner = cookieOf(await call('auth/setup', { password: 'owner-password-123', setupCode }));
});
afterEach(() => sql.close());

it('solo il Super Admin crea, vede e disattiva il link di invito', async () => {
  expect((await call('app-invites', {})).status).toBe(401);
  expect((await call('app-invites')).status).toBe(403);
  const created = await call('users', { email: 'cliente@example.test', name: 'Cliente', username: 'cliente', role: 'User', password: 'password-cliente' }, { cookie: owner });
  expect(created.status).toBe(201);
  const client = cookieOf(await call('auth/login', { identifier: 'cliente', password: 'password-cliente' }, { ip: '198.51.100.9' }));
  expect((await call('app-invites', {}, { cookie: client })).status).toBe(403);
  expect((await call('app-invites', undefined, { cookie: client })).status).toBe(403);
  expect((await call('app-invites/revoke', {}, { cookie: client })).status).toBe(403);

  const invite = await createInvite();
  expect(invite.token).toMatch(/^[0-9a-f]{48}$/);
  expect(invite).toMatchObject({ registrations: 0, maxRegistrations: 5 });
  expect(invite.expiresAt - invite.createdAt).toBe(7 * 24 * 60 * 60 * 1000);
  const listed = await (await call('app-invites', undefined, { cookie: owner })).json() as any;
  expect(listed.invites.map((i: any) => i.id)).toEqual([invite.id]);

  // Un nuovo link disattiva il precedente: ne resta uno solo valido.
  const next = await createInvite();
  expect((await (await call('app-invite?token=' + invite.token)).json() as any).valid).toBe(false);
  expect((await (await call('app-invites', undefined, { cookie: owner })).json() as any).invites.map((i: any) => i.id)).toEqual([next.id]);

  expect((await call('app-invites/revoke', {}, { cookie: owner })).status).toBe(200);
  expect((await (await call('app-invite?token=' + next.token)).json() as any).valid).toBe(false);
  expect((await (await call('app-invites', undefined, { cookie: owner })).json() as any).invites).toEqual([]);
});

it('chi apre il link vede chi lo invita e si crea un account Cliente', async () => {
  const invite = await createInvite();
  expect(await (await call('app-invite?token=' + 'f'.repeat(48))).json()).toEqual({ valid: false });
  expect(await (await call('app-invite?token=non-valido')).json()).toEqual({ valid: false });
  expect(await (await call('app-invite?token=' + invite.token)).json()).toEqual({ valid: true, inviterName: 'Giacomo Tanduo', registrationOpen: true });

  const fields = friend(1, invite.token);
  expect((await call('auth/register', { ...fields, appInvite: 'f'.repeat(48) })).status).toBe(403);
  expect((await call('auth/register', { ...fields, password: 'corta' })).status).toBe(400);
  const created = await call('auth/register', { ...fields, role: 'SuperAdmin' });
  expect(created.status).toBe(200);
  expect((await created.json() as any).user).toMatchObject({ name: 'Amico 1', username: 'amico1', role: 'User', owner: false });
  const cookie = cookieOf(created);
  expect((await call('users', undefined, { cookie })).status).toBe(403);
  expect((await call('auth/register', fields)).status).toBe(409);
  // L'account creato accede poi normalmente con le sue credenziali.
  expect((await call('auth/login', { identifier: 'amico1', password: 'password-amico' }, { ip: '198.51.100.40' })).status).toBe(200);
  expect((await (await call('app-invites', undefined, { cookie: owner })).json() as any).invites[0].registrations).toBe(1);
});

it('un link registra al massimo 5 account e non vale più dopo la scadenza', async () => {
  const invite = await createInvite();
  const make = (i: number) => call('auth/register', friend(i, invite.token), { ip: '198.51.100.' + (20 + i) });
  for (let i = 0; i < 5; i++) expect((await make(i)).status).toBe(200);
  expect((await make(99)).status).toBe(403);
  expect((await (await call('app-invite?token=' + invite.token)).json() as any).registrationOpen).toBe(false);

  const later = await createInvite();
  sql.prepare('UPDATE app_invites SET expires_at=? WHERE id=?').run(Date.now() - 1, later.id);
  expect((await call('auth/register', friend(50, later.token), { ip: '198.51.100.90' })).status).toBe(403);
  expect((await (await call('app-invite?token=' + later.token)).json() as any).valid).toBe(false);
  expect(Number((sql.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n)).toBe(1 + 5);
});

it('un link disattivato non registra più nessuno', async () => {
  const invite = await createInvite();
  await call('app-invites/revoke', {}, { cookie: owner });
  expect((await call('auth/register', friend(7, invite.token))).status).toBe(403);
});
