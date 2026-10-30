import { validateIntegrity } from "./integrity";
export { validateIntegrity } from "./integrity";
import { z } from "zod";
import { DataSet } from "../models/domain";
export const BACKUP_VERSION = 9;
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
const machineSetup=z.object({machine:z.string().max(120).optional(),seat:z.string().max(80).optional(),backrest:z.string().max(80).optional(),grip:z.string().max(120).optional(),notes:z.string().max(500).optional()});
const prescriptionDetails={rirMin:z.number().min(0).max(10).optional(),rirMax:z.number().min(0).max(10).optional(),warmupNotes:text.optional(),reference:text.optional(),loadUnit:z.string().max(120).optional()};
const program=z.object({importId:id,sourceName:z.string().min(1).max(255),sourceKind:z.enum(['original','GT-1']),startDate:date,endDate:date,weeks:z.number().int().min(1).max(10000),fileHash:z.string().regex(/^[a-f0-9]{64}$/),importedAt:time,sessionCount:z.number().int().min(1).max(10000),createdExerciseIds:z.array(id).max(10000).optional(),createdGroupIds:z.array(id).max(1000).optional()}).refine(value=>value.endDate>=value.startDate);
const schemas = {
  profiles: z.object({
    id,
    photo: image.optional(),
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
    program:program.optional(),completedAt:time.optional(),completionReason:z.enum(['automatic','manual']).optional(),
  }),
  days: z.object({
    id,
    planId: id,
    name: nonempty,
    order: int,
    weekday: z.number().int().min(0).max(6).optional(),
    week:z.number().int().positive().max(10000).optional(),sessionDate:date.optional(),phase:z.string().max(200).optional(),notes:text.optional(),
  }),
  planExercises: z
    .object({
      id,
      dayId: id,
      exerciseId: id,
      superset:z.enum(["A","B","C","D"]).optional(),
      warmupSets:z.number().int().min(0).max(5).optional(),
      ...prescriptionDetails,
      sets: z.number().int().min(1).max(30),
      repsMin: z.number().int().min(1).max(999),
      repsMax: z.number().int().min(1).max(999),
      targetWeight: num.optional(),
      rest: num.max(7200),
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
    videoUrl: z.union([z.string().url().max(1000), z.literal("")]).optional(),
    thumbnailUrl: z.union([z.string().url().max(1000), z.literal("")]).optional(),
    videoTitle: text.optional(),
    videoChannel: text.optional(),
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
      duration: num.max(100000),durationUnknown:z.boolean().optional(),
      notes: text,
      status: z.enum(["draft", "completed"]),
      bodyWeight: z.number().positive().max(700).optional(),
      programWeek:z.number().int().positive().max(10000).optional(),programPhase:z.string().max(200).optional(),
    })
    .refine((w) => w.status !== "completed" || !!w.endedAt)
    .refine((w) => !w.endedAt || new Date(w.endedAt) >= new Date(w.startedAt)),
  workoutExercises: z.object({
    ...prescriptionDetails,
    substitutedFrom:z.object({exerciseId:id,name:nonempty}).optional(),
    superset:z.enum(["A","B","C","D"]).optional(),machineSetup:machineSetup.optional(),
    id,
    workoutId: id,
    exerciseId: id,
    name: nonempty,
    loadMode: mode,
    order: int,
    rest: num.max(7200),
    notes: text,
    repsMin:z.number().int().min(1).max(999).optional(),repsMax:z.number().int().min(1).max(999).optional(),
  }),
  sets: z.object({
    kind:z.enum(["work","warmup"]).optional(),
    id,
    workoutExerciseId: id,
    number: z.number().int().min(1),
    weight: num,
    reps: z.number().int().min(1).max(999),
    rpe,
    rest: num.max(7200).optional(),
    notes: text.optional(),
    completed: z.boolean(),
  }),
  settings: z.object({
    gymMode:z.boolean().optional(),archiveResetId:id.optional(),
    catalogBaseline: z.object({exercises:z.record(id,z.string().regex(/^[a-f0-9]{64}$/)),groups:z.record(id,z.string().max(10000))}).optional(),
    id,
    externalTimerEnabled: z.boolean().optional(),
    theme: z.enum(["dark", "light"]),
    unit: z.enum(["kg", "lb"]),
    prefill: z.boolean(),
    lastBackup: time.optional(),backupConfirmedAt:time.optional(),backupSnoozedUntil:time.optional(),backupReminderDays:z.union([z.literal(0),z.literal(7),z.literal(14),z.literal(30)]).optional(),
    iphoneChecklist:z.object({device:z.string().max(120),ios:z.string().max(80),checks:z.record(z.string().max(80),z.object({state:z.enum(['todo','pass','fail']),note:z.string().max(500).optional(),checkedAt:time.optional()}))}).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    themeConfig:z.object({palette:z.enum(['carbonio','artico','prugna','petrolio','sabbia','ghiaccio']),mode:z.enum(['dark','light','system']),background:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()}).strict().optional(),
    goals:z.object({calories:z.number().positive().max(20000).optional(),protein:z.number().positive().max(2000).optional(),carbs:z.number().positive().max(3000).optional(),fat:z.number().positive().max(2000).optional(),workoutsPerWeek:z.number().int().min(1).max(14).optional()}).optional(),
  }),
};
const dataSchema = z.object({
  exercisePreferences:z.array(z.object({id,favorite:z.boolean(),machineSetup:machineSetup.optional(),weightStep:z.number().positive().max(50).optional()})).max(10000),
  workoutUi:z.array(z.object({id,step:z.enum(['list','detail','record','rest']),tab:z.enum(['sets','history','notes']),exerciseId:z.string().max(150),setId:z.string().max(150),restEnd:num,restTotal:num.max(7200),paused:z.boolean(),pausedSeconds:num.max(7200),weight:num,reps:z.number().int().min(1).max(999),rpe,setNotes:z.string().max(10000),kind:z.enum(['work','warmup']),updatedAt:time})).max(1),
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
  scheduledWorkouts:z.array(z.object({id,date,planId:z.string().max(150),dayId:z.string().max(150),planName:z.string().max(200),dayName:nonempty,notes:text,workoutId:id.optional(),kind:z.enum(['workout','cardio','mobility','rest','other']).optional(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),durationMinutes:z.number().positive().max(1440).optional(),estimatedCalories:z.number().min(0).max(20000).optional(),done:z.boolean().optional()})).max(10000),
  measurements:z.array(z.object({id,date,weight:z.number().positive().max(700),waist:z.number().positive().max(300).optional(),bodyFat:z.number().min(1).max(80).optional()})).max(10000),
  meals: z.array(z.object({id,date,ingredients:z.array(z.object({id,name:nonempty,grams:z.number().positive().max(10000),calories:num.max(20000),protein:num.max(2000),carbs:num.max(3000),fat:num.max(2000)})).min(1).max(30).optional(),mealType:z.enum(["breakfast","lunch","dinner","snack"]).optional(),name:nonempty,grams:z.number().positive().max(10000),calories:num.max(20000),protein:num.max(2000),carbs:num.max(3000),fat:num.max(2000),notes:text,photo:image.optional(),source:z.enum(["manual","photo-suggestion"]),createdAt:time})).max(10000),
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
  const imageBytes = (data.profiles[0].photo?.size||0)+data.exercises.reduce((n,e)=>n+(e.image?.size||0),0)+data.meals.reduce((n,e)=>n+(e.photo?.size||0),0);
  if(imageBytes>25*1024*1024) throw Error("Troppe foto per un backup su questo dispositivo. Rimuovi alcune foto dei pasti e riprova.");
  const profiles=[];
  for(const p of data.profiles) profiles.push({...p,photo:p.photo?{mime:p.photo.type,data:await base64(p.photo)}:undefined});
  const meals=[];
  for(const m of data.meals) meals.push({...m,photo:m.photo?{mime:m.photo.type,data:await base64(m.photo)}:undefined});
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
      data: { ...data, profiles, exercises, meals },
    },
    null,
    2,
  );
}
// Add explicit vN -> vN+1 pure functions here when the on-disk format evolves.
export const migrations: Record<number, (value: unknown) => unknown> = {1: value => ({...(value as object),meals:[]}),2:value=>value,3:value=>({...value as object,scheduledWorkouts:[],measurements:[]}),4:value=>({...value as object,exercisePreferences:[],workoutUi:[]}),5:value=>value,6:value=>value,7:value=>value,8:value=>value};
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
      const blob = await decodeBackupImage(e.image);
      return { ...e, image: blob };
    }),
  );
  const meals = [];
  for (const m of data.meals) meals.push({...m,photo:m.photo?await decodeBackupImage(m.photo):undefined});
  const profiles=[];
  for(const p of data.profiles) profiles.push({...p,photo:p.photo?await decodeBackupImage(p.photo):undefined});
  const result: DataSet = { ...data, profiles, exercises, meals };
  validateIntegrity(result);
  return result;
}

async function decodeBackupImage(image: {mime:string;data:string}) {
  const { mime, data: encoded } = image;
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

  return blob;
}
