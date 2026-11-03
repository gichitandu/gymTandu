import { beforeEach, afterEach, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { api } from "../worker/index.js";
import { DEFAULT_DESIGN } from "../shared/design-system.js";
const origin = "https://gymtrack.test",
  owner = "giacomotanduo004@gmail.com";
let sql: DatabaseSync, env: any;
function request(path: string, body?: unknown, opts: any = {}) {
  return new Request(origin + "/api/" + path, {
    method: opts.method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(opts.noIdentity
        ? {}
        : {
            "oai-authenticated-user-id": opts.visitor || "owner",
            "oai-authenticated-user-email": owner,
          }),
      ...(body === undefined
        ? {}
        : {
            Origin: opts.origin || origin,
            "Content-Type": "application/json",
          }),
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (path: string, body?: unknown, opts: any = {}) =>
  api(request(path, body, opts), env);
const config = () => structuredClone(DEFAULT_DESIGN);
async function activate() {
  const r = await call("auth/setup", { password: "test-owner-password" });
  expect(r.status).toBe(200);
  return { cookie: r.headers.get("set-cookie")!.split(";")[0] };
}
async function roleSession(role: string, superSession: any) {
  const username = role.toLowerCase();
  expect(
    (
      await call(
        "users",
        {
          name: role,
          email: username + "@test.com",
          username,
          role,
          password: "test-client-password",
        },
        superSession,
      )
    ).status,
  ).toBe(201);
  const r = await call(
    "auth/login",
    { email: username, password: "test-client-password" },
    { visitor: username },
  );
  expect(r.status).toBe(200);
  return {
    visitor: username,
    cookie: r.headers.get("set-cookie")!.split(";")[0],
  };
}
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  env = {
    DB: {
      prepare: (query: string) => {
        let args: any[] = [];
        const statement = {
          bind: (...values: any[]) => {
            args = values;
            return statement;
          },
          first: async () => sql.prepare(query).get(...args),
          all: async () => ({ results: sql.prepare(query).all(...args) }),
          run: async () => ({
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          }),
        };
        return statement;
      },
      batch: async (statements: any[]) => {
        sql.exec("BEGIN");
        try {
          const result = [];
          for (const statement of statements)
            result.push(await statement.run());
          sql.exec("COMMIT");
          return result;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
});
afterEach(() => sql.close());

it("enforces server sessions and SuperAdmin on every privileged path, regardless of payload role", async () => {
  const superSession = await activate();
  const endpoints = [
    "studio",
    "draft",
    "discard",
    "publish",
    "rollback",
    "presets",
    "rename",
    "export",
  ];
  for (const endpoint of endpoints) {
    expect(
      (
        await call(
          "design/" + endpoint,
          endpoint === "studio" ? undefined : { role: "SuperAdmin" },
        )
      ).status,
    ).toBe(401);
  }
  expect(
    (await call("design/published", undefined, { noIdentity: true })).status,
  ).toBe(401);
  for (const role of ["Admin", "User"]) {
    const session = await roleSession(role, superSession);
    for (const endpoint of endpoints)
      expect(
        (
          await call(
            "design/" + endpoint,
            endpoint === "studio"
              ? undefined
              : { role: "SuperAdmin", config: config() },
            session,
          )
        ).status,
      ).toBe(403);
    expect((await call("design/published", undefined, session)).status).toBe(
      200,
    );
  }
  expect(
    (
      await call("design/studio", undefined, {
        ...superSession,
        visitor: "stolen",
      })
    ).status,
  ).toBe(401);
  await call("auth/logout", {}, superSession);
  expect((await call("design/studio", undefined, superSession)).status).toBe(
    401,
  );
});
it("does not publish private previews and survives reload, publish, preset restore and rollback with audit", async () => {
  const session = await activate(),
    client = await roleSession("User", session),
    beforeUsers = sql.prepare("SELECT * FROM users ORDER BY id").all();
  const value = config();
  value.presetId = "azzurro_gt";
  value.instances["home.stats.workouts"] = {
    radius: 24,
    height: 56,
    fill: "#0077FF",
    label: "Le mie sessioni",
  };
  const saved = await call(
    "design/draft",
    { config: value, baseRevision: 0, version: 0 },
    session,
  );
  expect(saved.status).toBe(200);
  expect((await saved.json()).version).toBe(1);
  const reopened = await (
    await call("design/studio", undefined, session)
  ).json();
  expect(reopened.draft.config).toEqual(value);
  expect(
    await (await call("design/published", undefined, client)).json(),
  ).toMatchObject({ revision: 0, config: config() });
  expect(
    (await call("design/publish", { expectedRevision: 0, version: 1 }, session))
      .status,
  ).toBe(400);
  const published = await call(
    "design/publish",
    { expectedRevision: 0, version: 1, confirmed: true },
    session,
  );
  expect(published.status).toBe(200);
  expect(await published.json()).toMatchObject({ revision: 1, config: value });
  expect(
    await (await call("design/published", undefined, client)).json(),
  ).toMatchObject({ revision: 1, config: value });
  expect(
    (await (await call("design/studio", undefined, session)).json()).draft,
  ).toBeNull();
  const factory = config();
  factory.presetId = "azzurro_gt";
  expect(
    (
      await call(
        "design/draft",
        { config: factory, baseRevision: 1, version: 0 },
        session,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "design/publish",
        { expectedRevision: 1, version: 1, confirmed: true },
        session,
      )
    ).status,
  ).toBe(200);
  const rollback = await call(
    "design/rollback",
    { expectedRevision: 2, revision: 1, confirmed: true },
    session,
  );
  expect(rollback.status).toBe(200);
  expect(await rollback.json()).toMatchObject({ revision: 3, config: value });
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_revisions").get()!.total,
  ).toBe(3);
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_audit").get()!.total,
  ).toBe(3);
  const history = (
    await (await call("design/studio", undefined, session)).json()
  ).history;
  expect(history[0]).toMatchObject({
    revision: 3,
    kind: "rollback",
    sourceRevision: 1,
  });
  expect(
    history[0].changes.some((c: any) => c.path.includes("home.stats.workouts")),
  ).toBe(true);
  expect(history[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(sql.prepare("SELECT * FROM users ORDER BY id").all()).toEqual(
    beforeUsers,
  );
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM user_preferences").get()!.total,
  ).toBe(0);
});
it("uses optimistic draft and publish versions; stale writes never create audit or overwrite the current theme", async () => {
  const session = await activate(),
    value = config();
  expect(
    (
      await call(
        "design/draft",
        { config: value, baseRevision: 0, version: 0 },
        session,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "design/draft",
        { config: value, baseRevision: 0, version: 0 },
        session,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        "design/publish",
        { expectedRevision: 0, version: 0, confirmed: true },
        session,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        "design/publish",
        { expectedRevision: 0, version: 1, confirmed: true },
        session,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "design/publish",
        { expectedRevision: 0, version: 1, confirmed: true },
        session,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        "design/rollback",
        { expectedRevision: 0, revision: 0, confirmed: true },
        session,
      )
    ).status,
  ).toBe(409);
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_audit").get()!.total,
  ).toBe(1);
});
it("atomically rejects publication if the draft changes between reading it and committing it", async () => {
  const session = await activate();
  await call(
    "design/draft",
    { config: config(), baseRevision: 0, version: 0 },
    session,
  );
  const batch = env.DB.batch;
  env.DB.batch = async (statements: any[]) => {
    sql.prepare("UPDATE design_drafts SET version=2").run();
    return batch(statements);
  };
  expect(
    (
      await call(
        "design/publish",
        { expectedRevision: 0, version: 1, confirmed: true },
        session,
      )
    ).status,
  ).toBe(409);
  expect(sql.prepare("SELECT revision FROM design_state").get()!.revision).toBe(
    0,
  );
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_audit").get()!.total,
  ).toBe(0);
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_revisions").get()!.total,
  ).toBe(0);
});
it("rejects injected handlers, privilege fields, unknown schema, XSS, unsafe sizes and oversized streams without mutation", async () => {
  const session = await activate();
  for (const patch of [
    { global: { onclick: "script" } },
    { schemaVersion: 9 },
    {
      instances: {
        "home.stats.workouts": { label: "<script>alert(1)</script>" },
      },
    },
    { global: { fill: "url(https://attacker.test)" } },
    { global: { height: 1 } },
    { pages: { __unknown: { radius: 1 } } },
  ]) {
    expect(
      (
        await call(
          "design/draft",
          { config: { ...config(), ...patch }, baseRevision: 0, version: 0 },
          session,
        )
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await call(
        "design/draft",
        { config: config(), role: "SuperAdmin", baseRevision: 0, version: 0 },
        session,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        "design/export",
        { config: { ...config(), role: "SuperAdmin" } },
        session,
      )
    ).status,
  ).toBe(400);
  expect(
    (await call("design/draft", { padding: "x".repeat(70000) }, session))
      .status,
  ).toBe(413);
  expect(
    sql.prepare("SELECT COUNT(*) AS total FROM design_drafts").get()!.total,
  ).toBe(0);
  expect(
    (
      await call(
        "design/draft",
        { config: config(), baseRevision: 0, version: 0 },
        { ...session, origin: "https://attacker.test" },
      )
    ).status,
  ).toBe(403);
});
it("preserves immutable factory presets, supports validated personal copies/renaming/export and removes only the current private draft", async () => {
  const session = await activate(),
    value = config();
  value.presetId = "viola_neon";
  const created = await call(
    "design/presets",
    { name: "GT Viola", config: value },
    session,
  );
  expect(created.status).toBe(201);
  const preset = await created.json();
  expect(
    (
      await call(
        "design/rename",
        { id: preset.id, version: 1, name: "GT Viola copia" },
        session,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "design/rename",
        { id: "viola_neon", version: 1, name: "Replace factory" },
        session,
      )
    ).status,
  ).toBe(409);
  const state = await (await call("design/studio", undefined, session)).json();
  expect(state.presets[0]).toMatchObject({
    name: "GT Viola copia",
    config: value,
  });
  expect(
    await (await call("design/export", { config: value }, session)).json(),
  ).toEqual({ format: "gt-design-studio", schemaVersion: 1, config: value });
  await call(
    "design/draft",
    { config: value, baseRevision: 0, version: 0 },
    session,
  );
  expect((await call("design/discard", { version: 0 }, session)).status).toBe(
    409,
  );
  expect((await call("design/discard", { version: 1 }, session)).status).toBe(
    200,
  );
  expect(
    (await (await call("design/studio", undefined, session)).json()).draft,
  ).toBeNull();
  expect(
    (await (await call("design/published", undefined, session)).json())
      .revision,
  ).toBe(0);
});
it("safely falls back for corrupted/obsolete published configuration and restores revision zero as a new audited revision", async () => {
  const session = await activate();
  sql.prepare("UPDATE design_state SET config=?").run('{"schemaVersion":999}');
  expect(
    (await (await call("design/published", undefined, session)).json()).config,
  ).toEqual(config());
  expect(
    (
      await call(
        "design/rollback",
        { revision: 0, expectedRevision: 0, confirmed: true },
        session,
      )
    ).status,
  ).toBe(200);
  expect(
    sql.prepare("SELECT revision,kind FROM design_revisions").get(),
  ).toMatchObject({ revision: 1, kind: "rollback" });
});
it("can disable the editor on the server while preserving published theme reads and account access", async () => {
  const session = await activate();
  env.DESIGN_STUDIO_DISABLED = "1";
  expect((await call("design/studio", undefined, session)).status).toBe(503);
  expect(
    (
      await call(
        "design/draft",
        { config: config(), baseRevision: 0, version: 0 },
        session,
      )
    ).status,
  ).toBe(503);
  expect(
    await (await call("design/published", undefined, session)).json(),
  ).toMatchObject({ config: config(), studioEnabled: false });
  expect(
    (await (await call("auth/me", undefined, session)).json()).user.role,
  ).toBe("SuperAdmin");
});
