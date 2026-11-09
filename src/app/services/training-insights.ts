import { DataSet, localDate } from "../models/domain";
import { sessionVolume } from "./statistics";

export interface TrainingPeriod {
  from: string;
  to: string;
  workouts: number;
  minutes: number;
  unknownDurations: number;
  externalVolume: number;
  activeDays: number;
  completedSets: number;
}
export interface TrainingInsight {
  title: string;
  message: string;
  kind: "progress" | "consistency" | "recovery" | "schedule";
}
const fromDays = (today: string, days: number) => {
  const date = new Date(today + "T12:00:00");
  date.setDate(date.getDate() - days + 1);
  return localDate(date);
};
const finished = (data: DataSet, from: string, to: string) =>
  data.workouts.filter(
    (w) => w.status === "completed" && w.date >= from && w.date <= to,
  );
/**
 * Settimana di scarico: suggerisce una pausa più leggera dopo molte settimane consecutive
 * con almeno tre sedute (finestre mobili di 7 giorni che terminano oggi). Solo osservazione:
 * non modifica piani né carichi.
 */
export function deloadInsight(
  data: DataSet,
  today = localDate(),
  minWeeks = 4,
  minSessions = 3,
): TrainingInsight | null {
  let weeks = 0;
  for (let i = 0; i < 8; i++) {
    const to = i === 0 ? today : fromDays(today, i * 7 + 1);
    if (finished(data, fromDays(to, 7), to).length < minSessions) break;
    weeks++;
  }
  if (weeks < minWeeks) return null;
  const recent = finished(data, fromDays(today, 7), today),
    ids = new Set(
      data.workoutExercises
        .filter((e) => recent.some((w) => w.id === e.workoutId))
        .map((e) => e.id),
    );
  const rpe = data.sets
    .filter(
      (x) =>
        x.completed &&
        x.kind !== "warmup" &&
        x.rpe !== undefined &&
        ids.has(x.workoutExerciseId),
    )
    .map((x) => x.rpe as number);
  const hard =
    rpe.length >= 5 && rpe.reduce((n, v) => n + v, 0) / rpe.length >= 8.5;
  return {
    kind: "recovery",
    title: "Valuta una settimana di scarico",
    message: `Ti alleni con almeno 3 sedute a settimana da ${weeks} settimane, senza una settimana più leggera.${hard ? " Nell’ultima settimana lo sforzo medio è stato alto (RPE 8,5 o più)." : ""} Puoi provare per una settimana a ridurre volume o carichi di circa il 30–40%, oppure confrontarti con un professionista. È solo un’indicazione: il piano non viene cambiato.`,
  };
}
export function summarizeTraining(
  data: DataSet,
  days = 28,
  today = localDate(),
): {
  current: TrainingPeriod;
  previous: TrainingPeriod;
  insights: TrainingInsight[];
} {
  const from = fromDays(today, days),
    beforeDate = new Date(from + "T12:00:00");
  beforeDate.setDate(beforeDate.getDate() - 1);
  const previousTo = localDate(beforeDate),
    previousFrom = fromDays(previousTo, days);
  function period(start: string, end: string): TrainingPeriod {
    const rows = finished(data, start, end),
      ids = new Set(rows.map((w) => w.id));
    const exercises = new Set(
      data.workoutExercises
        .filter((row) => ids.has(row.workoutId))
        .map((row) => row.id),
    );
    return {
      from: start,
      to: end,
      workouts: rows.length,
      minutes: rows
        .filter((w) => !w.durationUnknown && w.duration > 0)
        .reduce((n, w) => n + w.duration, 0),
      unknownDurations: rows.filter((w) => w.durationUnknown || !w.duration)
        .length,
      externalVolume: rows.reduce((n, w) => n + sessionVolume(data, w), 0),
      activeDays: new Set(rows.map((w) => w.date)).size,
      completedSets: data.sets.filter(
        (set) =>
          set.completed &&
          set.kind !== "warmup" &&
          exercises.has(set.workoutExerciseId),
      ).length,
    };
  }
  const current = period(from, today),
    previous = period(previousFrom, previousTo);
  const insights: TrainingInsight[] = [];
  if (current.workouts === 0)
    insights.push({
      kind: "consistency",
      title: "Riparti dal tuo ritmo",
      message:
        "Nessuna seduta completata nel periodo. Prepara la prossima sessione dal calendario.",
    });
  else {
    if (previous.workouts > 0) {
      const delta = current.workouts - previous.workouts;
      insights.push({
        kind: "consistency",
        title:
          delta > 0
            ? "Più costanza"
            : delta < 0
              ? "Ritmo da ritrovare"
              : "Costanza stabile",
        message:
          delta === 0
            ? "Hai completato lo stesso numero di sedute del periodo precedente."
            : delta > 0
              ? `Hai completato ${delta} sedute in più del periodo precedente.`
              : `Hai completato ${-delta} sedute in meno del periodo precedente.`,
      });
    } else
      insights.push({
        kind: "consistency",
        title: "Il tuo punto di partenza",
        message: `${current.workouts} sedute completate: continua a registrarle per ottenere confronti attendibili.`,
      });
    if (current.externalVolume > 0 && previous.externalVolume > 0) {
      const diff = (current.externalVolume / previous.externalVolume - 1) * 100;
      insights.push({
        kind: "progress",
        title: "Volume a carico esterno",
        message: `Rispetto al periodo precedente: ${diff >= 0 ? "+" : ""}${diff.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%. Il volume dipende anche dal numero e dal tipo di sedute, non prova da solo un miglioramento di forza.`,
      });
    }
  }
  const next = data.scheduledWorkouts
    .filter(
      (e) =>
        (e.kind ?? "workout") === "workout" &&
        e.date >= today &&
        !e.done &&
        !data.workouts.some(
          (w) => w.id === e.workoutId && w.status === "completed",
        ),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time || "").localeCompare(b.time || ""),
    )[0];
  if (next)
    insights.push({
      kind: "schedule",
      title: "Prossimo appuntamento",
      message: `${next.dayName} · ${next.date}${next.time ? " alle " + next.time : ""}. Puoi aggiungere un promemoria al calendario del telefono.`,
    });
  const wellness = data.wellnessLogs.find((row) => row.date === today);
  if (
    wellness &&
    ((wellness.energy !== undefined && wellness.energy <= 2) ||
      (wellness.stress !== undefined && wellness.stress >= 4))
  )
    insights.push({
      kind: "recovery",
      title: "Ascolta le sensazioni",
      message:
        "Oggi hai registrato poca energia o stress elevato. Valuta personalmente l’intensità e, se necessario, confrontati con un professionista.",
    });
  const deload = deloadInsight(data, today);
  if (deload) insights.push(deload);
  return { current, previous, insights };
}
/** Weekly comparison points for the existing SVG chart, with no persistence or server calls. */
export function trainingTimeline(
  data: DataSet,
  days = 28,
  today = localDate(),
) {
  const from = fromDays(today, days),
    start = Date.parse(from + "T12:00:00Z"),
    count = Math.ceil(days / 7);
  const points = Array.from({ length: count }, (_, i) => {
    const date = new Date(start + i * 7 * 86400000).toISOString().slice(0, 10);
    return {
      label: date.slice(8) + "/" + date.slice(5, 7),
      sessions: 0,
      volume: 0,
    };
  });
  for (const workout of finished(data, from, today)) {
    const position = Math.floor(
        (Date.parse(workout.date + "T12:00:00Z") - start) / (7 * 86400000),
      ),
      bucket = points[position];
    if (bucket) {
      bucket.sessions++;
      bucket.volume += sessionVolume(data, workout);
    }
  }
  return points;
}
function csvCell(value: string | number) {
  const raw = String(value);
  // Spreadsheet tools can execute formulas in imported CSV cells, even if quoted.
  const safe =
    /^\s*[=+@-]/.test(raw) && typeof value === "string" ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function trainingReportCsv(
  data: DataSet,
  from: string,
  to: string,
  unit: "kg" | "lb" = "kg",
): string {
  const workouts = finished(data, from, to).sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt),
  );
  const lines = [
    [
      "Data",
      "Piano",
      "Sessione",
      "Durata (min)",
      "Serie di lavoro",
      "Ripetizioni",
      "Volume esterno (" + unit + ")",
    ]
      .map(csvCell)
      .join(";"),
  ];
  const factor = unit === "lb" ? 2.2046226218 : 1;
  for (const w of workouts) {
    const exercises = data.workoutExercises.filter(
        (row) => row.workoutId === w.id,
      ),
      ids = new Set(exercises.map((e) => e.id));
    const sets = data.sets.filter(
      (s) => ids.has(s.workoutExerciseId) && s.completed && s.kind !== "warmup",
    );
    const minutes = w.durationUnknown || !w.duration ? "" : String(w.duration);
    lines.push(
      [
        w.date,
        w.planName,
        w.dayName,
        minutes,
        sets.length,
        sets.reduce((n, s) => n + s.reps, 0),
        Math.round(sessionVolume(data, w) * factor * 100) / 100,
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
const escapeIcs = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
/** Importable calendar reminder. Nothing is sent or scheduled without user action. */
export function workoutReminderIcs(
  event: { id: string; date: string; time?: string; dayName: string },
  minutesBefore = 60,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    !Number.isFinite(Date.parse(event.date + "T12:00:00Z")) ||
    new Date(event.date + "T12:00:00Z").toISOString().slice(0, 10) !==
      event.date
  )
    throw Error("Data del promemoria non valida.");
  if (event.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.time))
    throw Error("Orario del promemoria non valido.");
  if (![15, 30, 60, 120].includes(minutesBefore))
    throw Error("Anticipo del promemoria non valido.");
  const stamp = event.date.replaceAll("-", ""),
    start = event.time
      ? stamp + "T" + event.time.replace(":", "") + "00"
      : stamp;
  const dt = event.time ? "DTSTART:" + start : "DTSTART;VALUE=DATE:" + start;
  const endDate = new Date(event.date + "T12:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const end = event.time
    ? "DURATION:PT1H"
    : "DTEND;VALUE=DATE:" + localDate(endDate).replaceAll("-", "");
  const alarm = event.time
    ? [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "DESCRIPTION:Allenamento GymTrack",
        "TRIGGER:-PT" + minutesBefore + "M",
        "END:VALARM",
      ]
    : [];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GymTrack//Promemoria//IT",
    "BEGIN:VEVENT",
    "UID:" + encodeURIComponent(event.id) + "@gymtrack.local",
    "DTSTAMP:" +
      new Date()
        .toISOString()
        .replaceAll("-", "")
        .replaceAll(":", "")
        .replace(/\.\d{3}/, ""),
    dt,
    end,
    "SUMMARY:" + escapeIcs(event.dayName),
    "DESCRIPTION:Promemoria personale creato da GymTrack",
    ...alarm,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
