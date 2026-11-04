import {DataSet,WorkoutLog} from '../models/domain';

/** Excel-compatible UTF-8 CSV. Never sends personal workout data over the network. */
function cell(value:unknown):string {
 const raw=String(value??'');
 // Prevent spreadsheet formula execution when opening user-entered names/notes.
 const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?'\''+raw:raw;
 return '"'+safe.replaceAll('"','""').replace(/[\r\n]+/g,' ')+'"';
}

export function trainingReportCsv(data:DataSet,workouts:readonly WorkoutLog[]):string {
 const header=['Data','Piano','Seduta','Esercizio','Modalità','Numero serie','Carico (kg)','Ripetizioni','RPE','Durata (min)','Note seduta'];
 const lines=['sep=;',header.map(cell).join(';')];
 const byWorkout=new Map<string,DataSet['workoutExercises']>();
 for(const row of data.workoutExercises){
  const list=byWorkout.get(row.workoutId)||[];
  list.push(row);byWorkout.set(row.workoutId,list);
 }
 const setsByRow=new Map<string,DataSet['sets']>();
 for(const set of data.sets){
  if(!set.completed||set.kind==='warmup')continue;
  const list=setsByRow.get(set.workoutExerciseId)||[];
  list.push(set);setsByRow.set(set.workoutExerciseId,list);
 }
 for(const workout of [...workouts].filter(w=>w.status==='completed').sort((a,b)=>a.date.localeCompare(b.date))){
  const exercises=byWorkout.get(workout.id)||[];
  let exported=false;
  for(const row of exercises){
   for(const set of setsByRow.get(row.id)||[]){
    exported=true;
    lines.push([workout.date,workout.planName,workout.dayName,row.name,row.loadMode,set.number,
      row.loadMode==='bodyweight'?'':set.weight,set.reps,set.rpe??'',workout.durationUnknown?'':workout.duration,workout.notes].map(cell).join(';'));
   }
  }
  if(!exported)lines.push([workout.date,workout.planName,workout.dayName,'','','','','','',workout.durationUnknown?'':workout.duration,workout.notes].map(cell).join(';'));
 }
 return '\ufeff'+lines.join('\r\n')+'\r\n';
}
