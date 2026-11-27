import { Exercise } from '../models/domain';

/** Video tecnici locali (animazioni schematiche 3D, 28 s, senza audio, testo italiano integrato).
 * Associazione statica per ID; nome e attrezzo devono coincidere con quelli attesi, così un esercizio
 * personalizzato o rinominato non riceve per errore un filmato non pertinente. Nessun campo dati nuovo.
 * `file` (facoltativo) indica un video già esistente con un altro nome, per le voci generiche del catalogo
 * che coincidono con la variante rappresentata (es. «Lat machine» = presa prona larga). I nuovi video si
 * rigenerano con tools/technique-videos/render.mjs. */
const TECHNIQUE_VIDEOS: Record<string, { name: string; equipment: string; file?: string }> = {
  'exercise-11': {name:"Squat",equipment:"Bilanciere"},
  'exercise-0': {name:"Panca piana",equipment:"Bilanciere"},
  'variant-db-bench-30': {name:"Panca inclinata con manubri a 30°",equipment:"Manubri"},
  'variant-lat-pronated-wide': {name:"Lat machine presa prona larga",equipment:"Cavi"},
  'variant-row-neutral': {name:"Pulley presa neutra stretta",equipment:"Cavi"},
  'exercise-15': {name:"Stacco rumeno",equipment:"Bilanciere"},
  'exercise-8': {name:"Shoulder press",equipment:"Manubri"},
  'exercise-9': {name:"Alzate laterali",equipment:"Manubri"},
  'exercise-17': {name:"Curl manubri",equipment:"Manubri"},
  'variant-pushdown-rope': {name:"Pushdown con corda",equipment:"Cavi"},
  'library-bodyweight_push_ups': {name:"Piegamenti a terra",equipment:"Corpo libero"},
  'library-bodyweight_plank': {name:"Plank",equipment:"Corpo libero"},
  // Petto
  'exercise-3': {name:"Chest press",equipment:"Macchina"},
  'variant-incline-chest-machine': {name:"Chest press inclinata alla macchina",equipment:"Macchina"},
  'library-dumbbells_dumbbell_bench_press': {name:"Panca piana con manubri (0°)",equipment:"Manubri"},
  'variant-db-bench-45': {name:"Panca inclinata con manubri a 45°",equipment:"Manubri"},
  'library-barbell_incline_bench_press': {name:"Panca inclinata bilanciere",equipment:"Bilanciere"},
  'exercise-2': {name:"Croci ai cavi",equipment:"Cavi"},
  'library-dumbbells_dumbbell_flyes': {name:"Croci manubri",equipment:"Manubri"},
  // Schiena
  'exercise-4': {name:"Lat machine",equipment:"Cavi",file:'variant-lat-pronated-wide'},
  'exercise-6': {name:"Pulley",equipment:"Cavi",file:'variant-row-neutral'},
  'exercise-5': {name:"Rematore bilanciere",equipment:"Bilanciere"},
  // Spalle
  'exercise-10': {name:"Alzate posteriori",equipment:"Manubri"},
  // Gambe
  'exercise-12': {name:"Leg press",equipment:"Macchina"},
  'exercise-13': {name:"Leg extension",equipment:"Macchina"},
};
const BASE = '/training/videos/gt-technique-v1';

export interface TechniqueVideo { video: string; poster: string; subtitles: string; }

export function techniqueVideoFor(exercise: Pick<Exercise, 'id' | 'name' | 'equipment'> | undefined | null): TechniqueVideo | null {
  if (!exercise || !Object.prototype.hasOwnProperty.call(TECHNIQUE_VIDEOS, exercise.id)) return null;
  const expected = TECHNIQUE_VIDEOS[exercise.id];
  if (exercise.name.trim() !== expected.name || exercise.equipment.trim() !== expected.equipment) return null;
  const file = expected.file ?? exercise.id;
  return {
    video: `${BASE}/${file}.mp4`,
    poster: `${BASE}/posters/${file}.jpg`,
    subtitles: `${BASE}/subtitles/${file}.vtt`,
  };
}

export const TECHNIQUE_VIDEO_IDS: readonly string[] = Object.keys(TECHNIQUE_VIDEOS);
