import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import relay, { renderCalendar } from '../calendar-relay/index.js';
import { dispatchHubReminders } from '../calendar-relay/hub.js';
import { hubApi, hubCalendarEvents, hubReminders, hubZonedUtc } from '../worker/hub.js';

let sql: DatabaseSync, relayEnv: any, objects: Map<string, { text: string; meta: any; etag: string }>, bucket: any;
const secret = 's'.repeat(64), origin = 'https://calendar.example.test';
const superAdmin = { id: 'owner', role: 'SuperAdmin' }, client = { id: 'c', role: 'User' };
const main = () => ({ CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: secret, BUCKET: bucket });
const put = (body: any) => new Request('https://gymtrack.test/api/hub', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = (path = '/api/hub') => new Request('https://gymtrack.test' + path);
const event = (extra: any = {}) => ({ id: 'ev1', updatedAt: 1, kind: 'impegno', title: 'Dentista', notes: '', date: '2026-11-11', time: '17:30', durationMinutes: 45, repeat: 'none', notify: true, notifyOffsets: [30], showInCalendar: true, color: 'blue', ...extra });

beforeEach(async () => {
  sql = new DatabaseSync(':memory:'); sql.exec(readFileSync('calendar-relay/schema.sql', 'utf8'));
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  relayEnv = { CALENDAR_RELAY_SECRET: secret, PUSH_VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), PUSH_VAPID_SUBJECT: 'mailto:test@example.test', PUSH_SCHEDULER_ENABLED: 'true', DB: { prepare: (query: string) => { let args: any[] = []; const s = { bind(...a: any[]) { args = a; return s; }, first: async () => sql.prepare(query).get(...args), all: async () => ({ results: sql.prepare(query).all(...args) }), run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }) }; return s; } } };
  objects = new Map(); let n = 0;
  bucket = {
    head: async (key: string) => { const o = objects.get(key); return o ? { etag: o.etag, customMetadata: o.meta } : null; },
    get: async (key: string) => { const o = objects.get(key); return o ? { customMetadata: o.meta, text: async () => o.text } : null; },
    put: async (key: string, text: string, options: any = {}) => { const o = objects.get(key); if (options.onlyIf?.etagMatches && o?.etag !== options.onlyIf.etagMatches) return null; objects.set(key, { text, meta: options.customMetadata ?? {}, etag: 'e' + (++n) }); return {}; },
    list: async ({ prefix }: any) => ({ objects: [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }),
    delete: async (key: string) => { objects.delete(key); },
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, options: any) => {
    const req = new Request(input, options);
    if (req.url.startsWith(origin)) return relay.fetch(req, relayEnv);
    return new Response(null, { status: 201 });
  });
});
afterEach(() => { sql.close(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('riserva il Hub al Super Admin e salva con controllo di revisione', async () => {
  expect((await hubApi(get(), main(), null)).status).toBe(401);
  expect((await hubApi(get(), main(), client)).status).toBe(403);
  expect(await (await hubApi(get(), main(), superAdmin)).json()).toEqual({ revision: 0, updatedAt: null, data: null });
  const first = await hubApi(put({ baseRevision: 0, data: { events: [event()] } }), main(), superAdmin);
  expect(first.status).toBe(200);
  expect((await first.json() as any).revision).toBe(1);
  const stale = await hubApi(put({ baseRevision: 0, data: { events: [] } }), main(), superAdmin);
  expect(stale.status).toBe(409);
  const stored = await (await hubApi(get(), main(), superAdmin)).json() as any;
  expect(stored.revision).toBe(1);
  expect(stored.data.events[0].title).toBe('Dentista');
  expect((await hubApi(put({ baseRevision: 1, data: { events: [{ id: '' }] } }), main(), superAdmin)).status).toBe(400);
});

it('apre il Hub agli utenti solo se il Super Admin lo ha abilitato, con archivi separati per account', async () => {
  const flags = { hub_enabled: 0, garage_enabled: 0 };
  const db = { prepare: () => { const s: any = { bind: () => s, first: async () => ({ nutrition_enabled: 0, ...flags, revision: 1, updated_at: 1 }) }; return s; } };
  const env = () => ({ ...main(), DB: db });
  expect((await hubApi(get(), env(), client)).status).toBe(403);
  expect((await hubApi(get(), main(), client)).status).toBe(403);
  await hubApi(put({ baseRevision: 0, data: { events: [event()] } }), env(), superAdmin);
  for (const open of [{ hub_enabled: 1, garage_enabled: 0 }, { hub_enabled: 0, garage_enabled: 1 }]) {
    Object.assign(flags, open);
    expect(await (await hubApi(get(), env(), client)).json()).toEqual({ revision: 0, updatedAt: null, data: null });
  }
  const saved = await hubApi(put({ baseRevision: 0, data: { notes: [{ id: 'n1', updatedAt: 1, text: 'Solo mia' }] } }), env(), client);
  expect(saved.status).toBe(200);
  expect(objects.has('hub/c.json')).toBe(true);
  expect(((await (await hubApi(get(), env(), superAdmin)).json()) as any).data.notes).toEqual([]);
  Object.assign(flags, { hub_enabled: 0, garage_enabled: 0 });
  expect((await hubApi(get(), env(), client)).status).toBe(403);
});

it('conserva auto e rifornimenti se una copia non aggiornata dell’app non li invia', async () => {
  const car = { id: 'car', updatedAt: 1, name: 'Golf 8', fuel: 'benzina', tankLiters: 50, readings: [], deadlines: {} };
  expect((await hubApi(put({ baseRevision: 0, data: { events: [], cars: [car], fuelups: [] } }), main(), superAdmin)).status).toBe(200);
  expect((await hubApi(put({ baseRevision: 1, data: { events: [event()] } }), main(), superAdmin)).status).toBe(200);
  let stored = await (await hubApi(get(), main(), superAdmin)).json() as any;
  expect(stored.data.cars).toEqual([car]);
  expect(stored.data.events).toHaveLength(1);
  // Una copia aggiornata che invia l'elenco vuoto lo sostituisce davvero.
  expect((await hubApi(put({ baseRevision: 2, data: { events: [], cars: [{ ...car, deleted: true, updatedAt: 2 }], fuelups: [] } }), main(), superAdmin)).status).toBe(200);
  stored = await (await hubApi(get(), main(), superAdmin)).json() as any;
  expect(stored.data.cars[0].deleted).toBe(true);
});

it('calcola promemoria con anticipi e ora legale nel fuso dell’utente', () => {
  expect(new Date(hubZonedUtc('2026-11-11', '17:30', 'Europe/Rome')).toISOString()).toBe('2026-11-11T16:30:00.000Z');
  expect(new Date(hubZonedUtc('2026-07-11', '17:30', 'Europe/Rome')).toISOString()).toBe('2026-07-11T15:30:00.000Z');
  const now = Date.parse('2026-11-11T08:00:00Z');
  const data = { events: [event({ notifyOffsets: [30, 1440] }), event({ id: 'past', date: '2026-11-01' }), event({ id: 'off', notify: false })], prefs: [{ id: 'p', updatedAt: 1, timezone: 'Europe/Rome', budgetAlerts: [{ category: 'ristoranti', label: 'Ristoranti e bar', month: '2026-11', pct: 82, spent: 16480, cap: 20000 }] }] };
  const reminders = hubReminders(data, now);
  expect(reminders.map((r: any) => [r.id, new Date(r.at).toISOString()])).toEqual([
    ['ev~ev1~2026-11-11~30', '2026-11-11T16:00:00.000Z'],
    ['budget~ristoranti~2026-11', '2026-11-11T08:00:00.000Z'],
  ]);
  const yearly = hubCalendarEvents({ events: [event({ id: 'ins', title: 'Assicurazione', kind: 'scadenza', time: undefined, repeat: 'yearly', date: '2026-11-28' })] }, now);
  expect(yearly[0]).toEqual({ id: 'hub-ins-20261128', title: 'Scadenza: Assicurazione', date: '2026-11-28' });
});

it('invia il push all’ora giusta e il service worker riceve il testo una sola volta per id', async () => {
  const now = Date.parse('2026-11-11T08:00:00Z');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
  // Account del relay e dispositivo iscritto.
  const key = await (async () => { await hubApi(put({ baseRevision: 0, data: { events: [event({ time: '09:15', notifyOffsets: [0] })] } }), main(), superAdmin); return (sql.prepare('SELECT account_key FROM hub_reminders').get() as any).account_key; })();
  sql.prepare('INSERT INTO push_devices(id,account_key,endpoint,next_due,due_day) VALUES(?,?,?,?,?)').run('d'.repeat(64), key, 'https://web.push.apple.com/x', now + 86400000, '2026-11-12');
  await dispatchHubReminders(relayEnv, now);
  expect((sql.prepare('SELECT sent_at FROM hub_reminders').get() as any).sent_at).toBeNull();
  const due = Date.parse('2026-11-11T08:15:00Z');
  await dispatchHubReminders(relayEnv, due);
  expect((sql.prepare('SELECT sent_at FROM hub_reminders').get() as any).sent_at).toBe(due);
  vi.setSystemTime(due + 60000);
  const body = await (await hubApi(get('/api/hub/due'), main(), superAdmin)).json() as any;
  expect(body.items).toEqual([{ id: 'ev~ev1~2026-11-11~0', title: 'Dentista', body: 'Adesso · 09:15', url: '/hub/calendario?giorno=2026-11-11' }]);
  // Un nuovo salvataggio non rimanda un promemoria già inviato.
  await hubApi(put({ baseRevision: 1, data: { events: [event({ time: '09:15', notifyOffsets: [0] })] } }), main(), superAdmin);
  expect((sql.prepare('SELECT sent_at FROM hub_reminders').get() as any).sent_at).toBe(due);
});

it('aggiunge gli impegni con orario al calendario abbonato', () => {
  const text = renderCalendar([{ id: 'w1', title: 'Allenamento', date: '2026-11-11' }], 1, Date.parse('2026-11-11T08:00:00Z'), 'k', [{ id: 'hub-ev1-20261111', title: 'Dentista', date: '2026-11-11', start: '2026-11-11T16:30:00.000Z', end: '2026-11-11T17:15:00.000Z' }]);
  expect(text).toContain('DTSTART:20261111T163000Z');
  expect(text).toContain('SUMMARY:Dentista');
  expect(text).toContain('SUMMARY:Allenamento');
});
