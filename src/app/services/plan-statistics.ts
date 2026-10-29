import {DataSet,LoadMode,WorkoutLog,localDate} from '../models/domain';
import {setupKey,setupSummary} from './training-flow';

export interface PlanExerciseStatistics{
 key:string;exerciseId:string;name:string;mode:LoadMode;setup:string;loadUnit:string;
 workSets:number;repetitions:number;sessions:number;maxWeight:number|null;maxReps:number;volume:number|null;
 history:{date:string;workoutId:string;maxWeight:number|null;maxReps:number;volume:number|null}[];
}
export interface PlanSessionStatistics{
 key:string;date:string;title:string;status:'completed'|'draft'|'planned'|'missed'|'cancelled';
 workoutId?:string;eventId?:string;week?:number;duration:number|null;volume:number|null;
}
export interface PlanStatistics{
 expectedCount:number|null;completedCount:number;completedScheduledCount:number;draftCount:number;pendingCount:number;missedCount:number;cancelledCount:number;
 completionPercentage:number|null;workSetCount:number;warmupSetCount:number;repetitions:number;volume:number;volumeSetCount:number;excludedVolumeSetCount:number;
 duration:number;averageDuration:number|null;durationCount:number;missingDurationCount:number;
 byWeek:{week:number;label:string;completedCount:number;volume:number;volumeSetCount:number}[];
 exercises:PlanExerciseStatistics[];sessions:PlanSessionStatistics[];workouts:WorkoutLog[];
}
const unique=<T extends {id:string}>(rows:T[])=>[...new Map(rows.map(row=>[row.id,row])).values()];
const time=(date:string)=>Date.parse(date+'T12:00:00Z');
function knownUnit(value?:string){return !value||! /da verificare|da confermare|sconosciut|unknown/i.test(value);}
export function buildPlanStatistics(data:DataSet,planId:string,today=new Date().toISOString().slice(0,10)):PlanStatistics{
 const plan=data.plans.find(p=>p.id===planId),workouts=unique(data.workouts.filter(w=>w.planId===planId)).sort((a,b)=>a.date.localeCompare(b.date)||a.startedAt.localeCompare(b.startedAt));
 const completed=workouts.filter(w=>w.status==='completed'),completedIds=new Set(completed.map(w=>w.id)),allWorkouts=new Map(workouts.map(w=>[w.id,w]));
 const events=unique(data.scheduledWorkouts.filter(event=>event.planId===planId)),days=data.days.filter(day=>day.planId===planId);
 const dayMap=new Map(days.map(day=>[day.id,day])),rows=unique(data.workoutExercises.filter(e=>completedIds.has(e.workoutId))),rowIds=new Set(rows.map(e=>e.id));
 const sets=unique(data.sets.filter(set=>set.completed&&rowIds.has(set.workoutExerciseId))),setsByExercise=new Map<string,typeof sets>();
 for(const set of sets){const group=setsByExercise.get(set.workoutExerciseId)||[];group.push(set);setsByExercise.set(set.workoutExerciseId,group);}
 const exerciseMap=new Map<string,PlanExerciseStatistics & {sessionIds:Set<string>}>(),sessionVolumes=new Map<string,{value:number;count:number}>(),weeks=new Map<number,{week:number;label:string;completedCount:number;volume:number;volumeSetCount:number}>();
 let workSetCount=0,warmupSetCount=0,repetitions=0,volume=0,volumeSetCount=0,excludedVolumeSetCount=0;
 for(const row of rows){
  const rowSets=setsByExercise.get(row.id)||[],work=rowSets.filter(set=>set.kind!=='warmup');warmupSetCount+=rowSets.length-work.length;
  workSetCount+=work.length;repetitions+=work.reduce((sum,set)=>sum+set.reps,0);
  const unit=row.loadUnit||'',comparable=knownUnit(unit),external=row.loadMode==='external'&&comparable;
  const value=external?work.reduce((sum,set)=>sum+set.weight*set.reps,0):0;
  if(external){volume+=value;volumeSetCount+=work.length;}else excludedVolumeSetCount+=work.length;
  const existing=sessionVolumes.get(row.workoutId)||{value:0,count:0};existing.value+=value;existing.count+=external?work.length:0;sessionVolumes.set(row.workoutId,existing);
  if(!work.length)continue;
  const key=JSON.stringify([row.exerciseId,row.loadMode,setupKey(row.machineSetup),unit]);
  let stats=exerciseMap.get(key);
  if(!stats){stats={key,exerciseId:row.exerciseId,name:row.name,mode:row.loadMode,setup:setupSummary(row.machineSetup)||'Configurazione non registrata',loadUnit:unit,workSets:0,repetitions:0,sessions:0,maxWeight:row.loadMode==='bodyweight'||!comparable?null:0,maxReps:0,volume:external?0:null,history:[],sessionIds:new Set()};exerciseMap.set(key,stats);}
  stats.workSets+=work.length;stats.repetitions+=work.reduce((sum,set)=>sum+set.reps,0);stats.sessionIds.add(row.workoutId);stats.sessions=stats.sessionIds.size;
  stats.maxReps=Math.max(stats.maxReps,...work.map(set=>set.reps));if(stats.maxWeight!==null)stats.maxWeight=Math.max(stats.maxWeight,...work.map(set=>set.weight));if(stats.volume!==null)stats.volume+=value;
  const history=stats.history.find(point=>point.workoutId===row.workoutId),maxWeight=stats.maxWeight===null?null:Math.max(...work.map(set=>set.weight)),maxReps=Math.max(...work.map(set=>set.reps));
  if(history){history.maxReps=Math.max(history.maxReps,maxReps);if(history.maxWeight!==null&&maxWeight!==null)history.maxWeight=Math.max(history.maxWeight,maxWeight);if(history.volume!==null)history.volume+=value;}
  else stats.history.push({date:allWorkouts.get(row.workoutId)!.date,workoutId:row.workoutId,maxWeight,maxReps,volume:external?value:null});
 }
 const weekOf=(w:WorkoutLog)=>{const day=dayMap.get(w.dayId);return day?.week||(plan?.program?Math.max(1,Math.floor((time(w.date)-time(plan.program.startDate))/(7*86400000))+1):Math.floor((time(w.date)-time(completed[0]?.date||w.date))/(7*86400000))+1);};
 for(const w of completed){const week=weekOf(w),group=weeks.get(week)||{week,label:'Sett. '+week,completedCount:0,volume:0,volumeSetCount:0},v=sessionVolumes.get(w.id);group.completedCount++;group.volume+=v?.value||0;group.volumeSetCount+=v?.count||0;weeks.set(week,group);}
 const metrics=(workout?:WorkoutLog)=>({duration:workout&&workout.duration>0?workout.duration:null,volume:workout&&sessionVolumes.get(workout.id)?.count?sessionVolumes.get(workout.id)!.value:null});
 const sessions:PlanSessionStatistics[]=[],seenWorkouts=new Set<string>(),seenDays=new Set<string>(),completedScheduled=new Set<string>();
 const closedDate=plan?.completedAt?localDate(new Date(plan.completedAt)):today;
 for(const event of events){const w=event.workoutId?allWorkouts.get(event.workoutId):undefined;seenDays.add(event.dayId);if(w)seenWorkouts.add(w.id);
  const status=w?.status||(plan?.completedAt?(event.date<closedDate?'missed':'cancelled'):event.date<today?'missed':'planned');if(status==='completed'&&w)completedScheduled.add(w.id);
  sessions.push({key:'event:'+event.id,eventId:event.id,workoutId:w?.id,date:w?.date||event.date,title:event.dayName,status,week:dayMap.get(event.dayId)?.week,...metrics(w)});
 }
 // Session-specific imported days retain the intended schedule after a manual
 // close removes unstarted calendar rows. This keeps missed/cancelled counts real.
 for(const day of days.filter(day=>day.sessionDate&&!seenDays.has(day.id))){
  const w=workouts.find(w=>w.dayId===day.id&&!seenWorkouts.has(w.id));if(w)seenWorkouts.add(w.id);
  const status=w?.status||'cancelled';if(status==='completed'&&w)completedScheduled.add(w.id);
  sessions.push({key:'day:'+day.id,date:w?.date||day.sessionDate!,title:day.name,status,week:day.week,workoutId:w?.id,...metrics(w)});
 }
 for(const w of workouts.filter(w=>!seenWorkouts.has(w.id)))sessions.push({key:'workout:'+w.id,date:w.date,title:w.dayName,status:w.status,workoutId:w.id,week:dayMap.get(w.dayId)?.week,...metrics(w)});
 sessions.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
 const expectedCount=plan?.program?.sessionCount??(events.length?events.length:null),durations=completed.map(w=>w.duration).filter(value=>Number.isFinite(value)&&value>0),duration=durations.reduce((sum,value)=>sum+value,0);
 const counts=(status:PlanSessionStatistics['status'])=>sessions.filter(row=>row.status===status).length,completedScheduledCount=completedScheduled.size;
 for(const row of exerciseMap.values())row.history.sort((a,b)=>a.date.localeCompare(b.date)||a.workoutId.localeCompare(b.workoutId));
 return{expectedCount,completedCount:completed.length,completedScheduledCount,draftCount:workouts.length-completed.length,pendingCount:counts('planned'),missedCount:counts('missed'),cancelledCount:counts('cancelled'),completionPercentage:expectedCount?Math.min(100,Math.round(completedScheduledCount/expectedCount*100)):null,workSetCount,warmupSetCount,repetitions,volume,volumeSetCount,excludedVolumeSetCount,duration,averageDuration:durations.length?duration/durations.length:null,durationCount:durations.length,missingDurationCount:completed.length-durations.length,byWeek:[...weeks.values()].sort((a,b)=>a.week-b.week),exercises:[...exerciseMap.values()].map(({sessionIds,...row})=>row).sort((a,b)=>a.name.localeCompare(b.name)||a.setup.localeCompare(b.setup)),sessions,workouts};
}
