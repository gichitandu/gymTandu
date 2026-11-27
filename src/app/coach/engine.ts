import { CATALOG, getExercise } from './catalog.js';
import { VARIANTS, findVariant, resolveVariantId } from './variants.js';
import { BLOCK_WEEKS_RANGE, DAY_FOCUS_LABELS, ENGINE_VERSION, EXPERIENCE_PRESETS, GOAL_PRESETS, HEAVY_COMPOUNDS, HEURISTICS, MAX_EXERCISES_RANGE, MIN_REST_SECONDS, MUSCLE_LABELS, REST_DELTA_SECONDS, SESSION_MINUTES_RANGE, SPLIT_LABELS, VOLUME_SET_DELTA, type RepTier } from './config.js';
import type { ActualSet, DayFocus, Decision, Exercise, ExercisePrescription, ExerciseReplacement, ExerciseRecommendationInput, LoadSetting, Muscle, NextSetInput, PlanSession, Profile, RecoveryAssessment, SetRecommendation, SplitMode, TrainingPlan, WorkoutHistory } from './models.js';

const MUSCLES = Object.keys(MUSCLE_LABELS) as Muscle[];
const DAY_MS = 86_400_000;
const decision = (ruleId: string, message: string, kind: Decision['kind'] = 'heuristic', sourceIds: string[] = []): Decision => ({ ruleId, message, kind, sourceIds });
const round = (n: number): number => Math.round(n * 1000) / 1000;
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const validSet = (s: ActualSet): boolean => valid(s.reps) && s.reps >= 0 && Number.isInteger(s.reps) && (s.loadKg === null || valid(s.loadKg) && s.loadKg >= 0) && (s.rir === null || valid(s.rir) && s.rir >= 0 && s.rir <= 10) && ['good', 'degraded', 'unknown'].includes(s.technique) && typeof s.pain === 'boolean';

function time(date: string): number {
  const value = Date.parse(date);
  if (!Number.isFinite(value)) throw new RangeError('Data non valida: usa una data ISO esplicita.');
  return value;
}

function validateProfile(p: Profile): void {
  if (!GOAL_PRESETS[p.goal] || !EXPERIENCE_PRESETS[p.experience]) throw new RangeError('Obiettivo o livello non supportato.');
  if (!Number.isInteger(p.daysPerWeek) || p.daysPerWeek < 1 || p.daysPerWeek > 6) throw new RangeError('Scegli da 1 a 6 giorni alla settimana.');
  if (!valid(p.minutesPerSession) || p.minutesPerSession < HEURISTICS.minimumSessionMinutes || p.minutesPerSession > 120) throw new RangeError('Scegli una durata tra 20 e 120 minuti.');
  if (!Array.isArray(p.equipment) || !p.equipment.length || p.equipment.some(e => !['machine','cable','dumbbell','barbell','bodyweight'].includes(e))) throw new RangeError('Seleziona almeno un tipo di attrezzatura valido.');
  if (!Array.isArray(p.priorities) || p.priorities.some(m => !MUSCLES.includes(m))) throw new RangeError('Priorità muscolari non valide.');
  if (!Array.isArray(p.excludedExerciseIds)) throw new RangeError('Elenco esclusioni non valido.');
  validatePreferences(p);
  for (const [id, setting] of Object.entries(p.loadSettings ?? {})) {
    const isBodyweight = CATALOG.find(ex => ex.id === id)?.loadType === 'bodyweight';
    if (!valid(setting.minKg) || setting.minKg < 0 || !valid(setting.incrementKg) || (isBodyweight ? setting.incrementKg < 0 : setting.incrementKg <= 0)) throw new RangeError('Incremento e minimo di carico devono essere numeri validi (incremento > 0, oppure 0 a corpo libero).');
    if (setting.availableLoadsKg && (!setting.availableLoadsKg.length || setting.availableLoadsKg.some(x => !valid(x) || x < setting.minKg))) throw new RangeError('Carichi disponibili non validi.');
    if (setting.variantId !== undefined && typeof setting.variantId !== 'string') throw new RangeError('Variante dell’esercizio non valida.');
  }
}

/** Preferenze facoltative di struttura e dosaggio: assenti = comportamento delle versioni precedenti. */
function validatePreferences(p: Profile): void {
  const integerIn = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (p.split !== undefined && !Object.hasOwn(SPLIT_LABELS, p.split)) throw new RangeError('Struttura settimanale non supportata.');
  if (p.customDays !== undefined && (!Array.isArray(p.customDays) || p.customDays.length > 6 || p.customDays.some(d => !Object.hasOwn(DAY_FOCUS_LABELS, d)))) throw new RangeError('Contenuto delle sedute non valido.');
  if (p.split === 'custom' && p.customDays?.length !== p.daysPerWeek) throw new RangeError('Nella settimana personalizzata scegli il contenuto di ogni seduta.');
  if (p.sessionMinutes !== undefined && (!Array.isArray(p.sessionMinutes) || p.sessionMinutes.length > 6 || p.sessionMinutes.some(m => m !== null && (!valid(m) || m < SESSION_MINUTES_RANGE.min || m > SESSION_MINUTES_RANGE.max)))) throw new RangeError('La durata di ogni seduta deve essere tra 20 e 120 minuti.');
  if (p.blockWeeks !== undefined && !integerIn(p.blockWeeks, BLOCK_WEEKS_RANGE.min, BLOCK_WEEKS_RANGE.max)) throw new RangeError('Scegli un blocco da 2 a 16 settimane.');
  if (p.maxExercises !== undefined && !integerIn(p.maxExercises, MAX_EXERCISES_RANGE.min, MAX_EXERCISES_RANGE.max)) throw new RangeError('Scegli da 3 a 10 esercizi per seduta.');
  if (p.volume !== undefined && !Object.hasOwn(VOLUME_SET_DELTA, p.volume)) throw new RangeError('Livello di volume non supportato.');
  if (p.rest !== undefined && !Object.hasOwn(REST_DELTA_SECONDS, p.rest)) throw new RangeError('Preferenza di recupero non supportata.');
  if (p.preferredExerciseIds !== undefined && (!Array.isArray(p.preferredExerciseIds) || p.preferredExerciseIds.some(id => typeof id !== 'string'))) throw new RangeError('Elenco esercizi preferiti non valido.');
  if (p.varyRepeatedDays !== undefined && typeof p.varyRepeatedDays !== 'boolean') throw new RangeError('Preferenza di variazione non valida.');
  if (p.replacements !== undefined && (!Array.isArray(p.replacements) || p.replacements.length > REPLACEMENTS_MAX
    || p.replacements.some(r => !r || typeof r !== 'object' || typeof r.session !== 'string' || r.session.length > 60 || typeof r.from !== 'string' || typeof r.to !== 'string' || !['similar', 'muscle'].includes(r.kind)))) throw new RangeError('Sostituzioni degli esercizi non valide.');
  // Gli id sconosciuti non sono un errore (il catalogo può cambiare tra versioni): valgono come «esercizio generico».
  if (p.variants !== undefined && (typeof p.variants !== 'object' || p.variants === null || Array.isArray(p.variants) || Object.values(p.variants).some(id => typeof id !== 'string'))) throw new RangeError('Varianti degli esercizi non valide.');
}

/** Oltre questo numero il profilo diventerebbe troppo grande per essere salvato insieme alla scheda. */
export const REPLACEMENTS_MAX = 40;

function loadSetting(profile: Profile, ex: Exercise): LoadSetting {
  return profile.loadSettings?.[ex.id] ?? { incrementKg: ex.defaultIncrementKg, minKg: ex.defaultMinKg, equipmentKey: ex.id };
}

/** Available dumbbell values are per dumbbell; barbell values include the bar. */
function nextLoad(current: number, setting: LoadSetting, direction: 1 | -1): number | null {
  if (setting.availableLoadsKg) {
    const values = [...new Set(setting.availableLoadsKg)].sort((a, b) => a - b);
    return direction === 1 ? values.find(x => x > current + 0.001) ?? null : values.filter(x => x < current - 0.001).at(-1) ?? null;
  }
  if (!valid(setting.incrementKg) || setting.incrementKg <= 0) return null;
  const offset = (current - setting.minKg) / setting.incrementKg;
  const count = direction === 1 ? Math.floor(offset + 0.00001) + 1 : Math.ceil(offset - 0.00001) - 1;
  const value = round(setting.minKg + Math.max(0, count) * setting.incrementKg);
  if (direction === -1 && value >= current - 0.001) return null;
  return value >= setting.minKg ? value : null;
}

function validLoad(load: number, setting: LoadSetting): boolean {
  if (load < setting.minKg) return false;
  if (setting.availableLoadsKg) return setting.availableLoadsKg.some(x => Math.abs(x - load) < 0.001);
  if (!(setting.incrementKg > 0)) return false;
  const steps = (load - setting.minKg) / setting.incrementKg;
  return Math.abs(steps - Math.round(steps)) < 0.001;
}

function historyFor(history: WorkoutHistory[], p: ExercisePrescription, asOf: string): WorkoutHistory[] {
  const now = time(asOf);
  const unique = new Map<string, WorkoutHistory>();
  for (const h of history) {
    if (h.exerciseId !== p.exerciseId || h.equipmentKey !== p.equipmentKey || !Array.isArray(h.sets)) continue;
    const date = Date.parse(h.date);
    if (!Number.isFinite(date) || date > now || !h.sets.every(validSet)) continue;
    unique.set(h.id, h);
  }
  return [...unique.values()].sort((a, b) => time(b.date) - time(a.date) || b.id.localeCompare(a.id));
}

const working = (h: WorkoutHistory): ActualSet[] => h.sets.filter(s => s.kind === 'working');
function complete(h: WorkoutHistory, p: ExercisePrescription): boolean {
  return h.completed && working(h).length === p.sets && (h.prescribedSets === undefined || h.prescribedSets === p.sets) && (h.repsMin === undefined || h.repsMin === p.repsMin) && (h.repsMax === undefined || h.repsMax === p.repsMax);
}
function contextual(h: WorkoutHistory, p: ExercisePrescription): boolean {
  return h.prescribedSets === p.sets && h.repsMin === p.repsMin && h.repsMax === p.repsMax;
}
function successful(h: WorkoutHistory, p: ExercisePrescription): boolean {
  const sets = working(h);
  return complete(h,p) && contextual(h,p) && sets.every(s => s.reps >= p.repsMax && s.rir !== null && s.rir >= p.rir && s.technique === 'good' && !s.pain && (s.targetRir === undefined || s.targetRir === p.rir)) && sets.every(s => s.loadKg === sets[0]?.loadKg);
}
/** Successo netto: tutte le serie al limite superiore con almeno una ripetizione in riserva oltre a quella prevista. */
function clearlyEasy(h: WorkoutHistory, p: ExercisePrescription): boolean {
  return successful(h,p) && working(h).every(s => s.rir !== null && s.rir >= p.rir + 1);
}
function difficult(h: WorkoutHistory, p?: ExercisePrescription): boolean {
  const sets = working(h);
  const minimum = p?.repsMin ?? h.repsMin;
  if (!h.completed || minimum === undefined || !sets.length || (p && !complete(h,p))) return false;
  return sets.filter(s => s.reps < minimum && s.rir !== null && s.rir <= 1 && !s.pain && s.technique === 'good').length >= Math.ceil(sets.length / 2);
}

function label(ex: Exercise, value: number | null): string {
  if (ex.loadType === 'bodyweight') return 'Corpo libero · adatta la variante';
  const unit = ex.loadType === 'per-dumbbell' ? 'kg per manubrio' : ex.loadType === 'total' ? 'kg totali' : 'kg sulla stessa macchina';
  return value === null ? `Da calibrare · ${unit}` : `${value} ${unit}`;
}

/** Persisted plans must respect current settings as well as generation-time checks. */
function sanitizeTechniques(p: ExercisePrescription, profile: Profile, ex: Exercise): ExercisePrescription {
  const allowed = profile.experience === 'advanced' && profile.goal === 'hypertrophy' && ex.isolation && ex.stable && !p.calibration && p.progression !== 'review' && p.progression !== 'reduce' && !p.supersetGroup;
  if (!allowed || !profile.allowDropSets || ex.loadType === 'bodyweight') p.dropSet = undefined;
  p.failureAllowedLastSet = allowed && profile.allowFailure && !p.dropSet && p.failureAllowedLastSet;
  return p;
}

/** Recommend one exercise for a future session. Never modifies historical logs. */
export function recommendExercise(input: ExerciseRecommendationInput): ExercisePrescription {
  validateProfile(input.profile);
  const { profile, asOf } = input;
  const p: ExercisePrescription = { ...input.prescription, decisions: [...input.prescription.decisions], alternatives: [...input.prescription.alternatives] };
  const ex = getExercise(p.exerciseId);
  const settings = loadSetting(profile,ex);
  const logs = historyFor(input.history,p,asOf);
  const last = logs[0];
  const completeLogs = logs.filter(h => complete(h,p));
  const mostRecent = completeLogs[0];
  const recentCompleteLogs = completeLogs.filter(h => time(asOf)-time(h.date) <= HEURISTICS.staleHistoryDays*DAY_MS);
  if (last?.sets.some(s => s.pain)) {
    p.progression = 'review'; p.loadKg = null; p.calibration = true; p.dropSet = undefined; p.failureAllowedLastSet = false;
    p.decisions.push(decision('pain-review','Ultimo allenamento con dolore segnalato: non riproporre automaticamente questo esercizio. Verifica prima una variante confortevole.','constraint'));
  } else if (!mostRecent || time(asOf) - time(mostRecent.date) > HEURISTICS.staleHistoryDays * DAY_MS) {
    p.loadKg = null; p.progression = 'calibrate'; p.calibration = ex.loadType !== 'bodyweight'; p.confidence = 'initial';
    p.decisions.push(decision(mostRecent ? 'stale-history' : 'cold-start',mostRecent ? 'Lo storico confrontabile risale a oltre 28 giorni fa: ricalibra il carico senza presumere la prestazione attuale.' : 'Manca una seduta completa e confrontabile: scegli un carico di prova gestibile, poi registra ripetizioni e difficoltà.','heuristic',['acsm-2026']));
  } else {
    const sets = working(mostRecent);
    const firstLoad = sets[0]?.loadKg ?? null;
    p.confidence = recentCompleteLogs.filter(h => contextual(h,p) && working(h).every(s => s.rir !== null && s.technique === 'good' && !s.pain)).length >= 3 ? 'established' : 'limited';
    p.progression = 'maintain';
    p.loadKg = firstLoad;
    p.calibration = firstLoad === null && ex.loadType !== 'bodyweight';
    if (ex.loadType !== 'bodyweight' && firstLoad !== null && !validLoad(firstLoad,settings)) {
      p.loadKg = null; p.calibration = true; p.progression = 'calibrate';
      p.decisions.push(decision('unavailable-load','Il carico storico non coincide con gli incrementi disponibili: verifica attrezzatura e impostazioni prima di prescriverlo.','constraint'));
    } else if (logs[0] && !complete(logs[0],p)) {
      p.decisions.push(decision('incomplete-latest','L’ultima seduta è parziale o usa una prescrizione diversa: mantieni come riferimento l’ultima seduta completa, senza aumentare.'));
    } else if (sets.some(s => s.technique === 'degraded')) {
      p.progression = 'review'; p.dropSet = undefined; p.failureAllowedLastSet = false;
      p.decisions.push(decision('technique-review','Tecnica peggiorata nell’ultima seduta: verifica esecuzione e carico prima di progredire.','constraint'));
    } else if (ex.loadType !== 'bodyweight' && sets.some(s => s.loadKg !== firstLoad)) {
      p.loadKg = null; p.calibration = true; p.progression = 'calibrate';
      p.decisions.push(decision('mixed-load-history','La seduta usa carichi diversi tra le serie: non viene trasformata automaticamente in serie tutte allo stesso peso. Ricalibra questa prescrizione.','constraint'));
    } else if (recentCompleteLogs.slice(0,HEURISTICS.plateauSessions).length === HEURISTICS.plateauSessions && recentCompleteLogs.slice(0,HEURISTICS.plateauSessions).every(h => difficult(h,p))) {
      const lower = firstLoad === null ? null : nextLoad(firstLoad,settings,-1);
      p.loadKg = lower ?? firstLoad; p.progression = lower === null ? 'review' : 'reduce'; p.dropSet = undefined; p.failureAllowedLastSet = false;
      p.decisions.push(decision('repeated-difficulty','Tre sedute complete con difficoltà ripetuta: proponi un piccolo passo indietro e rivedi il recupero. La causa non è deducibile automaticamente.'));
    } else if (firstLoad !== null && ex.loadType !== 'bodyweight' && (
      // Doppia progressione: due sedute al limite superiore con il margine richiesto…
      (recentCompleteLogs.length >= HEURISTICS.comparableSuccessesForIncrease && recentCompleteLogs.slice(0,2).every(h => successful(h,p)) && working(recentCompleteLogs[1]!)[0]?.loadKg === firstLoad)
      // …oppure, per principianti e intermedi che progrediscono più in fretta, una sola seduta chiaramente facile.
      || (profile.experience !== 'advanced' && clearlyEasy(mostRecent,p)))) {
      const single = !(recentCompleteLogs.length >= HEURISTICS.comparableSuccessesForIncrease && recentCompleteLogs.slice(0,2).every(h => successful(h,p)) && working(recentCompleteLogs[1]!)[0]?.loadKg === firstLoad);
      const next = nextLoad(firstLoad,settings,1);
      if (next !== null && (firstLoad === 0 || (next-firstLoad)/firstLoad <= HEURISTICS.maxRelativeIncrease)) {
        p.loadKg = next; p.progression = 'increase'; p.calibration = false;
        p.decisions.push(decision('double-progression',single
          ? 'Ultima seduta completa al limite superiore con almeno una ripetizione in riserva in più del previsto: chi è all’inizio o a livello intermedio progredisce in fretta, quindi prova già il minimo incremento disponibile, ripartendo dalla parte bassa del range.'
          : 'Due sedute complete al limite superiore con tecnica e margine richiesti: prova il minimo incremento disponibile, ripartendo dalla parte bassa del range.','heuristic',['acsm-2026']));
      } else {
        p.decisions.push(decision('increment-too-large',next === null ? 'Nessun incremento disponibile: mantieni il carico e rivedi la progressione.' : 'Il minimo incremento supera il 10%: mantieni il carico; valuta un incremento più piccolo senza forzare il salto.'));
      }
    } else {
      p.decisions.push(decision('maintain-baseline','Mantieni il carico di riferimento e prova a migliorare le ripetizioni nel range. Una singola giornata negativa non cambia automaticamente il programma.','heuristic',['acsm-2026','rir-accuracy-2022']));
      if (sets.some(s => s.rir === null || s.technique === 'unknown')) p.decisions.push(decision('uncertain-feedback','RIR o tecnica non registrati: il carico resta un riferimento, senza dedurre un margine che non hai indicato.','constraint',['rir-accuracy-2022']));
    }
  }
  if (ex.loadType === 'bodyweight') { p.loadKg = null; p.calibration = false; }
  p.loadLabel = label(ex,p.loadKg);
  return sanitizeTechniques(p,profile,ex);
}

/** The next-set adjustment is session-local, not a new long-term baseline. */
export function recommendNextSet({profile,prescription,completedSets}: NextSetInput): SetRecommendation {
  validateProfile(profile);
  if (!completedSets.every(validSet)) throw new RangeError('Dati della serie non validi.');
  const ex = getExercise(prescription.exerciseId);
  const p = sanitizeTechniques({...prescription},profile,ex);
  const actual = completedSets.filter(s => s.kind === 'working');
  const result: SetRecommendation = { setNumber: actual.length+1, loadKg:p.loadKg, repsMin:p.repsMin, repsMax:p.repsMax, rir:p.rir, restSeconds:p.restSeconds, action:p.calibration ? 'calibrate' : 'maintain', reason:p.calibration ? 'Scegli un carico di prova gestibile e registra il risultato; il sistema non inventa i kg.' : 'Mantieni la prescrizione e il margine indicati.', ruleId:'next-baseline', confidence:p.confidence, isTemporary:true };
  if (p.progression === 'review') return {...result,action:'stop',loadKg:null,reason:'Questo esercizio richiede una verifica prima di riprendere. Risolvi la segnalazione di dolore, tecnica o difficoltà prima di eseguire altre serie.',ruleId:'pending-review'};
  if (completedSets.some(s => s.pain)) return {...result,action:'stop',loadKg:null,reason:'Dolore segnalato: interrompi questo esercizio. Non cercare di compensare con una dropset o altre serie.',ruleId:'pain-stop'};
  if (completedSets.some(s => s.technique === 'degraded')) return {...result,action:'stop',reason:'La tecnica è peggiorata: termina questo esercizio e verifica carico ed esecuzione prima di riprenderlo.',ruleId:'technique-stop'};
  if (actual.length >= p.sets) return {...result, action:'complete',reason:'Serie allenanti completate. Registra separatamente l’eventuale dropset prevista.',ruleId:'exercise-complete',...(p.dropSet ? {dropSet:p.dropSet} : {})};
  const last = actual.at(-1);
  if (!last) return result;
  if (last.loadKg !== null && ex.loadType !== 'bodyweight') {
    const setting = loadSetting(profile,ex);
    if (!validLoad(last.loadKg,setting)) return {...result,loadKg:null,action:'calibrate',reason:'Il carico registrato non coincide con gli incrementi impostati: verifica attrezzatura e valori.',ruleId:'next-unavailable-load'};
    result.loadKg = last.loadKg;
    result.action = 'maintain';
    result.reason = 'Usa il carico appena registrato come riferimento per la prossima serie, rispettando il margine previsto.';
  }
  if (last.loadKg === null && ex.loadType !== 'bodyweight') return {...result,loadKg:null,action:'calibrate',reason:'Manca il carico effettivo della serie: inseriscilo prima di ricevere un suggerimento in kg.',ruleId:'next-missing-load'};
  if (last.rir === null || last.technique === 'unknown') {
    if (last.reps < p.repsMin) return {...result,action:'rest',restSeconds:p.restSeconds+30,reason:'Ripetizioni sotto il range e feedback incompleto: recupera un po’ di più e verifica la difficoltà, senza dedurre il cedimento.',ruleId:'next-incomplete-feedback'};
    return {...result,action:'maintain',reason:'Mantieni il riferimento: senza RIR o tecnica verificata non viene dedotta la difficoltà della serie.',ruleId:'next-unknown-rir'};
  }
  if (last.reps < p.repsMin && last.rir < Math.max(1,p.rir-1)) {
    const lower = last.loadKg === null || ex.loadType === 'bodyweight' ? null : nextLoad(last.loadKg,loadSetting(profile,ex),-1);
    return {...result,loadKg:lower ?? last.loadKg,action:lower === null ? 'rest' : 'reduce',restSeconds:p.restSeconds+30,reason:lower === null ? 'La serie è risultata molto difficile: prolunga il recupero e valuta una variante più gestibile.' : 'Serie sotto il range e vicina al cedimento: riduci di un incremento disponibile e recupera 30 secondi in più. Vale per questa seduta.',ruleId:'next-hard-set'};
  }
  if (last.reps < p.repsMin) return {...result,action:'rest',restSeconds:p.restSeconds+30,reason:'Prova un recupero leggermente più lungo. Un calo moderato tra serie non richiede automaticamente meno peso.',ruleId:'next-recovery'};
  if (last.reps >= p.repsMax && last.rir >= p.rir+2) {
    // Autoregolazione in seduta: serie chiaramente facile al limite superiore → un incremento solo per oggi.
    const heavier = last.loadKg === null || ex.loadType === 'bodyweight' || last.pain || last.technique !== 'good' ? null : nextLoad(last.loadKg,loadSetting(profile,ex),1);
    if (heavier !== null && last.loadKg !== null && last.loadKg > 0 && (heavier-last.loadKg)/last.loadKg <= HEURISTICS.maxRelativeIncrease)
      return {...result,loadKg:heavier,action:'increase',reason:`Serie molto più facile del previsto (${last.rir} ripetizioni in riserva invece di ${p.rir}): per le prossime serie di oggi prova ${heavier} kg. Vale solo per questa seduta; la progressione del piano resta legata alle sedute complete.`,ruleId:'next-easy-increase'};
    return {...result,action:'maintain',reason:'Serie più facile del previsto: conferma il risultato nella prossima. L’aumento stabile richiede sedute confrontabili, senza rincorrere ogni variazione.',ruleId:'next-easy-confirm'};
  }
  if (p.failureAllowedLastSet && actual.length+1 === p.sets) result.rir = 0;
  return result;
}

/** Repeated patterns suggest a review; this cannot diagnose the cause of fatigue. */
export function assessRecovery(profile: Profile, history: WorkoutHistory[], asOf: string): RecoveryAssessment {
  validateProfile(profile); const now = time(asOf);
  const eligible = history.filter(h => Number.isFinite(Date.parse(h.date)) && time(h.date) <= now && now-time(h.date) <= 28*DAY_MS && Array.isArray(h.sets) && h.sets.every(validSet));
  const latest = [...eligible].sort((a,b) => time(b.date)-time(a.date));
  const recentDate = latest[0]?.date;
  const painful = latest.filter(h => h.date === recentDate && h.sets.some(s => s.pain));
  if (painful.length) return {action:'stop',reason:'Dolore nell’ultima seduta: interrompi gli esercizi coinvolti e chiarisci il problema prima di aumentare il lavoro.',affectedExerciseIds:[...new Set(painful.map(h=>h.exerciseId))],suggestedVolumeFactor:1,automatic:false,decisions:[decision('recovery-pain','Il dolore non viene interpretato come semplice fatica.','constraint')]};
  const groups = new Map<string,WorkoutHistory[]>();
  for (const h of latest) { const key = `${h.exerciseId}|${h.equipmentKey}`; const records = groups.get(key) ?? []; if (!records.some(r=>r.id===h.id)) records.push(h); groups.set(key,records); }
  const affected: string[] = [];
  for (const logs of groups.values()) {
    const completed = logs.filter(h => h.completed && h.prescribedSets !== undefined && h.prescribedSets === working(h).length);
    const three = completed.slice(0,3);
    if (three.length === 3 && three.every(h => difficult(h)) && three.every(h=>h.prescribedSets===three[0]!.prescribedSets && h.repsMin===three[0]!.repsMin && h.repsMax===three[0]!.repsMax && working(h).every(s=>s.loadKg===working(three[0]!)[0]?.loadKg))) affected.push(three[0]!.exerciseId);
  }
  const ids = [...new Set(affected)];
  if (ids.length >= 2) return {action:'consider-deload',reason:'Difficoltà ripetuta su più esercizi: valuta una settimana con circa un terzo di serie in meno, mantenendo margine. È una proposta da confermare, non una diagnosi.',affectedExerciseIds:ids,suggestedVolumeFactor:0.67,automatic:false,decisions:[decision('multi-exercise-review','Tre sedute confrontabili difficili su almeno due esercizi: proposta di riduzione temporanea, non applicata automaticamente.')]};
  if (ids.length === 1) return {action:'review-exercise',reason:'Lo stallo riguarda un esercizio: rivedi carico, esecuzione e recupero prima di cambiare tutto il programma.',affectedExerciseIds:ids,suggestedVolumeFactor:1,automatic:false,decisions:[decision('single-exercise-review','Un andamento locale non dimostra affaticamento generale.')]};
  return {action:'continue',reason:'Non emerge una difficoltà ripetuta sufficiente a proporre uno scarico. Continua a raccogliere sedute confrontabili.',affectedExerciseIds:[],suggestedVolumeFactor:1,automatic:false,decisions:[decision('insufficient-trend','Una giornata difficile o pochi dati non bastano per concludere che serva uno scarico.')]};
}

/** optional: slot accessorio, nessun avviso se manca. fallback: senza isolamento usa un multiarticolare dello stesso muscolo. */
interface Slot { movement?: Exercise['movement']; muscle?: Muscle; optional?: boolean; fallback?: boolean; }
const slot = (movement: Exercise['movement']): Slot => ({movement});
const muscleSlot = (muscle: Muscle): Slot => ({muscle});
/** Muscolo scelto esplicitamente (priorità o sedute dedicate): se manca un isolamento, ripiega su un multiarticolare. */
const targetSlot = (muscle: Muscle): Slot => ({muscle,fallback:true});
const extra = (s: Slot): Slot => ({...s,optional:true,fallback:false});
/** key raggruppa le sedute dello stesso tipo (variazione); muscles limita le priorità alle sedute che allenano quel muscolo. */
interface SessionTemplate { key: string; name: string; focus: string; slots: Slot[]; muscles?: Muscle[]; }

const FULL_TEMPLATES: SessionTemplate[] = [
  {key:'full',name:'Full body A',focus:'Squat · spinta · tirata',slots:[slot('squat'),slot('push'),slot('pull'),slot('hinge'),slot('vertical-push'),slot('core'),muscleSlot('biceps')]},
  {key:'full',name:'Full body B',focus:'Catena posteriore · dorso · petto',slots:[slot('hinge'),slot('vertical-pull'),slot('push'),slot('squat'),muscleSlot('shoulders'),slot('core'),muscleSlot('triceps')]},
  {key:'full',name:'Full body C',focus:'Gambe · dorso · spalle',slots:[slot('squat'),slot('pull'),slot('vertical-push'),slot('hinge'),slot('push'),slot('core'),muscleSlot('calves')]},
];

/** Struttura automatica storica: invariata, così chi non modifica la settimana riceve lo stesso piano. */
function sessionTemplates(days: number): SessionTemplate[] {
  const full = FULL_TEMPLATES;
  if (days <= 3) return full.slice(0,days);
  const upper = {key:'upper',name:'Upper A',focus:'Petto · dorso · spalle',slots:[slot('push'),slot('pull'),slot('vertical-pull'),slot('vertical-push'),muscleSlot('biceps'),muscleSlot('triceps')]};
  const lower = {key:'lower',name:'Lower A',focus:'Gambe · glutei · core',slots:[slot('squat'),slot('hinge'),muscleSlot('quads'),muscleSlot('hamstrings'),muscleSlot('calves'),slot('core')]};
  const result = [upper,lower,{...upper,name:'Upper B'},{...lower,name:'Lower B'}];
  if(days===5) result.push({...full[2]!,name:'Full body · richiami'});
  if(days===6) result.push({...upper,name:'Upper C'},{...lower,name:'Lower C'});
  return result;
}

/** Sedute selezionabili. L'ordine degli slot conta: in mancanza di tempo si tolgono gli ultimi. */
const FOCUS_TEMPLATES: Record<Exclude<DayFocus,'full'>, Omit<SessionTemplate,'key'> & { muscles: Muscle[] }> = {
  upper: {name:'Upper',focus:'Petto · dorso · spalle',muscles:['chest','back','shoulders','biceps','triceps'],slots:[slot('push'),slot('pull'),slot('vertical-pull'),slot('vertical-push'),targetSlot('biceps'),targetSlot('triceps')]},
  lower: {name:'Lower',focus:'Gambe · glutei · core',muscles:['quads','hamstrings','glutes','calves','core'],slots:[slot('squat'),slot('hinge'),targetSlot('quads'),targetSlot('hamstrings'),muscleSlot('calves'),slot('core')]},
  push: {name:'Push',focus:'Petto · spalle · tricipiti',muscles:['chest','shoulders','triceps'],slots:[slot('push'),slot('vertical-push'),targetSlot('chest'),targetSlot('triceps'),targetSlot('shoulders'),extra(slot('push'))]},
  pull: {name:'Pull',focus:'Dorso · bicipiti',muscles:['back','biceps','core'],slots:[slot('vertical-pull'),slot('pull'),extra(slot('pull')),targetSlot('biceps'),extra(slot('vertical-pull')),slot('core')]},
  'chest-back': {name:'Petto e dorso',focus:'Petto · dorso',muscles:['chest','back'],slots:[slot('push'),slot('pull'),slot('vertical-pull'),extra(slot('push')),targetSlot('chest'),extra(slot('pull'))]},
  'chest-triceps': {name:'Petto e tricipiti',focus:'Petto · tricipiti',muscles:['chest','triceps'],slots:[slot('push'),extra(slot('push')),targetSlot('chest'),targetSlot('triceps'),extra(muscleSlot('chest')),extra(muscleSlot('triceps'))]},
  'back-biceps': {name:'Dorso e bicipiti',focus:'Dorso · bicipiti',muscles:['back','biceps'],slots:[slot('vertical-pull'),slot('pull'),extra(slot('pull')),targetSlot('biceps'),extra(slot('vertical-pull')),extra(muscleSlot('biceps'))]},
  'shoulders-arms': {name:'Spalle e braccia',focus:'Spalle · bicipiti · tricipiti',muscles:['shoulders','biceps','triceps'],slots:[slot('vertical-push'),targetSlot('shoulders'),targetSlot('biceps'),targetSlot('triceps'),extra(muscleSlot('shoulders')),extra(muscleSlot('biceps')),extra(muscleSlot('triceps'))]},
  'glutes-hamstrings': {name:'Glutei e femorali',focus:'Glutei · femorali · polpacci',muscles:['glutes','hamstrings','calves','core'],slots:[slot('hinge'),targetSlot('glutes'),targetSlot('hamstrings'),extra(slot('squat')),muscleSlot('calves'),slot('core')]},
};

const alternate = (n: number, a: DayFocus, b: DayFocus): DayFocus[] => Array.from({length:n},(_,i)=>i%2 ? b : a);
/** Contenuto delle sedute per ogni struttura. Con la struttura automatica descrive la proposta storica. */
export function weekFocuses(profile: Pick<Profile,'daysPerWeek'|'split'|'customDays'>): DayFocus[] {
  const n = Math.max(1, Math.min(6, Math.trunc(profile.daysPerWeek) || 1));
  const mode: SplitMode = profile.split ?? 'auto';
  if (n === 1 && mode !== 'custom') return ['full'];
  switch (mode) {
    case 'custom': {
      const automatic = weekFocuses({daysPerWeek:n});
      return automatic.map((day,i) => profile.customDays?.[i] ?? day);
    }
    case 'full-body': return Array.from({length:n},() => 'full' as const);
    case 'upper-lower': return n === 3 ? ['upper','lower','full'] : n === 5 ? ['upper','lower','upper','lower','full'] : alternate(n,'upper','lower');
    case 'push-pull-legs': return ([['upper','lower'],['push','pull','lower'],['push','pull','lower','upper'],['push','pull','lower','upper','lower'],['push','pull','lower','push','pull','lower']] as DayFocus[][])[n-2]!;
    case 'body-part': return ([['upper','lower'],['chest-back','lower','shoulders-arms'],['chest-triceps','back-biceps','lower','shoulders-arms'],['chest-triceps','back-biceps','lower','shoulders-arms','glutes-hamstrings'],['chest-triceps','back-biceps','lower','shoulders-arms','glutes-hamstrings','chest-back']] as DayFocus[][])[n-2]!;
    default: return n <= 3 ? Array.from({length:n},() => 'full' as const) : n === 5 ? ['upper','lower','upper','lower','full'] : alternate(n,'upper','lower');
  }
}

/** Sedute dello stesso tipo prendono una lettera (A, B, C…) solo se ripetute nella settimana. */
function focusTemplates(days: DayFocus[]): SessionTemplate[] {
  const seen = new Map<DayFocus,number>();
  return days.map(day => {
    const k = seen.get(day) ?? 0; seen.set(day,k+1);
    const repeated = days.filter(d => d === day).length > 1;
    const suffix = repeated ? ` ${'ABCDEF'[k]}` : '';
    if (day === 'full') { const base = FULL_TEMPLATES[k % FULL_TEMPLATES.length]!; return {...base,name:`Full body${suffix}`}; }
    const t = FOCUS_TEMPLATES[day];
    return {key:day,name:`${t.name}${suffix}`,focus:t.focus,slots:t.slots,muscles:t.muscles};
  });
}

function availableExercises(profile: Profile): Exercise[] {
  return CATALOG.filter(ex => profile.equipment.includes(ex.equipment) && !profile.excludedExerciseIds.includes(ex.id) && (profile.experience !== 'beginner' || ex.beginnerSuitable));
}

const NONE: ReadonlySet<string> = new Set();
/** I preferiti vincono quando compatibili; con la variazione attiva gli esercizi già usati in sedute dello stesso tipo scendono in classifica. */
function pickExercise(choices: Exercise[], s: Slot, used: Set<string>, profile:Profile, avoid: ReadonlySet<string> = NONE): Exercise | undefined {
  const free = choices.filter(ex => !used.has(ex.id));
  let matching = free.filter(ex => s.movement ? ex.movement === s.movement : s.muscle ? ex.primary.includes(s.muscle) && ex.isolation : false);
  if (!matching.length && s.muscle && s.fallback) {
    const leading = free.filter(ex => ex.primary[0] === s.muscle);
    matching = leading.length ? leading : free.filter(ex => ex.primary.includes(s.muscle!));
  }
  return [...matching].sort((a,b) => {
    const score = (ex:Exercise): number => exerciseScore(ex,profile) - (avoid.has(ex.id) ? 8 : 0);
    return score(b)-score(a) || CATALOG.indexOf(a)-CATALOG.indexOf(b);
  })[0];
}

/** Preferenza del coach per un esercizio, a parità di ruolo nella seduta. Usata anche per scegliere le sostituzioni. */
function exerciseScore(ex: Exercise, profile: Profile): number {
  return (profile.goal==='strength' && profile.experience!=='beginner' && ex.equipment==='barbell' ? 10 : 0) + (profile.experience==='beginner' && ex.stable ? 5 : 0) + ex.primary.filter(m=>profile.priorities.includes(m)).length*2 - (ex.loadType==='bodyweight' ? 2 : 0)
    + ((profile.preferredExerciseIds ?? []).includes(ex.id) ? 20 : 0);
}

/** Sostituzioni a catena per uno stesso esercizio (A→B, poi B→C), dalla prima all'ultima. */
function replacementChain(profile: Pick<Profile, 'replacements'>, sessionName: string, exerciseId: string): ExerciseReplacement[] {
  const chain: ExerciseReplacement[] = []; const seen = new Set([exerciseId]); let current = exerciseId;
  for (let i = 0; i < REPLACEMENTS_MAX; i++) {
    const step = profile.replacements?.find(r => r.session === sessionName && r.from === current);
    if (!step || seen.has(step.to)) break;
    chain.push(step); seen.add(step.to); current = step.to;
  }
  return chain;
}

/** Esercizi già sostituiti in quella posizione: non vanno riproposti finché ci sono altre alternative. */
function replacementPast(profile: Profile, sessionName: string, exerciseId: string): Set<string> {
  const past = new Set<string>(); let current = exerciseId;
  for (let i = 0; i < REPLACEMENTS_MAX; i++) {
    const step = profile.replacements?.find(r => r.session === sessionName && r.to === current);
    if (!step || past.has(step.from)) break;
    past.add(step.from); current = step.from;
  }
  return past;
}

const exerciseName = (id: string): string => CATALOG.find(ex => ex.id === id)?.name ?? id;

/**
 * Esercizio scelto dall'utente al posto di quello proposto dal coach. Se quello scelto non è più disponibile
 * (attrezzatura, esclusioni, già in seduta) prova i precedenti della catena; se nessuno va, lascia l'originale e lo dice.
 */
function replacementFor(profile: Profile, sessionName: string, picked: Exercise, choices: Exercise[], used: Set<string>): { exercise?: Exercise; kind?: ExerciseReplacement['kind']; warning?: string } | undefined {
  const chain = replacementChain(profile, sessionName, picked.id);
  if (!chain.length) return undefined;
  for (const step of [...chain].reverse()) {
    const candidate = choices.find(ex => ex.id === step.to);
    if (candidate && !used.has(candidate.id)) return { exercise: candidate, kind: step.kind };
  }
  return { warning: `Sostituzione non applicata in ${sessionName}: «${exerciseName(chain.at(-1)!.to)}» al posto di «${picked.name}» non è disponibile con attrezzatura, esclusioni e seduta attuali.` };
}

function replacementDecision(from: Exercise, kind: ExerciseReplacement['kind']): Decision {
  return decision('replacement',`Scelto da te al posto di «${from.name}»: ${kind === 'similar' ? 'esercizio simile, stesso movimento e stesso muscolo' : 'stesso muscolo principale con un movimento diverso'}. Il carico si calibra su questo esercizio.`,'constraint');
}

/**
 * Riduce ogni catena (A→B, poi B→C) a una sola voce (A→C): stesso risultato, meno spazio nel profilo salvato.
 * Si perde solo la memoria degli esercizi già scartati; una catena che torna all'inizio (A→B→A) sparisce.
 */
export function compactReplacements(list: readonly ExerciseReplacement[]): ExerciseReplacement[] {
  const holder = { replacements: [...list] };
  return list.flatMap(entry => {
    if (list.some(other => other !== entry && other.session === entry.session && other.to === entry.from)) return [];
    const last = replacementChain(holder, entry.session, entry.from).at(-1) ?? entry;
    return [{ session: entry.session, from: entry.from, to: last.to, kind: last.kind }];
  });
}

export interface ReplacementSuggestion { exerciseId: string; kind: ExerciseReplacement['kind']; }

/**
 * Propone un altro esercizio per una posizione del piano: prima simili (stesso movimento e stesso muscolo), poi dello
 * stesso muscolo principale. Rispetta attrezzatura, livello ed esclusioni, non ripete esercizi già nella seduta né
 * quelli indicati in `taken` (altre sostituzioni della stessa richiesta) e, se può, evita quelli già sostituiti.
 * A parità preferisce lo stesso tipo di carico (con peso o a corpo libero) e un esercizio non ancora presente altrove.
 */
export function suggestReplacement(profile: Profile, plan: TrainingPlan, sessionId: string, exerciseId: string, taken: ReadonlySet<string> = NONE): ReplacementSuggestion | null {
  validateProfile(profile);
  const session = plan.sessions.find(s => s.id === sessionId);
  const current = CATALOG.find(ex => ex.id === exerciseId);
  if (!session || !current) return null;
  const inSession = new Set(session.exercises.map(p => p.exerciseId));
  const elsewhere = new Set(plan.sessions.filter(s => s !== session).flatMap(s => s.exercises.map(p => p.exerciseId)));
  const past = replacementPast(profile, session.name, exerciseId);
  const pool = availableExercises(profile).filter(ex => ex.id !== exerciseId && !inSession.has(ex.id) && !taken.has(ex.id));
  // Con carico resta con carico: un esercizio a corpo libero non è un'alternativa equivalente a una macchina o a un bilanciere.
  const loadMismatch = (ex: Exercise) => Number((ex.loadType === 'bodyweight') !== (current.loadType === 'bodyweight'));
  const tierOf = (ex: Exercise): 0 | 1 | undefined => ex.movement === current.movement && ex.primary.some(m => current.primary.includes(m)) ? 0 : ex.primary.includes(current.primary[0]!) ? 1 : undefined;
  const ranked = (skipPast: boolean) => pool.filter(ex => !skipPast || !past.has(ex.id)).flatMap(ex => { const tier = tierOf(ex); return tier === undefined ? [] : [{ ex, tier }]; })
    .sort((a, b) => a.tier - b.tier
      || Number(a.ex.isolation !== current.isolation) - Number(b.ex.isolation !== current.isolation)
      || loadMismatch(a.ex) - loadMismatch(b.ex)
      || Number(elsewhere.has(a.ex.id)) - Number(elsewhere.has(b.ex.id))
      || exerciseScore(b.ex, profile) - exerciseScore(a.ex, profile)
      || CATALOG.indexOf(a.ex) - CATALOG.indexOf(b.ex));
  const best = ranked(true)[0] ?? ranked(false)[0];
  return best ? { exerciseId: best.ex.id, kind: best.tier === 0 ? 'similar' : 'muscle' } : null;
}

function estimateMinutes(exercises: ExercisePrescription[]): number {
  const work = exercises.reduce((total,p) => total + p.sets * (p.repsMax*HEURISTICS.secondsPerRep+15) + Math.max(0,p.sets-1)*p.restSeconds + HEURISTICS.transitionSeconds + (p.dropSet ? 60 : 0),0);
  return Math.ceil(HEURISTICS.warmupMinutes+work/60);
}

/** Beginners learn heavy lifts in the moderate range before using the lowest one. */
function repTier(ex: Exercise, profile: Profile): RepTier {
  if (ex.isolation || ex.loadType === 'bodyweight' || ex.movement === 'core') return 'isolation';
  return HEAVY_COMPOUNDS.has(ex.id) && profile.experience !== 'beginner' ? 'heavy' : 'compound';
}

function repRangeReason(tier: RepTier, profile: Profile, [min, max]: [number, number]): string {
  const range = `${min}–${max} ripetizioni`;
  const heavyForBeginner = profile.experience === 'beginner' ? ' Da principiante i multiarticolari più pesanti restano in questo range finché tecnica e carico di riferimento non sono stabili.' : '';
  if (tier === 'heavy') return profile.goal === 'strength'
    ? `Multiarticolare pesante, ${range}: per la forza massimale servono carichi alti, quindi poche ripetizioni.`
    : profile.goal === 'endurance'
      ? `Multiarticolare pesante, ${range}: range più basso degli altri esercizi per mantenere la tecnica stabile anche verso la fine della serie.`
      : `Multiarticolare pesante, ${range}: carico più alto e meno ripetizioni, così la tecnica regge. Per la massa conta soprattutto arrivare vicino al cedimento, ma su questi esercizi un range basso è più gestibile.`;
  if (tier === 'compound') return `Multiarticolare, ${range}: range intermedio tra carico e numero di ripetizioni.${heavyForBeginner}`;
  return `Isolamento o corpo libero, ${range}: carichi assoluti più bassi e più ripetizioni, più adatti a un singolo muscolo e alle articolazioni coinvolte.`;
}

/** Variante da prescrivere: quella collegata all'archivio (storico, disponibilità, scelta) oppure scelta/predefinita. */
function chosenVariant(profile: Profile, ex: Exercise): string | undefined {
  if (!VARIANTS[ex.id]) return undefined;
  return profile.loadSettings?.[ex.id]?.variantId ?? resolveVariantId(ex.id, profile.variants?.[ex.id]);
}

function variantDecisions(profile: Profile, ex: Exercise, variantId: string | undefined): Decision[] {
  const variant = findVariant(ex.id, variantId);
  if (!variant) return [];
  const mine = profile.variants?.[ex.id] === variant.id;
  return [decision('variant-choice',`Variante: ${variant.name}. ${mine ? 'Scelta da te.' : 'Proposta del coach: puoi cambiarla dalla scheda.'} I carichi si confrontano solo sulla stessa variante, quindi se la cambi il peso va ricalibrato.`,mine ? 'constraint' : 'heuristic')];
}

function basePrescription(ex: Exercise, profile:Profile, all:Exercise[]): ExercisePrescription {
  const preset = GOAL_PRESETS[profile.goal]; const experience = EXPERIENCE_PRESETS[profile.experience];
  const tier = repTier(ex, profile); const { reps: range, rest } = preset[tier];
  const setting = loadSetting(profile,ex);
  const baseSets = profile.daysPerWeek >= 5 ? Math.min(2,experience.sets) : experience.sets;
  const sets = Math.min(5, Math.max(1, baseSets + VOLUME_SET_DELTA[profile.volume ?? 'standard']));
  const restSeconds = Math.max(MIN_REST_SECONDS, rest + REST_DELTA_SECONDS[profile.rest ?? 'standard']);
  const variantId=chosenVariant(profile,ex);
  return {exerciseId:ex.id,name:findVariant(ex.id,variantId)?.name ?? ex.name,...(variantId!==undefined?{variantId}:{}),equipmentKey:setting.equipmentKey ?? ex.id,sets,repsMin:range[0],repsMax:range[1],rir:experience.rir,restSeconds,loadKg:null,loadLabel:label(ex,null),loadType:ex.loadType,calibration:ex.loadType!=='bodyweight',confidence:'initial',progression:'calibrate',alternatives:all.filter(other=>other.id!==ex.id && other.movement===ex.movement && other.primary.some(m=>ex.primary.includes(m))).slice(0,3).map(other=>other.id),failureAllowedLastSet:false,decisions:[...variantDecisions(profile,ex,variantId),decision(`rep-range-${tier}`,repRangeReason(tier,profile,range),'evidence-informed',['repetition-continuum-2021','acsm-2026']),decision('goal-preset','Range, recupero e margine sono un punto di partenza configurabile, non l’unica prescrizione efficace.','heuristic',['acsm-2026','prescription-2023','rest-2024']),...dosePreferences(baseSets,sets,rest,restSeconds)]};
}

/** Volume e recuperi scelti dall'utente restano visibili nella motivazione dell'esercizio. */
function dosePreferences(baseSets: number, sets: number, baseRest: number, rest: number): Decision[] {
  const result: Decision[] = [];
  if (sets !== baseSets) result.push(decision('volume-preference',`Volume ${sets > baseSets ? 'più alto' : 'ridotto'} scelto da te: ${sets} serie invece di ${baseSets}. Il tempo disponibile può ridurle ancora.`,'constraint',['volume-frequency-2026']));
  if (rest !== baseRest) result.push(decision('rest-preference',rest > baseRest
    ? `Recupero più lungo scelto da te: ${rest} secondi invece di ${baseRest}. Aiuta a mantenere le ripetizioni tra le serie, ma allunga la seduta.`
    : `Recupero più breve scelto da te: ${rest} secondi invece di ${baseRest}. La seduta dura meno; se le ripetizioni calano molto tra le serie, allunga la pausa.`,'constraint',['rest-2024']));
  return result;
}

/** Cold start works with zero history. No biological profile or photo infers a load. */
export function generatePlan(profile:Profile,history:WorkoutHistory[]=[],asOf:string):TrainingPlan {
  validateProfile(profile); time(asOf);
  const choices=availableExercises(profile); const warnings:string[]=[];
  if(!choices.length) throw new RangeError('Nessun esercizio compatibile: rivedi attrezzatura o esclusioni.');
  if(profile.daysPerWeek===1) warnings.push('Una sola seduta può essere utile, ma limita frequenza e distribuzione del lavoro: valuta due giorni se sostenibili.');
  if(profile.experience==='beginner' && profile.equipment.every(e=>e==='barbell')) warnings.push('Il catalogo iniziale esclude i principali esercizi con bilanciere senza esperienza: aggiungi attrezzatura o verifica la tecnica con un professionista.');
  if(profile.equipment.every(e=>e==='bodyweight')) warnings.push('Con il solo corpo libero e senza un punto di tirata il catalogo non copre adeguatamente il dorso. Aggiungi attrezzatura di tirata prima di considerare la scheda completa.');
  if((profile.allowDropSets||profile.allowFailure) && profile.experience==='beginner') warnings.push('Cedimento e dropset restano disabilitati nella fase iniziale, anche se selezionati.');
  const split:SplitMode=profile.split ?? 'auto';
  const templates=split==='auto' ? sessionTemplates(profile.daysPerWeek) : focusTemplates(weekFocuses(profile));
  const maxExercises=profile.maxExercises ?? MAX_EXERCISES_RANGE.default;
  const usedByType=new Map<string,Set<string>>();
  const sessions:PlanSession[]=templates.map((template,index)=>{
    const used=new Set<string>(); const sessionWarnings:string[]=[];
    const selected:ExercisePrescription[]=[];
    const budget=profile.sessionMinutes?.[index] ?? profile.minutesPerSession;
    const avoid=profile.varyRepeatedDays ? usedByType.get(template.key) ?? NONE : NONE;
    // Le priorità entrano solo nelle sedute che allenano quel muscolo; la struttura automatica le aggiunge ovunque come prima.
    const prioritySlots=profile.priorities.filter(m=>!template.muscles || template.muscles.includes(m)).map(targetSlot);
    for(const s of [...template.slots.slice(0,4),...prioritySlots,...template.slots.slice(4)]) {
      const picked=pickExercise(choices,s,used,profile,avoid);
      if(!picked) { if(!s.optional && s.movement && ['squat','hinge','push','pull','vertical-pull'].includes(s.movement)) sessionWarnings.push(`Movimento ${s.movement} non coperto con le impostazioni attuali.`); continue; }
      // Una sostituzione chiesta dall'utente prende il posto dell'esercizio scelto; quello originale non rientra in un altro slot.
      const swap=replacementFor(profile,template.name,picked,choices,used);
      const ex=swap?.exercise ?? picked;
      if(swap?.warning) sessionWarnings.push(swap.warning);
      used.add(picked.id); used.add(ex.id);
      const prescription=basePrescription(ex,profile,choices);
      if(swap?.exercise && swap.kind) prescription.decisions.unshift(replacementDecision(picked,swap.kind));
      selected.push(prescription);
      if(selected.length>=maxExercises) break;
    }
    while(selected.length>3 && estimateMinutes(selected)>budget) selected.pop();
    if(estimateMinutes(selected)>budget) {
      for(let i=selected.length-1;i>=0 && estimateMinutes(selected)>budget;i--) selected[i]!.sets=Math.max(1,selected[i]!.sets-1);
    }
    if(estimateMinutes(selected)>budget) sessionWarnings.push('Il tempo richiesto supera il budget anche dopo la riduzione del lavoro: aumenta il tempo o rivedi la frequenza.');
    const typeUsed=usedByType.get(template.key) ?? new Set<string>();
    for(const p of selected) typeUsed.add(p.exerciseId);
    usedByType.set(template.key,typeUsed);
    if(selected.length<3) sessionWarnings.push('Pochi esercizi compatibili: la copertura del programma è incompleta.');
    const prescriptions=selected.map(p=>recommendExercise({profile,prescription:p,history,asOf}));
    if(profile.allowSupersets && profile.goal!=='strength' && profile.experience!=='beginner') {
      const eligible=prescriptions.filter(p=>getExercise(p.exerciseId).isolation && p.progression!=='review');
      const pair=eligible.find(a=>eligible.some(b=>a!==b && !getExercise(a.exerciseId).primary.some(m=>getExercise(b.exerciseId).primary.includes(m))));
      const other=pair ? eligible.find(b=>b!==pair && !getExercise(pair.exerciseId).primary.some(m=>getExercise(b.exerciseId).primary.includes(m))) : undefined;
      if(pair&&other) for(const p of [pair,other]) {p.supersetGroup=`session-${index+1}-A`;p.decisions.push(decision('superset-opt-in','Superset opzionale con muscoli diversi: passa al secondo esercizio, poi rispetta il recupero. Mantieni il margine; separa le serie se la prestazione cala.','heuristic',['supersets-2025']));}
    }
    const advanced=profile.experience==='advanced' && profile.goal==='hypertrophy';
    const finisher=[...prescriptions].reverse().find(p=>{const ex=getExercise(p.exerciseId);return ex.isolation&&ex.stable&&ex.loadType!=='bodyweight'&&!p.calibration&&p.progression!=='review'&&p.progression!=='reduce'&&!p.supersetGroup;});
    if(finisher&&advanced&&profile.allowDropSets && index===0 && budget-estimateMinutes(prescriptions)>=1) {
      finisher.dropSet={afterSet:finisher.sets,reductionPercent:HEURISTICS.dropReductionPercent,targetRir:1,maxDrops:1,countsAsAdditionalWork:true,instruction:'Dopo l’ultima serie, riduci circa il 20% usando un carico realmente disponibile e fai un solo segmento aggiuntivo, fermandoti con circa 1 ripetizione di margine. Se il carico non è disponibile, salta la dropset.'};
      finisher.decisions.push(decision('dropset-opt-in','Un solo segmento aggiuntivo nella prima seduta: lavoro supplementare registrato separatamente, non equivalente a un numero fisso di serie.','heuristic',['dropsets-2026']));
    } else if(finisher&&advanced&&profile.allowFailure) {
      finisher.failureAllowedLastSet=true;
      finisher.decisions.push(decision('failure-opt-in','Solo l’ultima serie può arrivare a RIR 0 mantenendo tecnica corretta. Non tentare ripetizioni fallite; l’opzione non è necessaria per progredire.','heuristic',['acsm-2026','rir-2024']));
    }
    return {id:`session-${index+1}`,name:template.name,focus:template.focus,exercises:prescriptions,estimatedMinutes:estimateMinutes(prescriptions),warnings:[...new Set(sessionWarnings)]};
  });
  const weeklyVolume=Object.fromEntries(MUSCLES.map(m=>[m,0])) as Record<Muscle,number>;
  const secondaryExposure={...weeklyVolume}; let supplementalDropSets=0;
  for(const s of sessions) for(const p of s.exercises) {const ex=getExercise(p.exerciseId);for(const m of ex.primary) weeklyVolume[m]+=p.sets;for(const m of ex.secondary) secondaryExposure[m]+=p.sets;if(p.dropSet)supplementalDropSets++;}
  const untrained=MUSCLES.filter(m=>weeklyVolume[m]===0&&secondaryExposure[m]===0);
  if(untrained.length) warnings.push(`Nessun lavoro diretto o indiretto previsto per: ${untrained.map(m=>MUSCLE_LABELS[m]).join(', ')}. Valuta tempo, attrezzatura e priorità.`);
  if(profile.priorities.some(m=>weeklyVolume[m]===0)) warnings.push('Alcune priorità non sono coperte nel tempo e con l’attrezzatura scelti. Non aggiungere volume automaticamente: rivedi i vincoli.');
  const planned=new Set(sessions.flatMap(s=>s.exercises.map(p=>p.exerciseId)));
  const missingPreferred=[...new Set(profile.preferredExerciseIds ?? [])].filter(id=>!planned.has(id));
  if(missingPreferred.length) warnings.push(`Esercizi preferiti non inseriti: ${missingPreferred.map(id=>CATALOG.find(ex=>ex.id===id)?.name ?? id).join(', ')}. Possibili cause: attrezzatura, livello o esclusioni, nessuna seduta che preveda quel movimento, oppure tempo insufficiente.`);
  const blockWeeks=profile.blockWeeks ?? BLOCK_WEEKS_RANGE.default;
  const decisions=[decision('program-template',`Struttura stabile per un blocco ${profile.blockWeeks === undefined ? 'iniziale di quattro settimane' : `di ${blockWeeks} settimane scelto da te`}; giorni, selezione e dosi sono euristiche verificabili e modificabili.`,'heuristic',['acsm-2026','prescription-2023']),...structureDecisions(profile,split,sessions)];
  const serialized=JSON.stringify({profile,asOf,sessions:sessions.map(s=>s.exercises.map(p=>[p.exerciseId,p.sets,p.loadKg]))});let hash=2166136261;for(let i=0;i<serialized.length;i++){hash^=serialized.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return {id:`coach-${(hash>>>0).toString(16)}`,version:ENGINE_VERSION,createdAt:asOf,profile:JSON.parse(JSON.stringify(profile)) as Profile,sessions,weeklyVolume,secondaryExposure,supplementalDropSets,warnings:[...new Set(warnings)],blockWeeks,decisions:[...decisions,decision('volume-accounting','Volume mostrato come serie dirette; esposizioni secondarie e dropset restano separate. Il conteggio non misura la risposta biologica individuale.','evidence-informed',['volume-frequency-2026']),decision('no-photo-load','Nessun carico è ricavato da foto, peso corporeo o aspetto fisico.','constraint')]};
}

/** Spiega la struttura settimanale e le scelte di composizione, distinguendo la proposta automatica dalle scelte dell'utente. */
function structureDecisions(profile: Profile, split: SplitMode, sessions: PlanSession[]): Decision[] {
  const names = sessions.map(s => s.name).join(', ');
  const result: Decision[] = split === 'auto'
    ? [decision('week-structure',`Struttura automatica (${names}): full body fino a 3 sedute, upper/lower da 4 in su. Dal profilo puoi scegliere un'altra struttura o decidere il contenuto di ogni seduta.`,'heuristic',['volume-frequency-2026'])]
    : [decision('week-structure',`Struttura scelta da te: ${SPLIT_LABELS[split]} (${names}).`,'constraint')];
  if (split === 'push-pull-legs' && profile.daysPerWeek < 3) result.push(decision('split-fallback','Push / Pull / Legs richiede almeno 3 sedute: con meno sedute il coach usa full body o upper/lower per allenare tutti i gruppi.','heuristic'));
  if (split !== 'auto' && split !== 'full-body') result.push(decision('split-frequency','Con sedute dedicate a pochi muscoli ogni gruppo viene allenato meno volte a settimana. Per la crescita muscolare pesa soprattutto il volume settimanale; per la forza ripetere più spesso i movimenti principali può aiutare. Controlla negli avvisi i gruppi rimasti scoperti.','evidence-informed',['volume-frequency-2026']));
  if (profile.sessionMinutes?.some((m, i) => m !== null && i < sessions.length)) result.push(decision('session-minutes','Alcune sedute hanno una durata diversa scelta da te: esercizi e serie si adattano al tempo di ciascuna.','constraint'));
  if (profile.maxExercises !== undefined) result.push(decision('max-exercises',`Al massimo ${profile.maxExercises} esercizi per seduta, come da tua scelta.`,'constraint'));
  if (profile.varyRepeatedDays) result.push(decision('vary-repeated-days','Le sedute dello stesso tipo usano esercizi diversi quando l’attrezzatura offre alternative; i movimenti principali restano gli stessi.','heuristic'));
  if (profile.preferredExerciseIds?.length) result.push(decision('preferred-exercises','Gli esercizi preferiti vengono scelti per primi quando la seduta prevede il loro movimento o muscolo.','constraint'));
  return result;
}
