import { CATALOG, getExercise } from './catalog.js';
import { ENGINE_VERSION, EXPERIENCE_PRESETS, GOAL_PRESETS, HEURISTICS, MUSCLE_LABELS } from './config.js';
import type { ActualSet, Decision, Exercise, ExercisePrescription, ExerciseRecommendationInput, LoadSetting, Muscle, NextSetInput, PlanSession, Profile, RecoveryAssessment, SetRecommendation, TrainingPlan, WorkoutHistory } from './models.js';

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
  for (const [id, setting] of Object.entries(p.loadSettings ?? {})) {
    const isBodyweight = CATALOG.find(ex => ex.id === id)?.loadType === 'bodyweight';
    if (!valid(setting.minKg) || setting.minKg < 0 || !valid(setting.incrementKg) || (isBodyweight ? setting.incrementKg < 0 : setting.incrementKg <= 0)) throw new RangeError('Incremento e minimo di carico devono essere numeri validi (incremento > 0, oppure 0 a corpo libero).');
    if (setting.availableLoadsKg && (!setting.availableLoadsKg.length || setting.availableLoadsKg.some(x => !valid(x) || x < setting.minKg))) throw new RangeError('Carichi disponibili non validi.');
  }
}

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
    } else if (recentCompleteLogs.length >= HEURISTICS.comparableSuccessesForIncrease && recentCompleteLogs.slice(0,2).every(h => successful(h,p)) && working(recentCompleteLogs[1]!)[0]?.loadKg === firstLoad && firstLoad !== null && ex.loadType !== 'bodyweight') {
      const next = nextLoad(firstLoad,settings,1);
      if (next !== null && (firstLoad === 0 || (next-firstLoad)/firstLoad <= HEURISTICS.maxRelativeIncrease)) {
        p.loadKg = next; p.progression = 'increase'; p.calibration = false;
        p.decisions.push(decision('double-progression','Due sedute complete al limite superiore con tecnica e margine richiesti: prova il minimo incremento disponibile, ripartendo dalla parte bassa del range.','heuristic',['acsm-2026']));
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
  if (last.reps >= p.repsMax && last.rir >= p.rir+2) return {...result,action:'maintain',reason:'Serie più facile del previsto: conferma il risultato nella prossima. L’aumento stabile richiede sedute confrontabili, senza rincorrere ogni variazione.',ruleId:'next-easy-confirm'};
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

interface Slot { movement?: Exercise['movement']; muscle?: Muscle; }
const slot = (movement: Exercise['movement']): Slot => ({movement});
const muscleSlot = (muscle: Muscle): Slot => ({muscle});

function sessionTemplates(days: number): Array<{name:string;focus:string;slots:Slot[]}> {
  const full = [
    {name:'Full body A',focus:'Squat · spinta · tirata',slots:[slot('squat'),slot('push'),slot('pull'),slot('hinge'),slot('vertical-push'),slot('core'),muscleSlot('biceps')]},
    {name:'Full body B',focus:'Catena posteriore · dorso · petto',slots:[slot('hinge'),slot('vertical-pull'),slot('push'),slot('squat'),muscleSlot('shoulders'),slot('core'),muscleSlot('triceps')]},
    {name:'Full body C',focus:'Gambe · dorso · spalle',slots:[slot('squat'),slot('pull'),slot('vertical-push'),slot('hinge'),slot('push'),slot('core'),muscleSlot('calves')]},
  ];
  if (days <= 3) return full.slice(0,days);
  const upper = {name:'Upper A',focus:'Petto · dorso · spalle',slots:[slot('push'),slot('pull'),slot('vertical-pull'),slot('vertical-push'),muscleSlot('biceps'),muscleSlot('triceps')]};
  const lower = {name:'Lower A',focus:'Gambe · glutei · core',slots:[slot('squat'),slot('hinge'),muscleSlot('quads'),muscleSlot('hamstrings'),muscleSlot('calves'),slot('core')]};
  const result = [upper,lower,{...upper,name:'Upper B'},{...lower,name:'Lower B'}];
  if(days===5) result.push({...full[2]!,name:'Full body · richiami'});
  if(days===6) result.push({...upper,name:'Upper C'},{...lower,name:'Lower C'});
  return result;
}

function availableExercises(profile: Profile): Exercise[] {
  return CATALOG.filter(ex => profile.equipment.includes(ex.equipment) && !profile.excludedExerciseIds.includes(ex.id) && (profile.experience !== 'beginner' || ex.beginnerSuitable));
}

function pickExercise(choices: Exercise[], s: Slot, used: Set<string>, profile:Profile): Exercise | undefined {
  const matching = choices.filter(ex => !used.has(ex.id) && (s.movement ? ex.movement === s.movement : s.muscle ? ex.primary.includes(s.muscle) && ex.isolation : false));
  return [...matching].sort((a,b) => {
    const score = (ex:Exercise): number => (profile.goal==='strength' && profile.experience!=='beginner' && ex.equipment==='barbell' ? 10 : 0) + (profile.experience==='beginner' && ex.stable ? 5 : 0) + ex.primary.filter(m=>profile.priorities.includes(m)).length*2 - (ex.loadType==='bodyweight' ? 2 : 0);
    return score(b)-score(a) || CATALOG.indexOf(a)-CATALOG.indexOf(b);
  })[0];
}

function estimateMinutes(exercises: ExercisePrescription[]): number {
  const work = exercises.reduce((total,p) => total + p.sets * (p.repsMax*HEURISTICS.secondsPerRep+15) + Math.max(0,p.sets-1)*p.restSeconds + HEURISTICS.transitionSeconds + (p.dropSet ? 60 : 0),0);
  return Math.ceil(HEURISTICS.warmupMinutes+work/60);
}

function basePrescription(ex: Exercise, profile:Profile, all:Exercise[]): ExercisePrescription {
  const preset = GOAL_PRESETS[profile.goal]; const experience = EXPERIENCE_PRESETS[profile.experience];
  const range = ex.isolation || ex.loadType==='bodyweight' || ex.movement==='core' ? preset.isolation : preset.compound;
  const setting = loadSetting(profile,ex);
  const sets = profile.daysPerWeek >= 5 ? Math.min(2,experience.sets) : experience.sets;
  return {exerciseId:ex.id,name:ex.name,equipmentKey:setting.equipmentKey ?? ex.id,sets,repsMin:range[0],repsMax:range[1],rir:experience.rir,restSeconds:ex.isolation ? preset.restIsolation : preset.restCompound,loadKg:null,loadLabel:label(ex,null),loadType:ex.loadType,calibration:ex.loadType!=='bodyweight',confidence:'initial',progression:'calibrate',alternatives:all.filter(other=>other.id!==ex.id && other.movement===ex.movement && other.primary.some(m=>ex.primary.includes(m))).slice(0,3).map(other=>other.id),failureAllowedLastSet:false,decisions:[decision('goal-preset','Range, recupero e margine sono un punto di partenza configurabile, non l’unica prescrizione efficace.','heuristic',['acsm-2026','prescription-2023','rest-2024'])]};
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
  const sessions:PlanSession[]=sessionTemplates(profile.daysPerWeek).map((template,index)=>{
    const used=new Set<string>(); const sessionWarnings:string[]=[];
    const selected:ExercisePrescription[]=[];
    const prioritySlots=profile.priorities.map(muscleSlot);
    for(const s of [...template.slots.slice(0,4),...prioritySlots,...template.slots.slice(4)]) {
      const ex=pickExercise(choices,s,used,profile);
      if(!ex) { if(s.movement && ['squat','hinge','push','pull','vertical-pull'].includes(s.movement)) sessionWarnings.push(`Movimento ${s.movement} non coperto con le impostazioni attuali.`); continue; }
      used.add(ex.id); selected.push(basePrescription(ex,profile,choices));
      if(selected.length>=8) break;
    }
    while(selected.length>3 && estimateMinutes(selected)>profile.minutesPerSession) selected.pop();
    if(estimateMinutes(selected)>profile.minutesPerSession) {
      for(let i=selected.length-1;i>=0 && estimateMinutes(selected)>profile.minutesPerSession;i--) selected[i]!.sets=Math.max(1,selected[i]!.sets-1);
    }
    if(estimateMinutes(selected)>profile.minutesPerSession) sessionWarnings.push('Il tempo richiesto supera il budget anche dopo la riduzione del lavoro: aumenta il tempo o rivedi la frequenza.');
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
    if(finisher&&advanced&&profile.allowDropSets && index===0 && profile.minutesPerSession-estimateMinutes(prescriptions)>=1) {
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
  const serialized=JSON.stringify({profile,asOf,sessions:sessions.map(s=>s.exercises.map(p=>[p.exerciseId,p.sets,p.loadKg]))});let hash=2166136261;for(let i=0;i<serialized.length;i++){hash^=serialized.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return {id:`coach-${(hash>>>0).toString(16)}`,version:ENGINE_VERSION,createdAt:asOf,profile:JSON.parse(JSON.stringify(profile)) as Profile,sessions,weeklyVolume,secondaryExposure,supplementalDropSets,warnings:[...new Set(warnings)],blockWeeks:4,decisions:[decision('program-template','Struttura stabile per un blocco iniziale di quattro settimane; giorni, selezione e dosi sono euristiche verificabili e modificabili.','heuristic',['acsm-2026','prescription-2023']),decision('volume-accounting','Volume mostrato come serie dirette; esposizioni secondarie e dropset restano separate. Il conteggio non misura la risposta biologica individuale.','evidence-informed',['volume-frequency-2026']),decision('no-photo-load','Nessun carico è ricavato da foto, peso corporeo o aspetto fisico.','constraint')]};
}
