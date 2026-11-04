import {DataSet, ScheduledWorkout} from '../models/domain';
import {setupKey} from './training-flow';

/** Read-only training analysis: no estimated medical recovery scores and no automatic plan changes. */
export interface TrainingWindow {
 workouts:number;
 completedWorkSets:number;
 externalVolumeKg:number;
 averageSessionsPerWeek:number;
}
export interface LoadSuggestion {
 key:string;
 exercise:string;
 title:string;
 detail:string;
 oldWeightKg:number;
 suggestedWeightKg?:number;
}
export interface TrainingInsights {
 recent:TrainingWindow;
 previous:TrainingWindow;
 sessionsDifference:number|null;
 suggestions:LoadSuggestion[];
}

function weeksAgo(date:string,days:number){
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-days);
 return d.toISOString().slice(0,10);
}

export function buildTrainingInsights(data:DataSet,today:string):TrainingInsights {
 const since=weeksAgo(today,27),earlier=weeksAgo(today,55),before=weeksAgo(today,28);
 const workouts=data.workouts.filter(w=>w.status==='completed'&&w.date<=today&&w.date>=earlier);
 const sessions=new Map(workouts.map(w=>[w.id,w]));
 const exerciseRows=data.workoutExercises.filter(e=>sessions.has(e.workoutId));
 const rows=new Map(exerciseRows.map(e=>[e.id,e]));
 const setsByExercise=new Map<string,DataSet['sets']>();
 for(const set of data.sets)if(rows.has(set.workoutExerciseId)&&set.completed&&set.kind!=='warmup'){
  const grouped=setsByExercise.get(set.workoutExerciseId)||[];
  grouped.push(set);setsByExercise.set(set.workoutExerciseId,grouped);
 }
 const stats=(start:string,end:string):TrainingWindow=>{
  const items=workouts.filter(w=>w.date>=start&&w.date<=end),ids=new Set(items.map(w=>w.id));
  let completedWorkSets=0,externalVolumeKg=0;
  for(const row of exerciseRows){
   if(!ids.has(row.workoutId))continue;
   const sets=setsByExercise.get(row.id)||[];
   completedWorkSets+=sets.length;
   if(row.loadMode==='external'&&!/da verificare|da confermare|sconosciut|unknown/i.test(row.loadUnit||'')){
    for(const set of sets)externalVolumeKg+=set.weight*set.reps;
   }
  }
  return {workouts:items.length,completedWorkSets,externalVolumeKg,averageSessionsPerWeek:items.length/4};
 };
 const recent=stats(since,today),previous=stats(earlier,weeksAgo(today,28));
 const catalog=new Map(data.exercises.map(e=>[e.id,e.name]));
 const steps=new Map(data.exercisePreferences.map(p=>[p.id,p.weightStep]));
 const prescriptions=data.planExercises;
 const byExercise=new Map<string,typeof exerciseRows>();
 // Group by exercise and machine settings: unrelated machines are not compared.
 for(const row of exerciseRows){
  const workout=sessions.get(row.workoutId)!;
  if(workout.date<since||!['external','weighted-bodyweight'].includes(row.loadMode))continue;
  const key=row.exerciseId+'|'+row.loadMode+'|'+setupKey(row.machineSetup);
  const list=byExercise.get(key)||[];
  list.push(row);byExercise.set(key,list);
 }
 const suggestions:LoadSuggestion[]=[];
 for(const [key,list] of byExercise){
  const ordered=list.sort((a,b)=>{
   const x=sessions.get(a.workoutId)!,y=sessions.get(b.workoutId)!;
   return y.date.localeCompare(x.date)||y.startedAt.localeCompare(x.startedAt);
  });
  if(ordered.length<2)continue;
  const current=ordered[0],last=ordered[1],w=sessions.get(current.workoutId)!;
  // Only a unique prescription from the same day can justify a suggested load.
  const options=prescriptions.filter(p=>p.dayId===w.dayId&&p.exerciseId===current.exerciseId);
  if(options.length!==1)continue;
  const prescription=options[0];
  const completed=setsByExercise.get(current.id)||[],past=setsByExercise.get(last.id)||[];
  if(completed.length!==prescription.sets||past.length!==prescription.sets||!completed.length)continue;
  if(!completed.every(s=>s.reps>=prescription.repsMax&&s.rpe!==undefined&&s.rpe<=8&&s.rpe>=1))continue;
  if(!past.every(s=>s.weight===past[0].weight)||!completed.every(s=>s.weight===completed[0].weight))continue;
  if(completed[0].weight<past[0].weight||completed.some(s=>s.weight<=0))continue;
  const increment=steps.get(current.exerciseId)??2.5;
  if(!Number.isFinite(increment)||increment<=0||increment>50)continue;
  const weight=Math.round((completed[0].weight+increment)*100)/100;
  suggestions.push({
   key,exercise:catalog.get(current.exerciseId)||current.name,
   title:'Valuta un incremento di carico',
   detail:'Le ultime serie hanno raggiunto il limite alto delle ripetizioni con RPE fino a 8. Controlla tecnica e attrezzatura prima di decidere.',
   oldWeightKg:completed[0].weight,suggestedWeightKg:weight,
  });
 }
 return {recent,previous,sessionsDifference:previous.workouts?recent.workouts-previous.workouts:null,suggestions:suggestions.slice(0,3)};
}

export interface CalendarReminder {id:string;date:string;time?:string;title:string;kind:string;}
/** In-app reminders only; push notification delivery depends on the existing server and device permission. */
export function upcomingCalendarReminders(data:DataSet,today:string,days=7):CalendarReminder[] {
 const until=weeksAgo(today,-(days-1));
 const completed=new Set(data.workouts.filter(w=>w.status==='completed').map(w=>w.id));
 const concluded=new Set(data.plans.filter(p=>!!p.completedAt).map(p=>p.id));
 return data.scheduledWorkouts
  .filter(e=>e.date>=today&&e.date<=until&&e.done!==true&&!completed.has(e.workoutId||'')&&!((e.kind??'workout')==='workout'&&concluded.has(e.planId)))
  .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''))
  .slice(0,5)
  .map((e:ScheduledWorkout)=>({id:e.id,date:e.date,time:e.time,title:e.dayName,kind:e.kind||'workout'}));
}
