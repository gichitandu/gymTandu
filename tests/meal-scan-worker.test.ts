import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
import { MEAL_SCAN_FREE_NEURONS, MEAL_SCAN_MODEL, MEAL_SCAN_RESERVATION, mealScanApi, mealScanBudget, mealScanNeurons, mealScanParse, mealScanStatus } from '../worker/meal-scan.js';

// Dati sintetici: SQLite in memoria al posto di D1 e un modello finto al posto di Workers AI.
const NOON = Date.UTC(2026, 10, 14, 12), CAP = 9500;
const image = 'data:image/jpeg;base64,' + 'A'.repeat(64);
const admin = { id: 'owner', role: 'SuperAdmin' }, client = { id: 'client', role: 'User' };
const meal = { kind: 'plate', dish: 'Pollo e riso', items: [{ name: 'Petto di pollo', grams: 150, calories: 248, protein: 46.5, carbs: 0, fat: 5.4 }, { name: 'Riso', grams: 180, calories: 234, protein: 4.9, carbs: 50.8, fat: 0.5 }] };
const answer = (usage: any = { prompt_tokens: 1500, completion_tokens: 200 }) => ({ choices: [{ message: { content: JSON.stringify(meal) } }], usage });

let sql: DatabaseSync, run: ReturnType<typeof vi.fn>, env: any;
const d1 = () => ({ prepare(query: string) { let args: any[] = []; const s = { bind(...a: any[]) { args = a; return s; }, first: async () => sql.prepare(query).get(...args), run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }) }; return s; } });
const post = (body: any = { image }) => new Request('https://gymtrack.test/api/meal-scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const get = () => new Request('https://gymtrack.test/api/meal-scan');
const scan = (now = NOON, user: any = admin) => mealScanApi(post(), env, user, now);
const usage = () => sql.prepare('SELECT neurons,requests,blocked FROM ai_usage WHERE day=?').get('2026-11-14') as any;
const preset = (neurons: number) => sql.prepare('INSERT INTO ai_usage(day,neurons,requests,blocked,updated_at) VALUES(?,?,0,0,0)').run('2026-11-14', neurons);

beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  run = vi.fn(async () => answer());
  env = { DB: d1(), AI: { run } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { sql.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('blocca al 95% dell’allocazione gratuita e non permette di allargare il limite dalle variabili', () => {
  expect(mealScanBudget({})).toEqual({ limit: MEAL_SCAN_FREE_NEURONS, reservePercent: 5, cap: CAP });
  expect(mealScanBudget({ AI_DAILY_NEURON_LIMIT: '50000', AI_RESERVE_PERCENT: '0' })).toEqual({ limit: 10000, reservePercent: 5, cap: CAP });
  expect(mealScanBudget({ AI_DAILY_NEURON_LIMIT: '2000', AI_RESERVE_PERCENT: '20' })).toEqual({ limit: 2000, reservePercent: 20, cap: 1600 });
  expect(mealScanBudget({ AI_DAILY_NEURON_LIMIT: 'abc', AI_RESERVE_PERCENT: '-3' }).cap).toBe(CAP);
});

it('richiede un account e segue la visibilità della sezione Pasti', async () => {
  expect((await mealScanApi(get(), env, null, NOON)).status).toBe(401);
  expect((await mealScanApi(get(), env, client, NOON)).status).toBe(403);
  expect((await scan(NOON, client)).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
  sql.prepare('INSERT INTO app_features(id,nutrition_enabled,revision) VALUES(?,1,1)').run('current');
  expect((await mealScanApi(get(), env, client, NOON)).status).toBe(200);
  expect((await mealScanApi(new Request('https://gymtrack.test/api/meal-scan', { method: 'PATCH' }), env, admin, NOON)).status).toBe(405);
  // Il percorso è collegato al Worker principale e senza sessione non raggiunge il modello.
  const routed = await api(new Request('https://gymtrack.test/api/meal-scan', { headers: { 'oai-authenticated-user-id': 'visitor' } }), env, {});
  expect(routed.status).toBe(401);
  expect(run).not.toHaveBeenCalled();
});

it('senza Workers AI o senza migrazione non è disponibile e non chiama alcun modello', async () => {
  expect(await (await mealScanApi(get(), { DB: env.DB }, admin, NOON)).json()).toMatchObject({ available: false, blocked: false });
  const off = await mealScanApi(post(), { DB: env.DB }, admin, NOON);
  expect(off.status).toBe(503); expect((await off.json() as any).code).toBe('AI_UNAVAILABLE');
  sql.exec('DROP TABLE ai_usage');
  expect(await (await mealScanApi(get(), env, admin, NOON)).json()).toMatchObject({ available: false, setup: 'migration' });
  expect((await scan()).status).toBe(503);
  expect(run).not.toHaveBeenCalled();
});

it('legge la foto, restituisce alimenti controllati e conta il consumo reale', async () => {
  const response = await scan(); const body = await response.json() as any;
  expect(response.status).toBe(200);
  expect(body.items).toEqual(meal.items); expect(body.dish).toBe('Pollo e riso'); expect(body.kind).toBe('plate');
  expect(run).toHaveBeenCalledTimes(1);
  const [model, input, options] = run.mock.calls[0] as any[];
  expect(model).toBe(MEAL_SCAN_MODEL); expect(model.startsWith('@cf/')).toBe(true);
  expect(input.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: image } });
  expect(input.max_completion_tokens).toBeLessThanOrEqual(900); expect(input.chat_template_kwargs).toEqual({ enable_thinking: false });
  expect(options).toEqual({ rejectIfBusy: true });
  // 1.500 token in ingresso e 200 in uscita: 19,1 Neuron, maggiorati del 20% e arrotondati per eccesso.
  const neurons = mealScanNeurons({ prompt_tokens: 1500, completion_tokens: 200 });
  expect(neurons).toBe(23);
  expect(usage()).toEqual({ neurons, requests: 1, blocked: 0 });
  expect(body.status).toMatchObject({ available: true, blocked: false, used: neurons, cap: CAP, limit: 10000, thresholdPercent: 95, resetAt: Date.UTC(2026, 10, 15) });
});

it('senza consumo dichiarato tiene contata l’intera prenotazione', async () => {
  run.mockResolvedValue(answer(null)); await scan();
  expect(usage().neurons).toBe(MEAL_SCAN_RESERVATION);
  run.mockResolvedValue(answer({ prompt_tokens: 0, completion_tokens: 0 })); await scan();
  expect(usage().neurons).toBe(MEAL_SCAN_RESERVATION * 2);
  expect(mealScanNeurons({ prompt_tokens: -1, completion_tokens: 5 })).toBeNull(); expect(mealScanNeurons(null)).toBeNull();
});

it('prima del 95% rifiuta la richiesta con «attendere ripristino» senza chiamare il modello', async () => {
  preset(CAP - MEAL_SCAN_RESERVATION + 1);
  expect(await (await mealScanApi(get(), env, admin, NOON)).json()).toMatchObject({ available: true, blocked: true, remainingScans: 0 });
  const response = await scan(); const body = await response.json() as any;
  expect(response.status).toBe(429); expect(body.code).toBe('AI_LIMIT'); expect(body.error).toContain('attendere ripristino');
  expect(body.status).toMatchObject({ blocked: true, resetAt: Date.UTC(2026, 10, 15) });
  expect(run).not.toHaveBeenCalled();
  expect(usage()).toEqual({ neurons: CAP - MEAL_SCAN_RESERVATION + 1, requests: 0, blocked: 0 });
});

it('l’ultima richiesta ammessa è quella che resta entro il limite', async () => {
  preset(CAP - MEAL_SCAN_RESERVATION); run.mockResolvedValue(answer(null));
  expect((await scan()).status).toBe(200); expect(usage().neurons).toBe(CAP);
  expect((await scan()).status).toBe(429); expect(run).toHaveBeenCalledTimes(1); expect(usage().neurons).toBe(CAP);
});

it('non supera mai il limite nemmeno con centinaia di richieste contemporanee', async () => {
  run.mockResolvedValue(answer(null));
  const responses = await Promise.all(Array.from({ length: 300 }, () => scan()));
  const allowed = responses.filter(response => response.status === 200).length;
  expect(allowed).toBe(CAP / MEAL_SCAN_RESERVATION); expect(run).toHaveBeenCalledTimes(allowed);
  expect(responses.filter(response => response.status === 429)).toHaveLength(300 - allowed);
  expect(usage().neurons).toBe(CAP); expect(usage().neurons).toBeLessThanOrEqual(MEAL_SCAN_FREE_NEURONS * 0.95);
});

it('resta sotto il limite anche quando ogni lettura costa più del previsto', async () => {
  // 20.000 token in ingresso: 219 Neuron, oltre la prenotazione. Il margine del 5% assorbe la differenza.
  run.mockResolvedValue(answer({ prompt_tokens: 20000, completion_tokens: 0 }));
  for (let index = 0; index < 100; index++) await scan();
  expect(usage().neurons).toBeLessThan(MEAL_SCAN_FREE_NEURONS);
  expect((await scan()).status).toBe(429);
});

it('riparte da zero dopo il ripristino delle 00:00 UTC', async () => {
  preset(CAP);
  expect((await scan(Date.UTC(2026, 10, 14, 23, 59, 59))).status).toBe(429);
  const next = Date.UTC(2026, 10, 15, 0, 0, 1);
  expect(await (await mealScanApi(get(), env, admin, next)).json()).toMatchObject({ blocked: false, used: 0, resetAt: Date.UTC(2026, 10, 16) });
  expect((await scan(next)).status).toBe(200); expect(run).toHaveBeenCalledTimes(1);
  expect(usage().neurons).toBe(CAP);
});

it('se Cloudflare dichiara esaurita l’allocazione ferma tutto fino al ripristino', async () => {
  run.mockRejectedValueOnce(new Error('3036: You have used up your daily free allocation of 10,000 neurons.'));
  const first = await scan(); expect(first.status).toBe(429); expect((await first.json() as any).status.blocked).toBe(true);
  expect(usage().blocked).toBe(1);
  expect((await scan()).status).toBe(429); expect(run).toHaveBeenCalledTimes(1);
  expect((await scan(Date.UTC(2026, 10, 15, 1))).status).toBe(200);
});

it('libera la prenotazione solo quando il modello non è stato eseguito', async () => {
  run.mockRejectedValueOnce(new Error('3040: Capacity temporarily exceeded, please try again.'));
  const busy = await scan(); expect(busy.status).toBe(502); expect((await busy.json() as any).code).toBe('AI_ERROR');
  expect(usage()).toEqual({ neurons: 0, requests: 1, blocked: 0 });
  run.mockRejectedValueOnce(new Error('errore sconosciuto con dettagli interni'));
  const failed = await scan(); const body = await failed.json() as any;
  expect(failed.status).toBe(502); expect(body.error).not.toContain('dettagli interni');
  expect(usage().neurons).toBe(MEAL_SCAN_RESERVATION);
});

it('una foto non valida o un database in errore non consumano il limite e non raggiungono il modello', async () => {
  for (const body of [{}, { image: 'https://example.test/foto.jpg' }, { image: 'data:text/html;base64,AAAA' }, { image: 'data:image/jpeg;base64,' + 'A'.repeat(700001) }]) {
    expect([400, 413]).toContain((await mealScanApi(post(body), env, admin, NOON)).status);
  }
  expect(usage()).toBeUndefined(); expect(run).not.toHaveBeenCalled();
  const broken = { ...env, DB: { prepare: (query: string) => { if (/^(INSERT|UPDATE)/.test(query)) throw new Error('D1 non raggiungibile'); return env.DB.prepare(query); } } };
  expect((await mealScanApi(post(), broken, admin, NOON)).status).toBe(503);
  const silent = { ...env, DB: { prepare: (query: string) => { const s = env.DB.prepare(query); return /^UPDATE/.test(query) ? { bind: () => ({ run: async () => ({}) }) } : s; } } };
  expect((await mealScanApi(post(), silent, admin, NOON)).status).toBe(429);
  expect(run).not.toHaveBeenCalled();
});

it('accetta dal modello solo alimenti con valori plausibili', async () => {
  expect(mealScanParse('Ecco il risultato:\n```json\n' + JSON.stringify(meal) + '\n```')).toEqual(meal);
  expect(mealScanParse({ response: 'x' })).toBeNull(); expect(mealScanParse('nessun json')).toBeNull(); expect(mealScanParse('{"items":"no"}')).toBeNull();
  const parsed = mealScanParse(JSON.stringify({ kind: 'label', dish: ' Yogurt <b>greco</b> ', items: [
    { name: 'Yogurt greco', grams: '170 g', kcal: '165,5', proteins: 17, carbohydrates: 6, fats: 9 },
    { name: '', grams: 10, calories: 1, protein: 0, carbs: 0, fat: 0 }, { name: 'Senza grammi', grams: 0, calories: 1, protein: 0, carbs: 0, fat: 0 },
    { name: 'Negativo', grams: 10, calories: -5, protein: 0, carbs: 0, fat: 0 }, { name: 'Enorme', grams: 99999, calories: 99999, protein: 1, carbs: 1, fat: 1 },
    ...Array.from({ length: 12 }, (_, index) => ({ name: 'Voce ' + index, grams: 10, calories: 10, protein: 1, carbs: 1, fat: 1 })),
  ] }))!;
  expect(parsed.kind).toBe('label'); expect(parsed.dish).toBe('Yogurt b greco /b'); expect(parsed.items).toHaveLength(8);
  expect(parsed.items[0]).toEqual({ name: 'Yogurt greco', grams: 170, calories: 165.5, protein: 17, carbs: 6, fat: 9 });
  expect(parsed.items[1]).toEqual({ name: 'Enorme', grams: 10000, calories: 20000, protein: 1, carbs: 1, fat: 1 });
  run.mockResolvedValue({ response: 'Non vedo cibo.', usage: { prompt_tokens: 900, completion_tokens: 10 } });
  expect(await (await scan()).json()).toMatchObject({ kind: 'none', items: [] });
  expect((await mealScanStatus(env, NOON)).requests).toBe(1);
});

// Gemini: riservato agli indirizzi autorizzati, con ripiego su Workers AI. Rete simulata, nessuna chiave reale.
const owner = { id: 'owner', role: 'SuperAdmin', email: 'owner@example.test' };
const geminiReply = (text: string, ok = true, status = 200) => ({ ok, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const geminiCount = () => (sql.prepare('SELECT requests FROM ai_usage WHERE day=?').get('gemini-2026-11-14-owner') as any)?.requests;

it('Gemini serve solo gli indirizzi elencati; gli altri account usano sempre Workers AI', async () => {
  const fetchMock = vi.fn(async () => geminiReply(JSON.stringify(meal))); vi.stubGlobal('fetch', fetchMock);
  env = { ...env, GEMINI_API_KEY: 'chiave-finta', GEMINI_USER_EMAILS: 'Owner@Example.test, altro@example.test' };
  const mine = await (await scan(NOON, owner)).json() as any;
  expect(mine.provider).toBe('gemini'); expect(mine.items).toEqual(meal.items);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(run).not.toHaveBeenCalled();
  const [url, init] = fetchMock.mock.calls[0] as any[];
  expect(url).toContain('https://generativelanguage.googleapis.com/'); expect(url).not.toContain('chiave-finta');
  expect(init.headers['x-goog-api-key']).toBe('chiave-finta');
  expect(JSON.parse(init.body).contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
  expect(geminiCount()).toBe(1); expect(usage()).toBeUndefined();
  sql.prepare('INSERT INTO app_features(id,nutrition_enabled,revision) VALUES(?,1,1)').run('current');
  const other = await (await scan(NOON, { ...client, email: 'cliente@example.test' })).json() as any;
  expect(other.provider).toBe('cloudflare'); expect(run).toHaveBeenCalledTimes(1); expect(fetchMock).toHaveBeenCalledTimes(1);
  // Senza chiave o con un indirizzo non elencato Gemini non viene mai chiamato.
  env = { ...env, GEMINI_API_KEY: '' }; expect(((await (await scan(NOON, owner)).json()) as any).provider).toBe('cloudflare');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('se Gemini fallisce o raggiunge il limite la lettura passa a Workers AI', async () => {
  const fetchMock = vi.fn(async () => geminiReply('', false, 500)); vi.stubGlobal('fetch', fetchMock);
  env = { ...env, GEMINI_API_KEY: 'chiave-finta', GEMINI_USER_EMAILS: 'owner@example.test', GEMINI_DAILY_LIMIT: '2' };
  const failed = await (await scan(NOON, owner)).json() as any;
  expect(failed.provider).toBe('cloudflare'); expect(failed.geminiError).toContain('Gemini HTTP 500');
  fetchMock.mockResolvedValue(geminiReply('{"kind":"none","items":[]}') as any);
  expect(((await (await scan(NOON, owner)).json()) as any).provider).toBe('gemini');
  // Limite giornaliero Gemini (2) raggiunto: Cloudflare, senza chiamare Google.
  expect(((await (await scan(NOON, owner)).json()) as any).provider).toBe('cloudflare');
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(geminiCount()).toBe(2);
  // 429 di Google: giorno bloccato per Gemini.
  sql.exec("DELETE FROM ai_usage WHERE day LIKE 'gemini-%'");
  fetchMock.mockResolvedValue(geminiReply('', false, 429) as any);
  await scan(NOON, owner); await scan(NOON, owner);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((sql.prepare("SELECT blocked FROM ai_usage WHERE day LIKE 'gemini-%'").get() as any).blocked).toBe(1);
});

// Chiave personale incollata nell'app: archivio R2 finto, Google simulato.
const bucket = () => { const files = new Map<string, string>(); return { files, put: async (k: string, v: string) => { files.set(k, v); }, get: async (k: string) => files.has(k) ? { text: async () => files.get(k)! } : null, delete: async (k: string) => { files.delete(k); } }; };
const KEY = 'AIza' + 'x'.repeat(35);
const put = (body: any) => new Request('https://gymtrack.test/api/meal-scan', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const remove = () => new Request('https://gymtrack.test/api/meal-scan', { method: 'DELETE' });

it('un admin incolla la chiave nell’app: viene verificata, salvata cifrata e non è mai restituita', async () => {
  const fetchMock = vi.fn(async (_url: string, init: any) => init.method === 'GET' ? ({ ok: true, status: 200 }) : geminiReply(JSON.stringify(meal))); vi.stubGlobal('fetch', fetchMock);
  const store = bucket(); env = { ...env, BUCKET: store, SETUP_CODE: 'codice-di-setup-finto' };
  // Chi non è admin non può salvare né leggere.
  expect((await mealScanApi(put({ apiKey: KEY }), env, client, NOON)).status).toBe(403);
  expect(store.files.size).toBe(0);
  // Chiavi malformate o rifiutate da Google non vengono salvate; i formati con punto restano ammessi.
  expect((await mealScanApi(put({ apiKey: 'con spazio ' + 'x'.repeat(30) }), env, owner, NOON)).status).toBe(400);
  expect((await mealScanApi(put({ apiKey: 'corta' }), env, owner, NOON)).status).toBe(400);
  fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as any);
  expect((await mealScanApi(put({ apiKey: KEY }), env, owner, NOON)).status).toBe(400);
  fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as any);
  expect(((await (await mealScanApi(put({ apiKey: KEY, model: 'modello-inesistente' }), env, owner, NOON)).json()) as any).error).toContain('Modello non trovato');
  expect(store.files.size).toBe(0);
  const saved = await mealScanApi(put({ apiKey: KEY, model: 'gemini-2.5-flash' }), env, owner, NOON); const text = JSON.stringify(await saved.json());
  expect(saved.status).toBe(200); expect(text).not.toContain(KEY); expect(text).toContain('"configured":true');
  expect([...store.files.values()].join('')).not.toContain(KEY);
  expect(fetchMock.mock.calls.at(-1)![1].headers['x-goog-api-key']).toBe(KEY);
  // La chiave salvata viene usata solo da questo account.
  const mine = await (await scan(NOON, owner)).json() as any;
  expect(mine.provider).toBe('gemini'); expect(fetchMock.mock.calls.at(-1)![1].headers['x-goog-api-key']).toBe(KEY);
  const status = await (await mealScanApi(get(), env, owner, NOON)).json() as any;
  expect(status.gemini).toMatchObject({ configured: true, source: 'app', used: 1 }); expect(JSON.stringify(status)).not.toContain(KEY);
  sql.prepare('INSERT INTO app_features(id,nutrition_enabled,revision) VALUES(?,1,1)').run('current');
  expect(((await (await scan(NOON, { ...client, email: 'x@example.test' })).json()) as any).provider).toBe('cloudflare');
  // Con un altro SETUP_CODE la chiave non è più leggibile: si passa a Workers AI.
  expect(((await (await mealScanApi(post(), { ...env, SETUP_CODE: 'altro-codice-finto' }, owner, NOON)).json()) as any).provider).toBe('cloudflare');
  // Rimozione.
  expect(((await (await mealScanApi(remove(), env, owner, NOON)).json()) as any).gemini.configured).toBe(false);
  expect(store.files.size).toBe(0); expect(((await (await scan(NOON, owner)).json()) as any).provider).toBe('cloudflare');
});
