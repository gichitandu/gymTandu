// GT Hub nel Worker distribuito: accesso solo Super Admin, revisioni e conflitti, con D1/R2 sostitutivi.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../../dist/server/index.js';
const sql = new DatabaseSync(':memory:'), objects = new Map(), origin = 'https://gymtrack.test';
for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
// Il primo accesso è riservato al proprietario configurato nel Worker.
const owner = readFileSync('worker/index.js', 'utf8').match(/const OWNER = '([^']+)'/)[1];
let tag = 0;
const stored = key => { const o = objects.get(key); return o && {key, etag: o.etag, customMetadata: o.customMetadata, text: async () => o.data}; };
const env = {DB: {
  prepare(query) {let args = []; const statement = {bind(...values) {args = values; return statement;}, async first() {return sql.prepare(query).get(...args);}, async all() {return {results: sql.prepare(query).all(...args)};}, async run() {return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}}; return statement;},
  async batch(statements) {sql.exec('BEGIN'); try {const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result;} catch(error) {sql.exec('ROLLBACK'); throw error;}}
}, BUCKET: {
  async put(key, data, options = {}) {
    const current = objects.get(key);
    if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
    objects.set(key, {data: typeof data === 'string' ? data : String(data), etag: 'e' + (++tag), customMetadata: options.customMetadata ?? {}}); return {key};
  },
  async get(key) {return stored(key) ?? null;}, async head(key) {return stored(key) ?? null;},
  async delete(key) {objects.delete(key);}, async list({prefix = ''} = {}) {return {objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({key}))};},
}};
let cookie = '';
const call = (path, method = 'GET', body) => worker.fetch(new Request(origin + path, {
  method, headers: {'oai-authenticated-user-id': 'packaged-hub-owner', 'oai-authenticated-user-email': owner, ...(cookie ? {Cookie: cookie} : {}), ...(body === undefined ? {} : {Origin: origin, 'Content-Type': 'application/json'})},
  ...(body === undefined ? {} : {body: JSON.stringify(body)}),
}), env, {waitUntil() {}});
const doc = title => ({version: 1, events: [{id: 'ev1', updatedAt: 1, kind: 'impegno', title, notes: '', date: '2030-01-10', time: '09:00', repeat: 'none', notify: true, notifyOffsets: [30], showInCalendar: false, color: 'blue'}], notes: [], transactions: [], imports: [], rules: [], plans: [], people: [], groups: [], expenses: [], settlements: [], prefs: []});
try {
  assert.equal((await call('/api/hub')).status, 401);
  const setup = await call('/api/auth/setup', 'POST', {password: 'packaged-hub-password'}); assert.equal(setup.status, 200); cookie = setup.headers.get('set-cookie').split(';')[0];
  let read = await call('/api/hub'); assert.equal(read.status, 200); assert.deepEqual(await read.json(), {revision: 0, updatedAt: null, data: null});
  const first = await call('/api/hub', 'PUT', {baseRevision: 0, data: doc('Dentista')}); assert.equal(first.status, 200, await first.clone().text()); assert.equal((await first.json()).revision, 1);
  const stale = await call('/api/hub', 'PUT', {baseRevision: 0, data: doc('Copia vecchia')}); assert.equal(stale.status, 409); assert.equal((await stale.json()).revision, 1);
  read = await (await call('/api/hub')).json(); assert.equal(read.revision, 1); assert.equal(read.data.events[0].title, 'Dentista');
  assert.equal((await call('/api/hub', 'PUT', {baseRevision: 1, data: {...doc('x'), events: [{id: 'bad'}]}})).status, 400);
  assert.equal((await call('/api/hub/due')).status, 200);
  const vw = await call('/api/hub/vw'); assert.equal(vw.status, 200); assert.deepEqual(await vw.json(), {configured: false, state: 'off', message: '', checkedAt: null, updatedAt: null, capturedAt: null, values: null, vehicle: null});
  assert.equal((await call('/api/hub/vw/sync', 'POST', {})).status, 200);
  console.log('PASS packaged Worker: GT Hub revisions, stale-copy conflict and record validation, GT Garage Volkswagen status');
  // Lettura foto dei pasti: spenta senza Workers AI, poi con un modello sostitutivo e il blocco prima del limite gratuito.
  assert.deepEqual((({available, blocked}) => ({available, blocked}))(await (await call('/api/meal-scan')).json()), {available: false, blocked: false});
  let aiCalls = 0;
  env.AI = {async run(model) {aiCalls++; assert.ok(model.startsWith('@cf/')); return {choices: [{message: {content: '{"kind":"plate","dish":"Riso","items":[{"name":"Riso","grams":180,"calories":234,"protein":4.9,"carbs":50.8,"fat":0.5}]}'}}], usage: {prompt_tokens: 1500, completion_tokens: 200}};}};
  const photo = {image: 'data:image/jpeg;base64,AAAA'};
  const scanned = await call('/api/meal-scan', 'POST', photo); assert.equal(scanned.status, 200, await scanned.clone().text());
  const meal = await scanned.json(); assert.equal(meal.items[0].name, 'Riso'); assert.equal(meal.status.used, 23); assert.equal(meal.status.cap, 9500);
  // Coach con l'AI: stesso modello e stesso limite giornaliero di Neuron della lettura dei pasti.
  let coachCalls = 0;
  const mealRun = env.AI.run;
  env.AI.run = async (model, input) => {
    if (!String(input?.messages?.[0]?.content).startsWith('Sei il Coach Ombra')) return mealRun(model, input);
    coachCalls++; assert.ok(model.startsWith('@cf/'));
    return {choices: [{message: {content: '{"headline":"Tieni il carico","advice":"Ripeti 80 kg con tecnica pulita.","cues":["Scapole addotte"],"stance":"agree","answer":""}'}}], usage: {prompt_tokens: 1200, completion_tokens: 220}};
  };
  const coachBody = {kind: 'set', context: {esercizio: 'Panca piana', proposta: {azione: 'Mantieni il carico', carico: 80, ripetizioni: 8}}, question: ''};
  const coached = await call('/api/coach-ai', 'POST', coachBody); assert.equal(coached.status, 200, await coached.clone().text());
  const advice = await coached.json(); assert.equal(advice.provider, 'cloudflare'); assert.equal(advice.cues[0], 'Scapole addotte'); assert.equal(advice.remaining, 19);
  assert.equal((await (await call('/api/meal-scan')).json()).used, 44);
  sql.prepare('UPDATE ai_usage SET neurons = 9401 WHERE day NOT LIKE ?').run('%-%-%-%');
  const waiting = await call('/api/meal-scan', 'POST', photo); assert.equal(waiting.status, 429); assert.equal((await waiting.json()).code, 'AI_LIMIT');
  const coachWaiting = await call('/api/coach-ai', 'POST', coachBody); assert.equal(coachWaiting.status, 429); assert.equal((await coachWaiting.json()).code, 'AI_LIMIT');
  assert.equal(aiCalls, 1); assert.equal(coachCalls, 1); assert.equal((await (await call('/api/meal-scan')).json()).blocked, true);
  assert.equal((await (await call('/api/coach-ai')).json()).remaining, 19);
  delete env.AI;
  console.log('PASS packaged Worker: meal photo reading and Coach AI stop before the free Workers AI allocation');
  sql.prepare("UPDATE users SET role = 'Admin'").run();
  const denied = await call('/api/hub'); assert.equal(denied.status, 403);
  assert.equal((await call('/api/hub/vw')).status, 403);
  console.log('PASS packaged Worker: GT Hub reserved to Super Admin on the server');
} finally {sql.close();}
