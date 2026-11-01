import {DataSet,WorkoutUiState} from '../models/domain';
import {remainingSeconds} from './rest-clock';
/** Preserve an absolute deadline when navigating; only pausing freezes seconds. */
export function toggleWorkoutTimer(state:WorkoutUiState,now:number):WorkoutUiState {
 const updatedAt=new Date(Math.max(now,Date.parse(state.updatedAt)+1)).toISOString();
 return state.paused?{...state,paused:false,restEnd:now+state.pausedSeconds*1000,updatedAt}:{...state,paused:true,pausedSeconds:remainingSeconds(state.restEnd,now),updatedAt};
}
/** Return to pending inputs when possible, otherwise select the next saved set. */
export function recordingTimerState(state:WorkoutUiState,data:DataSet,now:number):WorkoutUiState {
 const exercises=data.workoutExercises.filter(e=>e.workoutId===state.id).sort((a,b)=>a.order-b.order);
 const owned=new Set(exercises.map(e=>e.id));const sets=data.sets.filter(s=>owned.has(s.workoutExerciseId));
 const current=sets.find(s=>s.id===state.setId&&s.workoutExerciseId===state.exerciseId);
 const next=current&&!current.completed?current:sets.filter(s=>s.workoutExerciseId===state.exerciseId).sort((a,b)=>a.number-b.number).find(s=>!s.completed)||exercises.flatMap(e=>sets.filter(s=>s.workoutExerciseId===e.id).sort((a,b)=>a.number-b.number)).find(s=>!s.completed);
 const updatedAt=new Date(Math.max(now,Date.parse(state.updatedAt)+1)).toISOString();
 if(!next)return {...state,step:'list',updatedAt};
 if(next.id===current?.id)return {...state,step:'record',updatedAt};
 return {...state,step:'record',exerciseId:next.workoutExerciseId,setId:next.id,weight:next.weight,reps:next.reps,rpe:next.rpe,setNotes:next.notes||'',kind:next.kind||'work',updatedAt};
}
