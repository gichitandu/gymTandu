import { inject, Injectable, signal } from "@angular/core";
import Dexie from "dexie";
import { Account, AuthService } from "./auth";
import { Store } from "./store";
import { DataSet, Exercise, TABLES, TrainingPlan } from "../models/domain";
import { seed } from "../core/seed";
import { validateIntegrity } from "./integrity";
import { exportBackup } from "./backup";
import { missingProgramEvents } from "./plan-program";

const DEVICE_ARCHIVE = "gymtrack-user-device-local";
export function allowedArchiveNames(
  account: Pick<Account, "id" | "owner"> | null,
  platformOwner = false,
): string[] {
  if (!account) return [];
  return [
    ...new Set([
      account.owner ? "gymtrack-v1" : "gymtrack-user-" + account.id,
      DEVICE_ARCHIVE,
      ...(platformOwner ? ["gymtrack-v1"] : []),
    ]),
  ];
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function normalized(value: unknown): Promise<unknown> {
  if (value instanceof Blob)
    return {
      mime: value.type,
      content: await crypto.subtle
        .digest("SHA-256", await value.arrayBuffer())
        .then((bytes) =>
          [...new Uint8Array(bytes)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
        ),
    };
  if (Array.isArray(value)) return Promise.all(value.map(normalized));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (
        item === undefined ||
        key === "createdAt" ||
        key === "updatedAt" ||
        (item === "" &&
          ["videoUrl", "thumbnailUrl", "videoTitle", "videoChannel"].includes(
            key,
          ))
      )
        continue;
      result[key] = await normalized(item);
    }
    return result;
  }
  return value;
}
async function fingerprint(value: unknown) {
  return JSON.stringify(await normalized(value));
}
async function recoveredId(
  namespace: string,
  table: string,
  id: string,
  content: string,
) {
  return (
    "recovered-" +
    table +
    "-" +
    (await hash(namespace + ":" + id + ":" + content)).slice(0, 32)
  );
}

/** Reads an existing archive without migrating, replacing or creating it. */
export async function readExistingArchive(
  name: string,
): Promise<DataSet | undefined> {
  if (!(await Dexie.exists(name))) return undefined;
  const db = new Dexie(name);
  try {
    await db.open();
    const tables = db.tables.filter((table) =>
      TABLES.includes(table.name as keyof DataSet),
    );
    const rows = await db.transaction("r", tables, () =>
      Promise.all(
        tables.map(async (table) => [table.name, await table.toArray()]),
      ),
    );
    const defaults = seed(),
      data = { ...defaults, ...Object.fromEntries(rows) } as DataSet;
    // Old partially initialized archives can still contain useful plans.
    if (!data.profiles.length) data.profiles = defaults.profiles;
    if (!data.roles.length) data.roles = defaults.roles;
    if (!data.settings.length) data.settings = defaults.settings;
    validateIntegrity(data);
    return data;
  } finally {
    db.close();
  }
}

function planGraph(
  data: DataSet,
  plan: TrainingPlan,
  exerciseIds = new Map<string, string>(),
) {
  const { active, updatedAt, ...metadata } = plan;
  const days = data.days
    .filter((day) => day.planId === plan.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(days.map((day) => day.id));
  return {
    plan: metadata,
    days,
    exercises: data.planExercises
      .filter((entry) => ids.has(entry.dayId))
      .map((entry) => ({
        ...entry,
        exerciseId: exerciseIds.get(entry.exerciseId) || entry.exerciseId,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Adds catalog entries and complete plan graphs; existing rows always survive. */
export async function mergeRecoveredArchive(
  current: DataSet,
  source: DataSet,
  sourceKey: string,
): Promise<DataSet> {
  const next = structuredClone(current),
    groupIds = new Map<string, string>(),
    exerciseIds = new Map<string, string>();
  for (const group of source.muscleGroups) {
    const same = next.muscleGroups.find((item) => item.name === group.name);
    if (same) {
      groupIds.set(group.id, same.id);
      continue;
    }
    const collision = next.muscleGroups.some((item) => item.id === group.id);
    const id = collision
      ? await recoveredId(sourceKey, "group", group.id, group.name)
      : group.id;
    if (!next.muscleGroups.some((item) => item.id === id))
      next.muscleGroups.push({ ...group, id });
    groupIds.set(group.id, id);
  }
  for (const exercise of source.exercises) {
    const entry: Exercise = {
      ...exercise,
      muscleGroupId:
        groupIds.get(exercise.muscleGroupId) || exercise.muscleGroupId,
      secondaryMuscleIds: exercise.secondaryMuscleIds.map(
        (id) => groupIds.get(id) || id,
      ),
    };
    const existing = next.exercises.find((item) => item.id === entry.id),
      content = await fingerprint(entry);
    let id = entry.id;
    if (existing && (await fingerprint(existing)) !== content)
      id = await recoveredId(sourceKey, "exercise", entry.id, content);
    if (!next.exercises.some((item) => item.id === id))
      next.exercises.push({ ...entry, id });
    exerciseIds.set(exercise.id, id);
  }
  for (const plan of source.plans) {
    const existing = next.plans.find((item) => item.id === plan.id),
      graph = await fingerprint(planGraph(source, plan, exerciseIds));
    if (existing && (await fingerprint(planGraph(next, existing))) === graph)
      continue;
    const collision = !!existing;
    const planId = collision
      ? await recoveredId(sourceKey, "plan", plan.id, graph)
      : plan.id;
    if (next.plans.some((item) => item.id === planId)) continue;
    const active = plan.active && !next.plans.some((item) => item.active);
    next.plans.push({
      ...plan,
      id: planId,
      userId: next.profiles[0].id,
      active,
      name: collision ? (plan.name + " · recuperato").slice(0, 200) : plan.name,
    });
    const days = source.days.filter((day) => day.planId === plan.id);
    for (const day of days) {
      const dayId =
        collision || next.days.some((item) => item.id === day.id)
          ? await recoveredId(sourceKey + ":" + planId, "day", day.id, graph)
          : day.id;
      next.days.push({ ...day, id: dayId, planId });
      for (const entry of source.planExercises.filter(
        (item) => item.dayId === day.id,
      )) {
        const id =
          collision || next.planExercises.some((item) => item.id === entry.id)
            ? await recoveredId(
                sourceKey + ":" + planId,
                "entry",
                entry.id,
                graph,
              )
            : entry.id;
        next.planExercises.push({
          ...entry,
          id,
          dayId,
          exerciseId: exerciseIds.get(entry.exerciseId) || entry.exerciseId,
        });
      }
    }
  }
  // Il recupero copiava piano e giorni ma non gli eventi: i programmi a date fisse sparivano dal calendario.
  const recoveredPlans = next.plans
    .filter((plan) => !current.plans.some((item) => item.id === plan.id))
    .map((plan) => plan.id);
  if (recoveredPlans.length)
    next.scheduledWorkouts.push(...missingProgramEvents(next, recoveredPlans));
  validateIntegrity(next);
  return next;
}

export interface RecoveryCandidate {
  key: string;
  label: string;
  plans: number;
  exercises: number;
  workouts: number;
  meals: number;
}
@Injectable({ providedIn: "root" })
export class ArchiveRecoveryService {
  private auth = inject(AuthService);
  private store = inject(Store);
  candidates = signal<RecoveryCandidate[]>([]);
  busy = signal(false);
  searched = signal(false);
  status = signal("");
  private permitted(key: string) {
    return (
      allowedArchiveNames(this.auth.user(), this.auth.platformOwner()).includes(
        key,
      ) && key !== this.store.archiveKey()
    );
  }
  async scan() {
    if (this.busy() || !this.store.ready()) return;
    this.busy.set(true);
    this.status.set("");
    try {
      const candidates: RecoveryCandidate[] = [],
        defaults = new Map(
          await Promise.all(
            seed().exercises.map(
              async (item) => [item.id, await fingerprint(item)] as const,
            ),
          ),
        );
      for (const key of allowedArchiveNames(
        this.auth.user(),
        this.auth.platformOwner(),
      ).filter((key) => key !== this.store.archiveKey())) {
        try {
          const data = await readExistingArchive(key);
          if (!data) continue;
          let changed = 0;
          for (const exercise of data.exercises)
            if (defaults.get(exercise.id) !== (await fingerprint(exercise)))
              changed++;
          if (
            data.plans.length ||
            changed ||
            data.workouts.length ||
            data.meals.length
          )
            candidates.push({
              key,
              label:
                key === DEVICE_ARCHIVE
                  ? "Spazio senza account su questo dispositivo"
                  : "Archivio personale dell’account",
              plans: data.plans.length,
              exercises: changed,
              workouts: data.workouts.length,
              meals: data.meals.length,
            });
        } catch {
          this.status.set(
            "Un archivio presente non è leggibile automaticamente. La copia originale non è stata modificata.",
          );
        }
      }
      this.candidates.set(candidates);
      this.searched.set(true);
    } finally {
      this.busy.set(false);
    }
  }
  async recover(key: string) {
    if (this.busy() || !this.permitted(key)) return;
    this.busy.set(true);
    try {
      const source = await readExistingArchive(key);
      if (!source)
        throw Error(
          "Questo archivio non è più disponibile in questa installazione.",
        );
      const ok = await this.store.change(
        async (data) => {
          Object.assign(data, await mergeRecoveredArchive(data, source, key));
        },
        "Piani ed esercizi recuperati. I dati attuali e l’archivio originale sono conservati.",
        false,
      );
      if (ok)
        this.status.set(
          "Piani ed esercizi aggiunti all’archivio aperto. Le versioni diverse degli stessi piani restano separate.",
        );
    } catch (error) {
      this.store.error.set(
        error instanceof Error
          ? error.message
          : "Recupero non riuscito. Le copie originali sono conservate.",
      );
    } finally {
      this.busy.set(false);
    }
  }
  async download(key: string) {
    if (this.busy() || !this.permitted(key)) return;
    this.busy.set(true);
    try {
      const source = await readExistingArchive(key);
      if (!source) throw Error("Archivio non disponibile.");
      const url = URL.createObjectURL(
        new Blob([await exportBackup(source)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "gymtrack-archivio-recuperato.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.store.message.set(
        "Copia completa generata: verifica che sia stata salvata in File.",
      );
    } catch (error) {
      this.store.error.set(
        error instanceof Error ? error.message : "Copia non generata.",
      );
    } finally {
      this.busy.set(false);
    }
  }
}
