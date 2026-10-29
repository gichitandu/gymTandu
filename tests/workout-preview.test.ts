import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {ActivatedRoute,convertToParamMap} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {expect,it,vi} from 'vitest';
import {seed} from '../src/app/core/seed';
import {DataSet} from '../src/app/models/domain';
import {Store} from '../src/app/services/store';
import {buildWorkoutPreview} from '../src/app/services/workout-preview';
import {WorkoutPreviewComponent} from '../src/app/features/workout-preview.component';

const at='2026-11-02T12:00:00.000Z';
function fixture():DataSet{
  const data=seed();
  data.plans=[{id:'p',userId:'local',name:'Massa 8 settimane',description:'Progressione graduale del carico.',createdAt:at,updatedAt:at,active:true,archived:false}];
  data.days=[{id:'week-1',planId:'p',name:'Parte alta',order:0,week:1,sessionDate:'2026-11-02',phase:'Adattamento',notes:'Mantieni 3 ripetizioni in riserva.'},{id:'week-3',planId:'p',name:'Parte alta',order:1,week:3,sessionDate:'2026-11-16',phase:'Progressione',notes:'Aumenta il carico solo con tecnica stabile.'}];
  data.planExercises=[{id:'p1',dayId:'week-1',exerciseId:data.exercises[0].id,sets:2,repsMin:10,repsMax:12,rest:60,rirMin:3,rirMax:3,warmupSets:1,warmupNotes:'Una serie leggera.',notes:'Controlla la discesa.',reference:'Prova iniziale',loadUnit:'kg per manubrio',order:0},{id:'p3',dayId:'week-3',exerciseId:data.exercises[0].id,sets:4,repsMin:8,repsMax:10,rest:90,rirMin:1,rirMax:2,warmupSets:2,warmupNotes:'Due serie progressive.',notes:'Non perdere il controllo.',order:1},{id:'p3-first',dayId:'week-3',exerciseId:data.exercises[1].id,sets:3,repsMin:6,repsMax:6,rest:120,order:0,notes:''}];
  data.scheduledWorkouts=[{id:'scheduled-1',date:'2026-11-02',planId:'p',dayId:'week-1',planName:'Massa',dayName:'Parte alta',notes:'Porta una bottiglia.'},{id:'scheduled-3',date:'2026-11-17',planId:'p',dayId:'week-3',planName:'Massa',dayName:'Parte alta',notes:'Seduta spostata a martedì.'}];
  data.workouts=[{id:'already-open',userId:'local',planId:'p',dayId:'week-1',planName:'Massa',dayName:'Parte alta',date:'2026-11-01',startedAt:at,duration:0,status:'draft',notes:'Sessione da conservare'}];
  data.workoutExercises=[];data.sets=[];data.workoutUi=[];
  return data;
}
function freeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!(value instanceof Blob)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}
  return value;
}
it('reads the exact scheduled week prescriptions and actual scheduled date without touching the active session',()=>{
  const data=freeze(fixture()),before=JSON.stringify(data);
  const preview=buildWorkoutPreview(data,{scheduledId:'scheduled-3'});
  expect(preview).toMatchObject({available:true,title:'Parte alta',planName:'Massa 8 settimane',date:'2026-11-17',week:3,phase:'Progressione',workSets:7,warmupSets:2});
  expect(preview.exercises.map(row=>row.id)).toEqual(['p3-first','p3']);
  expect(preview.exercises[1].prescription).toMatchObject({sets:4,repsMin:8,repsMax:10,rest:90,rirMin:1,rirMax:2,warmupNotes:'Due serie progressive.',notes:'Non perdere il controllo.'});
  expect(preview.notes.map(note=>note.text)).toEqual(['Aumenta il carico solo con tecnica stabile.','Seduta spostata a martedì.','Progressione graduale del carico.']);
  expect(JSON.stringify(data)).toBe(before);expect(data.workouts[0].status).toBe('draft');expect(data.workouts).toHaveLength(1);
});
it('can inspect an unstarted plan day, including zero numeric targets and archived plans',()=>{
  const data=fixture();data.plans[0].archived=true;data.planExercises[0].targetWeight=0;data.planExercises[0].rpe=0;
  const preview=buildWorkoutPreview(data,{dayId:'week-1'});
  expect(preview.available).toBe(true);expect(preview.date).toBe('2026-11-02');expect(preview.workSets).toBe(2);expect(preview.exercises[0].prescription).toMatchObject({targetWeight:0,rpe:0,reference:'Prova iniziale',loadUnit:'kg per manubrio'});
});
it('does not fall back to a different day when a scheduled identifier is missing or mismatches the plan',()=>{
  const data=fixture();
  expect(buildWorkoutPreview(data,{scheduledId:'missing',dayId:'week-1'})).toMatchObject({available:false,exercises:[],message:'Questa programmazione non è più presente nel calendario.'});
  data.scheduledWorkouts[0].planId='other';expect(buildWorkoutPreview(data,{scheduledId:'scheduled-1'}).available).toBe(false);
  data.days=[];const missing=buildWorkoutPreview(data,{scheduledId:'scheduled-3'});expect(missing.available).toBe(false);expect(missing.title).toBe('Parte alta');expect(missing.date).toBe('2026-11-17');expect(missing.notes[0].text).toBe('Seduta spostata a martedì.');
});
it('handles deleted plans, absent catalog entries and empty days without inventing exercises',()=>{
  const data=fixture();data.exercises=[];
  const preview=buildWorkoutPreview(data,{dayId:'week-1'});expect(preview.exercises[0].name).toBe('Esercizio non disponibile');expect(preview.exercises[0].prescription.sets).toBe(2);
  data.planExercises=[];expect(buildWorkoutPreview(data,{dayId:'week-1'})).toMatchObject({available:true,exercises:[],workSets:0});
  data.plans=[];expect(buildWorkoutPreview(data,{scheduledId:'scheduled-1'})).toMatchObject({available:false,planId:'p',exercises:[]});
  expect(buildWorkoutPreview(data,{}).available).toBe(false);
});
it('updates a reused preview route and navigation context while never calling Store mutation methods',()=>{
  const data=fixture(),before=JSON.stringify(data),queryParamMap=new BehaviorSubject(convertToParamMap({scheduled:'scheduled-1'}));
  const forbidden=vi.fn(()=>{throw Error('Preview must never write');});
  const store={data:signal(data),ready:()=>true,settings:()=>data.settings[0],start:forbidden,startScheduled:forbidden,change:forbidden,scheduleWorkout:forbidden,finishDraft:forbidden};
  const injector=createEnvironmentInjector([{provide:Store,useValue:store},{provide:ActivatedRoute,useValue:{queryParamMap}}],null as unknown as EnvironmentInjector);
  try{
    const c=runInInjectionContext(injector,()=>new WorkoutPreviewComponent());expect(c.preview().week).toBe(1);expect(c.backPath()).toBe('/calendario');expect(c.backParams()).toEqual({date:'2026-11-02'});
    queryParamMap.next(convertToParamMap({day:'week-3',return:'piani'}));expect(c.preview().week).toBe(3);expect(c.backPath()).toBe('/piani');expect(c.backParams()).toEqual({plan:'p',week:3});
    queryParamMap.next(convertToParamMap({scheduled:'scheduled-3',return:'piano',plan:'forged-other-plan'}));expect(c.backPath()).toBe('/piano/p');
    queryParamMap.next(convertToParamMap({scheduled:'scheduled-1',return:'home'}));expect(c.backPath()).toBe('/');
    expect(forbidden).not.toHaveBeenCalled();expect(JSON.stringify(data)).toBe(before);
  }finally{injector.destroy();}
});
