import { validateIntegrity } from "./integrity";
export { validateIntegrity } from "./integrity";
import { z } from "zod";
import { DataSet } from "../models/domain";
export const BACKUP_VERSION = 1;
const id = z.string().min(1).max(150);
const text = z.string().max(10000);
const nonempty = z.string().trim().min(1).max(200);
const num = z.number().finite().nonnegative();
const int = num.int();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const time = z.iso.datetime({ offset: true });
const mode = z.enum([
  "external",
  "bodyweight",
  "weighted-bodyweight",
  "assisted",
]);
const rpe = z.number().min(1).max(10).optional();
const image = z.object({
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z
    .string()
    .max(2800000)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
});
const schemas = {
  profiles: z.object({
    id,
    name: nonempty,
    role: z.enum(["SuperAdmin", "Admin", "User"]),
    bodyWeight: z.number().positive().max(700).optional(),
    height: z.number().positive().max(300).optional(),
    birthDate: date.optional(),
    goal: text.optional(),
  }),
  roles: z.object({
    id,
    name: z.enum(["SuperAdmin", "Admin", "User"]),
    permissions: z.array(text).max(100),
  }),
  plans: z.object({
    id,
    userId: id,
    name: nonempty,
    description: text,
    createdAt: time,
    updatedAt: time,
    active: z.boolean(),
    archived: z.boolean(),
  }),
  days: z.object({
    id,
    planId: id,
    name: nonempty,
    order: int,
    weekday: z.number().int().min(0).max(6).optional(),
  }),
  planExercises: z
    .object({
      id,
      dayId: id,
      exerciseId: id,
      sets: z.number().int().min(1).max(30),
      repsMin: z.number().int().min(1).max(999),
      repsMax: z.number().int().min(1).max(999),
      targetWeight: num.optional(),
      rest: num.max(3600),
      rpe,
      notes: text,
      order: int,
    })
    .refine((e) => e.repsMin <= e.repsMax),
  exercises: z.object({
    id,
    name: nonempty,
    muscleGroupId: id,
    secondaryMuscleIds: z.array(id).max(100),
    description: text,
    image: image.optional(),
    equipment: nonempty,
    tags: z.array(text).max(100),
    active: z.boolean(),
    createdAt: time,
    loadMode: mode,
  }),
  muscleGroups: z.object({ id, name: nonempty }),
  workouts: z
    .object({
      id,
      userId: id,
      planId: id,
      dayId: id,
      planName: nonempty,
      dayName: nonempty,
      date,
      startedAt: time,
      endedAt: time.optional(),
      duration: num.max(100000),
      notes: text,
      status: z.enum(["draft", "completed"]),
      bodyWeight: z.number().positive().max(700).optional(),
    })
    .refine((w) => w.status !== "completed" || !!w.endedAt)
    .refine((w) => !w.endedAt || new Date(w.endedAt) >= new Date(w.startedAt)),
  workoutExercises: z.object({
    id,
    workoutId: id,
    exerciseId: id,
    name: nonempty,
    loadMode: mode,
    order: int,
    rest: num.max(3600),
    notes: text,
  }),
  sets: z.object({
    id,
    workoutExerciseId: id,
    number: z.number().int().min(1),
    weight: num,
    reps: z.number().int().min(1).max(999),
    rpe,
    rest: num.max(3600).optional(),
    notes: text.optional(),
    completed: z.boolean(),
  }),
  settings: z.object({
    id,
    theme: z.enum(["dark", "light"]),
    unit: z.enum(["kg", "lb"]),
    prefill: z.boolean(),
    lastBackup: time.optional(),
  }),
};
const dataSchema = z.object({
  profiles: z.array(schemas.profiles).length(1),
  roles: z.array(schemas.roles).min(3).max(3),
  plans: z.array(schemas.plans).max(10000),
  days: z.array(schemas.days).max(100000),
  planExercises: z.array(schemas.planExercises).max(100000),
  exercises: z.array(schemas.exercises).max(10000),
  muscleGroups: z.array(schemas.muscleGroups).min(1).max(1000),
  workouts: z.array(schemas.workouts).max(100000),
  workoutExercises: z.array(schemas.workoutExercises).max(300000),
  sets: z.array(schemas.sets).max(1000000),
  settings: z.array(schemas.settings).length(1),
});
async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
export async function exportBackup(data: DataSet) {
  validateIntegrity(data);
  const exercises = await Promise.all(
    data.exercises.map(async (e) => ({
      ...e,
      image: e.image
        ? { mime: e.image.type, data: await base64(e.image) }
        : undefined,
    })),
  );
  return JSON.stringify(
    {
      app: "GymTrack",
      schemaVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: { ...data, exercises },
    },
    null,
    2,
  );
}
// Add explicit vN -> vN+1 pure functions here when the on-disk format evolves.
export const migrations: Record<number, (value: unknown) => unknown> = {};
export async function importBackup(json: string): Promise<DataSet> {
  if (new Blob([json]).size > 50 * 1024 * 1024)
    throw Error("Backup troppo grande: limite 50 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw Error("Il file non è un JSON valido.");
  }
  const header = z
    .object({
      app: z.literal("GymTrack"),
      schemaVersion: z.number().int().positive(),
      exportedAt: time,
      data: z.unknown(),
    })
    .safeParse(raw);
  if (!header.success) throw Error("Il file non è un backup GymTrack valido.");
  let version = header.data.schemaVersion;
  let value = header.data.data;
  while (version < BACKUP_VERSION) {
    if (!migrations[version]) throw Error("Versione backup non migrabile.");
    value = migrations[version](value);
    version++;
  }
  if (version !== BACKUP_VERSION)
    throw Error("Questo backup usa una versione più recente di GymTrack.");
  const parsed = dataSchema.safeParse(value);
  if (!parsed.success)
    throw Error(
      "Dati del backup non validi: " +
        parsed.error.issues
          .slice(0, 3)
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; "),
    );
  const data = parsed.data;
  const exercises = await Promise.all(
    data.exercises.map(async (e) => {
      if (!e.image) return { ...e, image: undefined };
      const { mime, data: encoded } = e.image;
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      } catch {
        throw Error("Immagine del backup non valida.");
      }
      if (bytes.length > 2 * 1024 * 1024 || bytes.length < 12)
        throw Error("Dimensione immagine non valida.");
      const sig = Array.from(bytes.slice(0, 12));
      const ok =
        mime === "image/png"
          ? sig.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
          : mime === "image/jpeg"
            ? sig[0] === 255 && sig[1] === 216 && sig[2] === 255
            : String.fromCharCode(...sig.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...sig.slice(8, 12)) === "WEBP";
      if (!ok) throw Error("Formato immagine non coerente.");
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(blob);
          bitmap.close();
        } catch {
          throw Error("Contenuto immagine non decodificabile.");
        }
      }
      return { ...e, image: blob };
    }),
  );
  const result: DataSet = { ...data, exercises };
  validateIntegrity(result);
  return result;
}
