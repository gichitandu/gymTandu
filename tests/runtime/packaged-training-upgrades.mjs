// Validate the actual deployable Worker with disposable SQLite/R2 substitutes.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../../dist/server/index.js';
import {defaultExercises, defaultGroups} from '../../worker/default-catalog.js';
const sql = new DatabaseSync(':memory:'), objects = new Map(), origin = 'https://gymtrack.test';
for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) sql.exec(readFileSync('drizzle/' + file, 'utf8'));
const env = {DB: {
  prepare(query) {let args = []; const statement = {bind(...values) {args = values; return statement;}, async first() {return sql.prepare(query).get(...args);}, async all() {return {results: sql.prepare(query).all(...args)};}, async run() {return {meta: {changes: Number(sql.prepare(query).run(...args).changes)}};}}; return statement;},
  async batch(statements) {sql.exec('BEGIN'); try {const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result;} catch(error) {sql.exec('ROLLBACK'); throw error;}}
}, BUCKET: {async put(key, data) {objects.set(key, data);}, async get(key) {return objects.has(key) ? {text: async () => objects.get(key)} : null;}, async delete(key) {objects.delete(key);}}};
let cookie = '';
const call = (path, body, revision = 0) => worker.fetch(new Request(origin + path, {
  method: body === undefined ? 'GET' : 'POST', headers: {'oai-authenticated-user-id': 'packaged-fixture-owner', 'oai-authenticated-user-email': 'giacomotanduo004@gmail.com', ...(cookie ? {Cookie: cookie} : {}), ...(body === undefined ? {} : {Origin: origin, 'Content-Type': 'application/json', 'If-Match': String(revision)})},
  ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)})
}), env, {waitUntil() {}});
try {
  assert.equal((await call('/api/design/studio')).status, 401);
  const setup = await call('/api/auth/setup', {password: 'packaged-fixture-password'}); assert.equal(setup.status, 200); cookie = setup.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/auth/me')).status, 200); assert.equal((await call('/api/design/studio')).status, 200);
  console.log('PASS packaged Worker: login and Super Admin Design Studio session gates');
  const data = Object.fromEntries(['plans','days','planExercises','workouts','workoutExercises','sets','meals','scheduledWorkouts','measurements','exercisePreferences','workoutUi','wellnessLogs'].map(name => [name, []]));
  Object.assign(data, {profiles: [{id: 'local', name: 'Atleta', role: 'SuperAdmin'}], roles: [{id: 'superadmin', name: 'SuperAdmin', permissions: ['*']}, {id: 'admin', name: 'Admin', permissions: ['catalog:write']}, {id: 'user', name: 'User', permissions: ['plans:own','workouts:own','stats:own']}], exercises: structuredClone(defaultExercises), muscleGroups: structuredClone(defaultGroups), settings: [{id: 'local', theme: 'dark', unit: 'kg', prefill: false, reusePreviousWeek: false}]});
  const backup = {app: 'GymTrack', schemaVersion: 11, exportedAt: new Date().toISOString(), data}, text = JSON.stringify(backup);
  const saved = await call('/api/archive?scope=account', text); assert.equal(saved.status, 200, await saved.text());
  let loaded = await (await call('/api/archive?scope=account')).json(); assert.equal(loaded.backup, text); assert.equal(loaded.revision, 1);
  backup.data.settings[0].reusePreviousWeek = 'false'; assert.equal((await call('/api/archive?scope=account', backup, 1)).status, 400);
  loaded = await (await call('/api/archive?scope=account')).json(); assert.equal(loaded.backup, text); assert.equal(loaded.revision, 1);
  console.log('PASS packaged Worker: new weekly preference survives account backup and malformed writes leave it intact');
  backup.data.settings[0].reusePreviousWeek = false;
  backup.data.workouts.push({id:'protected',userId:'local',planId:'p',dayId:'d',planName:'Piano',dayName:'Seduta conclusa',date:'2026-11-03',startedAt:'2026-11-03T12:00:00Z',endedAt:'2026-11-03T13:00:00Z',duration:60,notes:'',status:'completed'});
  backup.data.workoutExercises.push({id:'protected-ex',workoutId:'protected',exerciseId:'exercise-0',name:'Panca',loadMode:'external',order:0,rest:90,notes:''});
  backup.data.sets.push({id:'protected-set',workoutExerciseId:'protected-ex',number:1,weight:72.5,reps:9,completed:true});
  assert.equal((await call('/api/archive?scope=account', backup, 1)).status, 200);
  const stale=structuredClone(backup);stale.data.sets[0].completed=false;
  const rejected=await call('/api/archive?scope=account',stale,2);assert.equal(rejected.status,409);assert.equal((await rejected.json()).code,'workout_history_conflict');
  assert.equal((await call('/api/archive?scope=account&checkpoint=before-update',backup,2)).status,200);
  const protectedHistory=await (await call('/api/archive?scope=account&history=1')).json();assert(protectedHistory.versions.some(row=>row.reason==='completed-workout'));assert(protectedHistory.versions.some(row=>row.reason==='before-update'));
  console.log('PASS packaged Worker: completed progress rejects stale copies and protected update/history checkpoints remain available');
  const html = await (await call('/')).text(), manifest = await (await call('/manifest.webmanifest')).json();
  assert(html.includes('rel="apple-touch-icon" sizes="180x180" href="data:image/png;base64,'));
  for (const [index, size] of [192, 512].entries()) assert(Buffer.from(manifest.icons[index].src.split(',')[1], 'base64').equals(readFileSync('public/icons/gt-modern-' + size + '.png')));
  assert.equal((await (await call('/app-build.json')).json()).buildId, JSON.parse(readFileSync('dist/gymtrack/browser/app-build.json', 'utf8')).buildId);
  console.log('PASS packaged Worker: embedded GT icons, manifest, and exact deployed build identity');
} finally {sql.close();}
