import {CreatineLog} from '../models/domain';
/** Limite giornaliero accettato: ben oltre qualunque dose reale, serve solo a scartare errori di battitura. */
export const CREATINE_MAX_DAILY_GRAMS = 100;
export const CREATINE_QUICK_DOSES: readonly number[] = [3, 5];
export const roundGrams = (value: number) => Math.round(value * 10) / 10;
export const formatGrams = (value: number) => String(roundGrams(value)).replace('.', ',');
export function validCreatine(row: CreatineLog): boolean {
  const date = row?.date, d = typeof date === 'string' ? new Date(date + 'T12:00:00Z') : null;
  return !!row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 150
    && !!d && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && typeof row.grams === 'number' && Number.isFinite(row.grams) && row.grams > 0 && row.grams <= CREATINE_MAX_DAILY_GRAMS;
}
