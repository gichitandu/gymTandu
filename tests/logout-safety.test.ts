import "@angular/compiler";
import { afterEach, expect, it, vi } from "vitest";
import {
  ARCHIVE_CHOICE_KEY,
  AuthService,
  OFFLINE_ACCOUNT_KEY,
  OFFLINE_OPT_OUT_KEY,
  PENDING_LOGOUT_KEY,
} from "../src/app/services/auth";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function browser(online = true) {
  const storage = new Map([
    [ARCHIVE_CHOICE_KEY, JSON.stringify({ mode: "signed-out" })],
    ["gymtrack-saved-data", "keep-me"],
  ]);
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      user: {
        id: "new-user",
        name: "Atleta",
        email: "test@example.test",
        role: "User",
        active: true,
        owner: false,
      },
    }),
  });
  const navigator = { onLine: online },
    reload = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("navigator", navigator);
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("location", { reload });
  return { storage, fetch, navigator, reload };
}
it("consumes server-confirmed iPhone recovery before remembered offline access can reopen, preserving the archive", () => {
  const t = browser();
  t.storage.set(
    ARCHIVE_CHOICE_KEY,
    JSON.stringify({ mode: "account-offline", accountId: "tandu" }),
  );
  t.storage.set(
    OFFLINE_ACCOUNT_KEY,
    JSON.stringify({ id: "tandu", name: "Tandu", owner: true }),
  );
  const doc = { cookie: "__Host-gymtrack-recovered=1" };
  vi.stubGlobal("document", doc);
  const auth = new AuthService();
  expect(auth.user()).toBeNull();
  expect(auth.offlineAccount()).toBeNull();
  expect(auth.loading()).toBe(false);
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  expect(t.fetch).not.toHaveBeenCalled();
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
  expect(t.storage.has(OFFLINE_ACCOUNT_KEY)).toBe(false);
  expect(doc.cookie).toContain("Max-Age=0");
});
it("logs out once, keeps saved data, and allows the update coordinator to control reloading", async () => {
  const t = browser();
  const auth = new AuthService();
  auth.user.set({
    id: "u",
    name: "Atleta",
    email: "u@test.it",
    role: "User",
    active: true,
    owner: false,
  });
  let finish!: (value: unknown) => void;
  t.fetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const first = auth.logout({ reload: false });
  await auth.logout({ reload: false });
  expect(t.fetch).toHaveBeenCalledTimes(1);
  expect(auth.user()).toBeNull();
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  finish({ ok: true, json: async () => ({ ok: true }) });
  await first;
  expect(auth.user()).toBeNull();
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
  expect(t.reload).not.toHaveBeenCalled();
});
it("signs out locally when online revocation fails, preserving archives and revoking before the next login", async () => {
  const t = browser();
  const auth = new AuthService();
  auth.user.set({
    id: "u",
    name: "Atleta",
    email: "u@test.it",
    role: "User",
    active: true,
    owner: false,
  });
  t.fetch.mockRejectedValueOnce(Error("Network failed"));
  await auth.logout({ reload: false });
  expect(auth.user()).toBeNull();
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
  const reopened = new AuthService();
  await reopened.login("new@test.it", "password");
  expect(t.fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/auth/logout",
    "/api/auth/logout",
    "/api/auth/login",
  ]);
  expect(t.storage.has(PENDING_LOGOUT_KEY)).toBe(false);
});
it("retains the current page if neither cookie revocation nor durable local sign-out can succeed", async () => {
  const t = browser();
  const auth = new AuthService();
  const user = {
    id: "u",
    name: "Atleta",
    email: "u@test.it",
    role: "User" as const,
    active: true,
    owner: false,
  };
  auth.user.set(user);
  t.fetch.mockRejectedValueOnce(Error("Network failed"));
  (localStorage as any).setItem = () => {
    throw Error("Storage blocked");
  };
  await expect(auth.logout({ reload: false })).rejects.toThrow(
    "non consente di ricordarla",
  );
  expect(auth.user()).toEqual(user);
  expect(auth.loggingOut()).toBe(false);
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
});
it("never logs into another account while offline revocation is pending", async () => {
  const t = browser(false);
  t.storage.set(PENDING_LOGOUT_KEY, "1");
  const auth = new AuthService();
  await expect(auth.login("new@test.it", "password")).rejects.toThrow(
    "Riconnettiti",
  );
  expect(t.fetch).not.toHaveBeenCalled();
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  expect(auth.user()).toBeNull();
});
it("records an offline exit and revokes its pending cookie before a later login", async () => {
  const t = browser(false);
  t.storage.set(
    OFFLINE_ACCOUNT_KEY,
    JSON.stringify({ id: "old", name: "Old", owner: false }),
  );
  const auth = new AuthService();
  await auth.logout({ reload: false });
  expect(t.fetch).not.toHaveBeenCalled();
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  expect(t.storage.has(OFFLINE_ACCOUNT_KEY)).toBe(false);
  t.navigator.onLine = true;
  const reopened = new AuthService();
  await reopened.login("new@example.test", "a-password");
  expect(t.fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/auth/logout",
    "/api/auth/login",
  ]);
  expect(t.storage.has(PENDING_LOGOUT_KEY)).toBe(false);
  expect(reopened.user()?.id).toBe("new-user");
});
it("ignores a refresh started before logout and keeps the transition locked until reload", async () => {
  const t = browser();
  t.storage.set(ARCHIVE_CHOICE_KEY, JSON.stringify({ mode: "device" }));
  let finish!: (value: unknown) => void;
  t.fetch.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  const auth = new AuthService();
  await auth.logout({ reload: false });
  finish({
    ok: true,
    json: async () => ({
      user: { id: "old", name: "Old", owner: true, role: "SuperAdmin" },
      platformOwner: true,
    }),
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(auth.user()).toBeNull();
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  expect(auth.platformOwner()).toBe(false);
  expect(auth.loggingOut()).toBe(true);
  await expect(auth.login("other@test.it", "password")).rejects.toThrow(
    "Uscita in corso",
  );
  auth.openLocal();
  expect(auth.user()).toBeNull();
});

it("keeps the next login blocked while pending cookie revocation still fails", async () => {
  const t = browser();
  t.storage.set(PENDING_LOGOUT_KEY, "1");
  t.fetch.mockRejectedValue(Error("Service unavailable"));
  const auth = new AuthService();
  await expect(auth.login("new@test.it", "password")).rejects.toThrow(
    "Service unavailable",
  );
  expect(
    t.fetch.mock.calls.every((call) => call[0] === "/api/auth/logout"),
  ).toBe(true);
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  expect(auth.user()).toBeNull();
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
});

it("leaves immediately and reloads within a hard deadline even when cookie revocation never answers", async () => {
  vi.useFakeTimers();
  const t = browser(),
    auth = new AuthService();
  auth.user.set({
    id: "u",
    name: "Atleta",
    email: "u@test.it",
    role: "User",
    active: true,
    owner: false,
  });
  t.fetch.mockReturnValueOnce(new Promise(() => {}));
  const exiting = auth.logout();
  expect(auth.user()).toBeNull();
  expect(auth.archiveChoice()?.mode).toBe("signed-out");
  await vi.advanceTimersByTimeAsync(1500);
  await exiting;
  expect(t.reload).toHaveBeenCalledOnce();
  expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe("1");
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
});
it("makes the account device archive available offline by default without uploading a backup or password", async () => {
  const t = browser(),
    auth = new AuthService();
  await auth.login("new@test.it", "private-password");
  expect(auth.offlineAccount()).toMatchObject({ id: "new-user", role: "User" });
  expect(t.storage.get(OFFLINE_ACCOUNT_KEY)).not.toContain("private-password");
  t.navigator.onLine = false;
  const reopened = new AuthService();
  expect(reopened.user()?.id).toBe("new-user");
  expect(reopened.offlineMode()).toBe(true);
  expect(reopened.user()?.role).toBe("User");
  expect(t.fetch.mock.calls.map((call) => call[0])).toEqual([
    "/api/auth/login",
  ]);
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
});
it("migrates an already authenticated legacy session to offline availability without a server archive", async () => {
  const t = browser();
  t.storage.set(
    ARCHIVE_CHOICE_KEY,
    JSON.stringify({ mode: "account", accountId: "legacy" }),
  );
  t.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      user: {
        id: "legacy",
        name: "Tandu",
        email: "u@test.it",
        role: "SuperAdmin",
        active: true,
        owner: true,
      },
      setup: false,
    }),
  });
  const auth = new AuthService();
  await vi.waitFor(() => expect(auth.loading()).toBe(false));
  expect(auth.offlineAccount()).toMatchObject({
    id: "legacy",
    name: "Tandu",
    role: "User",
  });
  expect(auth.user()?.role).toBe("SuperAdmin");
  expect(t.fetch.mock.calls.map((call) => call[0])).toEqual(["/api/auth/me"]);
  expect(t.storage.get("gymtrack-saved-data")).toBe("keep-me");
});
it("honors explicitly disabled remembered access across online refresh until the user enables it", async () => {
  const t = browser(),
    auth = new AuthService();
  await auth.login("new@test.it", "password", false, false);
  await auth.refresh();
  expect(auth.offlineAccount()).toBeNull();
  expect(t.storage.has(OFFLINE_ACCOUNT_KEY)).toBe(false);
  expect(JSON.parse(t.storage.get(OFFLINE_OPT_OUT_KEY)!)).toContain("new-user");
  auth.enableOffline();
  expect(auth.offlineAccount()?.id).toBe("new-user");
  expect(JSON.parse(t.storage.get(OFFLINE_OPT_OUT_KEY)!)).not.toContain(
    "new-user",
  );
});
