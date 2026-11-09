import type { Exercise } from "../models/domain";
import { movementKind, type MovementKind } from "./exercise-visual";
export interface MotionPhase {
  label: string;
  cue: string;
}
export interface MotionFrames {
  kind: MovementKind;
  source: string;
  columns: 3;
  rows: 2;
  frames: 6;
  durationMs: number;
  title: string;
  phases: readonly MotionPhase[];
}
const phase = (label: string, cue: string): MotionPhase => ({ label, cue });
const sequences: Record<
  MovementKind,
  { title: string; phases: readonly MotionPhase[] }
> = {
  bench: {
    title: "Panca piana con bilanciere",
    phases: [
      phase(
        "Partenza",
        "Piedi a terra e scapole stabili. Il bilanciere è vicino al petto.",
      ),
      phase(
        "Spinta",
        "Spingi il bilanciere verso l’alto mantenendo il controllo.",
      ),
      phase(
        "Estensione",
        "Completa la spinta senza perdere la posizione sulla panca.",
      ),
      phase(
        "Inizio della discesa",
        "Riporta il bilanciere verso il petto con un movimento controllato.",
      ),
      phase("Discesa", "Mantieni il carico stabile e le scapole appoggiate."),
      phase(
        "Ritorno",
        "Torna vicino al petto senza rimbalzare prima della ripetizione successiva.",
      ),
    ],
  },
  squat: {
    title: "Squat con bilanciere",
    phases: [
      phase(
        "Partenza",
        "Bilanciere sulla parte alta della schiena, piedi stabili e busto attivo.",
      ),
      phase(
        "Inizio della discesa",
        "Piega anche e ginocchia mantenendo i talloni a terra.",
      ),
      phase(
        "Discesa",
        "Scendi con controllo senza perdere la stabilità del busto.",
      ),
      phase(
        "Punto basso",
        "Raggiungi la profondità che riesci a controllare con una posizione stabile.",
      ),
      phase(
        "Risalita",
        "Spingi con i piedi e risali mantenendo il carico stabile.",
      ),
      phase("Ritorno", "Ritorna in piedi con controllo prima di ripetere."),
    ],
  },
  curl: {
    title: "Curl con manubri in piedi",
    phases: [
      phase(
        "Partenza",
        "In piedi con le braccia vicine al busto e i palmi rivolti in avanti.",
      ),
      phase(
        "Inizio della salita",
        "Fletti i gomiti mantenendo ferme le braccia.",
      ),
      phase(
        "Salita",
        "Avvicina i manubri alle spalle senza oscillare con il busto.",
      ),
      phase(
        "Contrazione",
        "Concludi la flessione senza spostare i gomiti in avanti.",
      ),
      phase("Discesa", "Abbassa i manubri lentamente mantenendo il controllo."),
      phase(
        "Ritorno",
        "Torna con le braccia distese ai lati prima di ripetere.",
      ),
    ],
  },
  lat: {
    title: "Lat machine",
    phases: [
      phase(
        "Partenza",
        "Siediti con i piedi a terra e le cosce sotto i supporti.",
      ),
      phase(
        "Inizio della trazione",
        "Porta i gomiti verso il basso mantenendo il busto stabile.",
      ),
      phase("Trazione", "Avvicina la barra alla parte alta del petto."),
      phase(
        "Chiusura",
        "La barra rimane davanti al busto; evita di tirarla dietro il collo.",
      ),
      phase("Risalita", "Lascia risalire la barra con controllo senza slanci."),
      phase(
        "Ritorno",
        "Ritorna alla posizione iniziale mantenendo il controllo del carico.",
      ),
    ],
  },
  shoulder: {
    title: "Spinte con manubri sopra la testa",
    phases: [
      phase(
        "Partenza",
        "Siediti con i piedi a terra e i manubri all’altezza delle spalle.",
      ),
      phase(
        "Inizio della spinta",
        "Spingi verso l’alto senza inarcare eccessivamente la schiena.",
      ),
      phase("Spinta", "Mantieni i manubri stabili mentre distendi le braccia."),
      phase("Estensione", "Concludi la spinta sopra la testa con controllo."),
      phase("Discesa", "Riporta lentamente i manubri verso le spalle."),
      phase("Ritorno", "Ritorna alla posizione iniziale prima di ripetere."),
    ],
  },
  fly: {
    title: "Croci ai cavi",
    phases: [
      phase(
        "Partenza",
        "Posizione stabile, braccia aperte e gomiti leggermente piegati.",
      ),
      phase(
        "Inizio della chiusura",
        "Avvicina le mani davanti al busto mantenendo l’angolo dei gomiti.",
      ),
      phase(
        "Chiusura",
        "Continua il movimento senza trasformarlo in una spinta.",
      ),
      phase(
        "Contrazione",
        "Avvicina le mani davanti al busto mantenendo i gomiti leggermente piegati.",
      ),
      phase(
        "Apertura",
        "Lascia riaprire le braccia con controllo mantenendo una lieve flessione dei gomiti.",
      ),
      phase(
        "Ritorno",
        "Ritorna alla posizione aperta senza forzare l’allungamento.",
      ),
    ],
  },
  lateral: {
    title: "Alzate laterali con manubri",
    phases: [
      phase("Partenza", "In piedi con i manubri ai lati e il busto stabile."),
      phase(
        "Inizio del sollevamento",
        "Solleva le braccia lateralmente con i gomiti leggermente piegati.",
      ),
      phase("Sollevamento", "Continua la salita senza slanci del busto."),
      phase("Altezza delle spalle", "Fermati circa all’altezza delle spalle."),
      phase("Discesa", "Abbassa i manubri lentamente mantenendo il controllo."),
      phase("Ritorno", "Ritorna con i manubri ai lati prima di ripetere."),
    ],
  },
};
/** Frame sequences describe the exact supported variant, never every exercise in its family. */
export function exerciseMotionFrames(
  exercise: Exercise | undefined,
): MotionFrames | undefined {
  const kind = movementKind(exercise);
  if (!kind) return;
  return {
    kind,
    source: `/training/motion/${kind}-frames-v1.png`,
    columns: 3,
    rows: 2,
    frames: 6,
    durationMs: 3600,
    ...sequences[kind],
  };
}
