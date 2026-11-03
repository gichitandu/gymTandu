import { APPROVED_THEME_PALETTES } from "../../shared/approved-palettes.js";
// Exercise the actual self-contained deployment Worker, not its source modules.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { api } from "../../dist/server/index.js";
const sql = new DatabaseSync(":memory:");
for (const file of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  sql.exec(readFileSync("drizzle/" + file, "utf8"));
const env = {
  DB: {
    prepare(query) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async first() {
          return sql.prepare(query).get(...args);
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          return {
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sql.exec("COMMIT");
        return results;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  },
};
const origin = "https://package-check.test";
const call = (path, body, cookie) =>
  api(
    new Request(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "oai-authenticated-user-id": "package-check",
        "oai-authenticated-user-email": "giacomotanduo004@gmail.com",
        ...(body === undefined
          ? {}
          : { Origin: origin, "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
try {
  assert.equal((await call("design/studio")).status, 401);
  const setup = await call("auth/setup", {
    password: "ephemeral-fixture-password",
  });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const state = await call("design/studio", undefined, cookie);
  assert.equal(state.status, 200);
  const studio = await state.json();
  assert.equal(studio.published.revision, 0);
  for (const palette of APPROVED_THEME_PALETTES) {
    const themeConfig = { palette: palette.id, mode: "dark" };
    assert.equal(
      (
        await call(
          "preferences",
          { backgroundColor: palette.background, themeConfig },
          cookie,
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await (await call("preferences", undefined, cookie)).json()).themeConfig,
      themeConfig,
    );
  }
  const config = studio.published.config;
  config.presetId = "petrolio-lumina";
  config.instances["home.stats.workouts"] = { radius: 24, fill: "#0077FF" };
  assert.equal(
    (
      await call(
        "design/draft",
        { config, baseRevision: 0, version: 0 },
        cookie,
      )
    ).status,
    200,
  );
  const published = await call(
    "design/publish",
    { version: 1, expectedRevision: 0, confirmed: true },
    cookie,
  );
  assert.equal(published.status, 200);
  assert.equal((await published.json()).revision, 1);
  const read = await (await call("design/published", undefined, cookie)).json();
  assert.equal(read.config.instances["home.stats.workouts"].radius, 24);
  assert.equal(read.studioEnabled, true);
  assert.equal(
    (
      await call(
        "design/rollback",
        { revision: 0, expectedRevision: 1, confirmed: true },
        cookie,
      )
    ).status,
    200,
  );
  console.log(
    "PASS packaged Worker: session gate, migration, draft, publish, published read and rollback in isolated SQLite.",
  );
} finally {
  sql.close();
}
