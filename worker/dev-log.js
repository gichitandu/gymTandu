// Registro sviluppo: errori registrati in automatico, bug, migliorie e idee del Super Admin.
// La cronologia (chi ha corretto cosa, con quale commit) è la memoria che Claude legge
// prima di lavorare. Mai parte degli archivi personali. Tutti i nomi hanno il prefisso
// devLog perché il pacchetto di deploy concatena i moduli del Worker in un solo file.
const DEV_LOG_KINDS = ['error', 'bug', 'improvement', 'idea'];
const DEV_LOG_STATUSES = ['open', 'in_progress', 'fixed', 'resolved', 'dismissed'];
const DEV_LOG_PRIORITIES = ['low', 'medium', 'high'];
const DEV_LOG_AUTO_SOURCES = { client: 'errore dell’app', feedback: 'messaggio di errore mostrato', server: 'errore del server' };
const DEV_LOG_MAX_OCCURRENCES = 20;
const DEV_LOG_MAX_OPEN_AUTO = 500;
const DEV_LOG_MAX_REPORTS = 20;
// Prova minima di una correzione: la nuova build aperta almeno due volte e, se la voce
// riguarda una pagina, quella pagina visitata almeno due volte, senza che l'errore ricompaia.
export const DEV_LOG_MIN_APP_STARTS = 2;
export const DEV_LOG_MIN_ROUTE_VISITS = 2;
const devLogEncoder = new TextEncoder();

function devLogReply(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function devLogFail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
async function devLogHash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', devLogEncoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Toglie dal testo ciò che non deve mai finire nel registro: email, token, id lunghi, immagini e valori nelle query. */
export function devLogScrub(value, limit) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[dati]')
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(bearer|token|password|secret|cookie|authorization|setupcode)(\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=[nascosto]')
    .replace(/([?&][^=\s&#]+=)[^&\s#]+/g, '$1[x]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[id]')
    .slice(0, limit);
}
/** Stesso errore = stessa voce. Il messaggio senza numeri resta stabile tra una build e l'altra (lo stack minificato no). */
export function devLogNormalize(message) {
  return String(message || '').toLowerCase().replace(/\[id\]|\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
}
function devLogRoute(value) {
  return typeof value === 'string' && /^\/[A-Za-z0-9:/_.*-]{0,99}$/.test(value) ? value : null;
}
function devLogBuild(value) {
  return typeof value === 'string' && /^(?:[a-f0-9]{64}|development)$/.test(value) ? value : null;
}
export function devLogDevice(request, standalone = false) {
  const agent = request.headers.get('user-agent') || '';
  const device = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android' : /Macintosh/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : 'Altro';
  return standalone ? device + ' · app installata' : device;
}
async function devLogBody(request, limit) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) devLogFail('Formato non supportato.', 415);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > limit) devLogFail('Richiesta troppo grande.', 413);
  const text = await request.text();
  if (text.length > limit) devLogFail('Richiesta troppo grande.', 413);
  try { const body = JSON.parse(text); if (body && typeof body === 'object' && !Array.isArray(body)) return body; } catch {}
  devLogFail('Richiesta non valida.');
}
function devLogText(value, max, label, required = false) {
  if (value === undefined || value === null) { if (required) devLogFail(label + ' mancante.'); return ''; }
  if (typeof value !== 'string') devLogFail(label + ' non valido.');
  const text = value.trim();
  if (required && !text) devLogFail(label + ' mancante.');
  if (text.length > max) devLogFail(label + ' troppo lungo (massimo ' + max + ' caratteri).');
  return text;
}

async function devLogEvent(db, itemId, actor, kind, note, now) {
  await db.prepare('INSERT INTO dev_item_events(item_id,at,actor,kind,note) VALUES(?,?,?,?,?)').bind(itemId, now, actor, kind, note || '').run();
}
async function devLogItem(db, id) {
  return db.prepare('SELECT * FROM dev_items WHERE id=?').bind(id).first();
}

/** Registra l'uso dell'app per build e pagina: «*» conta le aperture dell'app. */
export async function devLogUsage(db, build, routes, appStarts, now) {
  const entries = [['*', appStarts]];
  if (routes && typeof routes === 'object' && !Array.isArray(routes)) {
    for (const [route, visits] of Object.entries(routes).slice(0, 40)) {
      if (devLogRoute(route) && Number.isSafeInteger(visits) && visits > 0 && visits <= 1000) entries.push([route, visits]);
    }
  }
  for (const [route, visits] of entries) {
    await db.prepare('INSERT INTO dev_build_usage(build,route,visits,first_seen,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(build,route) DO UPDATE SET visits=dev_build_usage.visits+excluded.visits,last_seen=excluded.last_seen').bind(build, route, visits, now, now).run();
  }
}
async function devLogBuildFirstSeen(db, build) {
  const row = await db.prepare("SELECT first_seen FROM dev_build_usage WHERE build=? AND route='*'").bind(build).first();
  return row ? row.first_seen : null;
}

/** Salva un errore automatico: una voce per errore, con contatore e ultimi casi. Riapre una correzione smentita. */
export async function devLogRecord(db, report, now = Date.now()) {
  const source = Object.hasOwn(DEV_LOG_AUTO_SOURCES, report.source) ? report.source : null;
  const build = devLogBuild(report.build);
  if (!source || !build) return null;
  const message = devLogScrub(report.message, 300).trim() || 'Errore senza messaggio';
  const stack = devLogScrub(report.stack, 2000) || null;
  const route = devLogRoute(report.route);
  const device = typeof report.device === 'string' ? report.device.slice(0, 40) : null;
  const fingerprint = await devLogHash(source + '|' + (route || '') + '|' + devLogNormalize(message));
  // Una build mai vista prima (per esempio quella del Worker appena pubblicato) inizia da adesso.
  if (await devLogBuildFirstSeen(db, build) === null) await devLogUsage(db, build, null, 0, now);
  let item = await db.prepare('SELECT * FROM dev_items WHERE fingerprint=?').bind(fingerprint).first();
  if (!item) {
    const open = await db.prepare("SELECT COUNT(*) AS n FROM dev_items WHERE source='auto' AND status IN ('open','in_progress')").first();
    if ((open?.n || 0) >= DEV_LOG_MAX_OPEN_AUTO) return null;
    const priority = source === 'server' ? 'high' : source === 'client' ? 'medium' : 'low';
    const title = (route ? route + ' · ' : '') + message;
    const inserted = await db.prepare("INSERT INTO dev_items(kind,source,title,details,route,status,priority,regression,fingerprint,occurrences,first_seen,last_seen,last_build,created_at,updated_at) VALUES('error','auto',?,?,?,'open',?,0,?,1,?,?,?,?,?) ON CONFLICT(fingerprint) DO NOTHING")
      .bind(title.slice(0, 120), 'Origine: ' + DEV_LOG_AUTO_SOURCES[source] + '.', route, priority, fingerprint, now, now, build, now, now).run();
    if (inserted.meta.changes) {
      item = await db.prepare('SELECT * FROM dev_items WHERE fingerprint=?').bind(fingerprint).first();
      await devLogEvent(db, item.id, 'system', 'created', 'Registrato in automatico (' + DEV_LOG_AUTO_SOURCES[source] + ').', now);
    } else {
      item = await db.prepare('SELECT * FROM dev_items WHERE fingerprint=?').bind(fingerprint).first();
      if (!item) return null;
      await devLogRecurrence(db, item, build, now);
    }
  } else await devLogRecurrence(db, item, build, now);
  await db.prepare('INSERT INTO dev_occurrences(item_id,at,build,route,device,message,stack) VALUES(?,?,?,?,?,?,?)').bind(item.id, now, build, route, device, message, stack).run();
  await db.prepare('DELETE FROM dev_occurrences WHERE item_id=? AND id NOT IN (SELECT id FROM dev_occurrences WHERE item_id=? ORDER BY id DESC LIMIT ?)').bind(item.id, item.id, DEV_LOG_MAX_OCCURRENCES).run();
  return item.id;
}
async function devLogRecurrence(db, item, build, now) {
  const since = item.status === 'fixed' ? item.fixed_at : item.status === 'resolved' ? (item.fixed_at || item.resolved_at) : null;
  const firstSeen = since === null ? null : await devLogBuildFirstSeen(db, build);
  // Solo un caso da una build pubblicata dopo la correzione la smentisce: le build vecchie
  // ancora aperte su un dispositivo possono ripetere l'errore già corretto.
  if (since !== null && firstSeen !== null && firstSeen > since) {
    await db.prepare("UPDATE dev_items SET status='open',regression=1,resolved_at=NULL,occurrences=occurrences+1,last_seen=?,last_build=?,updated_at=? WHERE id=?").bind(now, build, now, item.id).run();
    await devLogEvent(db, item.id, 'system', 'reopened', 'Ricomparso nella build ' + build.slice(0, 8) + ', pubblicata dopo la correzione: la soluzione precedente non è bastata.', now);
  } else {
    await db.prepare('UPDATE dev_items SET occurrences=occurrences+1,last_seen=?,last_build=?,updated_at=? WHERE id=?').bind(now, build, now, item.id).run();
  }
}

/** Una correzione è provata quando una build pubblicata dopo è stata usata abbastanza, senza ricadute. */
export async function devLogVerification(db, item) {
  if (item.status !== 'fixed' || !item.fixed_at) return null;
  const builds = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(visits),0) AS starts FROM dev_build_usage WHERE route='*' AND first_seen>?").bind(item.fixed_at).first();
  const pageRoute = item.route && !item.route.startsWith('/api/') ? item.route : null;
  const visits = pageRoute ? (await db.prepare("SELECT COALESCE(SUM(u.visits),0) AS n FROM dev_build_usage u JOIN dev_build_usage b ON b.build=u.build AND b.route='*' WHERE b.first_seen>? AND u.route=?").bind(item.fixed_at, pageRoute).first())?.n || 0 : null;
  const newBuilds = builds?.n || 0, appStarts = builds?.starts || 0;
  let reason;
  if (!newBuilds) reason = 'Nessuna build pubblicata dopo la correzione è ancora stata aperta.';
  else if (appStarts < DEV_LOG_MIN_APP_STARTS) reason = 'Nuova build aperta ' + appStarts + ' volta/e: servono almeno ' + DEV_LOG_MIN_APP_STARTS + ' aperture.';
  else if (pageRoute && visits < DEV_LOG_MIN_ROUTE_VISITS) reason = 'La pagina ' + pageRoute + ' è stata aperta ' + visits + ' volta/e con la nuova build: ne servono almeno ' + DEV_LOG_MIN_ROUTE_VISITS + '.';
  else reason = 'Nuova build usata (' + appStarts + ' aperture' + (pageRoute ? ', ' + visits + ' visite a ' + pageRoute : '') + ') senza che il problema ricomparisse.';
  const ready = newBuilds > 0 && appStarts >= DEV_LOG_MIN_APP_STARTS && (!pageRoute || visits >= DEV_LOG_MIN_ROUTE_VISITS);
  return { ready, newBuilds, appStarts, routeVisits: visits, reason };
}

function devLogPublic(row) {
  return {
    id: row.id, code: 'GT-' + row.id, kind: row.kind, source: row.source, title: row.title, details: row.details, route: row.route,
    status: row.status, priority: row.priority, regression: !!row.regression, occurrences: row.occurrences, firstSeen: row.first_seen,
    lastSeen: row.last_seen, lastBuild: row.last_build, fixedAt: row.fixed_at, fixSummary: row.fix_summary, fixCommit: row.fix_commit,
    resolvedAt: row.resolved_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
async function devLogList(db, withHistory) {
  const rows = (await db.prepare("SELECT * FROM dev_items ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'fixed' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC LIMIT 500").all()).results;
  const items = [];
  for (const row of rows) {
    const item = devLogPublic(row);
    if (row.status === 'fixed') item.verification = await devLogVerification(db, row);
    if (withHistory) item.events = (await db.prepare('SELECT at,actor,kind,note FROM dev_item_events WHERE item_id=? ORDER BY id').bind(row.id).all()).results;
    items.push(item);
  }
  const counts = Object.fromEntries(DEV_LOG_STATUSES.map(status => [status, rows.filter(row => row.status === status).length]));
  return { items, counts };
}
async function devLogDetail(db, id) {
  const row = await devLogItem(db, id);
  if (!row) devLogFail('Voce non trovata.', 404);
  const item = devLogPublic(row);
  item.verification = await devLogVerification(db, row);
  item.events = (await db.prepare('SELECT at,actor,kind,note FROM dev_item_events WHERE item_id=? ORDER BY id').bind(id).all()).results;
  item.recent = (await db.prepare('SELECT at,build,route,device,message,stack FROM dev_occurrences WHERE item_id=? ORDER BY id DESC').bind(id).all()).results;
  return item;
}
async function devLogCreate(db, body, actor, now) {
  const kind = DEV_LOG_KINDS.includes(body.kind) ? body.kind : devLogFail('Tipo non valido.');
  const priority = body.priority === undefined ? 'medium' : DEV_LOG_PRIORITIES.includes(body.priority) ? body.priority : devLogFail('Priorità non valida.');
  const title = devLogText(body.title, 120, 'Titolo', true), details = devLogText(body.details, 4000, 'Descrizione');
  const route = body.route === undefined || body.route === null || body.route === '' ? null : devLogRoute(body.route) || devLogFail('Pagina non valida.');
  const source = actor === 'claude' ? 'claude' : 'manual';
  const result = await db.prepare("INSERT INTO dev_items(kind,source,title,details,route,status,priority,regression,occurrences,created_at,updated_at) VALUES(?,?,?,?,?,'open',?,0,0,?,?)").bind(kind, source, title, details, route, priority, now, now).run();
  const id = result.meta.last_row_id;
  await devLogEvent(db, id, actor, 'created', actor === 'claude' ? 'Aggiunto da Claude.' : 'Aggiunto da te.', now);
  return devLogDetail(db, id);
}

/** Cambi di stato. Claude non scarta voci e chiude come risolto solo ciò che la verifica conferma. */
async function devLogChange(db, id, body, actor, now) {
  const item = await devLogItem(db, id);
  if (!item) devLogFail('Voce non trovata.', 404);
  const action = body.action, note = devLogText(body.note, 2000, 'Nota');
  if (action === 'note') {
    if (!note) devLogFail('Scrivi una nota.');
    await devLogEvent(db, id, actor, 'note', note, now);
  } else if (action === 'start') {
    if (!['open', 'in_progress'].includes(item.status)) devLogFail('Si può iniziare solo una voce aperta.', 409);
    await db.prepare("UPDATE dev_items SET status='in_progress',updated_at=? WHERE id=?").bind(now, id).run();
    await devLogEvent(db, id, actor, 'started', note || 'Lavoro iniziato.', now);
  } else if (action === 'fixed') {
    if (['resolved', 'dismissed'].includes(item.status)) devLogFail('Riapri la voce prima di segnare una nuova correzione.', 409);
    const summary = devLogText(body.summary, 2000, 'Riassunto della correzione', true);
    const commit = body.commit === undefined || body.commit === '' ? null : typeof body.commit === 'string' && /^[0-9a-f]{7,40}$/.test(body.commit) ? body.commit : devLogFail('Commit non valido.');
    const tests = devLogText(body.tests, 1000, 'Elenco test');
    await db.prepare("UPDATE dev_items SET status='fixed',fixed_at=?,fix_summary=?,fix_commit=?,resolved_at=NULL,updated_at=? WHERE id=?").bind(now, summary, commit, now, id).run();
    await devLogEvent(db, id, actor, 'fixed', summary + (commit ? '\nCommit: ' + commit : '') + (tests ? '\nVerifiche: ' + tests : ''), now);
  } else if (action === 'resolve') {
    if (item.status === 'resolved') devLogFail('Voce già risolta.', 409);
    let evidence = note;
    if (actor === 'claude') {
      const check = await devLogVerification(db, item);
      if (!check) devLogFail('Claude può chiudere solo una voce «da verificare» con una correzione registrata.', 409);
      if (!check.ready) devLogFail('Non ancora verificabile: ' + check.reason, 409);
      evidence = check.reason + (note ? '\n' + note : '');
    }
    await db.prepare("UPDATE dev_items SET status='resolved',resolved_at=?,updated_at=? WHERE id=?").bind(now, now, id).run();
    await devLogEvent(db, id, actor, 'resolved', evidence || 'Confermato risolto.', now);
  } else if (action === 'reopen') {
    if (!['fixed', 'resolved', 'dismissed'].includes(item.status)) devLogFail('La voce è già aperta.', 409);
    await db.prepare("UPDATE dev_items SET status='open',resolved_at=NULL,updated_at=? WHERE id=?").bind(now, id).run();
    await devLogEvent(db, id, actor, 'reopened', note || 'Riaperto.', now);
  } else if (action === 'dismiss' && actor === 'user') {
    await db.prepare("UPDATE dev_items SET status='dismissed',updated_at=? WHERE id=?").bind(now, id).run();
    await devLogEvent(db, id, actor, 'dismissed', note || 'Scartato: gli stessi errori continuano a essere contati ma non riaprono la voce.', now);
  } else if (action === 'update' && actor === 'user') {
    const title = body.title === undefined ? item.title : devLogText(body.title, 120, 'Titolo', true);
    const details = body.details === undefined ? item.details : devLogText(body.details, 4000, 'Descrizione');
    const priority = body.priority === undefined ? item.priority : DEV_LOG_PRIORITIES.includes(body.priority) ? body.priority : devLogFail('Priorità non valida.');
    await db.prepare('UPDATE dev_items SET title=?,details=?,priority=?,updated_at=? WHERE id=?').bind(title, details, priority, now, id).run();
    if (priority !== item.priority) await devLogEvent(db, id, actor, 'priority', 'Priorità: ' + priority + '.', now);
  } else devLogFail('Operazione non valida.');
  return devLogDetail(db, id);
}
function devLogItemId(path, prefix) {
  const raw = path.slice(prefix.length).replace(/^GT-/i, '');
  return /^\d{1,9}$/.test(raw) ? Number(raw) : devLogFail('Voce non trovata.', 404);
}

/** API del Super Admin: errori automatici dall'app, elenco e gestione delle voci. */
export async function devLogApi(request, env, user, { build } = {}) {
  try {
    const db = env.DB, path = new URL(request.url).pathname, now = Date.now();
    if (!user) devLogFail('Accedi al tuo account.', 401);
    if (user.role !== 'SuperAdmin') devLogFail('Registro riservato al Super Admin.', 403);
    if (path === '/api/dev-log/report' && request.method === 'POST') {
      const body = await devLogBody(request, 65536), usage = body.usage;
      const reportBuild = devLogBuild(usage?.build);
      if (!reportBuild) devLogFail('Build non valida.');
      const appStarts = Number.isSafeInteger(usage.appStarts) && usage.appStarts >= 0 && usage.appStarts <= 100 ? usage.appStarts : 0;
      await devLogUsage(db, reportBuild, usage.routes, appStarts, now);
      const device = devLogDevice(request, usage.standalone === true);
      let recorded = 0;
      for (const report of Array.isArray(body.reports) ? body.reports.slice(0, DEV_LOG_MAX_REPORTS) : []) {
        if (!report || typeof report !== 'object' || !['client', 'feedback'].includes(report.source)) continue;
        if (await devLogRecord(db, { ...report, build: reportBuild, device }, now)) recorded++;
      }
      return devLogReply({ recorded });
    }
    if (path === '/api/dev-log/items') {
      if (request.method === 'GET') return devLogReply({ ...(await devLogList(db, false)), build: build || null });
      if (request.method === 'POST') return devLogReply({ item: await devLogCreate(db, await devLogBody(request, 16384), 'user', now) }, 201);
    }
    if (path.startsWith('/api/dev-log/items/')) {
      const id = devLogItemId(path, '/api/dev-log/items/');
      if (request.method === 'GET') return devLogReply({ item: await devLogDetail(db, id) });
      if (request.method === 'POST') return devLogReply({ item: await devLogChange(db, id, await devLogBody(request, 16384), 'user', now) });
    }
    devLogFail('Operazione non trovata.', 404);
  } catch (error) {
    if (error.status) return devLogReply({ error: error.message }, error.status);
    throw error;
  }
}

/** API per Claude: autorizzata solo dal segreto DEVLOG_TOKEN, non apre archivi né account. */
export async function devLogAgentApi(request, env, { build, limit } = {}) {
  try {
    const db = env.DB, path = new URL(request.url).pathname, now = Date.now();
    const secret = String(env.DEVLOG_TOKEN || '');
    if (secret.length < 24) devLogFail('Registro per Claude non configurato: imposta il segreto DEVLOG_TOKEN (almeno 24 caratteri).', 503);
    const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!given || await devLogHash(given) !== await devLogHash(secret)) {
      if (limit) await limit();
      devLogFail('Token del registro non valido.', 403);
    }
    if (path === '/api/dev-log/agent/items') {
      if (request.method === 'GET') return devLogReply({ ...(await devLogList(db, true)), build: build || null, rules: { minAppStarts: DEV_LOG_MIN_APP_STARTS, minRouteVisits: DEV_LOG_MIN_ROUTE_VISITS } });
      if (request.method === 'POST') return devLogReply({ item: await devLogCreate(db, await devLogBody(request, 16384), 'claude', now) }, 201);
    }
    if (path.startsWith('/api/dev-log/agent/items/')) {
      const id = devLogItemId(path, '/api/dev-log/agent/items/');
      if (request.method === 'GET') return devLogReply({ item: await devLogDetail(db, id) });
      if (request.method === 'POST') return devLogReply({ item: await devLogChange(db, id, await devLogBody(request, 16384), 'claude', now) });
    }
    devLogFail('Operazione non trovata.', 404);
  } catch (error) {
    if (error.status) return devLogReply({ error: error.message }, error.status);
    throw error;
  }
}

/** Errore inatteso del Worker durante una richiesta del Super Admin. Non deve mai far fallire la risposta. */
export async function devLogServerError(env, error, request, build) {
  try {
    if (!env?.DB) return;
    await devLogRecord(env.DB, { source: 'server', message: error?.message || String(error), stack: error?.stack, route: new URL(request.url).pathname, build, device: devLogDevice(request) });
  } catch (failure) {
    console.error('Registro sviluppo non aggiornato:', failure?.message || failure);
  }
}
