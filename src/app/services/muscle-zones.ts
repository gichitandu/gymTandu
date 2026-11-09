/**
 * Zone anatomiche per evidenziare sulla figura il gruppo muscolare selezionato.
 * Coordinate nello spazio delle immagini /training/figures/muscle-*-neutral.webp (1536×1024).
 */
export type MuscleZone = 'petto' | 'schiena' | 'spalle' | 'braccia' | 'core' | 'gambe' | 'glutei' | 'polpacci';
export type MuscleView = 'front' | 'back';
/** cx, cy, rx, ry */
export type ZoneEllipse = readonly [number, number, number, number];

const S = 2.56; // le zone sono state tracciate su una copia 600×400
const e = (cx: number, cy: number, rx: number, ry: number): ZoneEllipse => [cx * S, cy * S, rx * S, ry * S];

export const MUSCLE_ZONES: Record<MuscleView, Partial<Record<MuscleZone, ZoneEllipse[]>>> = {
  front: {
    petto: [e(283, 94, 19, 14), e(317, 94, 19, 14)],
    spalle: [e(252, 84, 14, 17), e(348, 84, 14, 17)],
    braccia: [e(243, 115, 9, 20), e(357, 115, 9, 20), e(232, 160, 8, 20), e(368, 160, 8, 20)],
    core: [e(300, 138, 19, 30)],
    gambe: [e(282, 240, 17, 42), e(319, 240, 17, 42)],
    polpacci: [e(268, 305, 10, 27), e(332, 305, 10, 27)],
  },
  back: {
    schiena: [e(300, 82, 24, 18), e(300, 118, 34, 33)],
    spalle: [e(257, 86, 14, 16), e(343, 86, 14, 16)],
    braccia: [e(243, 113, 10, 20), e(357, 113, 10, 20)],
    glutei: [e(285, 178, 17, 18), e(315, 178, 17, 18)],
    gambe: [e(284, 238, 16, 36), e(317, 238, 16, 36)],
    polpacci: [e(276, 297, 13, 27), e(324, 297, 13, 27)],
  },
};

const RULES: [RegExp, MuscleZone][] = [
  [/glute/, 'glutei'],
  [/polpacc|calf|calves|soleo|gastrocnem/, 'polpacci'],
  [/petto|pettoral|chest/, 'petto'],
  [/schien|dorsal|trapez|lomb|back|\blat/, 'schiena'],
  [/spall|deltoid|shoulder/, 'spalle'],
  [/bracc|bicip|tricip|avambracc|\barm/, 'braccia'],
  [/core|addom|addome|abs\b|obliqu/, 'core'],
  [/gamb|quadric|femoral|coscia|leg/, 'gambe'],
];

/** Zona della figura per il nome di un gruppo muscolare (anche personalizzato). */
export function muscleZoneFor(name: string | undefined): MuscleZone | undefined {
  const text = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return RULES.find(([pattern]) => pattern.test(text))?.[1];
}

/** Vista in cui la zona si vede meglio: schiena e glutei dietro, petto e core davanti. */
export function preferredMuscleView(zone: MuscleZone | undefined, current: MuscleView): MuscleView {
  if (!zone || MUSCLE_ZONES[current][zone]) return current;
  return current === 'front' ? 'back' : 'front';
}
