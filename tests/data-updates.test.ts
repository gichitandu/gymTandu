import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {afterEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {seed} from '../src/app/core/seed';
import {DataSet,TABLES} from '../src/app/models/domain';
import {GYM_REPOSITORY,GymRepository,IndexedDbRepository} from '../src/app/repositories/repository';
import {AuthService} from '../src/app/services/auth';
import {Store} from '../src/app/services/store';
import {WorkoutResumeService} from '../src/app/services/workout-resume';
import {ActiveWorkoutComponent} from '../src/app/shared/active-workout.component';

afterEach(()=>vi.unstubAllGlobals());

function editedArchive(){
 const d=seed();
 d.profiles[0].name='Profilo modificato';d.settings[0].unit='lb';
 d.exercises[0].name='La mia panca';d.exercises[0].active=false;
 const at='2026-10-20T12:00:00.000Z';
 d.plans.push({id:'p',userId:'local',name:'Piano modificato',description:'Appunti personali',createdAt:at,updatedAt:at,active:true,archived:false});
 d.days.push({id:'d',planId:'p',name:'Giorno personale',order:0});
 d.workouts.push({id:'w',userId:'local',planId:'p',dayId:'d',planName:'Piano modificato',dayName:'Giorno personale',date:'2026-10-20',startedAt:at,duration:0,notes:'Sessione aperta',status:'draft'});
 d.workoutExercises.push({id:'we',workoutId:'w',exerciseId:d.exercises[0].id,name:'Panca storica',loadMode:'external',order:0,rest:90,notes:'Note modificate'});
 d.sets.push({id:'s',workoutExerciseId:'we',number:1,weight:87.5,reps:9,completed:true});
 d.exercisePreferences.push({id:d.exercises[0].id,favorite:true,machineSetup:{seat:'4',grip:'Neutra'}});
 d.workoutUi.push({id:'w',step:'record',tab:'sets',exerciseId:'we',setId:'s',restEnd:0,restTotal:90,paused:false,pausedSeconds:0,weight:87.5,reps:9,setNotes:'Bozza',kind:'work',updatedAt:at});
 d.meals.push({id:'meal',date:'2026-10-20',name:'Pasto corretto',grams:150,calories:210,protein:20,carbs:15,fat:8,notes:'Modificato',source:'manual',createdAt:at});
 return d;
}

it('upgrades v6 additively, retaining every saved and edited record and photo',async()=>{
 const name='release-upgrade-'+crypto.randomUUID(),old=new Dexie(name);
 old.version(6).stores({profiles:'id,role',roles:'id,&name',plans:'id,userId,active,archived',days:'id,planId,order',planExercises:'id,dayId,exerciseId',exercises:'id,name,muscleGroupId,equipment,active',muscleGroups:'id,&name',workouts:'id,userId,planId,dayId,date,status',workoutExercises:'id,workoutId,exerciseId',sets:'id,workoutExerciseId',settings:'id',meals:'id,date,name',scheduledWorkouts:'id,date,dayId,workoutId',measurements:'id,&date',exercisePreferences:'id',workoutUi:'id'});
 const data=editedArchive();
 data.profiles[0].photo=new Blob([new Uint8Array([255,216,255,0,1])],{type:'image/jpeg'});
 for(const table of TABLES)await old.table(table).bulkPut(data[table]);old.close();
 const db=new GymDatabase(name);
 try{
  const upgraded=await db.snapshot();expect(db.verno).toBe(7);
  for(const table of TABLES)expect([...upgraded[table]].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...data[table]].sort((a,b)=>a.id.localeCompare(b.id)));
  expect(await upgraded.profiles[0].photo!.arrayBuffer()).toEqual(await data.profiles[0].photo!.arrayBuffer());
  db.close();const reopened=new GymDatabase(name);try{expect((await reopened.snapshot()).sets).toEqual(data.sets);}finally{reopened.close();}
 }finally{await db.delete();}
});

it('rejects a stale tab write instead of overwriting edits saved by another tab',async()=>{
 const name='release-tabs-'+crypto.randomUUID(),first=new GymDatabase(name),second=new GymDatabase(name);
 try{
  await first.replace(editedArchive());const a=await first.snapshot(),b=await second.snapshot();
  a.sets[0].weight=92.5;await first.replace(a);b.sets[0].weight=10;
  await expect(second.replace(b)).rejects.toThrow('altra finestra');
  expect((await first.snapshot()).sets[0].weight).toBe(92.5);
  const fresh=await second.snapshot();fresh.meals[0].name='Modifica successiva';await second.replace(fresh);
  expect((await first.snapshot()).meals[0].name).toBe('Modifica successiva');
 }finally{second.close();await first.delete();}
});

function storeFor(repo:GymRepository,auth?:unknown){
 vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});vi.stubGlobal('navigator',{onLine:false});
 return createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:repo},...(auth?[{provide:AuthService,useValue:auth}]:[]),Store,WorkoutResumeService],null as unknown as EnvironmentInjector);
}

it('ignores a stale tab journal on reload and stops journal writes after a database conflict',async()=>{
 const cache=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>cache.get(k)||null,setItem:(k:string,v:string)=>cache.set(k,v),removeItem:(k:string)=>cache.delete(k)});
 const name='release-stale-journal-'+crypto.randomUUID(),repo=new IndexedDbRepository(name),other=new GymDatabase(name);
 await repo.replace(editedArchive());const injector=storeFor(repo);let component:ActiveWorkoutComponent|undefined;
 try{
  const store=injector.get(Store);await vi.waitFor(()=>expect(store.ready()).toBe(true));
  const latest=await other.snapshot();latest.sets[0].weight=102.5;latest.workoutUi[0].weight=102.5;await other.replace(latest);
  component=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());Object.defineProperty(component,'workoutId',{value:()=> 'w'});
  component.exerciseId.set('we');component.setId.set('s');component.step.set('record');component.weight=10;component.remember();
  const journal=injector.get(WorkoutResumeService);
  const reloaded=await other.snapshot();
  expect(journal.read(name,'w',reloaded.workoutUi[0],other.currentRevision())?.weight).toBe(102.5);
  expect(await store.updateSet('s',{weight:10})).toBe(false);expect(store.conflicted()).toBe(true);
  expect(cache.get('gymtrack-resume-v1:'+name)).toBeUndefined();
  component.remember();expect(cache.get('gymtrack-resume-v1:'+name)).toBeUndefined();
  expect((await other.snapshot()).sets[0].weight).toBe(102.5);
 }finally{component?.ngOnDestroy();await injector.get(Store).settled();injector.destroy();other.close();await repo.db.delete();}
});

it('keeps this tab’s pending inputs through its own saves while refusing to rebase another tab’s journal',()=>{
 const cache=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>cache.get(k)||null,setItem:(k:string,v:string)=>cache.set(k,v),removeItem:(k:string)=>cache.delete(k)});
 const first=new WorkoutResumeService(),second=new WorkoutResumeService(),state=editedArchive().workoutUi[0];
 first.write('archive',state,3);first.rebase('archive',3,4);expect(first.read('archive','w',undefined,4)?.weight).toBe(87.5);
 second.rebase('archive',4,5);expect(second.read('archive','w',undefined,5)).toBeUndefined();
 first.invalidate('archive',3);expect(first.read('archive','w',undefined,4)?.weight).toBe(87.5);
 first.invalidate('archive',4);expect(first.read('archive','w',undefined,4)).toBeUndefined();
 cache.set('gymtrack-resume-v1:legacy',JSON.stringify({version:1,state}));first.rebase('legacy',0,0);first.rebase('legacy',0,1);expect(first.read('legacy','w',undefined,1)?.weight).toBe(87.5);
});

it('repairs missing bootstrap records without resetting plans, weights, meals or customized exercises',async()=>{
 const data=editedArchive();data.profiles=[];data.settings=[];let saved:DataSet|undefined;
 const repo:GymRepository={read:async()=>structuredClone(data),replace:async d=>{saved=structuredClone(d);}};
 const injector=storeFor(repo);
 try{const store=injector.get(Store);await vi.waitFor(()=>expect(store.ready()).toBe(true));expect(saved?.plans).toEqual(data.plans);expect(saved?.sets).toEqual(data.sets);expect(saved?.meals).toEqual(data.meals);expect(saved?.exercises[0].name).toBe('La mia panca');expect(saved?.profiles[0].id).toBe('local');}finally{injector.destroy();}
});

it('serializes a slow catalog refresh with personal edits so neither restores an older archive',async()=>{
 let persisted=editedArchive(),release!:()=>void,reached!:()=>void;
 const blocked=new Promise<void>(r=>release=r),started=new Promise<void>(r=>reached=r);let hold=true;
 const repo:GymRepository={read:async()=>structuredClone(persisted),replace:async d=>{if(hold){hold=false;reached();await blocked;}persisted=structuredClone(d);}};
 const catalog=seed();const auth={user:signal({id:'owner',role:'SuperAdmin',owner:true}),offlineMode:()=>false,request:vi.fn().mockResolvedValue({exercises:catalog.exercises,muscleGroups:catalog.muscleGroups})};
 const injector=storeFor(repo,auth);
 try{
  const store=injector.get(Store);await vi.waitFor(()=>expect(store.ready()).toBe(true));
  const refresh=store.refreshCatalog();await started;
  const edit=store.updateSet('s',{weight:102.5});
  await new Promise<void>(r=>setTimeout(r,0));release();await Promise.all([refresh,edit]);
  expect(persisted.sets[0].weight).toBe(102.5);expect(store.data().sets[0].weight).toBe(102.5);expect(persisted.plans[0].name).toBe('Piano modificato');
 }finally{release();injector.destroy();}
});
