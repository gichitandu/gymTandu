/* Ricerca degli allenamenti da condividere in gruppo: funzioni pure, testabili in Node. */

/** Allenamento tra cui scegliere per il gruppo. `dates`: giorni in cui è programmato (scheda o calendario). */
export interface GroupDayOption {
  id: string; label: string; planId: string; planName: string; dayName: string;
  week?: number; dates: string[]; exercises: string[]; shared: number; total: number;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Filtra gli allenamenti per testo (nome, scheda, esercizi), scheda, settimana e data del calendario. */
export function filterGroupDays(options: readonly GroupDayOption[], f: { query?: string; planId?: string; week?: number; date?: string }) {
  const words = fold(f.query || '').split(/\s+/).filter(Boolean);
  return options.filter(o => {
    if (f.planId && o.planId !== f.planId) return false;
    if (f.week && o.week !== f.week) return false;
    if (f.date && !o.dates.includes(f.date)) return false;
    if (!words.length) return true;
    const text = fold([o.planName, o.dayName, ...o.exercises].join(' '));
    return words.every(w => text.includes(w));
  });
}
