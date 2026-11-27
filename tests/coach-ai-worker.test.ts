import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { api } from '../worker/index.js';
import { MEAL_SCAN_MODEL, setGeminiRetryDelay } from '../worker/meal-scan.js';
import { COACH_AI_DEFAULT_DAILY_LIMIT, COACH_AI_SYSTEM, coachAiApi, coachAiClean, coachAiDailyLimit, coachAiParse, setCoachAiRetryDelay } from '../worker/coach-ai.js';

// Dati sintetici: SQLite in memoria al posto di D1, modello e rete simulati. Nessuna seduta reale.
const NOON = Date.UTC(2026, 10, 14, 12);
const user = { id: 'athlete', role: 'User' }, other = { id: 'other', role: 'User' };
const owner = { id: 'owner', role: 'SuperAdmin', email: 'owner@example.test' };
const context = { esercizio: 'Panca piana', obiettivo: { ripetizioni: '6–10', rpe: 8 }, oggi: [{ carico: 80, ripetizioni: 8, rpe: 8.5 }], proposta: { azione: 'Mantieni il carico', carico: 80, ripetizioni: 8 } };
const advice = { headline: 'Tieni 80 kg e cura la discesa', advice: 'La serie era vicina al limite giusto: ripeti 80 kg e cerca 8 ripetizioni pulite.', cues: ['Scapole addotte', 'Piedi saldi', 'Gomiti a 45°', 'Quarto in più'], stance: 'agree', answer: '' };
const answer = (content: unknown = advice, usage: any = { prompt_tokens: 1200, completion_tokens: 220 }) => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage });

let sql: DatabaseSync, run: ReturnType<typeof vi.fn>, env: any;
const d1 = () => ({ prepare(query: string) { let args: any[] = []; const s = { bind(...a: any[]) { args = a; return s; }, first: async () => sql.prepare(query).get(...args), run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }) }; return s; } });
const post = (body: any = { kind: 'set', context, question: 'Sento la spalla, come tengo i gomiti?' }) => new Request('https://gymtrack.test/api/coach-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ask = (body?: any, who: any = user, now = NOON) => coachAiApi(post(body), env, who, now);
const count = (id = 'athlete') => (sql.prepare('SELECT requests FROM ai_usage WHERE day=?').get('coach-2026-11-14-' + id) as any)?.requests ?? 0;
const neurons = () => (sql.prepare('SELECT neurons FROM ai_usage WHERE day=?').get('2026-11-14') as any)?.neurons;

beforeEach(() => {
  setGeminiRetryDelay(0); setCoachAiRetryDelay(0);
  sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
  run = vi.fn(async () => answer());
  env = { DB: d1(), AI: { run } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { sql.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('richiede un account, accetta solo GET e POST ed è collegato al Worker principale', async () => {
  expect((await coachAiApi(post(), env, null, NOON)).status).toBe(401);
  expect((await coachAiApi(new Request('https://gymtrack.test/api/coach-ai', { method: 'PATCH' }), env, user, NOON)).status).toBe(405);
  const routed = await api(new Request('https://gymtrack.test/api/coach-ai', { headers: { 'oai-authenticated-user-id': 'visitor' } }), env, {});
  expect(routed.status).toBe(401);
  expect(run).not.toHaveBeenCalled();
});

it('senza Workers AI né Gemini non è disponibile e non chiama alcun modello', async () => {
  const status = await (await coachAiApi(new Request('https://gymtrack.test/api/coach-ai'), { DB: env.DB }, user, NOON)).json() as any;
  expect(status).toMatchObject({ available: false, provider: '', dailyLimit: COACH_AI_DEFAULT_DAILY_LIMIT, remaining: COACH_AI_DEFAULT_DAILY_LIMIT });
  const off = await coachAiApi(post(), { DB: env.DB }, user, NOON);
  expect(off.status).toBe(503); expect((await off.json() as any).code).toBe('AI_UNAVAILABLE');
  expect(count()).toBe(0);
});

it('controlla la richiesta prima di contarla', async () => {
  for (const body of [{ kind: 'chat', context }, { kind: 'set' }, { kind: 'set', context: [] }, { kind: 'set', context: { '<x>': 1 } }, { kind: 'set', context, question: 42 }, 'non json'])
    expect((await ask(body)).status).toBe(400);
  expect((await ask({ kind: 'session', context: { testo: 'x'.repeat(20000) } })).status).toBe(413);
  expect((await ask({ kind: 'session', context: { righe: Array.from({ length: 24 }, () => ({ a: 'x'.repeat(190), b: 'y'.repeat(190) })) } })).status).toBe(413);
  expect(run).not.toHaveBeenCalled(); expect(count()).toBe(0);
});

it('risponde con il parere del coach, ripulito, e conta il consumo reale', async () => {
  const response = await ask(); const body = await response.json() as any;
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ kind: 'set', provider: 'cloudflare', headline: advice.headline, advice: advice.advice, stance: 'agree', remaining: COACH_AI_DEFAULT_DAILY_LIMIT - 1 });
  expect(body.cues).toEqual(advice.cues.slice(0, 3));
  const [model, input] = run.mock.calls[0] as any[];
  expect(model).toBe(MEAL_SCAN_MODEL);
  expect(input.messages[0].content).toBe(COACH_AI_SYSTEM);
  const prompt = input.messages[1].content[0].text;
  expect(prompt).toContain('"esercizio":"Panca piana"'); expect(prompt).toContain('Sento la spalla');
  expect(input.messages[1].content).toHaveLength(1);
  expect(count()).toBe(1);
  // 1200 token in ingresso e 220 in uscita, maggiorati del 20%: la prenotazione è sostituita dal consumo reale.
  expect(neurons()).toBe(21);
});

it('il riepilogo di fine seduta ha punti di forza, correzioni e priorità', async () => {
  run.mockResolvedValueOnce(answer({ headline: 'Buona seduta', advice: 'Sforzo ben dosato.', positives: ['Costanza'], improvements: ['Più recupero', 'Registra l’RPE'], focus: 'Panca: 3 minuti di recupero', cues: ['ignorato'] }) as any);
  const body = await (await ask({ kind: 'session', context: { seduta: 'Spinta', serie: 14 } })).json() as any;
  expect(body).toMatchObject({ kind: 'session', positives: ['Costanza'], improvements: ['Più recupero', 'Registra l’RPE'], focus: 'Panca: 3 minuti di recupero' });
  expect(body.cues).toBeUndefined();
  expect(run.mock.calls[0][1].messages[1].content[0].text).toContain('ha appena concluso l’allenamento');
});

it('ripulisce contesto e risposta da markup, chiavi strane e valori non validi', () => {
  expect(coachAiClean({ nome: '<script>alert(1)</script>', 'chiave strana': 1, peso: 82.456, n: Infinity, ok: true, vuoto: '', lista: [1, null, 'a'] }))
    .toEqual({ nome: 'script alert(1) /script', peso: 82.46, ok: true, lista: [1, 'a'] });
  expect(coachAiParse('nessun json')).toBeNull();
  expect(coachAiParse('{"headline":"x"}')).toBeNull();
  expect(coachAiParse('Ecco: {"advice":"<b>Sali</b>","stance":"aggressive"} fine')).toMatchObject({ advice: 'b Sali /b', stance: 'agree', cues: [] });
  expect(coachAiParse({ answer: 'Sì', stance: 'cautious' }, 'session')).toMatchObject({ answer: 'Sì', stance: 'cautious', positives: [], improvements: [], focus: '' });
});

it('una risposta non valida o un errore del modello non consumano l’analisi', async () => {
  run.mockResolvedValueOnce(answer('non è json') as any);
  const invalid = await ask();
  expect(invalid.status).toBe(502); expect(count()).toBe(0);
  run.mockRejectedValueOnce(new Error('AiError: 3040: out of capacity'));
  const busy = await ask();
  expect(busy.status).toBe(502); expect((await busy.json() as any).error).toContain('momentaneamente occupata');
  // Il modello che ha risposto male ha comunque lavorato (21 Neuron); quello occupato non ha consumato nulla.
  expect(count()).toBe(0); expect(neurons()).toBe(21);
});

it('rispetta il limite giornaliero per utente e quello condiviso di Workers AI', async () => {
  expect(coachAiDailyLimit({ COACH_AI_DAILY_LIMIT: '2' })).toBe(2);
  expect(coachAiDailyLimit({ COACH_AI_DAILY_LIMIT: '5000' })).toBe(200);
  expect(coachAiDailyLimit({ COACH_AI_DAILY_LIMIT: 'x' })).toBe(COACH_AI_DEFAULT_DAILY_LIMIT);
  env.COACH_AI_DAILY_LIMIT = '2';
  expect((await ask()).status).toBe(200); expect((await ask()).status).toBe(200);
  const limited = await ask();
  expect(limited.status).toBe(429); expect((await limited.json() as any).code).toBe('COACH_AI_LIMIT');
  expect((await ask(undefined, other)).status).toBe(200);
  expect(run).toHaveBeenCalledTimes(3);
  // Limite gratuito di Workers AI quasi esaurito: nessuna chiamata e l'analisi non viene contata.
  sql.prepare('UPDATE ai_usage SET neurons=9450 WHERE day=?').run('2026-11-14');
  const wait = await ask(undefined, owner);
  expect(wait.status).toBe(429); expect((await wait.json() as any).code).toBe('AI_LIMIT');
  expect(count('owner')).toBe(0); expect(run).toHaveBeenCalledTimes(3);
  const status = await (await coachAiApi(new Request('https://gymtrack.test/api/coach-ai'), env, user, NOON)).json() as any;
  expect(status).toMatchObject({ available: true, blocked: true, used: 2, remaining: 0 });
});

const geminiReply = (text: string, ok = true, status = 200) => ({ ok, status, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

it('usa Gemini quando l’admin lo ha configurato e ripiega su Workers AI se fallisce', async () => {
  const fetchMock = vi.fn(async () => geminiReply(JSON.stringify({ ...advice, stance: 'cautious' })));
  vi.stubGlobal('fetch', fetchMock);
  env = { ...env, GEMINI_API_KEY: 'chiave-finta', GEMINI_USER_EMAILS: 'owner@example.test' };
  const mine = await (await ask(undefined, owner)).json() as any;
  expect(mine).toMatchObject({ provider: 'gemini', stance: 'cautious' });
  expect(run).not.toHaveBeenCalled();
  const init = (fetchMock.mock.calls[0] as any[])[1];
  expect(JSON.parse(init.body).systemInstruction.parts[0].text).toBe(COACH_AI_SYSTEM);
  // Gli altri account non usano la chiave dell'admin.
  expect((await (await ask()).json() as any).provider).toBe('cloudflare');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  // Errore di Google: risponde Workers AI e il motivo è visibile solo all'admin.
  fetchMock.mockResolvedValue(geminiReply('', false, 403) as any);
  const fallback = await (await ask(undefined, owner)).json() as any;
  expect(fallback.provider).toBe('cloudflare'); expect(fallback.geminiError).toContain('Gemini HTTP 403');
  expect(count('owner')).toBe(2);
});
