// Analisi di una foto di pasto con Workers AI (binding `AI` in wrangler.jsonc).
// Il Worker riceve la foto già compressa dall'app, la passa al modello e
// restituisce alimenti e valori in forma strutturata. La foto non viene salvata:
// esiste solo per la durata della richiesta. Il risultato è sempre una stima che
// l'utente controlla e corregge prima di salvare il pasto.
//
// Modello predefinito: Gemma 3 12B (visione). Non usare Llama 3.2 Vision: la sua
// licenza non concede i diritti d'uso a chi è domiciliato nell'Unione Europea.
//
// Costo zero: il piano gratuito di Cloudflare concede 10.000 "neuroni" al giorno,
// azzerati a mezzanotte UTC. Questo modulo tiene un contatore globale stimato e:
//  - avvisa quando si arriva al 90% della quota;
//  - si ferma per tutti prima di superare il 95%, fino al giorno dopo.
// In più c'è un limite giornaliero per account, così una persona sola non consuma
// la quota di tutti. I contatori stanno in login_limits (chiavi `ai:...`), senza
// modificare lo schema. La stima è prudente; il pannello Workers AI di Cloudflare
// resta la misura ufficiale dei neuroni usati.
const MEAL_MODEL = '@cf/google/gemma-3-12b-it';
// Neuroni per milione di token (ingresso, uscita), dal listino Workers AI.
const MEAL_RATES = {
  '@cf/google/gemma-3-12b-it': { input: 31371, output: 50560 },
  '@cf/google/gemma-4-26b-a4b-it': { input: 9091, output: 27273 },
};
// Modello non in tabella: tariffe alte, per restare dalla parte della prudenza.
const MEAL_UNKNOWN_RATE = { input: 50000, output: 140000 };
const MEAL_FREE_NEURONS = 10000;
const MEAL_WARN_AT = 0.9;
const MEAL_STOP_AT = 0.95;
// Caso peggiore di una richiesta: immagine (fino a circa 6.400 token) più istruzioni, e risposta massima.
const MEAL_WORST_INPUT_TOKENS = 7200;
const MEAL_MAX_OUTPUT_TOKENS = 700;
const MEAL_MAX_IMAGE_BYTES = 600 * 1024;
const MEAL_DEFAULT_DAILY_LIMIT = 5;
const MEAL_TIMEOUT_MS = 25000;
const MEAL_MAX_ITEMS = 12;

const MEAL_SCHEMA = {
  name: 'meal_scan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_food', 'items', 'note'],
    properties: {
      is_food: { type: 'boolean' },
      note: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'confidence'],
          properties: {
            name: { type: 'string' },
            grams: { type: 'number' },
            kcal: { type: 'number' },
            protein: { type: 'number' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
    },
  },
};

const MEAL_SYSTEM_PROMPT = [
  'Sei un assistente di diario alimentare. Guardi la foto di un pasto e ne stimi il contenuto.',
  'Elenca ogni alimento distinto visibile (massimo 12), con nome in italiano, peso stimato in grammi della porzione nel piatto,',
  'e valori nutrizionali stimati per quella porzione: kcal, proteine, carboidrati e grassi in grammi.',
  'Considera cottura e condimenti visibili. Se la foto non contiene cibo, imposta is_food a false e items vuoto.',
  'Usa confidence "low" quando non sei sicuro dell\'alimento o della quantità. Non inventare alimenti non visibili.',
  'Nel campo note scrivi al massimo una frase breve su ciò che è incerto (ad esempio condimenti o dimensioni).',
].join(' ');

function mealError(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

const mealModel = env =>
  typeof env?.AI_VISION_MODEL === 'string' && env.AI_VISION_MODEL.startsWith('@cf/') ? env.AI_VISION_MODEL : MEAL_MODEL;

const mealRate = model => MEAL_RATES[model] || MEAL_UNKNOWN_RATE;

/** Neuroni riservati a ogni richiesta, nel caso peggiore: serve a non superare mai la soglia di stop. */
export function mealReserveNeurons(model = MEAL_MODEL) {
  const rate = mealRate(model);
  return Math.ceil((MEAL_WORST_INPUT_TOKENS * rate.input + MEAL_MAX_OUTPUT_TOKENS * rate.output) / 1e6);
}

function mealDailyLimit(env) {
  const value = Number.parseInt(String(env?.AI_DAILY_LIMIT ?? ''), 10);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : MEAL_DEFAULT_DAILY_LIMIT;
}

/** Quota gratuita giornaliera di Cloudflare; AI_DAILY_NEURONS la riduce se l'account usa Workers AI anche altrove. */
function mealAllowance(env) {
  const value = Number.parseInt(String(env?.AI_DAILY_NEURONS ?? ''), 10);
  return Number.isInteger(value) && value >= 100 && value <= 1_000_000 ? value : MEAL_FREE_NEURONS;
}

/** Giorno UTC: Cloudflare azzera la quota gratuita a mezzanotte UTC. */
function mealToday() {
  const now = Date.now();
  const date = new Date(now);
  return {
    now,
    day: date.toISOString().slice(0, 10),
    resetAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  };
}

/** Valida la foto: JPEG (così la prepara l'app) in data URL, entro il limite di peso. */
export function mealImage(value) {
  if (typeof value !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    mealError('Foto non valida. Scegli di nuovo la foto e riprova.');
  }
  const payload = value.slice('data:image/jpeg;base64,'.length);
  // Ogni JPEG inizia con i byte FF D8 FF, che in base64 diventano "/9j/".
  if (!payload.startsWith('/9j/')) mealError('Foto non valida. Scegli di nuovo la foto e riprova.');
  const bytes = Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  if (bytes > MEAL_MAX_IMAGE_BYTES) mealError('Foto troppo grande per l\'analisi.', 413);
  return value;
}

/** Somma (o sottrae) `amount` al contatore `id` e restituisce il nuovo totale. */
async function mealCount(db, id, amount, resetAt) {
  if (amount > 0) {
    await db
      .prepare('INSERT INTO login_limits(id,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+excluded.attempts')
      .bind(id, amount, resetAt)
      .run();
  } else {
    await db.prepare('UPDATE login_limits SET attempts=MAX(0,attempts+?) WHERE id=?').bind(amount, id).run();
  }
  const row = await db.prepare('SELECT attempts FROM login_limits WHERE id=?').bind(id).first();
  return Number(row?.attempts) || 0;
}

async function mealRead(db, id) {
  const row = await db.prepare('SELECT attempts FROM login_limits WHERE id=?').bind(id).first();
  return Number(row?.attempts) || 0;
}

/** Stato della quota globale: ok, warning (dal 90%) o stopped (la prossima analisi supererebbe il 95%). */
function mealBudgetState(used, allowance, reserve) {
  const percent = Math.min(100, Math.round((used / allowance) * 100));
  if (used + reserve > allowance * MEAL_STOP_AT) {
    return { state: 'stopped', percent, message: 'L\'analisi foto è in pausa fino a domani per non superare la quota gratuita. Inserisci il pasto a mano.' };
  }
  if (used >= allowance * MEAL_WARN_AT) {
    return { state: 'warning', percent, message: `Quota AI giornaliera quasi esaurita (${percent}%). L'analisi foto si fermerà a breve, fino a domani.` };
  }
  return { state: 'ok', percent };
}

const mealNumber = (value, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(max, Math.round(number * 10) / 10) : null;
};

/**
 * Rende affidabile la risposta del modello: scarta voci incomplete, limita gli
 * intervalli e riallinea le kcal ai macronutrienti quando si discostano troppo
 * (4 kcal/g per proteine e carboidrati, 9 kcal/g per i grassi).
 */
export function mealSanitize(raw) {
  let data = raw;
  if (typeof data === 'string') {
    const text = data.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return null;
  const items = [];
  let adjusted = false;
  for (const entry of data.items.slice(0, MEAL_MAX_ITEMS)) {
    const name = typeof entry?.name === 'string' ? entry.name.trim().replace(/\s+/g, ' ').slice(0, 100) : '';
    const grams = mealNumber(entry?.grams, 2000);
    const protein = mealNumber(entry?.protein, 500);
    const carbs = mealNumber(entry?.carbs, 1000);
    const fat = mealNumber(entry?.fat, 500);
    let calories = mealNumber(entry?.kcal, 5000);
    if (!name || !grams || grams < 1 || protein === null || carbs === null || fat === null) continue;
    const fromMacros = Math.round(protein * 4 + carbs * 4 + fat * 9);
    if (calories === null || Math.abs(calories - fromMacros) > Math.max(15, fromMacros * 0.2)) {
      calories = fromMacros;
      adjusted = true;
    }
    const confidence = ['high', 'medium', 'low'].includes(entry?.confidence) ? entry.confidence : 'low';
    items.push({ name, grams, calories, protein, carbs, fat, confidence });
  }
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 200) : '';
  return { isFood: data.is_food !== false && items.length > 0, items, note, adjusted };
}

/** I modelli Workers AI rispondono in `response` oppure nel formato chat `choices[0].message.content`. */
function mealOutput(response) {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return null;
  if ('response' in response) return response.response;
  const content = response.choices?.[0]?.message?.content;
  if (content !== undefined) return content;
  return 'items' in response ? response : null;
}

/** Neuroni realmente consumati, se la risposta riporta i token usati; altrimenti null. */
function mealNeurons(usage, rate) {
  const input = Number(usage?.prompt_tokens);
  const output = Number(usage?.completion_tokens);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0 || input + output === 0) return null;
  return (input * rate.input + output * rate.output) / 1e6;
}

async function mealRun(env, model, image, note) {
  const text = note ? `Foto del pasto. Nota dell'utente: ${note}` : 'Foto del pasto.';
  const request = env.AI.run(model, {
    messages: [
      { role: 'system', content: MEAL_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] },
    ],
    max_tokens: MEAL_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: MEAL_SCHEMA },
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { timeout: true })), MEAL_TIMEOUT_MS);
  });
  try {
    const response = await Promise.race([request, timeout]);
    return { output: mealOutput(response), usage: response?.usage };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Email al proprietario, una sola volta al giorno per livello (avviso al 90%, stop).
 * Usa Resend come gli avvisi dello spazio R2: senza RESEND_API_KEY non invia nulla.
 * Un errore di invio non blocca mai l'analisi.
 */
async function mealNotify(db, env, options, kind, percent, day, resetAt) {
  const to = env.ALERT_EMAIL || options?.ownerEmail;
  if (!env.RESEND_API_KEY || !to) return;
  const claimed = await db
    .prepare('INSERT INTO login_limits(id,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id) DO NOTHING')
    .bind(`ai:notice:${kind}:${day}`, resetAt)
    .run();
  if (!claimed?.meta?.changes) return;
  const stopped = kind === 'stopped';
  const send = (async () => {
    try {
      const response = await (options?.fetchImpl || fetch)('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'GymTrack <onboarding@resend.dev>',
          to: [to],
          subject: stopped ? 'GymTrack: analisi foto in pausa fino a domani' : `GymTrack: quota AI gratuita al ${percent}%`,
          text: [
            stopped
              ? 'L\'analisi delle foto dei pasti è stata fermata per tutti gli utenti, per non superare la quota gratuita giornaliera di Cloudflare Workers AI.'
              : `La quota gratuita giornaliera di Cloudflare Workers AI è stimata al ${percent}%. Al 95% l'analisi foto si ferma per tutti.`,
            '',
            'La quota riparte dopo mezzanotte UTC (l\'1:00 o le 2:00 in Italia). Nel frattempo gli utenti possono inserire i pasti a mano.',
            'Il consumo è una stima prudente: la misura ufficiale è nel pannello Workers AI di Cloudflare.',
          ].join('\n'),
        }),
      });
      if (!response.ok) console.error('Invio email quota AI non riuscito (' + response.status + ').');
    } catch (error) {
      console.error('Invio email quota AI non riuscito:', error?.message || error);
    }
  })();
  if (options?.waitUntil) options.waitUntil(send);
  else await send;
}

/**
 * GET /api/ai/budget: stato della quota AI di oggi (globale e dell'account), senza consumarla.
 * L'app lo usa per mostrare l'avviso al 90% e nascondere l'analisi quando è in pausa.
 */
export async function mealBudgetApi(env, me, db) {
  if (!me) mealError('Accedi per usare l\'analisi foto.', 401);
  if (!env?.AI?.run) return { state: 'unavailable', percent: 0, message: 'Analisi foto non attiva su questo server.' };
  const { day } = mealToday();
  const model = mealModel(env);
  const used = await mealRead(db, `ai:global:${day}`);
  const mine = await mealRead(db, `ai:user:${me.id}:${day}`);
  const limit = mealDailyLimit(env);
  const budget = mealBudgetState(used, mealAllowance(env), mealReserveNeurons(model));
  if (budget.state === 'ok' && mine >= limit) {
    return { state: 'user-limit', percent: budget.percent, message: 'Hai usato tutte le analisi foto di oggi. Inserisci il pasto a mano o riprova domani.', quota: { used: mine, limit } };
  }
  return { ...budget, quota: { used: mine, limit } };
}

/**
 * POST /api/ai/meal-scan con corpo { image: 'data:image/jpeg;base64,…', note?: string }.
 * Restituisce { isFood, items, note, adjusted, quota, budget }; gli errori hanno `status`.
 * `options` (facoltativo): { ownerEmail, waitUntil, fetchImpl } per l'email al proprietario.
 */
export async function mealScanApi(body, env, me, db, options = {}) {
  if (!me) mealError('Accedi per analizzare una foto.', 401);
  if (!env?.AI?.run) mealError('Analisi foto non attiva su questo server.', 503);
  const image = mealImage(body.image);
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
  const model = mealModel(env);
  const rate = mealRate(model);
  const reserve = mealReserveNeurons(model);
  const allowance = mealAllowance(env);
  const limit = mealDailyLimit(env);
  const { now, day, resetAt } = mealToday();
  const userKey = `ai:user:${me.id}:${day}`;
  const globalKey = `ai:global:${day}`;
  await db.prepare('DELETE FROM login_limits WHERE id LIKE ? AND reset_at<?').bind('ai:%', now).run();

  // 1) Limite dell'account.
  const mine = await mealCount(db, userKey, 1, resetAt);
  if (mine > limit) {
    await mealCount(db, userKey, -1, resetAt);
    mealError('Hai usato tutte le analisi foto di oggi. Inserisci il pasto a mano o riprova domani.', 429);
  }
  // 2) Quota globale: si riserva il caso peggiore prima di chiamare il modello; sopra il 95% si ferma per tutti.
  const reserved = await mealCount(db, globalKey, reserve, resetAt);
  if (reserved > allowance * MEAL_STOP_AT) {
    await mealCount(db, globalKey, -reserve, resetAt);
    await mealCount(db, userKey, -1, resetAt);
    const stopped = mealBudgetState(reserved - reserve, allowance, reserve);
    await mealNotify(db, env, options, 'stopped', stopped.percent, day, resetAt);
    mealError(stopped.message || 'L\'analisi foto è in pausa fino a domani. Inserisci il pasto a mano.', 429);
  }

  let result;
  let usage;
  try {
    const run = await mealRun(env, model, image, note);
    usage = run.usage;
    result = mealSanitize(run.output);
  } catch (error) {
    await mealCount(db, userKey, -1, resetAt);
    if (error?.timeout) {
      // Può aver consumato calcolo anche dopo il timeout: la riserva globale resta.
      mealError('L\'analisi sta impiegando troppo tempo. Riprova o inserisci il pasto a mano.', 504);
    }
    await mealCount(db, globalKey, -reserve, resetAt);
    mealError('Analisi foto non disponibile ora. Riprova più tardi o inserisci il pasto a mano.', 503);
  }
  if (!result) {
    // Il modello ha risposto (e consumato calcolo) ma il risultato non è leggibile: all'utente non costa un'analisi.
    await mealCount(db, userKey, -1, resetAt);
    mealError('Non sono riuscito a leggere il risultato. Riprova con una foto più chiara.', 502);
  }

  // 3) Aggiustamento: con i token realmente usati si libera parte della riserva, senza scendere sotto il 30%.
  const actual = mealNeurons(usage, rate);
  const charge = actual === null ? reserve : Math.min(reserve, Math.max(Math.ceil(reserve * 0.3), Math.ceil(actual * 1.2)));
  const total = await mealCount(db, globalKey, charge - reserve, resetAt);
  const budget = mealBudgetState(total, allowance, reserve);
  if (budget.state === 'warning' || budget.state === 'stopped') await mealNotify(db, env, options, budget.state, budget.percent, day, resetAt);
  return { ...result, quota: { used: mine, limit }, budget };
}
