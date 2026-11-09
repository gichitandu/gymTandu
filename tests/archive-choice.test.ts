import "@angular/compiler";
import { afterEach, expect, it, vi } from "vitest";
import {
  ARCHIVE_CHOICE_KEY,
  AuthService,
  OFFLINE_ACCOUNT_KEY,
} from "../src/app/services/auth";

afterEach(() => vi.unstubAllGlobals());
const owner = {
  id: "owner-id",
  name: "Owner",
  email: "owner@example.test",
  role: "SuperAdmin",
  active: true,
  owner: true,
};
function browser(
  entries: [string, string][],
  online = true,
  user: unknown = owner,
) {
  const storage = new Map(entries);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("navigator", { onLine: online });
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      user,
      setup: false,
      ownerEmail: owner.email,
      platformOwner: true,
    }),
  });
  vi.stubGlobal("fetch", fetch);
  const reload = vi.fn();
  vi.stubGlobal("location", { reload });
  return { storage, fetch, reload };
}
it("reopens the explicitly chosen device archive after reload even when an account cookie is valid", async () => {
  const b = browser([[ARCHIVE_CHOICE_KEY, JSON.stringify({ mode: "device" })]]);
  const auth = new AuthService();
  expect(auth.user()?.id).toBe("device-local");
  await vi.waitFor(() => expect(auth.platformOwner()).toBe(true));
  expect(auth.user()?.id).toBe("device-local");
  expect(auth.offlineMode()).toBe(true);
  expect(JSON.parse(b.storage.get(ARCHIVE_CHOICE_KEY)!)).toEqual({
    mode: "device",
  });
  await expect(auth.request("users")).rejects.toThrow("online");
});
it("restores an opted-in account archive offline while retaining User privileges", () => {
  const b = browser(
    [
      [
        ARCHIVE_CHOICE_KEY,
        JSON.stringify({ mode: "account-offline", accountId: owner.id }),
      ],
      [OFFLINE_ACCOUNT_KEY, JSON.stringify(owner)],
    ],
    false,
  );
  const auth = new AuthService();
  expect(auth.user()).toMatchObject({
    id: owner.id,
    owner: true,
    role: "User",
  });
  expect(auth.offlineMode()).toBe(true);
  expect(b.fetch).not.toHaveBeenCalled();
});
it("does not silently open another account over the last chosen account archive", async () => {
  browser(
    [
      [
        ARCHIVE_CHOICE_KEY,
        JSON.stringify({ mode: "account", accountId: owner.id }),
      ],
    ],
    true,
    { ...owner, id: "other-account", owner: false },
  );
  const auth = new AuthService();
  await vi.waitFor(() => expect(auth.loading()).toBe(false));
  expect(auth.user()).toBeNull();
  expect(auth.error()).toContain("stesso account");
  expect(auth.archiveChoice()?.accountId).toBe(owner.id);
});
it("reopens the remembered account archive when online status is true but the server is temporarily unreachable", async () => {
  const b = browser([
    [
      ARCHIVE_CHOICE_KEY,
      JSON.stringify({ mode: "account", accountId: owner.id }),
    ],
    [OFFLINE_ACCOUNT_KEY, JSON.stringify(owner)],
  ]);
  b.fetch.mockRejectedValue(Error("Server unavailable"));
  const auth = new AuthService();
  await vi.waitFor(() => expect(auth.loading()).toBe(false));
  expect(auth.user()?.id).toBe(owner.id);
  expect(auth.offlineMode()).toBe(true);
  expect(auth.archiveChoice()?.mode).toBe("account");
});
it("stays at the entry screen after explicit logout instead of reopening a different archive", async () => {
  const b = browser(
    [
      [ARCHIVE_CHOICE_KEY, JSON.stringify({ mode: "device" })],
      [OFFLINE_ACCOUNT_KEY, JSON.stringify(owner)],
    ],
    false,
  );
  const auth = new AuthService();
  await auth.logout();
  expect(b.reload).toHaveBeenCalledOnce();
  expect(b.storage.has(OFFLINE_ACCOUNT_KEY)).toBe(false);
  const reopened = new AuthService();
  expect(reopened.user()).toBeNull();
  expect(reopened.loading()).toBe(false);
  expect(reopened.archiveChoice()?.mode).toBe("signed-out");
  expect(b.fetch).not.toHaveBeenCalled();
});
