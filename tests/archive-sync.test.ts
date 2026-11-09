import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  signal,
} from "@angular/core";
import { afterEach, expect, it, vi } from "vitest";
import {
  ArchiveSyncService,
  archiveFingerprint,
} from "../src/app/services/archive-sync";
import { AuthService } from "../src/app/services/auth";
import { exportBackup, importBackup } from "../src/app/services/backup";
import { seed } from "../src/app/core/seed";
import { DataSet } from "../src/app/models/domain";

const injectors: EnvironmentInjector[] = [];
afterEach(() => {
  for (const injector of injectors) injector.destroy();
  injectors.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function plans(name: string): DataSet {
  const data = seed(),
    at = "2026-10-21T12:00:00.000Z";
  data.plans.push({
    id: "p",
    userId: "local",
    name,
    description: "",
    createdAt: at,
    updatedAt: at,
    active: true,
    archived: false,
  });
  return data;
}
async function setup(remote?: DataSet, owner = false) {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  const nav = { onLine: true },
    win = new EventTarget(),
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  const head = {
    revision: remote ? 1 : 0,
    backup: remote ? await exportBackup(remote) : (null as string | null),
    updatedAt: Date.now(),
  };
  const posts: { base: string; backup: string }[] = [];
  let lostAcknowledgement = false;
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const base = (options.headers as Record<string, string>)["If-Match"],
        backup = options.body as string;
      posts.push({ base, backup });
      if (Number(base) !== head.revision)
        return Response.json({ revision: head.revision }, { status: 409 });
      head.revision++;
      head.backup = backup;
      head.updatedAt = Date.now();
      if (lostAcknowledgement) {
        lostAcknowledgement = false;
        throw new TypeError("Connessione interrotta");
      }
      return Response.json(head);
    }
    return Response.json(head);
  });
  vi.stubGlobal("fetch", fetch);
  const auth = {
    user: signal({ id: owner ? "owner" : "device-local", owner }),
    offlineMode: () => true,
  };
  const injector = createEnvironmentInjector(
    [{ provide: AuthService, useValue: auth }, ArchiveSyncService],
    null as unknown as EnvironmentInjector,
  );
  injectors.push(injector);
  const service = injector.get(ArchiveSyncService);
  return {
    service,
    storage,
    nav,
    win,
    doc,
    head,
    posts,
    fetch,
    key: owner ? "gymtrack-v1" : "gymtrack-user-device-local",
    loseAck: () => (lostAcknowledgement = true),
  };
}

it("restores a server archive into an empty installation without uploading its seed", async () => {
  const t = await setup(plans("Piani recuperati"));
  const restored = await t.service.open(t.key, seed());
  expect(restored.plans[0].name).toBe("Piani recuperati");
  expect(t.service.status()).toBe("saved");
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(0);
});

it("never overwrites a populated different server archive when local metadata is missing", async () => {
  const t = await setup(plans("Copia server")),
    local = plans("Copia dispositivo");
  expect(await t.service.open(t.key, local)).toBe(local);
  expect(t.service.status()).toBe("conflict");
  expect(await t.service.flush()).toBe(false);
  expect(t.posts).toHaveLength(0);
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Copia server",
  );
  const downloaded = await t.service.readRemote();
  expect(downloaded?.plans[0].name).toBe("Copia server");
});

it("uploads existing local data to a missing server head and detects a baseline lost later", async () => {
  const t = await setup(),
    local = plans("Il mio piano");
  await t.service.open(t.key, local);
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(1);
  expect(t.posts[0].base).toBe("0");
  expect(t.service.status()).toBe("saved");
  t.storage.clear();
  const edited = plans("Modificato senza metadati");
  await t.service.open(t.key, edited);
  expect(t.service.status()).toBe("conflict");
  expect(await t.service.flush()).toBe(false);
  expect(t.posts).toHaveLength(1);
});

it("does not upload startup seed or catalog receipt noise before the first real save", async () => {
  const t = await setup(),
    empty = seed();
  await t.service.open(t.key, empty);
  t.service.changed(empty);
  const receipt = structuredClone(empty);
  (receipt.settings[0] as any).catalogBaseline = {
    exercises: { "exercise-0": "receipt" },
    groups: {},
  };
  t.service.changed(receipt);
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(0);
  expect(t.head.revision).toBe(0);
  t.service.changed(plans("Primo vero piano"));
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(1);
});

it("syncs an explicitly disabled weekly reuse preference even before the first plan exists", async () => {
  const t = await setup(),
    data = seed();
  await t.service.open(t.key, data);
  data.settings[0].reusePreviousWeek = false;
  t.service.changed(data);
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(1);
  expect(
    (await importBackup(t.head.backup!)).settings[0].reusePreviousWeek,
  ).toBe(false);
});

function recordedWorkout() {
  const data = seed(),
    at = "2026-11-03T17:00:00Z";
  data.workouts.push({
    id: "completed",
    userId: "local",
    planId: "p",
    dayId: "d",
    planName: "Piano",
    dayName: "Seduta",
    date: "2026-11-03",
    startedAt: at,
    endedAt: "2026-11-03T18:00:00Z",
    duration: 60,
    status: "completed",
    notes: "",
  });
  data.workoutExercises.push({
    id: "we",
    workoutId: "completed",
    exerciseId: "exercise-0",
    name: "Panca",
    loadMode: "external",
    order: 0,
    rest: 90,
    notes: "",
  });
  data.sets.push({
    id: "set",
    workoutExerciseId: "we",
    number: 1,
    weight: 72.5,
    reps: 9,
    completed: true,
  });
  return data;
}
it("does not auto-restore a newer server revision that contains less progress than the acknowledged device archive", async () => {
  const data = recordedWorkout(),
    t = await setup(data);
  await t.service.open(t.key, data);
  const stale = structuredClone(data);
  stale.workouts[0].status = "draft";
  stale.sets[0].completed = false;
  stale.sets[0].weight = 0;
  t.head.revision++;
  t.head.backup = await exportBackup(stale);
  const accept = vi.fn().mockResolvedValue(true);
  expect(await t.service.open(t.key, data, true, accept)).toBe(data);
  expect(accept).not.toHaveBeenCalled();
  expect(t.service.status()).toBe("conflict");
  expect(t.service.message()).toContain("meno progressi");
  expect(data.sets[0].weight).toBe(72.5);
});
it("rejects a server revision older than one already acknowledged instead of replacing local data", async () => {
  const data = recordedWorkout(),
    t = await setup(data);
  await t.service.open(t.key, data);
  t.head.revision = 0;
  const accept = vi.fn().mockResolvedValue(true);
  expect(await t.service.open(t.key, data, true, accept)).toBe(data);
  expect(accept).not.toHaveBeenCalled();
  expect(t.service.status()).toBe("conflict");
  expect(t.service.message()).toContain("precedente a un salvataggio");
});
it("persists exact intentional history edits offline and clears their receipt only after a server acknowledgement", async () => {
  const data = recordedWorkout(),
    t = await setup(data);
  await t.service.open(t.key, data);
  const edited = structuredClone(data);
  edited.sets[0].completed = false;
  t.nav.onLine = false;
  t.service.changed(edited, { workouts: [], sets: ["set"] });
  const meta = JSON.parse([...t.storage.values()][0]);
  expect(meta.historyIntent["s:set"]).toBeGreaterThan(0);
  await t.service.open(t.key, edited);
  t.nav.onLine = true;
  expect(await t.service.flush()).toBe(true);
  const sent = JSON.parse(t.posts[0].backup);
  expect(sent.historyIntent).toEqual({ workouts: [], sets: ["set"] });
  expect(JSON.parse([...t.storage.values()][0]).historyIntent).toBeUndefined();
  expect((await importBackup(t.head.backup!)).sets[0].completed).toBe(false);
});
it("writes a protected update checkpoint even when the regular snapshot already matches the server", async () => {
  const data = recordedWorkout(),
    t = await setup(data);
  await t.service.open(t.key, data);
  expect(await t.service.checkpointForUpdate()).toBe(true);
  expect(t.posts).toHaveLength(1);
  expect(
    t.fetch.mock.calls.some(([url]) =>
      url.includes("checkpoint=before-update"),
    ),
  ).toBe(true);
  expect((await importBackup(t.head.backup!)).sets[0]).toMatchObject({
    weight: 72.5,
    reps: 9,
    completed: true,
  });
});

it("lets an existing populated Safari archive fill a server head containing only a fresh PWA seed", async () => {
  const t = await setup(seed()),
    local = plans("Piano Safari esistente");
  expect(await t.service.open(t.key, local)).toBe(local);
  expect(await t.service.flush()).toBe(true);
  expect(t.posts[0].base).toBe("1");
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Piano Safari esistente",
  );
});

it("copies an intentional deletion after a first upload already in flight instead of resurrecting its older plan", async () => {
  const t = await setup();
  await t.service.open(t.key, plans("Da cancellare"));
  const original = t.fetch.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  t.fetch.mockImplementationOnce(async (url, options) => {
    const response = await original(url, options);
    await held;
    return response;
  });
  const saving = t.service.flush();
  await vi.waitFor(() => expect(t.posts).toHaveLength(1));
  t.service.changed(seed());
  release();
  expect(await saving).toBe(true);
  expect(t.posts).toHaveLength(2);
  expect((await importBackup(t.head.backup!)).plans).toHaveLength(0);
});

it("keeps offline writes local and copies them online only against their known baseline", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  t.nav.onLine = false;
  t.service.changed(plans("Modifica offline"));
  expect(t.service.status()).toBe("offline");
  expect(await t.service.flush()).toBe(false);
  expect(t.posts).toHaveLength(0);
  t.nav.onLine = true;
  t.win.dispatchEvent(new Event("online"));
  await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Modifica offline",
  );
  expect(t.posts).toHaveLength(1);
});

it("stages server recovery after reconnect rather than returning unseen restored data to no caller", async () => {
  const t = await setup(plans("Piano sul server"));
  t.nav.onLine = false;
  const local = seed();
  expect(await t.service.open(t.key, local)).toBe(local);
  t.nav.onLine = true;
  t.win.dispatchEvent(new Event("online"));
  await vi.waitFor(() => expect(t.service.status()).toBe("conflict"));
  t.service.changed(plans("Nuovo piano offline"));
  expect(await t.service.flush()).toBe(false);
  expect(t.posts).toHaveLength(0);
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Piano sul server",
  );
});

it("rejects a stale client write and preserves both copies until an explicit recovery merge", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  t.service.changed(plans("Modifica locale"));
  t.head.revision = 2;
  t.head.backup = await exportBackup(plans("Altro dispositivo"));
  expect(await t.service.flush()).toBe(false);
  expect(t.service.status()).toBe("conflict");
  expect((await importBackup(t.head.backup)).plans[0].name).toBe(
    "Altro dispositivo",
  );
  const remote = await t.service.readRemote();
  await t.service.acceptRemote(remote!);
  t.service.changed(plans("Recupero confermato"));
  expect(await t.service.flush()).toBe(true);
  expect(t.posts.at(-1)?.base).toBe("2");
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Recupero confermato",
  );
});

it("does not advance the writable baseline when a downloaded recovery is cancelled", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  t.head.revision = 2;
  t.head.backup = await exportBackup(plans("Modifica da altro dispositivo"));
  await t.service.readRemote();
  expect(t.service.revision()).toBe(1);
  t.service.changed(plans("Modifica locale successiva"));
  expect(await t.service.flush()).toBe(false);
  expect(t.posts[0].base).toBe("1");
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Modifica da altro dispositivo",
  );
});

it("recognizes an already committed identical snapshot after its acknowledgement was lost", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  t.loseAck();
  t.service.changed(plans("Confermato sul server"));
  expect(await t.service.flush()).toBe(false);
  expect(t.head.revision).toBe(2);
  expect(await t.service.flush()).toBe(true);
  expect(t.service.status()).toBe("saved");
  expect(t.service.revision()).toBe(2);
});

it("does not mix the device-copy revision into an account recovery", async () => {
  const account = plans("Account"),
    t = await setup(account, true);
  await t.service.open(t.key, account);
  const device = plans("Spazio locale"),
    backup = await exportBackup(device);
  t.fetch.mockImplementationOnce(async () =>
    Response.json({ revision: 9, backup, updatedAt: Date.now() }),
  );
  const downloaded = await t.service.readRemote("device");
  await t.service.acceptRemote(downloaded!, "device");
  expect(t.service.revision()).toBe(1);
  expect(t.service.canRecoverDevice()).toBe(true);
  t.service.changed(plans("Unione confermata"));
  expect(await t.service.flush()).toBe(true);
  expect(t.posts.at(-1)?.base).toBe("1");
});

it("compares content independently of export time, table ordering and runtime profile role", async () => {
  const first = plans("Piano"),
    second = structuredClone(first);
  second.exercises.reverse();
  second.profiles[0].role = "User";
  expect(await archiveFingerprint(await exportBackup(first))).toBe(
    await archiveFingerprint(await exportBackup(second)),
  );
});

it("starts pending copies immediately on background or page hide and removes lifecycle listeners when destroyed", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  t.service.changed(plans("Prima di uscire"));
  t.doc.visibilityState = "hidden";
  t.doc.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
  expect(t.posts).toHaveLength(1);
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Prima di uscire",
  );
  t.service.changed(plans("Pagina chiusa"));
  t.win.dispatchEvent(new Event("pagehide"));
  await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
  expect(t.posts).toHaveLength(2);
  const flush = vi.spyOn(t.service, "flush");
  t.service.ngOnDestroy();
  t.doc.dispatchEvent(new Event("visibilitychange"));
  t.win.dispatchEvent(new Event("pagehide"));
  expect(flush).not.toHaveBeenCalled();
});

it("retries an interrupted background copy on foreground even when the browser stays online", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  const original = t.fetch.getMockImplementation()!;
  let interrupt = true;
  t.fetch.mockImplementation(async (url, options) => {
    if (options?.method === "POST" && interrupt) {
      interrupt = false;
      throw new TypeError("Richiesta sospesa da iOS");
    }
    return original(url, options);
  });
  t.service.changed(plans("Modifica prima del blocco"));
  t.doc.visibilityState = "hidden";
  t.doc.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(t.service.status()).toBe("offline"));
  expect(t.nav.onLine).toBe(true);
  t.doc.visibilityState = "visible";
  t.doc.dispatchEvent(new Event("visibilitychange"));
  await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
  expect(
    t.fetch.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(2);
  expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
    "Modifica prima del blocco",
  );
});

it("coalesces repeated pageshow and foreground events into one upload and does not retry a conflict", async () => {
  const initial = plans("Primo"),
    t = await setup(initial);
  await t.service.open(t.key, initial);
  const original = t.fetch.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  t.fetch.mockImplementation(async (url, options) => {
    const response = await original(url, options);
    if (options?.method === "POST") await held;
    return response;
  });
  try {
    t.service.changed(plans("Ripresa"));
    t.win.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(t.posts).toHaveLength(1));
    t.win.dispatchEvent(new Event("pageshow"));
    t.doc.dispatchEvent(new Event("visibilitychange"));
    release();
    await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
    expect(t.posts).toHaveLength(1);
    t.fetch.mockImplementation(original);
    t.head.revision++;
    t.head.backup = await exportBackup(plans("Altro dispositivo"));
    t.service.changed(plans("Da conservare"));
    expect(await t.service.flush()).toBe(false);
    expect(t.service.status()).toBe("conflict");
    const calls = t.fetch.mock.calls.length;
    t.win.dispatchEvent(new Event("pageshow"));
    t.doc.dispatchEvent(new Event("visibilitychange"));
    t.win.dispatchEvent(new Event("online"));
    await Promise.resolve();
    expect(t.fetch).toHaveBeenCalledTimes(calls);
  } finally {
    release();
  }
}, 15000);

it("automatically retries a transient online failure with backoff without requiring another edit", async () => {
  vi.useFakeTimers();
  try {
    const initial = plans("Primo"),
      t = await setup(initial);
    await t.service.open(t.key, initial);
    const original = t.fetch.getMockImplementation()!;
    let failed = false;
    t.fetch.mockImplementation(async (url, options) => {
      if (options?.method === "POST" && !failed) {
        failed = true;
        throw new TypeError("Rete intermittente");
      }
      return original(url, options);
    });
    t.service.changed(plans("Da sincronizzare"));
    expect(await t.service.flush()).toBe(false);
    expect(t.service.status()).toBe("offline");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(t.service.status()).toBe("saved"));
    expect((await importBackup(t.head.backup!)).plans[0].name).toBe(
      "Da sincronizzare",
    );
  } finally {
    vi.useRealTimers();
  }
});

it("does not create a seed-only server copy when an update flush waits for the first server check", async () => {
  const t = await setup(),
    initial = seed(),
    original = t.fetch.getMockImplementation()!;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  t.fetch.mockImplementationOnce(async (url, options) => {
    await held;
    return original(url, options);
  });
  const opening = t.service.open(t.key, initial),
    flushing = t.service.flush();
  t.service.changed(initial);
  release();
  await opening;
  t.service.changed(initial);
  expect(await flushing).toBe(true);
  expect(await t.service.flush()).toBe(true);
  expect(t.posts).toHaveLength(0);
  expect(t.head.revision).toBe(0);
});
