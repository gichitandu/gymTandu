import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { afterEach, expect, it, vi } from "vitest";
import { AuthService } from "../src/app/services/auth";
import {
  DesignRuntime,
  canUseDesignStudio,
} from "../src/app/design/design-runtime";
import { DesignStyleTarget } from "../src/app/design/design-directives";
import { designStudioGuard } from "../src/app/design/design-guard";
import { DEFAULT_DESIGN } from "../shared/design-system.js";
afterEach(() => vi.unstubAllGlobals());
function auth(
  role: string | null = "SuperAdmin",
  offline = false,
  viewAsClient = false,
) {
  return {
    user: signal(role ? { id: "account", role } : null),
    uiRole: signal(viewAsClient ? "User" : role || "User"),
    offlineMode: signal(offline),
    loading: signal(false),
    refresh: vi.fn(),
    request: vi.fn().mockResolvedValue({}),
  };
}
it.each([null, "User", "Admin"])(
  "does not grant the editor to %s, offline identities or client preview",
  (role) => {
    expect(canUseDesignStudio(auth(role) as any)).toBe(false);
    expect(canUseDesignStudio(auth("SuperAdmin", true) as any)).toBe(false);
    expect(canUseDesignStudio(auth("SuperAdmin", false, true) as any)).toBe(
      false,
    );
    expect(canUseDesignStudio(auth() as any)).toBe(true);
  },
);
it("verifies the server before allowing the direct editor route and fails closed on 403/network errors", async () => {
  const account = auth(),
    denied = { path: "profile" },
    router = { createUrlTree: vi.fn().mockReturnValue(denied) };
  const injector = createEnvironmentInjector(
    [
      { provide: AuthService, useValue: account },
      { provide: Router, useValue: router },
    ],
    null as unknown as EnvironmentInjector,
  );
  const guard = () =>
    runInInjectionContext(injector, () =>
      designStudioGuard({} as any, {} as any),
    );
  expect(await guard()).toBe(true);
  expect(account.request).toHaveBeenCalledWith("design/studio");
  account.request.mockRejectedValue(Error("403"));
  expect(await guard()).toBe(denied);
  account.user.set({ id: "client", role: "Admin" });
  account.uiRole.set("Admin");
  account.request.mockClear();
  expect(await guard()).toBe(denied);
  expect(account.request).not.toHaveBeenCalled();
  injector.destroy();
});
it("waits for the initial authenticated session refresh instead of redirecting valid deep links", async () => {
  const account = auth(null);
  account.loading.set(true);
  account.refresh.mockImplementation(async () => {
    account.user.set({ id: "account", role: "SuperAdmin" });
    account.uiRole.set("SuperAdmin");
    account.loading.set(false);
  });
  const injector = createEnvironmentInjector(
    [
      { provide: AuthService, useValue: account },
      { provide: Router, useValue: { createUrlTree: () => false } },
    ],
    null as unknown as EnvironmentInjector,
  );
  expect(
    await runInInjectionContext(injector, () =>
      designStudioGuard({} as any, {} as any),
    ),
  ).toBe(true);
  expect(account.refresh).toHaveBeenCalledOnce();
  injector.destroy();
});
it("restores original inline styles and priorities, preserving functional attributes and unrelated styles", () => {
  const values = new Map([
    ["border-radius", { value: "8px", priority: "" }],
    ["--progress", { value: "25%", priority: "" }],
    ["height", { value: "auto", priority: "important" }],
  ]);
  const style = {
    getPropertyValue: (key: string) => values.get(key)?.value || "",
    getPropertyPriority: (key: string) => values.get(key)?.priority || "",
    setProperty: (key: string, value: string, priority = "") =>
      values.set(key, { value, priority }),
    removeProperty: (key: string) => values.delete(key),
  };
  const before = structuredClone(values),
    target = new DesignStyleTarget(style as any);
  target.apply({ "border-radius": "24px", background: "#123456" });
  expect(values.get("border-radius")?.value).toBe("24px");
  expect(values.get("--progress")?.value).toBe("25%");
  target.apply({ background: "#654321" });
  expect(values.get("border-radius")?.value).toBe("8px");
  target.clear();
  expect(values).toEqual(before);
});
it("does not allow a stale in-flight publication read to replace a more recent revision", () => {
  const storage = new Map();
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const runtime = Object.create(DesignRuntime.prototype);
  runtime.published = signal({
    revision: 4,
    config: structuredClone(DEFAULT_DESIGN),
    updatedAt: 4,
  });
  runtime.auth = { user: () => ({ id: "owner" }) };
  runtime.acceptPublished({
    revision: 3,
    config: { ...structuredClone(DEFAULT_DESIGN), presetId: "sabbia" },
    updatedAt: 3,
  });
  expect(runtime.published().revision).toBe(4);
  expect(storage.size).toBe(0);
  runtime.acceptPublished({
    revision: 5,
    config: { ...structuredClone(DEFAULT_DESIGN), presetId: "sabbia" },
    updatedAt: 5,
  });
  expect(runtime.published().revision).toBe(5);
  expect(storage.size).toBe(1);
});
