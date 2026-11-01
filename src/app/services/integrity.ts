import {validThemeConfig} from "./theme-palettes";
import {validateCalendarEvent} from './calendar-event-data';
import {validWorkoutUi} from "./workout-resume";
import { sumIngredients } from './nutrition';
import { DataSet, TABLES } from "../models/domain";
import {validatePrescriptionDetails} from './plan-program';
export function validateIntegrity(d: DataSet) {
  const fail = (m: string): never => {
    throw Error("Backup non valido: " + m);
  };
  for (const name of TABLES) {
    if (new Set(d[name].map((e) => e.id)).size !== d[name].length)
      fail("ID duplicati in " + name);
  }
  if (d.profiles[0].id !== "local" || d.settings[0].id !== "local")
    fail("profilo locale non valido");
  if (
    new Set(d.roles.map((r) => r.name)).size !== 3 ||
    !d.roles.some((r) => r.name === d.profiles[0].role)
  )
    fail("ruoli non validi");
  if (
    d.plans.filter((p) => p.active).length > 1 ||
    d.plans.some((p) => p.active && p.archived)
  )
    fail("piani attivi incoerenti");
  const exists = (t: keyof DataSet, id: string) =>
    d[t].some((e) => e.id === id);
  const validDate=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  for (const p of d.plans){
    if (!exists("profiles", p.userId)) fail("utente del piano mancante");
    if(p.completedAt&&(typeof p.completedAt!=='string'||!Number.isFinite(Date.parse(p.completedAt))||p.active||!['automatic','manual'].includes(p.completionReason||''))||p.completionReason&&!p.completedAt)fail('conclusione del piano non valida');
    if(p.program){const v=p.program;if(typeof v.importId!=='string'||!v.importId||v.importId.length>150||typeof v.sourceName!=='string'||!v.sourceName||v.sourceName.length>255||!['original','GT-1'].includes(v.sourceKind)||!validDate(v.startDate)||!validDate(v.endDate)||v.endDate<v.startDate||!Number.isInteger(v.weeks)||v.weeks<1||v.weeks>10000||!/^[a-f0-9]{64}$/.test(v.fileHash)||!Number.isFinite(Date.parse(v.importedAt))||!Number.isInteger(v.sessionCount)||v.sessionCount<1||v.sessionCount>10000)fail('metadati del programma Excel non validi');for(const key of ['createdExerciseIds','createdGroupIds'] as const){const ids=v[key];if(ids!==undefined&&(!Array.isArray(ids)||ids.length>(key==='createdExerciseIds'?10000:1000)||ids.some(id=>typeof id!=='string'||!id||id.length>150)))fail('riferimenti importazione non validi');}}
  }
  for (const e of d.exercises)
    if (
      !exists("muscleGroups", e.muscleGroupId) ||
      e.secondaryMuscleIds.some((g) => !exists("muscleGroups", g))
    )
      fail("gruppo muscolare mancante");
  for (const day of d.days){
    if (!exists("plans", day.planId)) fail("piano del giorno mancante");
    const plan=d.plans.find(plan=>plan.id===day.planId);
    if(day.week!==undefined&&(!Number.isInteger(day.week)||day.week<1||day.week>10000||!!plan?.program&&day.week>plan.program.weeks)||day.sessionDate!==undefined&&!validDate(day.sessionDate)||day.phase!==undefined&&(typeof day.phase!=='string'||day.phase.length>200)||day.notes!==undefined&&(typeof day.notes!=='string'||day.notes.length>10000))fail('prescrizione settimanale non valida');
  }
  for (const e of d.planExercises)
    if (!exists("days", e.dayId) || !exists("exercises", e.exerciseId))
      fail("riferimento esercizio del piano mancante");
  // Historical plan/day/catalog references may be absent: workout snapshots are authoritative.
  for (const w of d.workouts){
    if (!exists("profiles", w.userId)) fail("utente dell’allenamento mancante");
    if(w.programWeek!==undefined&&(!Number.isInteger(w.programWeek)||w.programWeek<1||w.programWeek>10000)||w.programPhase!==undefined&&(typeof w.programPhase!=='string'||w.programPhase.length>200))fail('settimana registrata non valida');
  }
  if (d.workouts.filter((w) => w.status === "draft").length > 1)
    fail("più sessioni in corso");
  for (const e of d.workoutExercises)
    if (!exists("workouts", e.workoutId))
      fail("allenamento dell’esercizio mancante");
  for(const item of d.workoutExercises){if(item.repsMin!==undefined&&(!Number.isInteger(item.repsMin)||item.repsMin<1||item.repsMin>999)||item.repsMax!==undefined&&(!Number.isInteger(item.repsMax)||item.repsMax<1||item.repsMax>999)||item.repsMin!==undefined&&item.repsMax!==undefined&&item.repsMin>item.repsMax)fail('ripetizioni target registrate non valide');}
  for (const s of d.sets)
    if (!exists("workoutExercises", s.workoutExerciseId))
      fail("esercizio della serie mancante");
  for(const m of d.meals) {
    if(m.ingredients){const totals=sumIngredients(m.ingredients);for(const key of ['grams','calories','protein','carbs','fat'] as const)if(Math.abs(totals[key]-m[key])>.11)fail("totali del pasto diversi dagli alimenti");}
    if(!m.name.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(m.grams)||m.grams<=0||m.grams>10000||[m.calories,m.protein,m.carbs,m.fat].some((v,i)=>!Number.isFinite(v)||v<0||v>[20000,2000,3000,2000][i])||m.photo && (m.photo.size>500*1024||!["image/jpeg","image/png","image/webp"].includes(m.photo.type))) fail("pasto non valido");
  }
  for(const e of d.scheduledWorkouts){try{validateCalendarEvent(e);}catch{fail('evento calendario non valido');}}
  if(new Set(d.measurements.map(m=>m.date)).size!==d.measurements.length)fail("misurazioni duplicate nella stessa data");
  for(const m of d.measurements)if(!Number.isFinite(m.weight)||m.weight<=0||m.weight>700||(m.waist!==undefined&&(!Number.isFinite(m.waist)||m.waist<=0||m.waist>300))||(m.bodyFat!==undefined&&(!Number.isFinite(m.bodyFat)||m.bodyFat<1||m.bodyFat>80))||!/^\d{4}-\d{2}-\d{2}$/.test(m.date))fail("misurazione non valida");
  if(d.settings[0].themeConfig!==undefined&&!validThemeConfig(d.settings[0].themeConfig))fail('tema non valido');
  if(d.settings[0].allowCompletedWorkoutDeletion!==undefined&&typeof d.settings[0].allowCompletedWorkoutDeletion!=='boolean')fail('preferenza eliminazione allenamenti non valida');
  if(d.settings[0].gymMode!==undefined&&typeof d.settings[0].gymMode!=='boolean')fail('modalità palestra non valida');
  for(const row of d.workoutExercises)if(row.substitutedFrom&&(typeof row.substitutedFrom.exerciseId!=='string'||!row.substitutedFrom.exerciseId||typeof row.substitutedFrom.name!=='string'||!row.substitutedFrom.name.trim()))fail('origine sostituzione non valida');
  for(const p of d.exercisePreferences){if(p.weightStep!==undefined&&(!Number.isFinite(p.weightStep)||p.weightStep<=0||p.weightStep>50))fail('incremento peso non valido');if(typeof p.favorite!=='boolean')fail('preferenza non valida');if(p.machineSetup){for(const [key,value] of Object.entries(p.machineSetup))if(!['machine','seat','backrest','grip','notes'].includes(key)||(value!==undefined&&(typeof value!=='string'||value.length>(key==='notes'?500:['seat','backrest'].includes(key)?80:120))))fail('configurazione macchina non valida');}}
  if(d.workoutUi.length>1)fail('più punti di ripresa');
  for(const state of d.workoutUi)if(!validWorkoutUi(state)||!d.workouts.some(w=>w.id===state.id&&w.status==='draft'))fail('punto di ripresa non valido');
  for(const pe of d.planExercises){if(pe.superset&&!['A','B','C','D'].includes(pe.superset)||pe.warmupSets!==undefined&&(!Number.isInteger(pe.warmupSets)||pe.warmupSets<0||pe.warmupSets>5))fail('superset o riscaldamento non valido');if(pe.superset&&d.planExercises.filter(e=>e.dayId===pe.dayId&&e.superset===pe.superset).length>2)fail('superset con più di due esercizi');}
  for(const set of d.sets)if(set.kind!==undefined&&!['work','warmup'].includes(set.kind))fail('tipo serie non valido');
  for(const item of [...d.planExercises,...d.workoutExercises]){try{validatePrescriptionDetails(item);}catch{fail('RIR o istruzioni dell’esercizio non validi');}}
  const settings=d.settings[0];if(settings.archiveResetId!==undefined&&(typeof settings.archiveResetId!=='string'||!settings.archiveResetId||settings.archiveResetId.length>150))fail('identificativo ripristino non valido');if(settings.catalogBaseline){const baseline=settings.catalogBaseline;if(!baseline.exercises||!baseline.groups||Object.entries(baseline.exercises).some(([id,hash])=>!id||id.length>150||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))||Object.entries(baseline.groups).some(([id,name])=>!id||id.length>150||typeof name!=='string'||name.length>10000))fail('riferimento catalogo non valido');}if(settings.externalTimerEnabled!==undefined&&typeof settings.externalTimerEnabled!=='boolean')fail('preferenza timer non valida');if(settings.backupReminderDays!==undefined&&![0,7,14,30].includes(settings.backupReminderDays))fail('promemoria backup non valido');
  const photo=d.profiles[0].photo;
  if(photo && (photo.size>500*1024||!["image/jpeg","image/png","image/webp"].includes(photo.type))) fail("foto profilo non valida");
  const setKeys = d.sets.map((s) => s.workoutExerciseId + ":" + s.number);
  if (new Set(setKeys).size !== setKeys.length) fail("numeri serie duplicati");
}
