import "@angular/compiler";
import "fake-indexeddb/auto";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { AuthService } from "../src/app/services/auth";
import { ThemeService } from "../src/app/services/theme";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function setup(cached?: { color: string; dirty?: boolean }) {
  const id = "theme-race-" + crypto.randomUUID(),
    styles = new Map<string, string>();
  const account = { id };
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", {
    body: {
      dataset: {},
      style: {
        setProperty: (key: string, value: string) => styles.set(key, value),
      },
      classList: { toggle: () => {} },
    },
    querySelector: () => null,
  });
  const db = new Dexie("gymtrack-preferences-v1");
  db.version(1).stores({ preferences: "id" });
  if (cached) await db.table("preferences").put({ id, ...cached });
  const request = vi.fn();
  const injector = createEnvironmentInjector(
    [
      {
        provide: AuthService,
        useValue: { user: () => account, offlineMode: () => false, request },
      },
      ThemeService,
    ],
    null as unknown as EnvironmentInjector,
  );
  const theme = injector.get(ThemeService);
  const ids = [id];
  cleanups.push(async () => {
    injector.destroy();
    await db.table("preferences").bulkDelete(ids);
    db.close();
  });
  return {
    id,
    ids,
    account,
    theme,
    request,
    styles,
    preference: () => db.table("preferences").get(account.id),
  };
}

it("keeps a newly saved color when an older preferences GET finishes afterwards", async () => {
  const t = await setup(),
    response = deferred<{ backgroundColor: string }>();
  t.request.mockImplementation((_path: string, body?: unknown) =>
    body ? Promise.resolve({ ok: true }) : response.promise,
  );
  const loading = t.theme.load();
  await vi.waitFor(() => expect(t.request).toHaveBeenCalledWith("preferences"));
  await t.theme.save("#123456");
  response.resolve({ backgroundColor: "#edf3fa" });
  await loading;
  expect(t.theme.color()).toBe("#123456");
  expect(t.styles.get("--bg")).toBe("#123456");
  expect(await t.preference()).toEqual({
    id: t.id,
    color: "#123456",
    dirty: false,
  });
});

it("uploads a new choice after an older dirty-cache upload and never rewrites its local cache with the old color", async () => {
  const t = await setup({ color: "#112233", dirty: true }),
    oldUpload = deferred<unknown>();
  let serverColor = "#000000";
  t.request.mockImplementation(
    async (_path: string, body: { backgroundColor: string }) => {
      if (body.backgroundColor === "#112233") await oldUpload.promise;
      serverColor = body.backgroundColor;
      return { ok: true };
    },
  );
  const loading = t.theme.load();
  await vi.waitFor(() => expect(t.request).toHaveBeenCalledTimes(1));
  const saving = t.theme.save("#445566");
  await vi.waitFor(() => expect(t.theme.color()).toBe("#445566"));
  expect(t.request).toHaveBeenCalledTimes(1);
  expect((await t.preference()).dirty).toBe(true);
  oldUpload.resolve({ ok: true });
  await Promise.all([loading, saving]);
  expect(t.request.mock.calls.map((call) => call[1].backgroundColor)).toEqual([
    "#112233",
    "#445566",
  ]);
  expect(serverColor).toBe("#445566");
  expect(t.theme.color()).toBe("#445566");
  expect(await t.preference()).toEqual({
    id: t.id,
    color: "#445566",
    dirty: false,
  });
});

it("continues syncing the new choice after an older dirty-cache upload fails", async () => {
  const t = await setup({ color: "#112233", dirty: true }),
    oldUpload = deferred<unknown>();
  t.request.mockImplementation(
    (_path: string, body: { backgroundColor: string }) =>
      body.backgroundColor === "#112233"
        ? oldUpload.promise
        : Promise.resolve({ ok: true }),
  );
  const loading = t.theme.load();
  await vi.waitFor(() => expect(t.request).toHaveBeenCalledTimes(1));
  const saving = t.theme.save("#556677");
  await vi.waitFor(() => expect(t.theme.color()).toBe("#556677"));
  oldUpload.reject(Error("Network unavailable"));
  await Promise.all([loading, saving]);
  expect(t.request).toHaveBeenCalledTimes(2);
  expect(t.theme.error()).toBe("");
  expect(await t.preference()).toEqual({
    id: t.id,
    color: "#556677",
    dirty: false,
  });
});

it("ignores a response belonging to the previous account after the active account changes", async () => {
  const t = await setup(),
    response = deferred<{ backgroundColor: string }>();
  t.request.mockImplementation((_path: string, body?: unknown) =>
    body ? Promise.resolve({ ok: true }) : response.promise,
  );
  const loading = t.theme.load();
  await vi.waitFor(() => expect(t.request).toHaveBeenCalledWith("preferences"));
  t.account.id = "theme-race-" + crypto.randomUUID();
  t.ids.push(t.account.id);
  await t.theme.save("#778899");
  response.resolve({ backgroundColor: "#ffffff" });
  await loading;
  expect(t.theme.color()).toBe("#778899");
  expect(await t.preference()).toEqual({
    id: t.account.id,
    color: "#778899",
    dirty: false,
  });
});
