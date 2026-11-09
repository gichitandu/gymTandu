import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.useRealTimers());
const release = () => new Request("https://gymtrack.test/api/app-release");
const refresh = {
  signedOut: false,
  refreshRequired: true,
  recoveryId: "logout-offline-v2",
};
function worker(markers = new Map<string, Response>()) {
  const handlers: any = {},
    local = {
      id: "local",
      url: "https://gymtrack.test/#/profilo",
      navigate: vi.fn(),
    },
    other = { id: "other", url: "https://other.test/", navigate: vi.fn() };
  local.navigate.mockResolvedValue(local);
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ signedOut: false }) });
  const cache = {
    match: vi.fn(async (key: string) => markers.get(key)),
    put: vi.fn(async (key: string, value: Response) => {
      markers.set(key, value);
    }),
  };
  const caches = { open: vi.fn().mockResolvedValue(cache) };
  const self = {
    caches,
    location: { origin: "https://gymtrack.test" },
    clients: { matchAll: vi.fn().mockResolvedValue([local, other]) },
    addEventListener: (name: string, callback: any) =>
      (handlers[name] = callback),
  };
  vm.runInNewContext(
    readFileSync("public/gymtrack-session-recovery.js", "utf8"),
    { self, fetch, URL, Response, AbortController, setTimeout, clearTimeout },
  );
  const dispatch = async (name: string, request?: Request) => {
    let job = Promise.resolve();
    handlers[name]({
      request,
      waitUntil: (work: Promise<void>) => (job = work),
    });
    await job;
  };
  return { fetch, local, other, self, cache, caches, markers, dispatch };
}
it("refreshes only same-origin windows after the server confirms targeted sign-out, without using archive storage", async () => {
  const w = worker();
  w.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ signedOut: true }),
  });
  await w.dispatch("activate");
  expect(w.fetch).toHaveBeenCalledWith(
    "/api/auth/device-recovery",
    expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body: "{}",
    }),
  );
  expect(w.local.navigate).toHaveBeenCalledExactlyOnceWith(
    "https://gymtrack.test/?ngsw-bypass=1#/",
  );
  expect(w.other.navigate).not.toHaveBeenCalled();
  expect(w.caches.open).not.toHaveBeenCalled();
});
it("leaves a PC or another account alone when the server declines recovery", async () => {
  const w = worker();
  await w.dispatch("activate");
  await w.dispatch("fetch", release());
  expect(w.fetch).toHaveBeenCalledOnce();
  expect(w.local.navigate).not.toHaveBeenCalled();
});
it("retries a failed recovery on the next online release check while ignoring unrelated requests", async () => {
  const w = worker();
  w.fetch.mockRejectedValueOnce(Error("Offline"));
  await w.dispatch("activate");
  await w.dispatch("fetch", new Request("https://other.test/api/app-release"));
  await w.dispatch("fetch", new Request("https://gymtrack.test/api/archive"));
  expect(w.fetch).toHaveBeenCalledOnce();
  w.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ signedOut: true }),
  });
  await w.dispatch("fetch", release());
  expect(w.fetch).toHaveBeenCalledTimes(2);
  expect(w.local.navigate).toHaveBeenCalledOnce();
});
it("retries document refresh after a transient navigation failure without revoking a new login", async () => {
  const w = worker();
  w.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  w.local.navigate.mockRejectedValueOnce(Error("Window busy"));
  await w.dispatch("activate");
  expect(w.markers.size).toBe(0);
  await w.dispatch("fetch", release());
  expect(w.local.navigate).toHaveBeenCalledTimes(2);
  expect(w.fetch).toHaveBeenCalledOnce();
  expect(w.markers.size).toBe(1);
});
it("refreshes a stale owner iPhone without requiring sign-out and does not loop after a worker restart", async () => {
  const markers = new Map<string, Response>(),
    w = worker(markers);
  w.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  await w.dispatch("activate");
  expect(w.local.navigate).toHaveBeenCalledOnce();
  expect(markers.size).toBe(1);
  expect(w.caches.open).toHaveBeenCalledWith("gymtrack-device-recovery-v1");
  const reopened = worker(markers);
  reopened.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  await reopened.dispatch("activate");
  await reopened.dispatch("fetch", release());
  expect(reopened.local.navigate).not.toHaveBeenCalled();
  expect(reopened.fetch).toHaveBeenCalledOnce();
});
it("still refreshes after a genuine cookie revocation even if this recovery generation was already applied", async () => {
  const markers = new Map<string, Response>(),
    first = worker(markers);
  first.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  await first.dispatch("activate");
  const w = worker(markers);
  w.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ...refresh, signedOut: true }),
  });
  await w.dispatch("activate");
  expect(w.local.navigate).toHaveBeenCalledOnce();
});
it("does not mark a partially refreshed set of same-origin windows as complete", async () => {
  const w = worker(),
    second = {
      id: "second",
      url: "https://gymtrack.test/#/sessione",
      navigate: vi.fn().mockRejectedValueOnce(Error("Busy")),
    };
  second.navigate.mockResolvedValueOnce(second);
  w.self.clients.matchAll.mockResolvedValue([w.local, second, w.other]);
  w.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  await w.dispatch("activate");
  expect(w.markers.size).toBe(0);
  expect(w.other.navigate).not.toHaveBeenCalled();
  await w.dispatch("fetch", release());
  expect(w.markers.size).toBe(1);
  expect(second.navigate).toHaveBeenCalledTimes(2);
});
it("does not wait indefinitely for recovery metadata storage and keeps the refresh independent of backups", async () => {
  vi.useFakeTimers();
  const w = worker();
  w.caches.open.mockReturnValue(new Promise(() => {}));
  w.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  const activation = w.dispatch("activate");
  await vi.advanceTimersByTimeAsync(1000);
  await activation;
  expect(w.local.navigate).toHaveBeenCalledOnce();
  await w.dispatch("fetch", release());
  expect(w.local.navigate).toHaveBeenCalledOnce();
});
it("ignores invalid refresh receipts without following server-provided URLs", async () => {
  const w = worker();
  w.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ...refresh, recoveryId: "https://other.test/" }),
  });
  await w.dispatch("activate");
  expect(w.local.navigate).not.toHaveBeenCalled();
  expect(w.markers.size).toBe(0);
});

it("waits for a slow but successful fresh navigation instead of repeating the recovery", async () => {
  vi.useFakeTimers();
  const w = worker();
  w.fetch.mockResolvedValue({ ok: true, json: async () => refresh });
  let finish!: (value: unknown) => void;
  w.local.navigate.mockReturnValueOnce(
    new Promise((resolve) => (finish = resolve)),
  );
  try {
    const activation = w.dispatch("activate");
    await vi.advanceTimersByTimeAsync(6000);
    expect(w.markers.size).toBe(0);
    finish(w.local);
    await activation;
    expect(w.markers.size).toBe(1);
    await w.dispatch("fetch", release());
    expect(w.local.navigate).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
