import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import relay, { renderCalendar } from "../calendar-relay/index.js";
import {
  calendarApi,
  calendarProjection,
  calendarConfigured,
  calendarPublish,
  calendarConfigure,
} from "../worker/calendar.js";
let sql: DatabaseSync, env: any;
const key = "a".repeat(64),
  other = "b".repeat(64),
  origin = "https://calendar.example.test",
  secret = "s".repeat(64);
const events = [
  {
    id: "event-1",
    title: "Gambe, forza; prova\nBEGIN:VEVENT 🏋️",
    date: "2026-10-31",
  },
];
function request(method = "GET", body?: any, account = key, authorized = true) {
  return new Request(origin + "/manage/" + account, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authorized ? { Authorization: "Bearer " + secret } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function enable(account = key, revision = 1) {
  await relay.fetch(
    request(
      "POST",
      { enable: true, events, revision, updatedAt: 1793059200000 },
      account,
    ),
    env,
  );
  return (await (
    await relay.fetch(request("GET", undefined, account), env)
  ).json()) as any;
}
async function read(token: string) {
  return relay.fetch(new Request(origin + "/calendar/" + token + ".ics"), env);
}
beforeEach(() => {
  sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync("calendar-relay/schema.sql", "utf8"));
  sql.exec(readFileSync("drizzle/0006_calendar_service_config.sql", "utf8"));
  env = {
    CALENDAR_RELAY_SECRET: secret,
    DB: {
      prepare: (query: string) => {
        let args: any[] = [];
        return {
          bind(...values: any[]) {
            args = values;
            return this;
          },
          first: async () => sql.prepare(query).get(...args),
          run: async () => ({
            meta: { changes: Number(sql.prepare(query).run(...args).changes) },
          }),
        };
      },
    },
  };
});
afterEach(() => {
  sql.close();
  vi.restoreAllMocks();
});
it("requires authorization for management and never provides a listing", async () => {
  expect(
    (await relay.fetch(request("GET", undefined, key, false), env)).status,
  ).toBe(401);
  expect((await relay.fetch(new Request(origin + "/"), env)).status).toBe(404);
  expect((await read("c".repeat(64))).status).toBe(404);
});
it("isolates two accounts and keeps tokens stable until revocation", async () => {
  const a = await enable(),
    b = await enable(other);
  expect(a.token).not.toBe(b.token);
  expect((await enable()).token).toBe(a.token);
  expect((await read(a.token)).headers.get("content-type")).toContain(
    "text/calendar",
  );
  await relay.fetch(request("DELETE"), env);
  expect((await read(a.token)).status).toBe(404);
  expect((await read(b.token)).status).toBe(200);
  const c = await enable();
  expect(c.token).not.toBe(a.token);
  expect((await read(a.token)).status).toBe(404);
});
it("publishes date changes/removal without duplicating UIDs and rejects older snapshots", async () => {
  const a = await enable();
  const changed = [{ ...events[0], date: "2026-11-01" }];
  await relay.fetch(
    request("POST", { events: changed, revision: 3, updatedAt: 1793059200000 }),
    env,
  );
  await relay.fetch(
    request("POST", { events, revision: 2, updatedAt: 1793059200000 }),
    env,
  );
  let text = await (await read(a.token)).text();
  expect(text).toContain("DTSTART;VALUE=DATE:20261101");
  expect(text).toContain("DTEND;VALUE=DATE:20261102");
  expect(text.match(/^UID:/gm)).toHaveLength(1);
  await relay.fetch(
    request("POST", { events: [], revision: 4, updatedAt: 1793059200000 }),
    env,
  );
  text = await (await read(a.token)).text();
  expect(text).not.toContain("BEGIN:VEVENT");
});
it("never enables a subscription through ordinary saves, including after revocation", async () => {
  const body = { events, revision: 9, updatedAt: 1793059200000 };
  await relay.fetch(request("POST", body), env);
  expect(
    ((await (await relay.fetch(request(), env)).json()) as any).enabled,
  ).toBe(false);
  const a = await enable();
  await relay.fetch(request("DELETE"), env);
  await relay.fetch(request("POST", body), env);
  expect((await read(a.token)).status).toBe(404);
});
it("escapes ICS injection, folds UTF-8 lines and handles leap year/DST as all-day dates", () => {
  const text = renderCalendar(
    [
      {
        ...events[0],
        title: "🏋️".repeat(49) + events[0].title,
        date: "2028-02-29",
      },
    ],
    2,
    1793059200000,
    key,
  );
  expect(text.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  expect(text).toContain("DTEND;VALUE=DATE:20280301");
  expect(text).toContain("\\nBEGIN:VEVENT");
  expect(text).toContain("\\,");
  expect(
    text
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  ).toBe(true);
  expect(() =>
    renderCalendar(
      [{ ...events[0], date: "2027-02-29" }],
      1,
      1793059200000,
      key,
    ),
  ).toThrow();
});
it("projects only scheduled titles and dates, excluding completed sessions and private notes", () => {
  const data = {
    scheduledWorkouts: [
      {
        ...events[0],
        dayName: "Gambe",
        notes: "private",
        workoutId: "completed",
      },
      {
        id: "next",
        date: "2026-11-01",
        dayName: "Petto",
        planName: "private plan",
        notes: "private",
      },
    ],
    workouts: [{ id: "completed", status: "completed" }],
  };
  expect(calendarProjection(data)).toEqual([
    { id: "next", date: "2026-11-01", title: "Petto" },
  ]);
});
it("projects only planned training activities so rest and personal notes never become workout reminders", () => {
  const data = {
    scheduledWorkouts: [
      {
        id: "cardio-done",
        kind: "cardio",
        dayName: "Cardio concluso",
        date: "2026-10-30",
        done: true,
        time: "08:00",
        estimatedCalories: 320,
        notes: "Privato",
      },
      {
        id: "mobility-next",
        kind: "mobility",
        dayName: "Mobilità",
        date: "2026-10-31",
        done: false,
        time: "17:30",
        durationMinutes: 20,
        notes: "Privato",
      },
      {
        id: "cardio-next",
        kind: "cardio",
        dayName: "Corsa",
        date: "2026-11-01",
        time: "07:30",
        estimatedCalories: 220,
        notes: "Privato",
      },
      {
        id: "rest",
        kind: "rest",
        dayName: "Riposo",
        date: "2026-11-01",
        notes: "Privato",
      },
      {
        id: "note",
        kind: "other",
        dayName: "Nota personale",
        date: "2026-11-01",
        notes: "Privato",
      },
    ],
    workouts: [],
  };
  expect(calendarProjection(data)).toEqual([
    { id: "mobility-next", date: "2026-10-31", title: "Mobilità" },
    { id: "cardio-next", date: "2026-11-01", title: "Corsa" },
  ]);
});
it("does not create any connection while unconfigured or unauthorized", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const getter = vi.fn();
  const req = new Request("https://gymtrack.test/api/calendar-subscription");
  expect(calendarConfigured({})).toBe(false);
  expect((await calendarApi(req, {}, null, getter)).status).toBe(401);
  expect(
    await (await calendarApi(req, {}, { id: "alice" }, getter)).json(),
  ).toEqual({ configured: false, enabled: false, canConfigure: false });
  expect(getter).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await calendarPublish({}, { id: "alice" }, "invalid", 1, 1);
  expect(fetch).not.toHaveBeenCalled();
});
it("uses distinct opaque account identities and keeps external secrets out of the client response", async () => {
  const realFetch = globalThis.fetch;
  const seen: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: any, options: any) => {
      const req = new Request(input, options);
      seen.push(new URL(req.url).pathname);
      return relay.fetch(req, env);
    },
  );
  const main = { CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: secret };
  const backup = {
    data: {
      scheduledWorkouts: [
        { id: "e1", dayName: "Gambe", date: "2026-10-31", notes: "private" },
      ],
      workouts: [],
    },
  };
  const archive = async () =>
    Response.json({
      backup: JSON.stringify(backup),
      revision: 1,
      updatedAt: 1793059200000,
    });
  const response = await calendarApi(
    new Request("https://gymtrack.test/api/calendar-subscription", {
      method: "POST",
    }),
    main,
    { id: "alice" },
    archive,
  );
  const state = (await response.json()) as any;
  expect(state.enabled).toBe(true);
  expect(state.url).toMatch(
    /^https:\/\/calendar.example.test\/calendar\/[a-f0-9]{64}\.ics$/,
  );
  expect(JSON.stringify(state)).not.toContain(secret);
  expect(seen.every((p) => !p.includes("alice"))).toBe(true);
  await calendarApi(
    new Request("https://gymtrack.test/api/calendar-subscription"),
    main,
    { id: "bob" },
    archive,
  );
  expect(seen.at(-1)).not.toBe(seen[0]);
  expect(realFetch).toBeTypeOf("function");
});

it("does not send event data for an account that has never enabled the calendar", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json({ enabled: false }));
  await calendarPublish(
    { CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: secret },
    { id: "alice" },
    "not parsed before opt-in",
    1,
    1793059200000,
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][1]?.method).toBe("GET");
  expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
});

it("lets only Super Admin verify/store the relay key, without returning it or replacing an existing key", async () => {
  const secret = "d".repeat(64),
    main = {
      ...env,
      CALENDAR_RELAY_URL: origin,
      CALENDAR_RELAY_SECRET: undefined,
    };
  const req = () =>
    new Request("https://gymtrack.test/api/calendar-config", {
      method: "POST",
      body: JSON.stringify({ secret }),
    });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json({ enabled: false }));
  for (const user of [
    null,
    { id: "u", role: "User" },
    { id: "a", role: "Admin" },
  ])
    expect((await calendarConfigure(req(), main, user)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
  const response = await calendarConfigure(req(), main, {
    id: "sa",
    role: "SuperAdmin",
  });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain(secret);
  expect(
    sql.prepare("SELECT secret FROM calendar_service_config").get()?.secret,
  ).toBe(secret);
  const repeated = await calendarConfigure(req(), main, {
    id: "sa",
    role: "SuperAdmin",
  });
  expect(repeated.status).toBe(409);
  expect(fetch).toHaveBeenCalledOnce();
  const state = await calendarApi(
    new Request("https://gymtrack.test/api/calendar-subscription"),
    main,
    { id: "u", role: "User" },
    vi.fn(),
  );
  const exposed = await state.json();
  expect((exposed as any).configured).toBe(true);
  expect(JSON.stringify(exposed)).not.toContain(secret);
});
it("does not store the relay key when the live verification fails", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("unauthorized", { status: 401 }),
  );
  const request = new Request("https://gymtrack.test/api/calendar-config", {
    method: "POST",
    body: JSON.stringify({ secret: "e".repeat(64) }),
  });
  const response = await calendarConfigure(
    request,
    { ...env, CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: undefined },
    { id: "sa", role: "SuperAdmin" },
  );
  expect(response.status).toBe(400);
  expect(
    sql.prepare("SELECT count(*) AS n FROM calendar_service_config").get()?.n,
  ).toBe(0);
});

it("adds server calendar configuration without changing existing archive heads or versions", () => {
  sql.exec(readFileSync("drizzle/0004_sparkling_lockheed.sql", "utf8"));
  sql
    .prepare("INSERT INTO archive_heads VALUES(?,?,?,?,?,?)")
    .run("synthetic-account", 42, "kept.json", 1, 100, "hash");
  sql
    .prepare("INSERT INTO archive_versions VALUES(?,?,?,?,?,?,?)")
    .run("copy-42", "synthetic-account", 42, "kept.json", 1, 100, "hash");
  const before = sql.prepare("SELECT * FROM archive_heads").all();
  const versions = sql.prepare("SELECT * FROM archive_versions").all();
  sql.exec(readFileSync("drizzle/0006_calendar_service_config.sql", "utf8"));
  expect(sql.prepare("SELECT * FROM archive_heads").all()).toEqual(before);
  expect(sql.prepare("SELECT * FROM archive_versions").all()).toEqual(versions);
});

it.each([
  {
    http: 401,
    body: "Unauthorized",
    status: 400,
    reason: "relay_key_rejected",
    text: "non riconosce la chiave",
  },
  {
    http: 403,
    body: "Forbidden",
    status: 502,
    reason: "relay_access_blocked",
    text: "blocca l’accesso",
  },
  {
    http: 403,
    body: "error code: 1042",
    status: 502,
    reason: "relay_cloudflare_1042",
    text: "1042",
  },
  {
    http: 404,
    body: "Not found",
    status: 502,
    reason: "relay_not_found",
    text: "non è stato trovato",
  },
  {
    http: 200,
    body: "<html>Login page</html>",
    status: 502,
    reason: "relay_invalid_response",
    text: "risposta non valida",
  },
])(
  "distinguishes relay error $reason without storing or logging a key",
  async ({ http, body, status, reason, text }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {}),
      key = "d".repeat(64);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: http }),
    );
    const response = await calendarConfigure(
      new Request("https://gymtrack.test/api/calendar-config", {
        method: "POST",
        body: JSON.stringify({ secret: key }),
      }),
      { ...env, CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: undefined },
      { id: "sa", role: "SuperAdmin" },
    );
    expect(response.status).toBe(status);
    expect(((await response.json()) as any).error).toContain(text);
    expect(JSON.stringify(warn.mock.calls)).toContain(reason);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
    expect(
      sql.prepare("SELECT count(*) AS n FROM calendar_service_config").get()?.n,
    ).toBe(0);
  },
);
it("reports network errors without echoing exception details containing secrets", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {}),
    key = "e".repeat(64);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    Error("request failed " + key),
  );
  const response = await calendarConfigure(
    new Request("https://gymtrack.test/api/calendar-config", {
      method: "POST",
      body: JSON.stringify({ secret: key }),
    }),
    { ...env, CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: undefined },
    { id: "sa", role: "SuperAdmin" },
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain(key);
  expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
});

it("uses the supported manual redirect mode and never follows a relay redirect with the key", async () => {
  const key = "f".repeat(64),
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) => {
      if (init?.redirect !== "manual")
        throw TypeError("Invalid redirect value in workerd");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://elsewhere.invalid" },
      });
    });
  const response = await calendarConfigure(
    new Request("https://gymtrack.test/api/calendar-config", {
      method: "POST",
      body: JSON.stringify({ secret: key }),
    }),
    { ...env, CALENDAR_RELAY_URL: origin, CALENDAR_RELAY_SECRET: undefined },
    { id: "sa", role: "SuperAdmin" },
  );
  expect(response.status).toBe(502);
  expect(((await response.json()) as any).error).toContain(
    "non è stata inoltrata",
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    sql.prepare("SELECT count(*) AS n FROM calendar_service_config").get()?.n,
  ).toBe(0);
  expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
});
