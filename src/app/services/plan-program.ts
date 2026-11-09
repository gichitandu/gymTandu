import {DataSet,ExercisePrescriptionDetails,TrainingPlan} from '../models/domain';
import {ExcelProgramDraft} from '../models/excel-import';
import {parseLocalDate} from './calendar';

export const normalizedExerciseName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function prescriptionDetails(value:ExercisePrescriptionDetails):ExercisePrescriptionDetails{
 return {rirMin:value.rirMin,rirMax:value.rirMax,warmupNotes:value.warmupNotes,reference:value.reference,loadUnit:value.loadUnit};
}
export function validatePrescriptionDetails(value:ExercisePrescriptionDetails){
 for(const key of ['rirMin','rirMax'] as const)if(value[key]!==undefined&&(!Number.isFinite(value[key])||value[key]!<0||value[key]!>10))throw Error('RIR non valido: usa un valore da 0 a 10.');
 if(value.rirMin!==undefined&&value.rirMax!==undefined&&value.rirMin>value.rirMax)throw Error('Intervallo RIR non valido.');
 for(const key of ['warmupNotes','reference','loadUnit'] as const)if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key]!.length>(key==='loadUnit'?120:10000)))throw Error('Dettaglio della prescrizione non valido.');
}
const dayNumber=(value:string)=>{parseLocalDate(value);return Date.parse(value+'T12:00:00Z')/86400000;};
export function validateExcelProgram(draft:ExcelProgramDraft){
 const text=(value:unknown,max:number,required=false)=>typeof value==='string'&&value.length<=max&&(!required||!!value.trim());
 if(!draft||!text(draft.name,200,true)||!text(draft.description,10000)||!text(draft.sourceName,255,true)||!['original','GT-1'].includes(draft.sourceKind)||!/^[a-f0-9]{64}$/.test(draft.fileHash))throw Error('Dati del file Excel non validi.');
 const start=dayNumber(draft.startDate),end=dayNumber(draft.endDate);
 if(parseLocalDate(draft.startDate).getDay()!==1)throw Error('Scegli un lunedì come inizio del programma.');
 if(!Number.isInteger(draft.weeks)||draft.weeks<1||draft.weeks>10000||end<start||!Array.isArray(draft.sessions)||!draft.sessions.length||draft.sessions.length>10000)throw Error('Durata o sedute del programma non valide.');
 const dates=new Set<string>(),weeks=new Set<number>();
 for(const session of draft.sessions){
  const day=dayNumber(session.date),week=Math.floor((day-start)/7)+1;
  if(day<start||day>end||session.week!==week||week>draft.weeks||session.weekday!==parseLocalDate(session.date).getDay()||!text(session.title,200,true)||!text(session.phase,200)||!text(session.notes,10000)||dates.has(session.date))throw Error('Data, settimana o seduta duplicata nel programma.');
  dates.add(session.date);
  weeks.add(session.week);
  if(!session.exercises.length||session.exercises.length>200)throw Error('Numero di esercizi della seduta non valido.');
  const ids=new Set<string>();
  for(const item of session.exercises){
   if(!text(item.sourceId,150,true)||ids.has(item.sourceId)||!text(item.name,200,true)||!text(item.notes,10000)||!Number.isInteger(item.order)||item.order<0||!Number.isInteger(item.sets)||item.sets<1||item.sets>30||!Number.isInteger(item.repsMin)||item.repsMin<1||!Number.isInteger(item.repsMax)||item.repsMax<item.repsMin||item.repsMax>999||!Number.isFinite(item.rest)||item.rest<0||item.rest>7200)throw Error('Prescrizione di un esercizio non valida.');
   ids.add(item.sourceId);validatePrescriptionDetails(item);
  }
 }
 if(weeks.size!==draft.weeks||Math.max(...[...dates].map(dayNumber))!==end)throw Error('Nel file mancano settimane o la data finale non corrisponde alle sedute.');
}
const dateLabel=(value:string)=>parseLocalDate(value).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});
export function effectiveProgramRange(data:DataSet,plan:TrainingPlan){
 const dates=[...data.scheduledWorkouts.filter(item=>item.planId===plan.id).map(item=>item.date),...data.workouts.filter(item=>item.planId===plan.id).map(item=>item.date)];
 if(!plan.completedAt&&plan.program)dates.push(plan.program.startDate,plan.program.endDate);
 if(!dates.length)return null;dates.sort();return{startDate:dates[0],endDate:dates[dates.length-1]};
}
export function excelProgramConflicts(data:DataSet,draft:Pick<ExcelProgramDraft,'startDate'|'endDate'>,ignorePlanId?:string):string[]{
 const messages:string[]=[];
 for(const plan of data.plans){
  if(plan.id===ignorePlanId)continue;
  const range=effectiveProgramRange(data,plan);
  if(range&&range.startDate<=draft.endDate&&range.endDate>=draft.startDate)messages.push(`Il piano “${plan.name}” occupa già il periodo ${dateLabel(range.startDate)} – ${dateLabel(range.endDate)}.`);
 }
 const seen=new Set<string>();
 const occupied=[...data.scheduledWorkouts.filter(item=>(item.kind??'workout')==='workout').map(item=>({date:item.date,planId:item.planId,planName:item.planName,title:item.dayName})),...data.workouts.map(item=>({date:item.date,planId:item.planId,planName:item.planName,title:item.dayName}))];
 for(const item of occupied){
  if(item.planId===ignorePlanId||item.date<draft.startDate||item.date>draft.endDate)continue;
  const key=item.date+':'+item.planId+':'+item.title;if(seen.has(key))continue;seen.add(key);
  messages.push(`${dateLabel(item.date)}: “${item.title}” del piano “${item.planName}” è già presente nel calendario o nello storico.`);
 }
 return messages;
}
export function scheduleConflicts(data:DataSet,dates:string[],planId:string,ignoreEventId?:string):string[]{
 const messages:string[]=[];
 for(const date of dates){
  for(const plan of data.plans){if(plan.archived)continue;const range=effectiveProgramRange(data,plan);if(plan.id!==planId&&range&&date>=range.startDate&&date<=range.endDate)messages.push(`${dateLabel(date)}: il periodo è già occupato dal piano “${plan.name}”.`);}
  for(const entry of data.scheduledWorkouts)if((entry.kind??'workout')==='workout'&&entry.id!==ignoreEventId&&entry.planId!==planId&&entry.date===date)messages.push(`${dateLabel(date)}: “${entry.dayName}” del piano “${entry.planName}” è già programmato.`);
  for(const entry of data.workouts)if(entry.planId!==planId&&entry.date===date)messages.push(`${dateLabel(date)}: “${entry.dayName}” del piano “${entry.planName}” è già registrato.`);
 }
 return [...new Set(messages)];
}
export function autoCompletePlan(data:DataSet,plan:TrainingPlan|undefined){
 if(!plan?.program||plan.completedAt||plan.program.sessionCount<1)return;
 const events=data.scheduledWorkouts.filter(event=>event.planId===plan.id);
 if(events.length!==plan.program.sessionCount||!events.every(event=>event.workoutId&&data.workouts.some(workout=>workout.id===event.workoutId&&workout.status==='completed')))return;
 plan.completedAt=new Date().toISOString();plan.completionReason='automatic';plan.active=false;plan.archived=true;plan.updatedAt=plan.completedAt;
}
