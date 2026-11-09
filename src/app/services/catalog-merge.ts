import { defaultExercises, defaultGroups } from "../core/default-catalog";
import {
  CatalogBaseline,
  DataSet,
  Exercise,
  MuscleGroup,
} from "../models/domain";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, ordered(item)]),
    );
  return value;
}

async function digest(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Compares editable fields and actual image bytes, without creation metadata. */
export async function exerciseFingerprint(exercise: Exercise): Promise<string> {
  const { image, createdAt: _createdAt, ...fields } = exercise;
  const picture = image
    ? {
        type: image.type,
        hash: await digest(new Uint8Array(await image.arrayBuffer())),
      }
    : undefined;
  return digest(
    new TextEncoder().encode(
      JSON.stringify(ordered({ ...fields, image: picture })),
    ),
  );
}

let defaults: Promise<CatalogBaseline> | undefined;
async function defaultBaseline(): Promise<CatalogBaseline> {
  return (defaults ||= Promise.all(
    defaultExercises.map(
      async (exercise) =>
        [exercise.id, await exerciseFingerprint(exercise)] as const,
    ),
  ).then((exercises) => ({
    exercises: Object.fromEntries(exercises),
    groups: Object.fromEntries(
      defaultGroups.map((group) => [group.id, group.name]),
    ),
  })));
}

export interface CatalogSource {
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
}
export interface AcceptedCatalogChanges {
  exercises?: string[];
  groups?: string[];
}

/** Three-way merge: receiving shared changes must not discard personal edits. */
export async function mergeCatalog(
  local: DataSet,
  remote: CatalogSource,
  accepted: AcceptedCatalogChanges = {},
): Promise<DataSet> {
  const result = structuredClone(local),
    incoming = structuredClone(remote),
    storedExercises = result.exercises,
    storedGroups = result.muscleGroups;
  const baseline = local.settings[0].catalogBaseline;
  const bundled = await defaultBaseline();
  const localHashes = new Map(
    await Promise.all(
      local.exercises.map(
        async (exercise) =>
          [exercise.id, await exerciseFingerprint(exercise)] as const,
      ),
    ),
  );
  const remoteHashes = Object.fromEntries(
    await Promise.all(
      remote.exercises.map(
        async (exercise) =>
          [exercise.id, await exerciseFingerprint(exercise)] as const,
      ),
    ),
  );
  const locals = new Map(
    storedExercises.map((exercise) => [exercise.id, exercise]),
  );
  const remoteIds = new Set(remote.exercises.map((exercise) => exercise.id));
  const acceptedExercises = new Set(accepted.exercises),
    acceptedGroups = new Set(accepted.groups);
  const changed = (id: string) =>
    localHashes.get(id) !== (baseline?.exercises[id] ?? bundled.exercises[id]);
  result.exercises = incoming.exercises.map((exercise) => {
    const personal = locals.get(exercise.id);
    return personal &&
      !acceptedExercises.has(exercise.id) &&
      changed(exercise.id)
      ? personal
      : exercise;
  });
  for (const exercise of storedExercises)
    if (!remoteIds.has(exercise.id)) {
      const previouslyShared =
        Object.hasOwn(baseline?.exercises || {}, exercise.id) ||
        Object.hasOwn(bundled.exercises, exercise.id);
      result.exercises.push(
        previouslyShared && !changed(exercise.id)
          ? { ...exercise, active: false }
          : exercise,
      );
    }

  const localGroups = new Map(storedGroups.map((group) => [group.id, group]));
  const groups = new Map(storedGroups.map((group) => [group.id, group]));
  for (const group of incoming.muscleGroups) {
    const personal = localGroups.get(group.id),
      previous = baseline?.groups[group.id] ?? bundled.groups[group.id];
    if (!personal || acceptedGroups.has(group.id) || personal.name === previous)
      groups.set(group.id, group);
  }
  result.muscleGroups = [...groups.values()];
  result.settings[0].catalogBaseline = {
    exercises: { ...baseline?.exercises, ...remoteHashes },
    groups: {
      ...baseline?.groups,
      ...Object.fromEntries(
        remote.muscleGroups.map((group) => [group.id, group.name]),
      ),
    },
  };
  return result;
}
