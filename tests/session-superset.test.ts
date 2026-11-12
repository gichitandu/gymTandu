import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {ActivatedRoute,Router} from '@angular/router';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {ActiveWorkoutComponent} from '../src/app/shared/active-workout.component';
let db:GymDatabase,injector:EnvironmentInjector,s:Store,active:ActiveWorkoutComponent|undefined;
beforeEach(async()=>{vi.stubGlobal('document',{body:{classList:{toggle(){}}}});db=new GymDatabase('gym-upgrade-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},{provide:Router,useValue:{navigateByUrl:vi.fn()}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}},Store],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));});
afterEach(async()=>{active?.ngOnDestroy();active=undefined;await s.settled();injector.destroy();await db.delete();vi.unstubAllGlobals();});
async function setup(date?:string){await s.savePlan('p','Piano','');await s.saveDay('d','p','Giorno');await s.savePlanExercise({id:'pe',dayId:'d',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:10,rest:90,notes:'Tecnica',order:0});await s.start('d',date);return s.workoutExercises(s.draft()!.id)[0];}
async function setupTwo(){await s.savePlan('p','Piano','');await s.saveDay('d','p','Giorno');await s.savePlanExercise({id:'pa',dayId:'d',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:10,rest:90,notes:'',order:0});await s.savePlanExercise({id:'pb',dayId:'d',exerciseId:'exercise-1',sets:3,repsMin:8,repsMax:10,rest:90,notes:'',order:1});await s.start('d');return s.workoutExercises(s.draft()!.id);}
it('pairs two session exercises as a superset and removes it, without touching the plan',async()=>{const [a,b]=await setupTwo(),plan=structuredClone(s.data().planExercises);expect(await s.pairWorkoutSuperset(a.id,b.id)).toBe(true);const [x,y]=s.workoutExercises(a.workoutId);expect(x.superset).toBe('A');expect(y.superset).toBe('A');expect(s.data().planExercises).toEqual(plan);expect(await s.pairWorkoutSuperset(a.id,'')).toBe(true);expect(s.workoutExercises(a.workoutId).every(e=>!e.superset)).toBe(true);});
it('shows last time values for the same work set position',async()=>{const e=await setup();const [first,second]=s.sets(e.id);await s.updateSet(first.id,{completed:true,weight:60,reps:10});await s.updateSet(second.id,{completed:true,weight:65,reps:8});await s.finish();await s.start('d');const now=s.workoutExercises(s.draft()!.id)[0];active=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());Object.defineProperty(active,'workoutId',{value:()=>now.workoutId});active.quickRecord(now);active.record(s.sets(now.id)[1]);expect(active.lastTimeSet()).toMatchObject({weight:65,reps:8});active.record(s.sets(now.id)[2]);expect(active.lastTimeSet()).toBeUndefined();});
