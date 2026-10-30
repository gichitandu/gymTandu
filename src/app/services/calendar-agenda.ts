import {CalendarEventKind,DataSet,localDate,ScheduledWorkout,WorkoutLog} from '../models/domain';

export type CalendarAgendaStatus='planned'|'completed'|'partial'|'rest'|'other'|'missed';

/** A calendar entry is a view of saved records, never a new workout record. */
export interface CalendarAgendaItem {
 id:string;
 event?:ScheduledWorkout;
 workout?:WorkoutLog;
 date:string;
 title:string;
 planName:string;
 notes:string;
 kind:CalendarEventKind;
 status:CalendarAgendaStatus;
 time?:string;
 durationMinutes?:number;
 /** True when the displayed duration comes from the programme, not a log. */
 durationEstimated:boolean;
 estimatedCalories?:number;
 completedSets:number;
 totalSets:number;
}

export interface CalendarAgendaStats {
 total:number;
 completed:number;
 partial:number;
 planned:number;
 rest:number;
 completionPercent:number;
 durationMinutes:number;
 hasDuration:boolean;
 hasEstimatedDuration:boolean;
 estimatedCalories:number;
 hasCalories:boolean;
}

function duration(value:unknown):number|undefined {
 return typeof value==='number'&&Number.isFinite(value)&&value>0?value:undefined;
}
function calories(value:unknown):number|undefined {
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
}
function clock(value:unknown):string|undefined {
 return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?value:undefined;
}
function startedTime(workout:WorkoutLog):string|undefined {
 const started=new Date(workout.startedAt);
 if(!Number.isFinite(started.getTime())||localDate(started)!==workout.date)return undefined;
 return `${String(started.getHours()).padStart(2,'0')}:${String(started.getMinutes()).padStart(2,'0')}`;
}
function noteParts(...values:(string|undefined)[]):string {
 return [...new Set(values.map(value=>value?.trim()).filter((value):value is string=>!!value))].join('\n\n');
}

/**
 * Logs are shown on their recorded date. A linked calendar event supplies its
 * optional metadata, but cannot create a second copy on its old scheduled day.
 */
export function calendarAgendaByDate(data:DataSet):Map<string,CalendarAgendaItem[]> {
 const workouts=new Map(data.workouts.map(workout=>[workout.id,workout]));
 const linkedEvents=new Map<string,ScheduledWorkout>();
 for(const event of data.scheduledWorkouts){
  const workout=workouts.get(event.workoutId||'');
  if(!workout)continue;
  const previous=linkedEvents.get(workout.id);
  // Prefer the matching date if an old archive contains several links to one
  // log. Otherwise the ID makes the selected snapshot independent of row order.
  if(!previous||event.date===workout.date&&previous.date!==workout.date||
    (event.date===workout.date)===(previous.date===workout.date)&&event.id<previous.id){
   linkedEvents.set(workout.id,event);
  }
 }
 const exerciseWorkouts=new Map(data.workoutExercises.map(exercise=>[exercise.id,exercise.workoutId]));
 const setCounts=new Map<string,{completed:number;total:number}>();
 for(const set of data.sets){
  const workoutId=exerciseWorkouts.get(set.workoutExerciseId);if(!workoutId)continue;
  const count=setCounts.get(workoutId)||{completed:0,total:0};
  count.total++;if(set.completed)count.completed++;setCounts.set(workoutId,count);
 }
 const plannedSets=new Map<string,number>();
 for(const exercise of data.planExercises){
  plannedSets.set(exercise.dayId,(plannedSets.get(exercise.dayId)||0)+exercise.sets+(exercise.warmupSets||0));
 }
 const endedPlans=new Set(data.plans.filter(plan=>plan.completedAt).map(plan=>plan.id));
 const items:CalendarAgendaItem[]=[];
 for(const event of data.scheduledWorkouts){
  if(workouts.has(event.workoutId||''))continue;
  const kind=event.kind||'workout';
  const status:CalendarAgendaStatus=kind==='rest'?'rest':event.done&&kind!=='workout'?'completed':
   kind==='workout'&&endedPlans.has(event.planId)?'missed':kind==='other'?'other':'planned';
  const plannedDuration=duration(event.durationMinutes);
  items.push({id:'event:'+event.id,event,date:event.date,title:event.dayName,planName:event.planName,notes:noteParts(event.notes),kind,status,
   time:clock(event.time),durationMinutes:plannedDuration,durationEstimated:plannedDuration!==undefined,
   estimatedCalories:calories(event.estimatedCalories),completedSets:0,totalSets:kind==='workout'?(plannedSets.get(event.dayId)||0):0});
 }
 for(const workout of data.workouts){
  const event=linkedEvents.get(workout.id),count=setCounts.get(workout.id)||{completed:0,total:0};
  const actualDuration=duration(workout.duration),plannedDuration=duration(event?.durationMinutes);
  items.push({id:event?'event:'+event.id:'workout:'+workout.id,event,workout,date:workout.date,title:workout.dayName,planName:workout.planName,
   notes:noteParts(event?.notes,workout.notes),kind:'workout',status:workout.status==='completed'?'completed':'partial',
   time:clock(event?.time)||startedTime(workout),durationMinutes:actualDuration??plannedDuration,
   durationEstimated:actualDuration===undefined&&plannedDuration!==undefined,estimatedCalories:calories(event?.estimatedCalories),
   completedSets:count.completed,totalSets:count.total});
 }
 const byDate=new Map<string,CalendarAgendaItem[]>();
 for(const item of items){const group=byDate.get(item.date)||[];group.push(item);byDate.set(item.date,group);}
 for(const group of byDate.values())group.sort((first,second)=>{
  if(first.time&&second.time)return first.time.localeCompare(second.time)||first.id.localeCompare(second.id);
  if(first.time)return -1;if(second.time)return 1;
  return first.id.localeCompare(second.id);
 });
 return byDate;
}

/** Single-day convenience API; month/week callers should reuse the full map. */
export function calendarAgenda(data:DataSet,date:string):CalendarAgendaItem[] {
 return calendarAgendaByDate(data).get(date)||[];
}

/** Rest and sessions left unperformed by a concluded plan are not targets. */
export function calendarAgendaStats(items:readonly CalendarAgendaItem[]):CalendarAgendaStats {
 const active=items.filter(item=>item.kind!=='rest'&&item.status!=='missed');
 const completed=active.filter(item=>item.status==='completed').length;
 return {
  total:active.length,completed,partial:active.filter(item=>item.status==='partial').length,
  planned:active.filter(item=>item.status==='planned'||item.status==='other').length,
  rest:items.filter(item=>item.kind==='rest').length,
  completionPercent:active.length?Math.round(completed/active.length*100):0,
  durationMinutes:active.reduce((sum,item)=>sum+(duration(item.durationMinutes)||0),0),
  hasDuration:active.some(item=>duration(item.durationMinutes)!==undefined),
  hasEstimatedDuration:active.some(item=>item.durationEstimated&&duration(item.durationMinutes)!==undefined),
  estimatedCalories:active.reduce((sum,item)=>sum+(calories(item.estimatedCalories)||0),0),
  hasCalories:active.some(item=>calories(item.estimatedCalories)!==undefined),
 };
}

export function calendarKindLabel(kind:CalendarEventKind):string {
 return ({workout:'Allenamento',cardio:'Cardio',mobility:'Mobilità',rest:'Riposo',other:'Altro'})[kind];
}
export function calendarKindIcon(kind:CalendarEventKind):string {
 return ({workout:'weight',cardio:'activity',mobility:'activity',rest:'moon',other:'note'})[kind];
}
export function calendarStatusLabel(status:CalendarAgendaStatus):string {
 return ({planned:'In programma',completed:'Completato',partial:'In corso',rest:'Riposo',other:'Altro',missed:'Non svolto'})[status];
}
export function formatCalendarDuration(minutes:number):string {
 if(!Number.isFinite(minutes)||minutes<=0)return '—';
 if(minutes<1)return '<1 min';
 const rounded=Math.round(minutes),hours=Math.floor(rounded/60),remaining=rounded%60;
 return hours?`${hours} h${remaining?' '+remaining+' min':''}`:`${remaining} min`;
}
