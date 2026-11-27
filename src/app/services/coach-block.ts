import type { DataSet } from '../models/domain';
import { readCoachMetadata } from './coach-expert-adapter';
import { coachSetFromLog, estimate1rm } from './coach-shadow';

/** Riepilogo di un piano creato dal Coach al termine del suo blocco (di solito 4 settimane). */
export interface CoachBlockReview {
  /** Durata del blocco in settimane. */
  weeks: number;
  /** Settimana in corso dall'inizio del piano (1 = prima). */
  week: number;
  ended: boolean;
  sessions: number;
  /** Sedute previste nel blocco: giorni del piano × settimane. */
  expected: number;
  /** Variazione del massimale stimato tra la prima e l'ultima seduta, migliori per primi. */
  progress: { name: string; percent: number }[];
  advice: string;
}

const DAY_MS = 86400000;
const time = (date: string) => Date.parse(date.slice(0, 10) + 'T12:00:00Z');

/**
 * Stato del blocco di un piano Coach. Restituisce null per i piani non creati dal Coach.
 * Funzione pura: non modifica l'archivio e non decide al posto dell'utente.
 */
export function coachBlockReview(data: DataSet, planId: string, today: string): CoachBlockReview | null {
  const plan = data.plans.find(row => row.id === planId);
  if (!plan || readCoachMetadata<{ schema?: number }>(plan.description)?.schema !== 1) return null;
  const start = time(plan.createdAt), now = time(today);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return null;
  const weeks = Number(/Programma Coach · (\d+) settimane/.exec(plan.description)?.[1]) || 4;
  const week = Math.floor((now - start) / (7 * DAY_MS)) + 1;
  const end = start + weeks * 7 * DAY_MS;
  const workouts = data.workouts
    .filter(w => w.planId === planId && w.status === 'completed' && time(w.date) >= start && time(w.date) < end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt));
  const days = data.days.filter(day => day.planId === planId).length;
  const expected = days * weeks;

  // Massimale stimato per esercizio, seduta per seduta (solo carico esterno, serie allenanti completate).
  const order = new Map(workouts.map((workout, index) => [workout.id, index]));
  const byExercise = new Map<string, { name: string; values: { index: number; value: number }[] }>();
  for (const row of data.workoutExercises) {
    const index = order.get(row.workoutId);
    if (index === undefined || row.loadMode !== 'external') continue;
    const values = data.sets
      .filter(set => set.workoutExerciseId === row.id && set.completed && set.kind !== 'warmup')
      .map(set => estimate1rm(coachSetFromLog(set)))
      .filter((value): value is number => value !== undefined);
    if (!values.length) continue;
    const entry = byExercise.get(row.exerciseId) ?? { name: row.name, values: [] };
    entry.values.push({ index, value: Math.max(...values) });
    byExercise.set(row.exerciseId, entry);
  }
  const progress = [...byExercise.values()]
    .filter(entry => entry.values.length >= 2)
    .map(entry => {
      const sorted = [...entry.values].sort((a, b) => a.index - b.index);
      return { name: entry.name, percent: Math.round((sorted[sorted.length - 1].value / sorted[0].value - 1) * 100) };
    })
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'it'));

  const ended = now >= end;
  const steady = expected > 0 && workouts.length >= expected * 0.75;
  const advice = !ended
    ? week === weeks
      ? 'Ultima settimana del blocco: completa le sedute previste, poi il Coach ti propone come proseguire.'
      : `Settimana ${week} di ${weeks}: segui il piano e registra lo sforzo, così i confronti di fine blocco saranno affidabili.`
    : !steady
      ? `Hai completato ${workouts.length} sedute su circa ${expected} previste: prima di cambiare programma, ripeti il blocco puntando alla costanza. È la variabile che conta di più.`
      : progress.length && progress.every(item => item.percent <= 0)
        ? 'Blocco completato con costanza, ma senza progressi misurabili: fai una settimana di scarico (circa metà delle serie, 3–4 ripetizioni in riserva) e poi crea un nuovo piano dal Coach cambiando intervalli di ripetizioni o esercizi.'
        : 'Blocco completato con costanza. Fai una settimana di scarico (stessi esercizi, circa metà delle serie e 3–4 ripetizioni in riserva), poi crea un nuovo piano dal Coach: partirà dai carichi aggiornati.';
  return { weeks, week: Math.min(week, weeks), ended, sessions: workouts.length, expected, progress, advice };
}
