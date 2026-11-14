import { DataSet, Exercise, LoadMode, now, uid } from '../models/domain';

/** Un esercizio della seduta così come viene condiviso con il gruppo: prescrizione e avanzamento. */
export interface GroupExercise {
  exerciseId: string; name: string; loadMode: LoadMode; order: number;
  muscleGroupId: string; muscleGroupName: string; equipment: string;
  sets: number; warmupSets: number; repsMin: number; repsMax: number; rest: number;
  superset?: 'A' | 'B' | 'C' | 'D';
  done: number; total: number; last?: { weight: number; reps: number };
}
export type GroupMode = '' | 'host' | 'same' | 'match';
export interface GroupMember { id: string; name: string; host: boolean; me: boolean; mode: GroupMode; exercises: GroupExercise[]; current: string; finished: boolean; updatedAt: number }
export interface GroupSession { id: string; dayName: string; hostId: string; ended: boolean; expiresAt: number; serverTime: number; code?: string; inviteToken?: string; members: GroupMember[] }

export const GROUP_PLAN_ID = 'gruppo';
export const groupDayId = (sessionId: string) => 'gruppo-' + sessionId;

/** Token di invito presente nell'indirizzo (#/gruppo?invito=…), se ben formato. */
export function inviteTokenFromUrl(href: string): string {
  return /[?&]invito=([0-9a-f]{48})(?:[&#]|$)/.exec(href)?.[1] || '';
}
export function inviteLink(origin: string, token: string): string {
  return `${origin}/#/gruppo?invito=${token}`;
}

/** Stesso esercizio anche quando due archivi lo hanno creato a mano con ID diversi. */
export function exerciseNameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function sameExercise(a: { exerciseId: string; name: string }, b: { exerciseId: string; name: string }): boolean {
  return a.exerciseId === b.exerciseId || !!exerciseNameKey(a.name) && exerciseNameKey(a.name) === exerciseNameKey(b.name);
}

/** Fotografia condivisibile di una seduta: solo le serie di lavoro contano per l'avanzamento. */
export function groupExercisesOf(d: DataSet, workoutId: string): GroupExercise[] {
  return d.workoutExercises.filter(e => e.workoutId === workoutId).sort((a, b) => a.order - b.order).slice(0, 40).map((row, index) => {
    const sets = d.sets.filter(s => s.workoutExerciseId === row.id).sort((a, b) => a.number - b.number);
    const work = sets.filter(s => s.kind !== 'warmup'), done = work.filter(s => s.completed), last = done.at(-1);
    const exercise = d.exercises.find(e => e.id === row.exerciseId);
    const repsMin = row.repsMin ?? work[0]?.reps ?? 8;
    return {
      exerciseId: row.exerciseId, name: row.name, loadMode: row.loadMode, order: index,
      muscleGroupId: exercise?.muscleGroupId || '', muscleGroupName: d.muscleGroups.find(g => g.id === exercise?.muscleGroupId)?.name || '', equipment: exercise?.equipment || '',
      sets: Math.min(30, Math.max(1, work.length)), warmupSets: Math.min(5, sets.length - work.length),
      repsMin, repsMax: Math.max(repsMin, row.repsMax ?? repsMin), rest: Math.min(3600, Math.max(0, Math.round(row.rest || 0))),
      ...(row.superset ? { superset: row.superset as GroupExercise['superset'] } : {}),
      done: Math.min(60, done.length), total: Math.min(60, work.length),
      ...(last ? { last: { weight: last.weight, reps: last.reps } } : {}),
    };
  });
}

/** Esercizi che compaiono in entrambe le sedute, nell'ordine di chi fa da riferimento. */
export function sharedExercises<T extends { exerciseId: string; name: string }>(mine: T[], reference: GroupExercise[]): { mine: T; theirs: GroupExercise }[] {
  const free = [...mine], out: { mine: T; theirs: GroupExercise }[] = [];
  for (const theirs of reference) {
    // Prima l'ID esatto, poi il nome: evita di abbinare due varianti quando c'è l'originale.
    let index = free.findIndex(row => row.exerciseId === theirs.exerciseId);
    if (index < 0) index = free.findIndex(row => sameExercise(row, theirs));
    if (index >= 0) out.push({ mine: free.splice(index, 1)[0], theirs });
  }
  return out;
}

export interface AlignRow { id: string; exerciseId: string; name: string; order: number; superset?: string; started: boolean }
/**
 * Riordina la mia seduta perché gli esercizi in comune cadano nello stesso momento di
 * quella di riferimento: dove l'altro ha un esercizio condiviso metto lo stesso, dove ne ha
 * uno suo metto uno dei miei. Gli esercizi già iniziati restano davanti e i superset uniti.
 */
export function alignedOrder(mine: AlignRow[], reference: GroupExercise[]): string[] {
  const rows = [...mine].sort((a, b) => a.order - b.order);
  const units: AlignRow[][] = [];
  for (const row of rows) {
    const unit = row.superset ? units.find(u => u[0].superset === row.superset) : undefined;
    if (unit) unit.push(row); else units.push([row]);
  }
  const started = units.filter(u => u.some(row => row.started)), open = units.filter(u => !u.some(row => row.started));
  const pairs = sharedExercises(open.flat(), reference);
  const unitOf = (row: AlignRow) => open.find(u => u.includes(row))!;
  const own = open.filter(u => !pairs.some(p => u.includes(p.mine)));
  const placed = new Set<AlignRow[]>(), result: AlignRow[][] = [...started];
  for (const theirs of reference) {
    const pair = pairs.find(p => p.theirs === theirs);
    const unit = pair ? unitOf(pair.mine) : own.find(u => !placed.has(u));
    if (unit && !placed.has(unit)) { placed.add(unit); result.push(unit); }
  }
  for (const unit of open) if (!placed.has(unit)) result.push(unit);
  return result.flat().map(row => row.id);
}

/** Trova nell'archivio l'esercizio ricevuto dal gruppo; se manca lo aggiunge al catalogo personale. */
export function ensureGroupExercise(d: DataSet, source: GroupExercise): Exercise {
  const found = d.exercises.find(e => e.id === source.exerciseId) || d.exercises.find(e => e.active && exerciseNameKey(e.name) === exerciseNameKey(source.name));
  if (found) return found;
  let group = d.muscleGroups.find(g => g.id === source.muscleGroupId) || d.muscleGroups.find(g => !!source.muscleGroupName && exerciseNameKey(g.name) === exerciseNameKey(source.muscleGroupName));
  if (!group) { group = { id: source.muscleGroupId || uid(), name: source.muscleGroupName || 'Altro' }; d.muscleGroups.push(group); }
  const exercise: Exercise = { id: source.exerciseId, name: source.name, muscleGroupId: group.id, secondaryMuscleIds: [], description: '', equipment: source.equipment || 'Altro', tags: [], active: true, createdAt: now(), loadMode: source.loadMode };
  d.exercises.push(exercise);
  return exercise;
}

/** Avanzamento complessivo di un partecipante, in serie di lavoro. */
export function memberProgress(member: Pick<GroupMember, 'exercises'>): { done: number; total: number } {
  return member.exercises.reduce((sum, e) => ({ done: sum.done + e.done, total: sum.total + e.total }), { done: 0, total: 0 });
}
