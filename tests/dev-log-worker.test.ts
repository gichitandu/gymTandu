import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
import { devLogAgentApi, devLogApi, devLogNormalize, devLogRecord, devLogScrub } from '../worker/dev-log.js';

// Dati sintetici: SQLite in memoria al posto di D1, nessun dato reale.
const OLD = 'a'.repeat(64), NEW = 'b'.repeat(64), TOKEN = 'token-di-prova-registro-0123456789';
const admin = { id: 'owner', role: 'SuperAdmin' }, client = { id: 'client', role: 'User' };
let sql: DatabaseSync, env: any, failQuery: RegExp | null;
const statement = (query: string) => {
  let args: any[] = [];
  const guard = () => { if (failQuery?.test(query)) throw Error('D1 interrotto per prova'); };
  const s = {
    bind(...a: any[]) { args = a; return s; },
    first: async () => { guard(); return sql.prepare(query).get(...args) ?? null; },
    all: async () => { guard(); return { results: sql.prepare(query).all(...args) }; },
    run: async () => { guard(); const r = sql.prepare(query).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  };
  return s;
};
const d1 = () => ({ prepare: statement, batch: async (list: any[]) => Promise.all(list.map(s => s.run())) });
const json = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Request('https://gymtrack.test' + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://gymtrack.test', ...headers }, body: JSON.stringify(body) });
const agent = (path: string, body?: unknown, token = TOKEN) => devLogAgentApi(json('/api/dev-log/agent/' + path, body, { Authorization: 'Bearer ' + token }), env, { build: NEW });
const report = (build: string, reports: any[] = [], routes: Record<string, number> = {}, appStarts = 1) => devLogApi(json('/api/dev-log/report', { usage: { build, appStarts, routes }, reports }, { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), env, admin);
const row = (id: number) => sql.prepare('SELECT * FROM dev_items WHERE id=?').get(id) as any;

beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  failQuery = null;
  env = { DB: d1(), DEVLOG_TOKEN: TOKEN, SELF_HOSTED: '1' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { sql.close(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('ripulisce email, token, id e immagini e dà lo stesso fingerprint a messaggi che cambiano solo nei numeri', () => {
  const text = devLogScrub('Errore per mario.rossi@example.com token=abc123 /api/x?id=42 ' + 'f'.repeat(40) + ' data:image/png;base64,AAAA', 500);
  expect(text).not.toContain('mario.rossi'); expect(text).not.toContain('abc123'); expect(text).not.toContain('=42'); expect(text).not.toContain('ffff'); expect(text).not.toContain('AAAA');
  expect(devLogNormalize('Serie 12 non trovata')).toBe(devLogNormalize('Serie 7 non trovata'));
});

it('accetta gli errori automatici solo dal Super Admin', async () => {
  expect((await devLogApi(json('/api/dev-log/report', { usage: { build: OLD, appStarts: 1 }, reports: [] }), env, client)).status).toBe(403);
  expect((await devLogApi(json('/api/dev-log/items'), env, null)).status).toBe(401);
  expect((await devLogApi(json('/api/dev-log/items'), env, client)).status).toBe(403);
  expect((await report('non-valida')).status).toBe(400);
});

it('raggruppa lo stesso errore in una voce con contatore e conserva al massimo 20 casi', async () => {
  for (let i = 0; i < 25; i++) await report(OLD, [{ source: 'client', message: `TypeError: riga ${i} senza peso`, stack: 'at saveSet', route: '/sessione' }]);
  const items = sql.prepare('SELECT * FROM dev_items').all() as any[];
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ kind: 'error', source: 'auto', status: 'open', occurrences: 25, route: '/sessione', priority: 'medium' });
  expect((sql.prepare('SELECT COUNT(*) AS n FROM dev_occurrences').get() as any).n).toBe(20);
  const device = (sql.prepare('SELECT device FROM dev_occurrences LIMIT 1').get() as any).device;
  expect(device).toBe('iPhone');
});

it('Claude non chiude una correzione finché la nuova build non è stata usata, poi la chiude con la prova', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  await report(OLD, [{ source: 'client', message: 'Salvataggio fallito', route: '/sessione' }]);
  const id = (sql.prepare('SELECT id FROM dev_items').get() as any).id;
  vi.setSystemTime(2_000);
  expect((await agent('items/GT-' + id, { action: 'start' })).status).toBe(200);
  expect((await agent('items/' + id, { action: 'fixed', summary: 'Controllo della serie vuota', commit: 'abc1234', tests: 'session.test.ts' })).status).toBe(200);
  expect(row(id).status).toBe('fixed');
  // Prima della pubblicazione: nessuna build nuova.
  let response = await agent('items/' + id, { action: 'resolve' });
  expect(response.status).toBe(409); expect((await response.json()).error).toContain('Nessuna build');
  // Build nuova aperta ma pagina non ancora visitata abbastanza.
  vi.setSystemTime(3_000); await report(NEW, [], { '/sessione': 1 }, 2);
  response = await agent('items/' + id, { action: 'resolve' });
  expect(response.status).toBe(409); expect((await response.json()).error).toContain('/sessione');
  await report(NEW, [], { '/sessione': 1 }, 0);
  const list = await (await agent('items')).json();
  expect(list.items[0].verification).toMatchObject({ ready: true, appStarts: 2, routeVisits: 2 });
  expect(list.items[0].events.map((e: any) => e.kind)).toEqual(['created', 'started', 'fixed']);
  expect((await agent('items/' + id, { action: 'resolve' })).status).toBe(200);
  expect(row(id).status).toBe('resolved');
});

it('un caso dalla vecchia build non riapre la correzione, uno dalla build nuova sì, come regressione', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  await report(OLD, [{ source: 'client', message: 'Errore grafico', route: '/progressi' }]);
  const id = (sql.prepare('SELECT id FROM dev_items').get() as any).id;
  vi.setSystemTime(2_000); await agent('items/' + id, { action: 'fixed', summary: 'Asse corretto' });
  vi.setSystemTime(3_000); await report(OLD, [{ source: 'client', message: 'Errore grafico', route: '/progressi' }]);
  expect(row(id)).toMatchObject({ status: 'fixed', occurrences: 2, regression: 0 });
  vi.setSystemTime(4_000); await report(NEW, [{ source: 'client', message: 'Errore grafico', route: '/progressi' }]);
  expect(row(id)).toMatchObject({ status: 'open', occurrences: 3, regression: 1 });
  const events = sql.prepare('SELECT kind,note FROM dev_item_events WHERE item_id=? ORDER BY id').all(id) as any[];
  expect(events.at(-1).kind).toBe('reopened'); expect(events.at(-1).note).toContain('non è bastata');
});

it('una voce scartata continua a contare i casi senza riaprirsi', async () => {
  await report(OLD, [{ source: 'feedback', message: 'Inserisci un nome', route: '/piani' }]);
  const id = (sql.prepare('SELECT id FROM dev_items').get() as any).id;
  expect(row(id).priority).toBe('low');
  expect((await devLogApi(json('/api/dev-log/items/' + id, { action: 'dismiss' }), env, admin)).status).toBe(200);
  await report(NEW, [{ source: 'feedback', message: 'Inserisci un nome', route: '/piani' }]);
  expect(row(id)).toMatchObject({ status: 'dismissed', occurrences: 2 });
});

it('Claude non può scartare voci e l’accesso richiede il token giusto', async () => {
  const created = await (await devLogApi(json('/api/dev-log/items', { kind: 'improvement', title: 'Grafico per gruppo', route: '/progressi' }), env, admin)).json();
  expect(created.item).toMatchObject({ code: expect.stringMatching(/^GT-\d+$/), source: 'manual', status: 'open' });
  expect((await agent('items/' + created.item.id, { action: 'dismiss' })).status).toBe(400);
  expect((await agent('items', undefined, 'sbagliato')).status).toBe(403);
  expect((await devLogAgentApi(json('/api/dev-log/agent/items', undefined, { Authorization: 'Bearer ' + TOKEN }), { DB: d1() }, {})).status).toBe(503);
  const added = await (await agent('items', { kind: 'bug', title: 'Trovato durante il lavoro' })).json();
  expect(added.item.source).toBe('claude');
});

it('passa dal router del Worker senza cookie per Claude e registra gli errori inattesi del Super Admin', async () => {
  const token = 'sessione-prova', at = Date.now();
  sql.prepare("INSERT INTO users(id,email,name,role,active,salt,password_hash,created_at) VALUES('owner','owner@example.test','Prova','SuperAdmin',1,'s','h',?)").run(at);
  sql.prepare("INSERT INTO sessions(token_hash,user_id,visitor_id,expires_at) VALUES(?,?,?,?)").run(createHash('sha256').update(token).digest('hex'), 'owner', 'standalone', at + 60_000);
  const agentResponse = await api(new Request('https://gymtrack.test/api/dev-log/agent/items', { headers: { Authorization: 'Bearer ' + TOKEN } }), env, {});
  expect(agentResponse.status).toBe(200);
  failQuery = /FROM catalog_exercises/;
  const response = await api(new Request('https://gymtrack.test/api/catalog', { headers: { Cookie: '__Host-gymtrack=' + token } }), env, {});
  expect(response.status).toBe(503);
  failQuery = null;
  const item = sql.prepare('SELECT * FROM dev_items').get() as any;
  expect(item).toMatchObject({ source: 'auto', route: '/api/catalog', priority: 'high', occurrences: 1 });
  expect(item.details).toContain('server');
});

it('ignora le fonti sconosciute e i casi senza build', async () => {
  expect(await devLogRecord(env.DB, { source: 'altro', message: 'x', build: OLD })).toBeNull();
  expect(await devLogRecord(env.DB, { source: 'client', message: 'x', build: 'nope' })).toBeNull();
});
