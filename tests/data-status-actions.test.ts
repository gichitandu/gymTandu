import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { afterEach, expect, it, vi } from "vitest";
import { DataStatusComponent } from "../src/app/shared/data-status.component";
import { Store } from "../src/app/services/store";
import { ArchiveSyncService } from "../src/app/services/archive-sync";
import { AuthService } from "../src/app/services/auth";
import { PwaService } from "../src/app/services/pwa";
let injector: EnvironmentInjector;
afterEach(() => injector?.destroy());
function setup() {
  const account = signal({ id: "a" }),
    scope = signal("a"),
    status = signal("offline"),
    flush = vi.fn().mockResolvedValue(true),
    settled = vi.fn().mockResolvedValue(true);
  injector = createEnvironmentInjector(
    [
      {
        provide: Store,
        useValue: {
          archiveKey: scope,
          settled,
          localSaveFailed: () => false,
          conflicted: () => false,
        },
      },
      {
        provide: ArchiveSyncService,
        useValue: { status, flush, message: () => "" },
      },
      {
        provide: AuthService,
        useValue: { user: account, offlineMode: () => false },
      },
      { provide: PwaService, useValue: { online: () => true } },
    ],
    null as unknown as EnvironmentInjector,
  );
  return {
    c: runInInjectionContext(injector, () => new DataStatusComponent()),
    account,
    scope,
    status,
    flush,
    settled,
  };
}
it("does not retry across an account change while local writes are pending", async () => {
  const t = setup();
  let done!: (value: boolean) => void;
  t.settled.mockReturnValue(new Promise((resolve) => (done = resolve)));
  const pending = t.c.retry();
  t.account.set({ id: "b" });
  t.scope.set("b");
  done(true);
  await pending;
  expect(t.flush).not.toHaveBeenCalled();
  expect(t.c.retrying()).toBe(false);
});
it("protects conflicts and suppresses repeated retry taps", async () => {
  const t = setup();
  t.status.set("conflict");
  await t.c.retry();
  expect(t.flush).not.toHaveBeenCalled();
  t.status.set("offline");
  await Promise.all([t.c.retry(), t.c.retry()]);
  expect(t.flush).toHaveBeenCalledTimes(1);
  expect(t.c.retryMessage()).toContain("confermata");
});
