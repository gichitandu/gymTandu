import { DataSet, localDate } from "../models/domain";
export type CalendarView = "day" | "week" | "month";
export function parseLocalDate(value: string) {
  const d = new Date(value + "T12:00:00");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(d.getTime()) ||
    localDate(d) !== value
  )
    throw Error("Data non valida.");
  return d;
}
export function moveDate(value: string, days: number) {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function calendarDays(value: string, view: CalendarView) {
  const anchor = parseLocalDate(value);
  if (view === "day") return [value];
  const start = new Date(anchor);
  if (view === "month") start.setDate(1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, i) =>
    moveDate(localDate(start), i),
  );
}
export function movePeriod(
  value: string,
  view: CalendarView,
  direction: number,
) {
  if (view !== "month")
    return moveDate(value, direction * (view === "week" ? 7 : 1));
  const d = parseLocalDate(value),
    day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + direction);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
  d.setDate(Math.min(day, end));
  return localDate(d);
}

export function weeklyDates(start: string, count: number) {
  parseLocalDate(start);
  if (!Number.isInteger(count) || count < 1 || count > 8)
    throw Error("Scegli da 1 a 8 settimane.");
  return Array.from({ length: count }, (_, i) => moveDate(start, i * 7));
}

export interface DayActivity {
  planned: number;
  completed: number;
  meals: number;
  calories: number;
}
export function calendarActivity(
  data: Pick<DataSet, "scheduledWorkouts" | "workouts" | "meals"> &
    Partial<Pick<DataSet, "plans">>,
) {
  const result = new Map<string, DayActivity>();
  const day = (date: string) => {
    let value = result.get(date);
    if (!value) {
      value = { planned: 0, completed: 0, meals: 0, calories: 0 };
      result.set(date, value);
    }
    return value;
  };
  const workouts = new Map(data.workouts.map((w) => [w.id, w]));
  const concluded = new Set(
    (data.plans || [])
      .filter((plan) => plan.completedAt)
      .map((plan) => plan.id),
  );
  for (const event of data.scheduledWorkouts) {
    const workout = workouts.get(event.workoutId || "");
    if (
      workout?.status === "completed" ||
      (!workout && concluded.has(event.planId))
    )
      continue;
    day(event.date).planned++;
  }
  for (const workout of data.workouts)
    if (workout.status === "completed") day(workout.date).completed++;
  for (const meal of data.meals) {
    const value = day(meal.date);
    value.meals++;
    value.calories += meal.calories;
  }
  return result;
}
