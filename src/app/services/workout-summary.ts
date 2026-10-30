import {DataSet,localDate} from '../models/domain';
import {setupKey} from './training-flow';
export function buildWorkoutSummary(data:DataSet,id:string){
 const workout=data.workouts.find(w=>w.id===id&&w.status==='completed');
 const rows=data.workoutExercises.filter(e=>e.workoutId===id),ids=new Set(rows.map(e=>e.id));
 const all=data.sets.filter(s=>ids.has(s.workoutExerciseId)),done=all.filter(s=>s.completed),work=done.filter(s=>s.kind!=='warmup');
 const known=(unit?:string)=>!unit||!/da verificare|da confermare|unknown|sconosciut/i.test(unit);
 const comparable=new Set(rows.filter(e=>e.loadMode==='external'&&known(e.loadUnit)).map(e=>e.id));
 const volume=work.filter(s=>comparable.has(s.workoutExerciseId)).reduce((sum,s)=>sum+s.weight*s.reps,0);
 const previous=workout?data.workouts.filter(w=>w.status==='completed'&&w.id!==id&&(w.date<workout.date||w.date===workout.date&&w.startedAt<workout.startedAt)):[];
 const previousIds=new Set(previous.map(w=>w.id));
 const improvements: {name:string;before:number;after:number;kind:'load'|'reps'}[]=[];
 const comparisons: {name:string;before:number;after:number;kind:'load'|'reps';date:string}[]=[];
 for(const row of rows){
  if(!known(row.loadUnit))continue;
  const current=work.filter(s=>s.workoutExerciseId===row.id);if(!current.length)continue;
  const matches=data.workoutExercises.filter(e=>previousIds.has(e.workoutId)&&e.exerciseId===row.exerciseId&&e.loadMode===row.loadMode&&setupKey(e.machineSetup)===setupKey(row.machineSetup)&&(e.loadUnit||'')===(row.loadUnit||''));
  const old=data.sets.filter(s=>s.completed&&s.kind!=='warmup'&&matches.some(e=>e.id===s.workoutExerciseId));if(!old.length)continue;
  const load=row.loadMode==='external'||row.loadMode==='weighted-bodyweight';
  if(!load&&row.loadMode!=='bodyweight')continue;
  const before=Math.max(...old.map(s=>load?s.weight:s.reps)),after=Math.max(...current.map(s=>load?s.weight:s.reps));
  const latest=previous.filter(w=>matches.some(e=>e.workoutId===w.id)).sort((a,b)=>b.date.localeCompare(a.date)||b.startedAt.localeCompare(a.startedAt))[0];
  const lastRows=new Set(matches.filter(e=>e.workoutId===latest?.id).map(e=>e.id)),last=old.filter(s=>lastRows.has(s.workoutExerciseId));
  if(latest&&last.length)comparisons.push({name:row.name,before:Math.max(...last.map(s=>load?s.weight:s.reps)),after,kind:load?'load':'reps',date:latest.date});
  if(after>before&&!improvements.some(e=>e.name===row.name&&e.kind===(load?'load':'reps')))improvements.push({name:row.name,before,after,kind:load?'load':'reps'});
 }
 return {workout,rows,completed:work.length,warmups:done.length-work.length,pending:all.length-done.length,total:all.length,volume,volumeKnown:work.some(s=>comparable.has(s.workoutExerciseId)),reps:work.reduce((n,s)=>n+s.reps,0),duration:workout&&workout.duration>0?workout.duration:null,improvements,comparisons};
}
