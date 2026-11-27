import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {Store} from '../src/app/services/store';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {ActiveWorkoutComponent} from '../src/app/shared/active-workout.component';
import {WorkoutResumeService} from '../src/app/services/workout-resume';
let db:GymDatabase,injector:EnvironmentInjector,s:Store,components:ActiveWorkoutComponent[];
beforeEach(async()=>{
 components=[];vi.stubGlobal('document',{visibilityState:'visible',body:{classList:{toggle:()=>{}}}});const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 db=new GymDatabase('training-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{storageKey:db.name,read:()=>db.snapshot(),replace:(d:any)=>db.replace(d)}},Store,WorkoutResumeService],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
});
afterEach(async()=>{for(const c of components)c.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function plan(superset=false,warmupSets=0){await s.savePlan('p','Piano','');await s.saveDay('d','p','Giorno 1');await s.savePlanExercise({id:'a',dayId:'d',exerciseId:'exercise-0',sets:2,repsMin:8,repsMax:10,rest:90,notes:'',order:0,targetWeight:80,superset:superset?'A':undefined,warmupSets});if(superset)await s.savePlanExercise({id:'b',dayId:'d',exerciseId:'exercise-4',sets:2,repsMin:8,repsMax:10,rest:90,notes:'',order:1,targetWeight:40,superset:'A'});}
function active(){const c=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());c.gymMode.set(false);const wid=s.draft()!.id;Object.defineProperty(c,'workoutId',{value:()=>wid});components.push(c);return c;}

// Dati sintetici: due macchine simili per lo stesso esercizio.
async function session(machine:string,weight:number,reps=10){
 await s.start('d');const ex=s.workoutExercises(s.draft()!.id)[0];
 if(machine)expect(await s.assignMachine(ex.id,machine)).toBe(true);
 for(const set of s.sets(ex.id))await s.updateSet(set.id,{weight,reps,completed:true});
 await s.finish();return ex.id;
}
it('tiene uno storico per macchina e riprende i carichi della macchina scelta',async()=>{
 await plan();
 await session('Technogym',60,8);await session('Panatta',50,10);
 expect(s.machinesFor('exercise-0').map(m=>[m.name,m.sets[0].weight])).toEqual([['Panatta',50],['Technogym',60]]);
 await s.start('d');const ex=s.workoutExercises(s.draft()!.id)[0];
 // La macchina abituale è l'ultima usata.
 expect(ex.machineSetup?.machine).toBe('Panatta');
 expect(await s.assignMachine(ex.id,' technogym ')).toBe(true);
 const row=s.workoutExercises(ex.workoutId)[0];
 expect(row.machineSetup?.machine).toBe('technogym');
 expect(s.sets(ex.id).map(x=>[x.weight,x.reps,x.completed])).toEqual([[60,8,false],[60,8,false]]);
 expect(s.previous('exercise-0',ex.workoutId,row.machineSetup).map(x=>x.weight)).toEqual([60,60]);
 expect(s.preference('exercise-0')?.machineSetup?.machine).toBe('technogym');
 expect(s.message()).toContain('ripresi i carichi');
});
it('le serie già registrate non cambiano quando si cambia macchina, e una macchina nuova non ha riferimento',async()=>{
 await plan();await session('Technogym',60,8);
 await s.start('d');const ex=s.workoutExercises(s.draft()!.id)[0],[first]=s.sets(ex.id);
 await s.updateSet(first.id,{weight:70,reps:6,completed:true});
 await s.assignMachine(ex.id,'Panatta');
 expect(s.sets(ex.id)[0]).toMatchObject({weight:70,reps:6,completed:true});
 expect(s.previous('exercise-0',ex.workoutId,s.workoutExercises(ex.workoutId)[0].machineSetup)).toEqual([]);
 expect(s.message()).toContain('prima volta');
});
it('sedile e presa non dividono lo storico: conta il nome della macchina',async()=>{
 await plan();await session('Technogym',60,8);
 expect(s.previous('exercise-0',undefined,{machine:'TECHNOGYM',seat:'7',grip:'Larga'}).map(x=>x.weight)).toEqual([60,60]);
 expect(s.previous('exercise-0',undefined,{machine:'Panatta',seat:'4'})).toEqual([]);
});
it('corregge a posteriori la macchina di una seduta registrata senza toccare le serie',async()=>{
 await plan();const old=await session('Technogym',50,10);await session('Technogym',60,8);
 const before=structuredClone(s.sets(old));
 expect(await s.assignMachine(old,'Panatta')).toBe(true);
 expect(s.data().workoutExercises.find(e=>e.id===old)!.machineSetup?.machine).toBe('Panatta');
 expect(s.sets(old)).toEqual(before);
 expect(s.machinesFor('exercise-0').map(m=>[m.name,m.sets[0].weight])).toEqual([['Technogym',60],['Panatta',50]]);
 expect(s.previous('exercise-0',undefined,{machine:'Panatta'}).map(x=>x.weight)).toEqual([50,50]);
 expect(s.message()).toContain('assegnata a Panatta');
});
it('in seduta il cambio di macchina aggiorna i valori proposti nella schermata della serie',async()=>{
 await plan();await session('Technogym',60,8);await session('Panatta',50,10);
 await s.start('d');const c=active(),ex=s.workoutExercises(s.draft()!.id)[0],[first]=s.sets(ex.id);
 c.open(ex);c.record(first);
 c.weight=55;c.inputChanged();
 await s.assignMachine(ex.id,'Technogym');c.machineChanged();
 expect(c.weight).toBe(60);expect(c.reps).toBe(8);expect(c.lastTimeSet()?.weight).toBe(60);
});
