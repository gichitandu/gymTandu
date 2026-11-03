import {
  DEFAULT_DESIGN,
  MAX_DESIGN_BYTES,
  parseDesign,
  validDesign,
} from "../shared/design-system.js";

const designReply = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const designFail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
const designKeys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((k) => allowed.includes(k));
function checkedDesign(value) {
  try {
    return parseDesign(value);
  } catch {
    designFail("Configurazione Design Studio non valida o non supportata.");
  }
}
const designInteger = (value) => Number.isSafeInteger(value) && value >= 0;
function storedDesign(text) {
  try {
    const value = JSON.parse(text);
    return validDesign(value) ? value : structuredClone(DEFAULT_DESIGN);
  } catch {
    return structuredClone(DEFAULT_DESIGN);
  }
}
async function designBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_DESIGN_BYTES + 1024)
    designFail("Configurazione troppo grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) designFail("Configurazione mancante.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DESIGN_BYTES + 1024) {
        await reader.cancel();
        designFail("Configurazione troppo grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    designFail("JSON non valido.");
  }
}
async function designPublished(db) {
  const row = await db
    .prepare("SELECT revision,config,updated_at FROM design_state WHERE id=?")
    .bind("current")
    .first();
  return {
    revision: row?.revision || 0,
    config: storedDesign(row?.config),
    updatedAt: row?.updated_at || null,
  };
}
function designDelta(before, after, path = "", result = []) {
  for (const key of new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])) {
    const a = before?.[key],
      b = after?.[key],
      at = path ? path + "." + key : key;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    )
      designDelta(a, b, at, result);
    else result.push({ path: at, before: a ?? null, after: b ?? null });
  }
  return result;
}
async function designCommit(
  db,
  me,
  config,
  expected,
  kind,
  sourceRevision,
  draftVersion,
) {
  const current = await designPublished(db);
  if (current.revision !== expected)
    designFail(
      "Il tema pubblicato è cambiato. Ricarica lo Studio prima di pubblicare.",
      409,
    );
  const text = JSON.stringify(checkedDesign(config)),
    revision = expected + 1,
    op = crypto.randomUUID(),
    at = Date.now();
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const checksum = Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const guard =
    kind === "publish"
      ? " AND EXISTS (SELECT 1 FROM design_drafts WHERE user_id=? AND version=?)"
      : "";
  const args = [
    revision,
    op,
    text,
    checksum,
    me.id,
    at,
    kind,
    sourceRevision ?? null,
    expected,
    ...(kind === "publish" ? [me.id, draftVersion] : []),
  ];
  const statements = [
    db
      .prepare(
        "INSERT INTO design_revisions (revision,operation_id,config,checksum,actor_id,created_at,kind,source_revision) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT revision FROM design_state WHERE id='current')=?" +
          guard,
      )
      .bind(...args),
    db
      .prepare(
        "UPDATE design_state SET revision=?,config=?,updated_at=?,updated_by=? WHERE id='current' AND revision=? AND EXISTS (SELECT 1 FROM design_revisions WHERE operation_id=?)",
      )
      .bind(revision, text, at, me.id, expected, op),
    db
      .prepare(
        "INSERT INTO design_audit (id,revision,actor_id,created_at,kind,delta) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM design_revisions WHERE operation_id=?)",
      )
      .bind(
        op,
        revision,
        me.id,
        at,
        kind,
        JSON.stringify(designDelta(current.config, config)),
        op,
      ),
  ];
  if (kind === "publish")
    statements.push(
      db
        .prepare(
          "DELETE FROM design_drafts WHERE user_id=? AND version=? AND EXISTS (SELECT 1 FROM design_revisions WHERE operation_id=?)",
        )
        .bind(me.id, draftVersion, op),
    );
  const result = await db.batch(statements);
  if (!result[1].meta?.changes)
    designFail("Conflitto di revisione o bozza. Ricarica lo Studio.", 409);
  return { revision, config: JSON.parse(text), updatedAt: at };
}

/** Called only after the existing Sites identity, session and CSRF boundaries. */
export async function designStudioApi(request, env, me) {
  if (!me) designFail("Accedi al tuo account.", 401);
  const url = new URL(request.url),
    path = url.pathname.slice("/api/design/".length),
    db = env.DB;
  if (path === "published" && request.method === "GET")
    return designReply({
      ...(await designPublished(db)),
      studioEnabled: env.DESIGN_STUDIO_DISABLED !== "1",
    });
  if (me.role !== "SuperAdmin")
    designFail("Accesso riservato al Super Admin.", 403);
  if (env.DESIGN_STUDIO_DISABLED === "1")
    designFail(
      "Design Studio temporaneamente disattivato. Le altre funzioni restano disponibili.",
      503,
    );
  if (path === "studio" && request.method === "GET") {
    const published = await designPublished(db);
    const [draft, presets, history] = await Promise.all([
      db
        .prepare(
          "SELECT config,base_revision,version,updated_at FROM design_drafts WHERE user_id=?",
        )
        .bind(me.id)
        .first(),
      db
        .prepare(
          "SELECT id,name,config,version,updated_at FROM design_presets WHERE user_id=? ORDER BY updated_at DESC LIMIT 40",
        )
        .bind(me.id)
        .all(),
      db
        .prepare(
          "SELECT r.revision,r.actor_id,r.created_at,r.kind,r.source_revision,r.checksum,u.name AS actor_name,a.delta FROM design_revisions r LEFT JOIN users u ON u.id=r.actor_id LEFT JOIN design_audit a ON a.revision=r.revision ORDER BY r.revision DESC LIMIT 30",
        )
        .all(),
    ]);
    return designReply({
      published,
      draft: draft
        ? {
            config: storedDesign(draft.config),
            baseRevision: draft.base_revision,
            version: draft.version,
            updatedAt: draft.updated_at,
          }
        : null,
      presets: presets.results.map((p) => ({
        id: p.id,
        name: p.name,
        config: storedDesign(p.config),
        version: p.version,
        updatedAt: p.updated_at,
      })),
      history: history.results.map((r) => ({
        revision: r.revision,
        actorId: r.actor_id,
        actorName: r.actor_name,
        createdAt: r.created_at,
        kind: r.kind,
        sourceRevision: r.source_revision,
        checksum: r.checksum,
        changes: JSON.parse(r.delta || "[]"),
      })),
    });
  }
  if (request.method !== "POST") designFail("Operazione non trovata.", 404);
  const body = await designBody(request);
  if (path === "draft") {
    if (
      !designKeys(body, ["config", "baseRevision", "version"]) ||
      !designInteger(body.baseRevision) ||
      !designInteger(body.version)
    )
      designFail("Dati della bozza non validi.");
    const config = checkedDesign(body.config),
      at = Date.now();
    const before = await db
      .prepare("SELECT version FROM design_drafts WHERE user_id=?")
      .bind(me.id)
      .first();
    if ((before?.version || 0) !== body.version)
      designFail(
        "La bozza è cambiata in un’altra finestra. Ricarica lo Studio.",
        409,
      );
    const result = await db
      .prepare(
        "INSERT INTO design_drafts (user_id,config,base_revision,version,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config,base_revision=excluded.base_revision,version=excluded.version,updated_at=excluded.updated_at WHERE design_drafts.version=?",
      )
      .bind(
        me.id,
        JSON.stringify(config),
        body.baseRevision,
        body.version + 1,
        at,
        body.version,
      )
      .run();
    if (!result.meta?.changes)
      designFail("Conflitto di bozza. Ricarica lo Studio.", 409);
    return designReply({
      config,
      baseRevision: body.baseRevision,
      version: body.version + 1,
      updatedAt: at,
    });
  }
  if (path === "discard") {
    if (!designKeys(body, ["version"]) || !designInteger(body.version))
      designFail("Versione bozza non valida.");
    const draft = await db
      .prepare("SELECT version FROM design_drafts WHERE user_id=?")
      .bind(me.id)
      .first();
    if (draft && draft.version !== body.version)
      designFail("La bozza è cambiata. Ricarica lo Studio.", 409);
    if (draft)
      await db
        .prepare("DELETE FROM design_drafts WHERE user_id=? AND version=?")
        .bind(me.id, body.version)
        .run();
    return designReply({ ok: true });
  }
  if (path === "publish") {
    if (
      !designKeys(body, ["expectedRevision", "version", "confirmed"]) ||
      body.confirmed !== true ||
      !designInteger(body.expectedRevision) ||
      !designInteger(body.version)
    )
      designFail("Conferma esplicita della pubblicazione richiesta.");
    const draft = await db
      .prepare(
        "SELECT config,version,base_revision FROM design_drafts WHERE user_id=?",
      )
      .bind(me.id)
      .first();
    if (
      !draft ||
      draft.version !== body.version ||
      draft.base_revision !== body.expectedRevision
    )
      designFail(
        "Bozza mancante o basata su una revisione diversa. Ricarica lo Studio.",
        409,
      );
    return designReply(
      await designCommit(
        db,
        me,
        JSON.parse(draft.config),
        body.expectedRevision,
        "publish",
        null,
        body.version,
      ),
    );
  }
  if (path === "rollback") {
    if (
      !designKeys(body, ["expectedRevision", "revision", "confirmed"]) ||
      body.confirmed !== true ||
      !designInteger(body.expectedRevision) ||
      !designInteger(body.revision)
    )
      designFail("Conferma e revisione richieste.");
    const revision =
      body.revision === 0
        ? { config: JSON.stringify(DEFAULT_DESIGN) }
        : await db
            .prepare("SELECT config FROM design_revisions WHERE revision=?")
            .bind(body.revision)
            .first();
    if (!revision) designFail("Revisione non trovata.", 404);
    return designReply(
      await designCommit(
        db,
        me,
        checkedDesign(JSON.parse(revision.config)),
        body.expectedRevision,
        "rollback",
        body.revision,
      ),
    );
  }
  if (path === "presets") {
    if (
      !designKeys(body, ["name", "config"]) ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 60 ||
      /[\u0000-\u001F<>]/.test(body.name)
    )
      designFail("Nome preset non valido.");
    const count = await db
      .prepare("SELECT COUNT(*) AS total FROM design_presets WHERE user_id=?")
      .bind(me.id)
      .first();
    if (count.total >= 40)
      designFail("Limite di 40 preset personali raggiunto.");
    const config = checkedDesign(body.config),
      id = crypto.randomUUID(),
      at = Date.now(),
      name = body.name.trim();
    await db
      .prepare(
        "INSERT INTO design_presets (id,user_id,name,config,version,updated_at) VALUES (?,?,?,?,1,?)",
      )
      .bind(id, me.id, name, JSON.stringify(config), at)
      .run();
    return designReply({ id, name, config, version: 1, updatedAt: at }, 201);
  }
  if (path === "rename") {
    if (
      !designKeys(body, ["id", "name", "version"]) ||
      typeof body.id !== "string" ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 60 ||
      /[\u0000-\u001F<>]/.test(body.name) ||
      !designInteger(body.version)
    )
      designFail("Preset non valido.");
    const result = await db
      .prepare(
        "UPDATE design_presets SET name=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?",
      )
      .bind(body.name.trim(), Date.now(), body.id, me.id, body.version)
      .run();
    if (!result.meta?.changes)
      designFail(
        "Preset non trovato o modificato. I factory sono immutabili.",
        409,
      );
    return designReply({ ok: true });
  }
  if (path === "export") {
    if (!designKeys(body, ["config"])) designFail("Esportazione non valida.");
    return designReply({
      format: "gt-design-studio",
      schemaVersion: 1,
      config: checkedDesign(body.config),
    });
  }
  designFail("Operazione non trovata.", 404);
}
