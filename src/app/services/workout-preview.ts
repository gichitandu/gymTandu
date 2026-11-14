import { coachVisibleText } from './coach-expert-adapter';
import {DataSet, Exercise, TrainingPlanExercise} from '../models/domain';

export interface WorkoutPreviewSelection {scheduledId?:string;dayId?:string}
export interface WorkoutPreviewExercise {
  readonly id:string;
  readonly name:string;
  readonly exercise?:Exercise;
  readonly muscle:string;
  readonly prescription:Readonly<TrainingPlanExercise>;
}
export interface WorkoutPreviewNote {readonly title:string;readonly text:string}
export interface WorkoutPreview {
  readonly available:boolean;
  readonly message:string;
  readonly title:string;
  readonly planName:string;
  readonly planId?:string;
  readonly date?:string;
  readonly week?:number;
  readonly phase?:string;
  readonly exercises:readonly WorkoutPreviewExercise[];
  readonly notes:readonly WorkoutPreviewNote[];
  readonly workSets:number;
  readonly warmupSets:number;
}

/** Resolves prescriptions only. Reading a schedule never creates or changes a session. */
export function buildWorkoutPreview(data:DataSet,selection:WorkoutPreviewSelection):WorkoutPreview {
  const event=selection.scheduledId?data.scheduledWorkouts.find(item=>item.id===selection.scheduledId):undefined;
  const dayId=selection.scheduledId?event?.dayId:selection.dayId;
  const day=dayId?data.days.find(item=>item.id===dayId):undefined;
  const plan=day?data.plans.find(item=>item.id===day.planId):undefined;
  const available=!!day&&!!plan&&(!event||event.planId===day.planId);
  const notes:WorkoutPreviewNote[]=[];
  const addNote=(title:string,text:string|undefined)=>{
    const trimmed=text?.trim();
    if(trimmed&&!notes.some(note=>note.text===trimmed))notes.push({title,text:trimmed});
  };
  if(available){addNote('Allenamento',day.notes);addNote('Promemoria',event?.notes);addNote('Piano',coachVisibleText(plan.description));}
  else addNote('Promemoria',event?.notes);
  const catalog=new Map(data.exercises.map(exercise=>[exercise.id,exercise]));
  const muscles=new Map(data.muscleGroups.map(group=>[group.id,group.name]));
  const exercises:WorkoutPreviewExercise[]=available?data.planExercises
    .filter(item=>item.dayId===day.id)
    .sort((a,b)=>a.order-b.order)
    .map(item=>{
      const exercise=catalog.get(item.exerciseId);
      return{id:item.id,name:exercise?.name||'Esercizio non disponibile',exercise,muscle:exercise?muscles.get(exercise.muscleGroupId)||'':'',prescription:item};
    }):[];
  let message='';
  if(selection.scheduledId&&!event)message='Questa programmazione non è più presente nel calendario.';
  else if(!day)message='La scheda di questo allenamento non è più disponibile.';
  else if(!plan)message='Il piano di questo allenamento non è più disponibile. La programmazione resta conservata.';
  else if(!available)message='La programmazione non corrisponde più al giorno del piano.';
  return{
    available,message,title:available?day.name:event?.dayName||'Allenamento non disponibile',
    planName:available?plan.name:event?.planName||'',planId:available?plan.id:event?.planId,
    date:event?.date||day?.sessionDate,week:available?day.week:undefined,phase:available?day.phase:undefined,
    exercises,notes,workSets:exercises.reduce((total,row)=>total+row.prescription.sets,0),
    warmupSets:exercises.reduce((total,row)=>total+(row.prescription.warmupSets||0),0),
  };
}
