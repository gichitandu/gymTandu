/**
 * Varianti reali del catalogo dell'app per gli esercizi del coach che ne hanno più di una.
 * Gli id sono quelli del catalogo (defaultExercises): lo storico dei carichi si lega all'esercizio
 * reale, quindi ogni variante ha le sue progressioni.
 *
 * Criteri di inclusione: stesso schema di movimento e stesso tipo di attrezzo dell'esercizio del coach
 * (così carico e ripetizioni restano confrontabili). Esclusi unilaterali, a bracci indipendenti, a dischi e assistiti.
 * Un id compare una sola volta: nativeToCore() deve poter risalire a un solo esercizio del coach.
 */
export interface ExerciseVariant { id: string; name: string; /** Etichetta attrezzo del catalogo, es. «Macchina». */ equipment: string; }
export interface VariantGroup { /** Variante proposta quando l'utente non ha storico né preferenze. */ defaultId: string; options: readonly ExerciseVariant[]; }

export const VARIANTS: Readonly<Record<string, VariantGroup>> = {
  "machine-chest-press": { defaultId: "variant-v2-chest-orizzontale", options: [
    { id: "exercise-3", name: "Chest press", equipment: "Macchina" },
    { id: "variant-v2-chest-orizzontale", name: "Chest press orizzontale presa prona", equipment: "Macchina" },
    { id: "variant-v2-chest-neutra", name: "Chest press orizzontale presa neutra", equipment: "Macchina" },
    { id: "variant-incline-chest-machine", name: "Chest press inclinata alla macchina", equipment: "Macchina" },
    { id: "variant-v2-chest-inclinata-neutra", name: "Chest press inclinata presa neutra", equipment: "Macchina" },
    { id: "variant-v2-chest-declinata", name: "Chest press declinata alla macchina", equipment: "Macchina" },
    { id: "variant-v2-chest-convergente", name: "Chest press convergente orizzontale", equipment: "Macchina" },
    { id: "variant-v2-chest-convergente-inclinata", name: "Chest press convergente inclinata", equipment: "Macchina" },
    { id: "variant-v2-chest-convergente-declinata", name: "Chest press convergente declinata", equipment: "Macchina" },
  ] },
  "cable-fly": { defaultId: "variant-v2-croci-spalle", options: [
    { id: "exercise-2", name: "Croci ai cavi", equipment: "Cavi" },
    { id: "variant-v2-croci-spalle", name: "Croci ai cavi all’altezza delle spalle", equipment: "Cavi" },
    { id: "variant-cable-fly-low", name: "Croci ai cavi dal basso verso l’alto", equipment: "Cavi" },
    { id: "variant-cable-fly-high", name: "Croci ai cavi dall’alto verso il basso", equipment: "Cavi" },
    { id: "variant-v2-croci-panca-piana", name: "Croci ai cavi su panca piana (0°)", equipment: "Cavi" },
    { id: "variant-v2-croci-panca-30", name: "Croci ai cavi su panca inclinata a 30°", equipment: "Cavi" },
    { id: "variant-v2-croci-panca-45", name: "Croci ai cavi su panca inclinata a 45°", equipment: "Cavi" },
  ] },
  "machine-lat-pulldown": { defaultId: "variant-lat-pronated-wide", options: [
    { id: "exercise-4", name: "Lat machine", equipment: "Cavi" },
    { id: "variant-lat-pronated-wide", name: "Lat machine presa prona larga", equipment: "Cavi" },
    { id: "variant-v2-lat-prona-media", name: "Lat machine presa prona media", equipment: "Cavi" },
    { id: "variant-v2-lat-prona-stretta", name: "Lat machine presa prona stretta", equipment: "Cavi" },
    { id: "library-cable_close_grip_front_lat_pulldown", name: "Lat machine presa stretta", equipment: "Cavi" },
    { id: "variant-lat-supinated", name: "Lat machine presa supina", equipment: "Cavi" },
    { id: "variant-v2-lat-supina-stretta", name: "Lat machine presa supina stretta", equipment: "Cavi" },
    { id: "variant-v2-lat-supina-larga", name: "Lat machine presa supina larga", equipment: "Cavi" },
    { id: "variant-lat-neutral", name: "Lat machine presa neutra", equipment: "Cavi" },
    { id: "variant-v2-lat-neutra-stretta", name: "Lat machine presa neutra con triangolo", equipment: "Cavi" },
    { id: "variant-v2-lat-neutra-media", name: "Lat machine presa neutra media", equipment: "Cavi" },
    { id: "variant-v2-lat-neutra-larga", name: "Lat machine presa neutra larga", equipment: "Cavi" },
    { id: "variant-v2-lat-sagomata-stretta", name: "Lat machine con maniglia sagomata stretta", equipment: "Cavi" },
    { id: "variant-v2-lat-sagomata-media", name: "Lat machine con maniglia sagomata media", equipment: "Cavi" },
    { id: "variant-v2-lat-sagomata-larga", name: "Lat machine con maniglia sagomata larga", equipment: "Cavi" },
  ] },
  "cable-row": { defaultId: "variant-row-neutral", options: [
    { id: "exercise-6", name: "Pulley", equipment: "Cavi" },
    { id: "variant-row-neutral", name: "Pulley presa neutra stretta", equipment: "Cavi" },
    { id: "variant-row-wide", name: "Pulley presa prona larga", equipment: "Cavi" },
    { id: "variant-v2-pulley-supino", name: "Pulley presa supina", equipment: "Cavi" },
  ] },
  "cable-pushdown": { defaultId: "variant-pushdown-rope", options: [
    { id: "exercise-18", name: "Pushdown cavo", equipment: "Cavi" },
    { id: "variant-pushdown-rope", name: "Pushdown con corda", equipment: "Cavi" },
    { id: "variant-pushdown-bar", name: "Pushdown con barra dritta", equipment: "Cavi" },
    { id: "variant-v2-pushdown-v", name: "Pushdown con barra a V", equipment: "Cavi" },
    { id: "variant-v2-pushdown-ez", name: "Pushdown con barra EZ", equipment: "Cavi" },
    { id: "variant-v2-pushdown-supino", name: "Pushdown con barra presa supina", equipment: "Cavi" },
  ] },
  "cable-curl": { defaultId: "variant-v2-curl-cavo-barra", options: [
    { id: "library-cable_standing_biceps_cable_curl", name: "Curl al cavo", equipment: "Cavi" },
    { id: "variant-v2-curl-cavo-corda", name: "Curl al cavo basso con corda", equipment: "Cavi" },
    { id: "variant-v2-curl-cavo-barra", name: "Curl al cavo basso con barra dritta", equipment: "Cavi" },
    { id: "variant-v2-curl-cavo-ez", name: "Curl al cavo basso con barra EZ", equipment: "Cavi" },
    { id: "variant-v2-curl-bayesian", name: "Curl al cavo dietro il corpo (Bayesian)", equipment: "Cavi" },
    { id: "variant-v2-curl-cavi-alti", name: "Curl ai cavi alti a doppio bicipite", equipment: "Cavi" },
  ] },
  "dumbbell-curl": { defaultId: "variant-curl-alternate", options: [
    { id: "exercise-17", name: "Curl manubri", equipment: "Manubri" },
    { id: "variant-curl-alternate", name: "Curl con manubri alternato", equipment: "Manubri" },
    { id: "variant-curl-seated", name: "Curl con manubri da seduto", equipment: "Manubri" },
    { id: "variant-v2-curl-db-simultaneo", name: "Curl con manubri simultaneo in piedi", equipment: "Manubri" },
    { id: "variant-incline-curl-45", name: "Curl con manubri su panca a 45°", equipment: "Manubri" },
    { id: "variant-incline-curl-60", name: "Curl con manubri su panca a 60°", equipment: "Manubri" },
  ] },
  "machine-leg-press": { defaultId: "variant-v2-legpress-45", options: [
    { id: "exercise-12", name: "Leg press", equipment: "Macchina" },
    { id: "variant-v2-legpress-45", name: "Leg press inclinata a 45°", equipment: "Macchina" },
    { id: "variant-v2-legpress-horizontal", name: "Leg press orizzontale", equipment: "Macchina" },
    { id: "variant-legpress-wide", name: "Leg press piedi larghi", equipment: "Macchina" },
    { id: "variant-legpress-narrow", name: "Leg press piedi stretti", equipment: "Macchina" },
  ] },
  "machine-leg-curl": { defaultId: "library-machine_seated_leg_curl", options: [
    { id: "library-machine_seated_leg_curl", name: "Leg curl seduto", equipment: "Macchina" },
    { id: "variant-legcurl-lying", name: "Leg curl sdraiato", equipment: "Macchina" },
  ] },
  "dumbbell-shoulder-press": { defaultId: "variant-shoulder-press-75", options: [
    { id: "exercise-8", name: "Shoulder press", equipment: "Manubri" },
    { id: "variant-shoulder-press-75", name: "Spinte spalle con manubri da seduto a 75°", equipment: "Manubri" },
    { id: "variant-shoulder-press-90", name: "Spinte spalle con manubri da seduto a 90°", equipment: "Manubri" },
  ] },
  "dumbbell-bench-press": { defaultId: "library-dumbbells_dumbbell_bench_press", options: [
    { id: "library-dumbbells_dumbbell_bench_press", name: "Panca piana con manubri (0°)", equipment: "Manubri" },
    { id: "variant-db-bench-neutral-0", name: "Panca piana con manubri, presa neutra", equipment: "Manubri" },
    { id: "variant-db-bench-15", name: "Panca inclinata con manubri a 15°", equipment: "Manubri" },
    { id: "variant-db-bench-30", name: "Panca inclinata con manubri a 30°", equipment: "Manubri" },
    { id: "variant-db-bench-45", name: "Panca inclinata con manubri a 45°", equipment: "Manubri" },
    { id: "variant-db-bench-neutral-30", name: "Panca inclinata a 30° con manubri, presa neutra", equipment: "Manubri" },
  ] },
  "barbell-bench-press": { defaultId: "exercise-0", options: [
    { id: "exercise-0", name: "Panca piana", equipment: "Bilanciere" },
    { id: "variant-barbell-bench-15", name: "Panca inclinata con bilanciere a 15°", equipment: "Bilanciere" },
    { id: "variant-barbell-bench-30", name: "Panca inclinata con bilanciere a 30°", equipment: "Bilanciere" },
    { id: "variant-barbell-bench-45", name: "Panca inclinata con bilanciere a 45°", equipment: "Bilanciere" },
  ] },
  "dumbbell-lateral-raise": { defaultId: "exercise-9", options: [
    { id: "exercise-9", name: "Alzate laterali", equipment: "Manubri" },
    { id: "variant-lateral-seated", name: "Alzate laterali con manubri da seduto", equipment: "Manubri" },
  ] },
  "cable-lateral-raise": { defaultId: "library-cable_standing_low_pulley_deltoid_raise", options: [
    { id: "library-cable_standing_low_pulley_deltoid_raise", name: "Alzate laterali al cavo", equipment: "Cavi" },
    { id: "variant-lateral-cable-behind", name: "Alzate laterali al cavo dietro il corpo", equipment: "Cavi" },
  ] },
  "barbell-squat": { defaultId: "variant-squat-high-bar", options: [
    { id: "exercise-11", name: "Squat", equipment: "Bilanciere" },
    { id: "variant-squat-high-bar", name: "Squat con bilanciere alto", equipment: "Bilanciere" },
    { id: "variant-squat-low-bar", name: "Squat con bilanciere basso", equipment: "Bilanciere" },
  ] },
  "dumbbell-row": { defaultId: "library-dumbbells_one_arm_dumbbell_row", options: [
    { id: "library-dumbbells_one_arm_dumbbell_row", name: "Rematore manubrio", equipment: "Manubri" },
    { id: "variant-row-supported-30", name: "Rematore con manubri con petto su panca a 30°", equipment: "Manubri" },
    { id: "variant-row-supported-45", name: "Rematore con manubri con petto su panca a 45°", equipment: "Manubri" },
  ] },
};

/** Esercizio del coach a cui appartiene un id del catalogo, se è una variante nota. */
export function variantCoreId(nativeId: string): string | undefined {
  for (const [coreId, group] of Object.entries(VARIANTS)) if (group.options.some(option => option.id === nativeId)) return coreId;
  return undefined;
}
export function findVariant(coreId: string, variantId: string | undefined): ExerciseVariant | undefined {
  return variantId ? VARIANTS[coreId]?.options.find(option => option.id === variantId) : undefined;
}
/** Varianti proposte dal coach: quella indicata se valida, altrimenti la predefinita. Id sconosciuti non fanno errore. */
export function resolveVariantId(coreId: string, wanted?: string): string | undefined {
  const group = VARIANTS[coreId];
  if (!group) return undefined;
  return wanted && group.options.some(option => option.id === wanted) ? wanted : group.defaultId;
}
