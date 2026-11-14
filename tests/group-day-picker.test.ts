import { expect, it } from 'vitest';
import { filterGroupDays, GroupDayOption } from '../src/app/services/group-day-filter';

const day = (id: string, dayName: string, week: number, dates: string[], exercises: string[], planId = 'p1'): GroupDayOption =>
  ({ id, label: dayName, planId, planName: planId === 'p1' ? 'Massa muscolare' : 'Forza', dayName, week, dates, exercises, shared: 0, total: exercises.length });
const options = [
  day('a', 'Lun - Petto Schiena', 1, ['2026-11-09'], ['Panca piana', 'Rematore']),
  day('b', 'Mar - Spalle Braccia', 1, ['2026-11-10'], ['Military press', 'Curl']),
  day('c', 'Lun - Petto Schiena', 2, ['2026-11-16'], ['Panca piana', 'Trazioni']),
  day('d', 'Gambe', 0, [], ['Squat'], 'p2'),
];

it('cerca per nome, esercizio e scheda senza badare a maiuscole e accenti', () => {
  expect(filterGroupDays(options, { query: 'petto' }).map(o => o.id)).toEqual(['a', 'c']);
  expect(filterGroupDays(options, { query: 'TRAZIONI' }).map(o => o.id)).toEqual(['c']);
  expect(filterGroupDays(options, { query: 'forza squat' }).map(o => o.id)).toEqual(['d']);
  expect(filterGroupDays(options, { query: 'panca petto' }).map(o => o.id)).toEqual(['a', 'c']);
});

it('filtra per scheda, settimana e data del calendario', () => {
  expect(filterGroupDays(options, { planId: 'p2' }).map(o => o.id)).toEqual(['d']);
  expect(filterGroupDays(options, { week: 2 }).map(o => o.id)).toEqual(['c']);
  expect(filterGroupDays(options, { date: '2026-11-10' }).map(o => o.id)).toEqual(['b']);
  expect(filterGroupDays(options, { date: '2026-11-11' })).toEqual([]);
  expect(filterGroupDays(options, { query: 'petto', week: 1 }).map(o => o.id)).toEqual(['a']);
});
