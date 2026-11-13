import { beforeEach, afterEach, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
import { GROUP_MAX_REGISTRATIONS } from '../worker/group.js';

// Allenamento in gruppo sul Worker in modalità autonoma: dati sintetici, database in memoria.
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
const exercise = (id: string, name: string, extra: any = {}) => ({ exerciseId: id, name, loadMode: 'external', order: 0, muscleGroupId: 'petto', muscleGroupName: 'Petto', equipment: 'Bilanciere', sets: 3, warmupSets: 0, repsMin: 8, repsMax: 10, rest: 90, done: 0, total: 3, ...extra });
const workout = [exercise('panca', 'Panca piana'), exercise('squat', 'Squat')];
let host: string;
async function addUser(name: string) {
  const r = await call('users', { email: name + '@example.test', name, username: name, role: 'User', password: 'password-' + name }, { cookie: host });
  expect(r.status).toBe(201);
  return cookieOf(await call('auth/login', { identifier: name, password: 'password-' + name }, { ip: '198.51.100.' + (name.length + 1) }));
}
async function createGroup(cookie = host) {
  const r = await call('group/create', { dayName: 'Petto e gambe', exercises: workout }, { cookie });
  expect(r.status).toBe(201);
  return (await r.json() as any).session;
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
  host = cookieOf(await call('auth/setup', { password: 'owner-password-123', setupCode }));
});
afterEach(() => sql.close());

it('richiede un account e crea un gruppo con codice di 6 cifre e link di invito', async () => {
  expect((await call('group')).status).toBe(401);
  expect((await call('group/create', { dayName: 'X', exercises: workout })).status).toBe(401);
  expect((await call('group/create', { dayName: 'Petto', exercises: [] }, { cookie: host })).status).toBe(400);
  const session = await createGroup();
  expect(session.code).toMatch(/^\d{6}$/);
  expect(session.inviteToken).toMatch(/^[0-9a-f]{48}$/);
  expect(session.members).toHaveLength(1);
  expect(session.members[0]).toMatchObject({ host: true, me: true, mode: 'host' });
  expect(session.members[0].exercises.map((e: any) => e.name)).toEqual(['Panca piana', 'Squat']);
  expect((await (await call('group', undefined, { cookie: host })).json() as any).session.id).toBe(session.id);
});

it('fa entrare un amico con il codice, senza mostrargli codice e link, e sincronizza l’avanzamento', async () => {
  const session = await createGroup(), friend = await addUser('marco');
  expect((await call('group/join', { code: 'abc' }, { cookie: friend })).status).toBe(400);
  const wrong = session.code === '000000' ? '000001' : '000000';
  expect((await call('group/join', { code: wrong }, { cookie: friend })).status).toBe(404);
  const joined = (await (await call('group/join', { code: session.code }, { cookie: friend })).json() as any).session;
  expect(joined.code).toBeUndefined();
  expect(joined.inviteToken).toBeUndefined();
  expect(joined.members.find((m: any) => m.me)).toMatchObject({ name: 'marco', mode: '', host: false });
  expect(joined.members.find((m: any) => m.host).exercises).toHaveLength(2);
  expect((await call('group/update', { id: session.id, mode: 'host' }, { cookie: friend })).status).toBe(400);
  const mine = [exercise('panca', 'Panca piana', { done: 2, last: { weight: 80, reps: 8 } })];
  const updated = await call('group/update', { id: session.id, mode: 'match', exercises: mine, current: 'panca' }, { cookie: friend });
  expect(updated.status).toBe(200);
  const seen = (await (await call('group?id=' + session.id, undefined, { cookie: host })).json() as any).session;
  const marco = seen.members.find((m: any) => m.name === 'marco');
  expect(marco).toMatchObject({ mode: 'match', current: 'panca', finished: false });
  expect(marco.exercises[0]).toMatchObject({ done: 2, total: 3, last: { weight: 80, reps: 8 } });
  // Chi ha creato il gruppo non può cambiare modalità: resta il riferimento.
  expect((await call('group/update', { id: session.id, mode: 'same' }, { cookie: host })).status).toBe(400);
});

it('scarta campi non previsti e valori fuori scala negli esercizi condivisi', async () => {
  const session = await createGroup();
  const dirty = [{ ...exercise('panca', '  Panca piana  ', { done: 50, total: 3, sets: 500, rest: -4 }), script: '<b>', last: { weight: -1, reps: 8 } }];
  const state = (await (await call('group/update', { id: session.id, exercises: dirty }, { cookie: host })).json() as any).session;
  const saved = state.members[0].exercises[0];
  expect(saved).toMatchObject({ name: 'Panca piana', done: 3, total: 3, sets: 3, rest: 90 });
  expect(saved.script).toBeUndefined();
  expect(saved.last).toBeUndefined();
  expect((await call('group/update', { id: session.id, exercises: [{ exerciseId: 'a b', name: 'x', loadMode: 'external' }] }, { cookie: host })).status).toBe(400);
  expect((await call('group/update', { id: session.id, exercises: Array.from({ length: 41 }, (_, i) => exercise('e' + i, 'E' + i)) }, { cookie: host })).status).toBe(400);
});

it('limita i tentativi sul codice di 6 cifre per account', async () => {
  const session = await createGroup(), friend = await addUser('luca');
  const wrong = session.code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 10; i++) expect((await call('group/join', { code: wrong }, { cookie: friend })).status).toBe(404);
  expect((await call('group/join', { code: session.code }, { cookie: friend })).status).toBe(429);
});

it('chiude il gruppo per tutti quando esce chi lo ha creato, mentre un amico esce da solo', async () => {
  const session = await createGroup(), friend = await addUser('anna'), other = await addUser('sara');
  await call('group/join', { code: session.code }, { cookie: friend });
  await call('group/join', { token: session.inviteToken }, { cookie: other });
  expect((await call('group/leave', { id: session.id }, { cookie: other })).status).toBe(200);
  expect((await (await call('group', undefined, { cookie: other })).json() as any).session).toBeNull();
  expect((await (await call('group?id=' + session.id, undefined, { cookie: friend })).json() as any).session.members).toHaveLength(2);
  await call('group/leave', { id: session.id }, { cookie: host });
  const after = (await (await call('group?id=' + session.id, undefined, { cookie: friend })).json() as any).session;
  expect(after.ended).toBe(true);
  expect((await (await call('group', undefined, { cookie: friend })).json() as any).session).toBeNull();
  expect((await call('group/join', { code: session.code }, { cookie: other })).status).toBe(404);
  expect((await (await call('group/invite?token=' + session.inviteToken)).json() as any).valid).toBe(false);
});

it('un nuovo gruppo dello stesso account chiude il precedente', async () => {
  const first = await createGroup(), second = await createGroup();
  expect(second.id).not.toBe(first.id);
  expect((await call('group/join', { code: first.code }, { cookie: await addUser('pino') })).status).toBe(first.code === second.code ? 200 : 404);
});

it('registra un nuovo Cliente solo con un invito valido e lo fa entrare nel gruppo', async () => {
  const fields = { name: 'Nuovo Amico', email: 'nuovo@example.test', username: 'nuovo', password: 'password-nuovo' };
  expect((await call('auth/register', fields)).status).toBe(403);
  expect((await call('auth/register', { ...fields, invite: 'f'.repeat(48) })).status).toBe(403);
  const session = await createGroup();
  const preview = await (await call('group/invite?token=' + session.inviteToken)).json() as any;
  expect(preview).toMatchObject({ valid: true, dayName: 'Petto e gambe', registrationOpen: true });
  expect((await call('auth/register', { ...fields, invite: session.inviteToken, password: 'corta' })).status).toBe(400);
  expect((await call('auth/register', { ...fields, invite: session.inviteToken, email: 'giacomotanduo004@gmail.com' })).status).toBe(409);
  const created = await call('auth/register', { ...fields, invite: session.inviteToken, role: 'SuperAdmin' });
  expect(created.status).toBe(200);
  const body = await created.json() as any;
  expect(body.user).toMatchObject({ name: 'Nuovo Amico', username: 'nuovo', role: 'User', owner: false });
  const cookie = cookieOf(created);
  expect((await call('users', undefined, { cookie })).status).toBe(403);
  expect((await call('auth/register', { ...fields, invite: session.inviteToken })).status).toBe(409);
  const joined = (await (await call('group/join', { token: session.inviteToken }, { cookie })).json() as any).session;
  expect(joined.members.map((m: any) => m.name)).toEqual(['Giacomo Tanduo', 'Nuovo Amico']);
});

it('un invito registra al massimo pochi account e smette di valere a gruppo chiuso', async () => {
  const session = await createGroup();
  const make = (i: number) => call('auth/register', { name: 'Amico ' + i, email: `amico${i}@example.test`, username: 'amico' + i, password: 'password-amico', invite: session.inviteToken }, { ip: '198.51.100.' + (20 + i) });
  for (let i = 0; i < GROUP_MAX_REGISTRATIONS; i++) expect((await make(i)).status).toBe(200);
  expect((await make(99)).status).toBe(403);
  expect((await (await call('group/invite?token=' + session.inviteToken)).json() as any).registrationOpen).toBe(false);
  const next = await createGroup();
  await call('group/leave', { id: next.id }, { cookie: host });
  expect((await make(100)).status).toBe(403);
  expect(Number((sql.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n)).toBe(1 + GROUP_MAX_REGISTRATIONS);
});
