/** Calendario del GT Hub: ripetizioni e voci del giorno (impegni, note, GymTrack, spese). */
import type { DataSet } from '../models/domain';
import { addDays, daysInMonth, HubColor, HubDoc, HubEvent, monthKey, pad2, parseDay, validDay } from './hub-model';
import type { Recurring, SpendItem } from './hub-finance';

/** Date in cui cade l'evento tra `from` e `to` (inclusi). */
export function eventOccurrences(e: Pick<HubEvent, 'date' | 'repeat'>, from: string, to: string): string[] {
  if (!validDay(e.date) || e.date > to) return [];
  if (e.repeat === 'none') return e.date >= from ? [e.date] : [];
  const out: string[] = [];
  const start = parseDay(e.date);
  for (let k = 0; k < 2000 && out.length < 400; k++) {
    let day: string;
    if (e.repeat === 'weekly') day = addDays(e.date, 7 * k);
    else {
      const months = e.repeat === 'monthly' ? k : 12 * k;
      const y = start.getFullYear() + Math.floor((start.getMonth() + months) / 12), m = (start.getMonth() + months) % 12;
      const month = `${y}-${pad2(m + 1)}`;
      day = `${month}-${pad2(Math.min(start.getDate(), daysInMonth(month)))}`;
    }
    if (day > to) break;
    if (day >= from) out.push(day);
  }
  return out;
}

export type CalItemKind = 'event' | 'note' | 'workout' | 'spend' | 'expected';
export interface CalItem {
  key: string; kind: CalItemKind; ref: string; title: string; subtitle: string;
  time?: string; durationMinutes?: number; allDay: boolean; tone: string; icon: string;
  amount?: number; done?: boolean; notify?: boolean; offsets?: number[]; occurrence: string;
}
export const TONE_OF: Record<HubColor, string> = { blue: 'b', violet: 'v', pink: 'p', amber: 'y', green: 'g', red: 'r' };

function minutes(time?: string) { if (!time) return -1; const [h, m] = time.split(':').map(Number); return h * 60 + m; }
export function sortItems(items: CalItem[]) {
  return items.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || minutes(a.time) - minutes(b.time) || a.title.localeCompare(b.title));
}

export function offsetsLabel(offsets: readonly number[]) {
  const names = [...offsets].sort((a, b) => b - a).map(o => o === 0 ? "all'ora" : o < 60 ? `${o} min prima` : o < 1440 ? `${o / 60} ${o === 60 ? 'ora' : 'ore'} prima` : o < 10080 ? `${o / 1440} ${o === 1440 ? 'giorno' : 'giorni'} prima` : '1 settimana prima');
  return names.join(' e ');
}

export function gymItems(data: DataSet | undefined, day: string): CalItem[] {
  if (!data) return [];
  const completed = new Set(data.workouts.filter(w => w.status === 'completed').map(w => w.id));
  const out: CalItem[] = [];
  for (const e of data.scheduledWorkouts) {
    if (e.date !== day) continue;
    const kind = e.kind ?? 'workout';
    if (kind === 'rest') continue;
    const done = !!e.done || (!!e.workoutId && completed.has(e.workoutId));
    out.push({ key: 'gym-' + e.id, kind: 'workout', ref: e.id, title: e.dayName, subtitle: kind === 'workout' ? (done ? 'Completato in GymTrack' : 'Allenamento GymTrack') : kind === 'cardio' ? 'Cardio' : kind === 'mobility' ? 'Mobilità' : 'Attività', time: e.time, durationMinutes: e.durationMinutes, allDay: !e.time, tone: 'p', icon: 'weight', done, occurrence: day });
  }
  for (const w of data.workouts) {
    if (w.date !== day || w.status !== 'completed' || data.scheduledWorkouts.some(e => e.workoutId === w.id)) continue;
    out.push({ key: 'gymw-' + w.id, kind: 'workout', ref: w.id, title: w.dayName, subtitle: 'Completato in GymTrack', allDay: true, tone: 'p', icon: 'weight', done: true, occurrence: day });
  }
  return out;
}

export function dayItems(doc: HubDoc, data: DataSet | undefined, day: string, spend: readonly SpendItem[], recurring: readonly Recurring[]): CalItem[] {
  const items: CalItem[] = [];
  for (const e of doc.events) {
    if (e.deleted || !eventOccurrences(e, day, day).length) continue;
    items.push({
      key: `ev-${e.id}-${day}`, kind: 'event', ref: e.id, title: e.title, subtitle: e.kind === 'scadenza' ? 'Scadenza' : e.kind === 'nota' ? 'Nota' : 'Impegno',
      time: e.time, durationMinutes: e.durationMinutes, allDay: !e.time, tone: TONE_OF[e.color] ?? 'b', icon: e.kind === 'scadenza' ? 'file' : e.kind === 'nota' ? 'note' : 'calendar',
      done: e.done, notify: e.notify, offsets: e.notifyOffsets, occurrence: day,
    });
  }
  for (const n of doc.notes) if (!n.deleted && n.date === day) items.push({ key: 'note-' + n.id, kind: 'note', ref: n.id, title: n.title || n.body.slice(0, 60), subtitle: n.pinned ? 'Nota fissata' : 'Nota', allDay: true, tone: 'y', icon: 'note', occurrence: day });
  items.push(...gymItems(data, day));
  for (const s of spend) if (s.date === day) items.push({ key: 'sp-' + s.id, kind: 'spend', ref: s.id, title: s.label.split(' · ')[0].slice(0, 60), subtitle: s.source === 'split' ? 'Spesa divisa' : 'Movimento', allDay: true, tone: 'o', icon: 'cart', amount: s.amount, occurrence: day });
  for (const r of recurring) if (r.nextDate === day) items.push({ key: 'rec-' + r.key, kind: 'expected', ref: r.key, title: r.label, subtitle: 'Addebito previsto', allDay: true, tone: 'l', icon: 'repeat', amount: r.amount, occurrence: day });
  return sortItems(items);
}

/** Per le tessere del mese: colori presenti in ogni giorno e spesa del giorno. */
export function monthSummary(doc: HubDoc, data: DataSet | undefined, month: string, spend: readonly SpendItem[]) {
  const from = month + '-01', to = `${month}-${pad2(daysInMonth(month))}`;
  const tones = new Map<string, string[]>(), spent = new Map<string, number>();
  const add = (day: string, tone: string) => { const list = tones.get(day) ?? []; if (!list.includes(tone) && list.length < 3) list.push(tone); tones.set(day, list); };
  for (const e of doc.events) if (!e.deleted) for (const d of eventOccurrences(e, from, to)) add(d, TONE_OF[e.color] ?? 'b');
  for (const n of doc.notes) if (!n.deleted && n.date && monthKey(n.date) === month) add(n.date, 'y');
  if (data) for (const e of data.scheduledWorkouts) if (monthKey(e.date) === month && (e.kind ?? 'workout') !== 'rest') add(e.date, 'p');
  for (const s of spend) if (monthKey(s.date) === month) spent.set(s.date, (spent.get(s.date) ?? 0) + s.amount);
  return { tones, spent };
}

/** Prossime voci (impegni, scadenze, addebiti previsti) dopo oggi. */
export function upcoming(doc: HubDoc, today: string, recurring: readonly Recurring[], days = 45) {
  const to = addDays(today, days), out: { day: string; item: CalItem }[] = [];
  for (const e of doc.events) {
    if (e.deleted) continue;
    const next = eventOccurrences(e, addDays(today, 1), to)[0];
    if (next) out.push({ day: next, item: { key: `up-${e.id}`, kind: 'event', ref: e.id, title: e.title, subtitle: e.kind === 'scadenza' ? 'Scadenza' : 'Impegno', time: e.time, allDay: !e.time, tone: TONE_OF[e.color] ?? 'b', icon: e.kind === 'scadenza' ? 'file' : 'calendar', notify: e.notify, offsets: e.notifyOffsets, occurrence: next } });
  }
  for (const r of recurring) if (r.nextDate > today && r.nextDate <= to) out.push({ day: r.nextDate, item: { key: 'rec-' + r.key, kind: 'expected', ref: r.key, title: r.label, subtitle: 'Addebito previsto', allDay: true, tone: 'l', icon: 'repeat', amount: r.amount, occurrence: r.nextDate } });
  return out.sort((a, b) => a.day.localeCompare(b.day) || minutes(a.item.time) - minutes(b.item.time)).slice(0, 6);
}
