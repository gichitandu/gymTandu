import { it, expect } from "vitest";
import {
  storageAlert,
  bucketBytes,
  thresholdsFor,
  STORAGE_THRESHOLDS,
} from "../worker/storage-alert.js";

const GB = 1_000_000_000;
const owner = "giacomotanduo004@gmail.com";

/** Bucket R2 finto: oggetti di dati con dimensione dichiarata e paginazione a 2 elementi. */
function fakeBucket(sizes: number[]) {
  const store = new Map<string, string>();
  let data = sizes;
  return {
    setSizes(next: number[]) {
      data = next;
    },
    store,
    async list({ cursor, limit }: { cursor?: string; limit?: number } = {}) {
      expect(limit).toBe(1000);
      const start = cursor ? Number(cursor) : 0,
        page = 2;
      const objects = data.slice(start, start + page).map((size) => ({ size }));
      const end = start + page;
      return { objects, truncated: end < data.length, cursor: String(end) };
    },
    async get(key: string) {
      const value = store.get(key);
      return value === undefined ? null : { text: async () => value };
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}
function fakeFetch(status = 200) {
  const calls: { url: string; init: any }[] = [];
  const impl = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: status < 400, status } as Response;
  };
  return { calls, impl: impl as unknown as typeof fetch };
}
const envWith = (bucket: any, extra: Record<string, string> = {}) => ({
  BUCKET: bucket,
  RESEND_API_KEY: "chiave-di-prova",
  ...extra,
});

it("somma le dimensioni su tutte le pagine del bucket", async () => {
  expect(await bucketBytes(fakeBucket([1, 2, 3, 4, 5]))).toBe(15);
});
it("non invia nulla sotto 8 GB", async () => {
  const f = fakeFetch(),
    bucket = fakeBucket([3 * GB, 4.9 * GB]);
  const result = await storageAlert(envWith(bucket), owner, f.impl);
  expect(result.sent).toBe(false);
  expect(result.level).toBe(0);
  expect(f.calls.length).toBe(0);
});
it("invia una sola email per soglia e non la ripete al controllo successivo", async () => {
  const f = fakeFetch(),
    bucket = fakeBucket([8.2 * GB]);
  const first = await storageAlert(envWith(bucket), owner, f.impl);
  expect(first.sent).toBe(true);
  expect(first.level).toBe(1);
  expect(f.calls.length).toBe(1);
  expect(f.calls[0].url).toBe("https://api.resend.com/emails");
  expect(f.calls[0].init.headers.Authorization).toBe("Bearer chiave-di-prova");
  const body = JSON.parse(f.calls[0].init.body);
  expect(body.to).toEqual([owner]);
  expect(body.subject).toContain("8,00 GB");
  expect((await storageAlert(envWith(bucket), owner, f.impl)).sent).toBe(false);
  expect(f.calls.length).toBe(1);
});
it("avvisa a 9 e a 9,5 GB, e salta alla soglia più alta se superata di colpo", async () => {
  const f = fakeFetch(),
    bucket = fakeBucket([8.1 * GB]);
  await storageAlert(envWith(bucket), owner, f.impl);
  bucket.setSizes([9.1 * GB]);
  expect((await storageAlert(envWith(bucket), owner, f.impl)).level).toBe(2);
  bucket.setSizes([9.6 * GB]);
  expect((await storageAlert(envWith(bucket), owner, f.impl)).level).toBe(3);
  expect(f.calls.map((c) => JSON.parse(c.init.body).subject)).toEqual([
    "GymTrack: spazio R2 oltre 8,00 GB",
    "GymTrack: spazio R2 oltre 9,00 GB",
    "GymTrack: spazio R2 oltre 9,50 GB",
  ]);
  const fresh = fakeFetch();
  expect(
    (await storageAlert(envWith(fakeBucket([9.9 * GB])), owner, fresh.impl))
      .level,
  ).toBe(3);
  expect(fresh.calls.length).toBe(1);
});
it("riarma gli avvisi quando l’uso scende sotto la soglia", async () => {
  const f = fakeFetch(),
    bucket = fakeBucket([8.5 * GB]);
  await storageAlert(envWith(bucket), owner, f.impl);
  bucket.setSizes([1 * GB]);
  expect((await storageAlert(envWith(bucket), owner, f.impl)).sent).toBe(false);
  bucket.setSizes([8.5 * GB]);
  expect((await storageAlert(envWith(bucket), owner, f.impl)).sent).toBe(true);
  expect(f.calls.length).toBe(2);
});
it("non aggiorna lo stato se l’invio fallisce, così riprova al controllo successivo", async () => {
  const bucket = fakeBucket([8.5 * GB]),
    bad = fakeFetch(500);
  let failed = false;
  try {
    await storageAlert(envWith(bucket), owner, bad.impl);
  } catch {
    failed = true;
  }
  expect(failed).toBe(true);
  const good = fakeFetch();
  expect((await storageAlert(envWith(bucket), owner, good.impl)).sent).toBe(
    true,
  );
});
it("senza chiave email non invia e non consuma la soglia", async () => {
  const bucket = fakeBucket([9.2 * GB]),
    f = fakeFetch();
  const result = await storageAlert({ BUCKET: bucket }, owner, f.impl);
  expect(result.sent).toBe(false);
  expect(f.calls.length).toBe(0);
  expect((await storageAlert(envWith(bucket), owner, f.impl)).sent).toBe(true);
});
it("usa ALERT_EMAIL se impostato e ignora il controllo senza bucket", async () => {
  const f = fakeFetch();
  await storageAlert(
    envWith(fakeBucket([8.5 * GB]), { ALERT_EMAIL: "altro@example.com" }),
    owner,
    f.impl,
  );
  expect(JSON.parse(f.calls[0].init.body).to).toEqual(["altro@example.com"]);
  expect((await storageAlert({}, owner, f.impl)).sent).toBe(false);
  expect(STORAGE_THRESHOLDS).toEqual([8 * GB, 9 * GB, 9.5 * GB]);
});
it("con STORAGE_ALERT_TEST_BYTES invia una email di prova anche con il bucket vuoto, una sola volta", async () => {
  const f = fakeFetch(),
    bucket = fakeBucket([]);
  const env = envWith(bucket, { STORAGE_ALERT_TEST_BYTES: "0" });
  expect((await storageAlert(env, owner, f.impl)).sent).toBe(true);
  expect((await storageAlert(env, owner, f.impl)).sent).toBe(false);
  expect(f.calls.length).toBe(1);
  const body = JSON.parse(f.calls[0].init.body);
  expect(body.subject).toBe("[PROVA] GymTrack: spazio R2 oltre 0,00 MB");
  expect(body.text).toContain("email di prova");
  // tornando alle soglie reali lo stato si riallinea senza inviare nulla
  const after = await storageAlert(envWith(bucket), owner, f.impl);
  expect(after.sent).toBe(false);
  expect(f.calls.length).toBe(1);
});
it("ignora valori non validi di STORAGE_ALERT_TEST_BYTES", () => {
  for (const raw of [undefined, "", "abc", "-5"])
    expect(thresholdsFor({ STORAGE_ALERT_TEST_BYTES: raw })).toBe(
      STORAGE_THRESHOLDS,
    );
  expect(thresholdsFor({ STORAGE_ALERT_TEST_BYTES: "1000" })).toEqual([1000]);
});

import { storageStatus } from "../worker/storage-alert.js";

it("storageStatus riassume totale, soglie e ripartizione per tipo", async () => {
  const objects = [
    { key: "archives/a/1/x.json", size: 5 * GB },
    { key: "archives/a/2/y.json", size: 3_200_000_000 },
    { key: "excel-imports/s/z.xlsx", size: 1_000_000 },
    { key: "system/storage-alert.json", size: 100 },
    { key: "altro/file", size: 50 },
  ];
  const bucket = {
    async list({ cursor }: { cursor?: string } = {}) {
      const start = cursor ? Number(cursor) : 0,
        end = start + 2;
      return {
        objects: objects.slice(start, end),
        truncated: end < objects.length,
        cursor: String(end),
      };
    },
    async get() {
      return {
        text: async () =>
          JSON.stringify({ level: 1, updatedAt: "2026-11-01T10:00:00.000Z" }),
      };
    },
  };
  const status = await storageStatus({ BUCKET: bucket });
  expect(status.available).toBe(true);
  expect(status.bytes).toBe(8_201_000_150);
  expect(status.level).toBe(1);
  expect(status.lastAlertLevel).toBe(1);
  expect(status.thresholds).toEqual(STORAGE_THRESHOLDS);
  expect(status.categories.map((c: any) => c.id)).toEqual([
    "archives",
    "excel-imports",
    "system",
    "other",
  ]);
  expect(status.categories[0].bytes).toBe(8_200_000_000);
});

it("storageStatus senza bucket non fallisce", async () => {
  expect(await storageStatus({})).toMatchObject({
    available: false,
    bytes: 0,
    categories: [],
  });
});
