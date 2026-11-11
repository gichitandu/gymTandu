import { Exercise } from '../models/domain';

/** Video tecnici locali (animazioni schematiche 3D, 28 s, senza audio, testo italiano integrato).
 * Associazione statica per ID; nome e attrezzo devono coincidere con quelli attesi, così un esercizio
 * personalizzato o rinominato non riceve per errore un filmato non pertinente. Nessun campo dati nuovo. */
const TECHNIQUE_VIDEOS: Record<string, { name: string; equipment: string }> = {
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
};
const BASE = '/training/videos/gt-technique-v1';

export interface TechniqueVideo { video: string; poster: string; subtitles: string; }

export function techniqueVideoFor(exercise: Pick<Exercise, 'id' | 'name' | 'equipment'> | undefined | null): TechniqueVideo | null {
  if (!exercise || !Object.prototype.hasOwnProperty.call(TECHNIQUE_VIDEOS, exercise.id)) return null;
  const expected = TECHNIQUE_VIDEOS[exercise.id];
  if (exercise.name.trim() !== expected.name || exercise.equipment.trim() !== expected.equipment) return null;
  return {
    video: `${BASE}/${exercise.id}.mp4`,
    poster: `${BASE}/posters/${exercise.id}.jpg`,
    subtitles: `${BASE}/subtitles/${exercise.id}.vtt`,
  };
}

export const TECHNIQUE_VIDEO_IDS: readonly string[] = Object.keys(TECHNIQUE_VIDEOS);
