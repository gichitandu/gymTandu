// Web Push carries no payload: the installed app displays a fixed, local message.
// No exercise names, account details or photos are sent to Apple/Google/Mozilla.
const pushEncoder = new TextEncoder();
const pushFormatters = new Map();
let pushSigningSource = "",
  pushSigningKey;
export function pushBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export async function pushHash(text) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", pushEncoder.encode(text)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function pushFail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function pushJson(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function validatePushEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    pushFail("Indirizzo notifiche non valido.");
  }
  const h = url.hostname;
  const allowed =
    h === "web.push.apple.com" ||
    h.endsWith(".push.apple.com") ||
    h === "fcm.googleapis.com" ||
    h === "updates.push.services.mozilla.com" ||
    h.endsWith(".push.services.mozilla.com") ||
    h.endsWith(".notify.windows.com");
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    url.protocol !== "https:" ||
    !allowed ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    pushFail("Servizio notifiche non supportato.");
  return url.href;
}
export function pushPreferences(value = {}) {
  const time = value.time ?? "08:30",
    timezone = value.timezone ?? "Europe/Rome",
    everyDay = value.everyDay ?? false;
  if (
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    typeof timezone !== "string" ||
    timezone.length > 80 ||
    typeof everyDay !== "boolean"
  )
    pushFail("Controlla orario e fuso orario.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
  } catch {
    pushFail("Fuso orario non valido.");
  }
  return { time, timezone, everyDay };
}
function pushParts(at, timezone) {
  let f = pushFormatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    if (pushFormatters.size > 50) pushFormatters.clear();
    pushFormatters.set(timezone, f);
  }
  return Object.fromEntries(
    f
      .formatToParts(at)
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, x.value]),
  );
}
export function pushLocalDay(at, timezone) {
  const p = pushParts(at, timezone);
  return p.year + "-" + p.month + "-" + p.day;
}
function pushWallUTC(p) {
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
export function nextPushTime(now, time, timezone, lastDay = "") {
  const day = pushLocalDay(now, timezone);
  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(day + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + offset);
    const targetDay = d.toISOString().slice(0, 10);
    if (targetDay === lastDay) continue;
    const wall = Date.parse(targetDay + "T" + time + ":00Z"),
      offsets = new Set(
        [-86400000, 0, 86400000].map((delta) => {
          const at = wall + delta;
          return pushWallUTC(pushParts(at, timezone)) - at;
        }),
      );
    const candidates = [...offsets]
      .map((zoneOffset) => wall - zoneOffset)
      .map((at) => ({ at, parts: pushParts(at, timezone) }))
      .filter((x) => x.at > now && pushLocalDay(x.at, timezone) === targetDay);
    const exact = candidates
      .filter((x) => x.parts.hour + ":" + x.parts.minute === time)
      .sort((a, b) => a.at - b.at);
    if (exact.length) return { at: exact[0].at, day: targetDay };
    // A nonexistent local time during spring DST moves forward by the DST gap.
    const later = candidates
      .filter((x) => x.parts.hour + ":" + x.parts.minute > time)
      .sort(
        (a, b) =>
          (a.parts.hour + a.parts.minute).localeCompare(
            b.parts.hour + b.parts.minute,
          ) || a.at - b.at,
      );
    if (later.length) return { at: later[0].at, day: targetDay };
  }
  throw Error("Unable to schedule reminder");
}
export function pushPublicKey(env) {
  try {
    const j = JSON.parse(env.PUSH_VAPID_PRIVATE_JWK || "null");
    if (
      j?.kty !== "EC" ||
      j.crv !== "P-256" ||
      !j.d ||
      typeof j.x !== "string" ||
      typeof j.y !== "string"
    )
      return null;
    return pushBase64(
      Uint8Array.from([
        4,
        ...Uint8Array.from(
          atob(j.x.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
        ...Uint8Array.from(
          atob(j.y.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ]),
    );
  } catch {
    return null;
  }
}
export async function vapidAuthorization(
  endpoint,
  jwk,
  subject,
  now = Date.now(),
) {
  const audience = new URL(validatePushEndpoint(endpoint)).origin;
  if (typeof subject !== "string" || !/^mailto:[^\s@]+@[^\s@]+$/.test(subject))
    throw Error("Push contact not configured");
  const encoded =
    pushBase64(
      pushEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
    ) +
    "." +
    pushBase64(
      pushEncoder.encode(
        JSON.stringify({
          aud: audience,
          exp: Math.floor(now / 1000) + 43200,
          sub: subject,
        }),
      ),
    );
  const source = JSON.stringify(jwk);
  if (source !== pushSigningSource) {
    pushSigningSource = source;
    pushSigningKey = crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  const key = await pushSigningKey;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    pushEncoder.encode(encoded),
  );
  const publicKey = pushPublicKey({
    PUSH_VAPID_PRIVATE_JWK: JSON.stringify(jwk),
  });
  if (!publicKey) throw Error("Push key not configured");
  return (
    "vapid t=" + encoded + "." + pushBase64(signature) + ", k=" + publicKey
  );
}
export async function sendEmptyPush(
  env,
  endpoint,
  topic,
  now = Date.now(),
  timeout = 8000,
) {
  const authorization = await vapidAuthorization(
    endpoint,
    JSON.parse(env.PUSH_VAPID_PRIVATE_JWK),
    env.PUSH_VAPID_SUBJECT,
    now,
  );
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeout);
  try {
    // Manual redirects are required by workerd and prevent forwarding VAPID JWTs.
    const response = await fetch(validatePushEndpoint(endpoint), {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: authorization,
        TTL: "900",
        Urgency: "normal",
        Topic: (await pushHash(topic)).slice(0, 32),
        "Content-Length": "0",
      },
    });
    await response.body?.cancel();
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}
export async function pushNeedsEvents(env, key) {
  return !!(await env.DB.prepare(
    "SELECT id FROM push_devices WHERE account_key=? LIMIT 1",
  )
    .bind(key)
    .first());
}
export async function updatePushEvents(env, key, events, revision) {
  await env.DB.prepare(
    "UPDATE push_accounts SET events=?,revision=? WHERE account_key=? AND revision<=?",
  )
    .bind(JSON.stringify(events), revision, key, revision)
    .run();
}
async function pushResetSchedule(env, key, prefs, now) {
  const rows = await env.DB.prepare(
    "SELECT id,last_sent_day FROM push_devices WHERE account_key=?",
  )
    .bind(key)
    .all();
  for (const row of rows.results || []) {
    const next = nextPushTime(
      now,
      prefs.time,
      prefs.timezone,
      row.last_sent_day,
    );
    await env.DB.prepare(
      "UPDATE push_devices SET next_due=?,due_day=?,failures=0 WHERE id=? AND account_key=?",
    )
      .bind(next.at, next.day, row.id, key)
      .run();
  }
}
export async function pushApi(request, env, key) {
  const url = new URL(request.url),
    deviceId = url.searchParams.get("device") || "";
  if (deviceId && !/^[a-f0-9]{64}$/.test(deviceId))
    pushFail("Dispositivo non valido.");
  const account = await env.DB.prepare(
    "SELECT * FROM push_accounts WHERE account_key=?",
  )
    .bind(key)
    .first();
  const prefs = pushPreferences(
    account
      ? {
          time: account.time,
          timezone: account.timezone,
          everyDay: !!account.every_day,
        }
      : {},
  );
  const available =
    !!pushPublicKey(env) && env.PUSH_SCHEDULER_ENABLED === "true";
  if (request.method === "GET") {
    const device = deviceId
      ? await env.DB.prepare(
          "SELECT id FROM push_devices WHERE id=? AND account_key=?",
        )
          .bind(deviceId, key)
          .first()
      : null;
    return pushJson({
      available,
      publicKey: available ? pushPublicKey(env) : null,
      ...prefs,
      deviceEnabled: !!device,
    });
  }
  if (!available)
    pushFail(
      "Il servizio notifiche deve essere aggiornato dall’amministratore.",
      503,
    );
  const reader = request.body?.getReader();
  if (!reader) pushFail("Richiesta mancante.");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 524288) {
      await reader.cancel();
      pushFail("Richiesta troppo grande.", 413);
    }
    text += decoder.decode(part.value, { stream: true });
  }
  let body;
  try {
    body = JSON.parse(text + decoder.decode());
  } catch {
    pushFail("Richiesta non valida.");
  }
  if (request.method === "DELETE") {
    if (typeof body.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id))
      pushFail("Dispositivo non valido.");
    await env.DB.prepare(
      "DELETE FROM push_devices WHERE id=? AND account_key=?",
    )
      .bind(body.id, key)
      .run();
    return pushJson({ ok: true });
  }
  if (request.method !== "POST")
    return pushJson({ error: "Metodo non supportato." }, 405);
  if (body.operation === "test") {
    const row = await env.DB.prepare(
      "SELECT * FROM push_devices WHERE id=? AND account_key=?",
    )
      .bind(body.id, key)
      .first();
    if (!row) pushFail("Attiva prima le notifiche su questo dispositivo.", 404);
    const now = Date.now();
    const claimed = await env.DB.prepare(
      "UPDATE push_devices SET last_test_at=? WHERE id=? AND account_key=? AND last_test_at<?",
    )
      .bind(now, row.id, key, now - 60000)
      .run();
    if (!claimed.meta?.changes)
      pushFail("Attendi un minuto prima di riprovare.", 429);
    let status;
    try {
      status = await sendEmptyPush(
        env,
        row.endpoint,
        "test-" + row.id,
        now,
        2500,
      );
    } catch {
      pushFail(
        "Il servizio del dispositivo non ha risposto. Attendi un minuto e riprova.",
        502,
      );
    }
    if (status === 404 || status === 410) {
      await env.DB.prepare(
        "DELETE FROM push_devices WHERE id=? AND account_key=?",
      )
        .bind(row.id, key)
        .run();
      pushFail(
        "Iscrizione scaduta. Disattiva e riattiva le notifiche su questo dispositivo.",
        410,
      );
    }
    if (status < 200 || status >= 300)
      pushFail(
        "Il servizio del dispositivo non ha accettato la notifica (" +
          status +
          ").",
        502,
      );
    return pushJson({ ok: true });
  }
  const selected = pushPreferences(body);
  if (body.operation !== "subscribe" && body.operation !== "preferences")
    pushFail("Operazione non supportata.");
  const events = body.events,
    revision = body.revision;
  if (
    !Array.isArray(events) ||
    events.length > 10000 ||
    events.some(
      (e) =>
        !e || typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date),
    ) ||
    !Number.isSafeInteger(revision) ||
    revision < 0
  )
    pushFail("Programmazione non valida.");
  let endpoint, id;
  if (body.operation === "subscribe") {
    endpoint = validatePushEndpoint(body.endpoint);
    id = await pushHash(endpoint);
    const existing = await env.DB.prepare(
      "SELECT account_key FROM push_devices WHERE id=?",
    )
      .bind(id)
      .first();
    if (existing && existing.account_key !== key)
      pushFail(
        "Disattiva le notifiche del precedente account su questo dispositivo e riprova.",
        409,
      );
  }
  await env.DB.prepare(
    "INSERT INTO push_accounts(account_key,time,timezone,every_day,events,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(account_key) DO UPDATE SET time=excluded.time,timezone=excluded.timezone,every_day=excluded.every_day,events=CASE WHEN excluded.revision>=push_accounts.revision THEN excluded.events ELSE push_accounts.events END,revision=MAX(push_accounts.revision,excluded.revision)",
  )
    .bind(
      key,
      selected.time,
      selected.timezone,
      selected.everyDay ? 1 : 0,
      JSON.stringify(events.map((e) => ({ date: e.date }))),
      revision,
    )
    .run();
  const now = Date.now();
  if (id) {
    const next = nextPushTime(now, selected.time, selected.timezone);
    await env.DB.prepare(
      "INSERT INTO push_devices(id,account_key,endpoint,next_due,due_day) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint WHERE push_devices.account_key=excluded.account_key",
    )
      .bind(id, key, endpoint, next.at, next.day)
      .run();
  }
  await pushResetSchedule(env, key, selected, now);
  return pushJson({ ok: true, id, ...selected });
}
export async function dispatchPushReminders(env, now = Date.now()) {
  if (!pushPublicKey(env) || env.PUSH_SCHEDULER_ENABLED !== "true") return;
  const rows = await env.DB.prepare(
    "SELECT d.*,a.time,a.timezone,a.every_day,a.events FROM push_devices d JOIN push_accounts a ON a.account_key=d.account_key WHERE d.next_due<=? AND d.lease_until<? ORDER BY d.next_due LIMIT 10",
  )
    .bind(now, now)
    .all();
  for (const row of rows.results || []) {
    const today = pushLocalDay(now, row.timezone),
      next = nextPushTime(now, row.time, row.timezone, today);
    const due =
      row.due_day === today &&
      row.last_sent_day !== today &&
      (!!row.every_day || JSON.parse(row.events).some((e) => e.date === today));
    if (!due) {
      await env.DB.prepare(
        "UPDATE push_devices SET next_due=?,due_day=?,lease_until=0 WHERE id=? AND next_due=?",
      )
        .bind(next.at, next.day, row.id, row.next_due)
        .run();
      continue;
    }
    const claimed = await env.DB.prepare(
      "UPDATE push_devices SET lease_until=? WHERE id=? AND next_due=? AND lease_until<?",
    )
      .bind(now + 120000, row.id, row.next_due, now)
      .run();
    if (!claimed.meta?.changes) continue;
    let status;
    try {
      status = await sendEmptyPush(
        env,
        row.endpoint,
        "daily-" + row.id + "-" + today,
        now,
      );
    } catch {
      status = 503;
    }
    if (status === 404 || status === 410) {
      await env.DB.prepare("DELETE FROM push_devices WHERE id=?")
        .bind(row.id)
        .run();
      continue;
    }
    if (status >= 200 && status < 300) {
      await env.DB.prepare(
        "UPDATE push_devices SET next_due=?,due_day=?,last_sent_day=?,lease_until=0,failures=0 WHERE id=?",
      )
        .bind(next.at, next.day, today, row.id)
        .run();
    } else {
      const retry =
        row.failures < 2 && pushLocalDay(now + 300000, row.timezone) === today;
      await env.DB.prepare(
        "UPDATE push_devices SET next_due=?,due_day=?,lease_until=0,failures=? WHERE id=?",
      )
        .bind(
          retry ? now + 300000 : next.at,
          retry ? today : next.day,
          retry ? row.failures + 1 : 0,
          row.id,
        )
        .run();
    }
  }
}
