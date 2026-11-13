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
import {backupReminder} from '../src/app/services/backup-reminder';
import {setupKey} from '../src/app/services/training-flow';
import {chartSeries} from '../src/app/services/statistics';
import {exportBackup,importBackup} from '../src/app/services/backup';
import {seed} from '../src/app/core/seed';
let db:GymDatabase,injector:EnvironmentInjector,s:Store,components:ActiveWorkoutComponent[];
beforeEach(async()=>{
 components=[];vi.stubGlobal('document',{visibilityState:'visible',body:{classList:{toggle:()=>{}}}});const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
 db=new GymDatabase('training-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{storageKey:db.name,read:()=>db.snapshot(),replace:(d:any)=>db.replace(d)}},Store,WorkoutResumeService],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
});
afterEach(async()=>{for(const c of components)c.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function plan(superset=false,warmupSets=0){await s.savePlan('p','Piano','');await s.saveDay('d','p','Giorno 1');await s.savePlanExercise({id:'a',dayId:'d',exerciseId:'exercise-0',sets:2,repsMin:8,repsMax:10,rest:90,notes:'',order:0,targetWeight:80,superset:superset?'A':undefined,warmupSets});if(superset)await s.savePlanExercise({id:'b',dayId:'d',exerciseId:'exercise-4',sets:2,repsMin:8,repsMax:10,rest:90,notes:'',order:1,targetWeight:40,superset:'A'});}
function active(){const c=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());c.gymMode.set(false);const wid=s.draft()!.id;Object.defineProperty(c,'workoutId',{value:()=>wid});components.push(c);return c;}
it('keeps favorites and machine settings personal, derives recents and snapshots each session',async()=>{
 await s.toggleFavorite('exercise-0');await s.saveMachineSetup('exercise-0',{machine:'Press A',seat:'4',grip:'Neutra'});await plan();await s.start('d');const ex=s.workoutExercises(s.draft()!.id)[0];expect(s.isFavorite('exercise-0')).toBe(true);expect(s.recentExerciseIds()[0]).toBe('exercise-0');expect(ex.machineSetup?.seat).toBe('4');
 await s.updateSet(s.sets(ex.id)[0].id,{completed:true});await s.saveMachineSetup('exercise-0',{machine:'Press B',seat:'2'},ex.id);expect(s.workoutExercises(ex.workoutId)[0].machineSetup?.machine).toBe('Press A');expect(s.preference('exercise-0')?.machineSetup?.machine).toBe('Press B');
 await s.finish();expect(s.previous('exercise-0',undefined,{machine:'Press B',seat:'2'})).toHaveLength(0);expect(s.previous('exercise-0',undefined,{machine:'Press A',seat:'4',grip:'Neutra'})).toHaveLength(1);
 await s.start('d');const second=s.workoutExercises(s.draft()!.id)[0];await s.updateSet(s.sets(second.id)[0].id,{weight:50,reps:8,completed:true});await s.finish();expect(s.records('exercise-0',setupKey({machine:'Press B',seat:'2'})).maxWeight).toBe(50);expect(chartSeries(s.data(),'exercise-0','',0,'weight',setupKey({machine:'Press A',seat:'4',grip:'Neutra'})).map(p=>p.value)).toEqual([80]);
 const restored=await importBackup(await exportBackup(await db.snapshot()));expect(restored.exercisePreferences[0]).toMatchObject({favorite:true,machineSetup:{machine:'Press B'}});expect(restored.workoutExercises.find(e=>e.id===ex.id)?.machineSetup?.machine).toBe('Press A');
});
it('excludes explicit warmups from records, charts and volume and retains legacy working sets',async()=>{
 await plan(false,1);await s.start('d');const ex=s.workoutExercises(s.draft()!.id)[0],sets=s.sets(ex.id);expect(sets.map(x=>x.kind)).toEqual(['warmup','work','work']);await s.updateSet(sets[0].id,{weight:100,reps:20,completed:true});await s.updateSet(sets[1].id,{weight:80,reps:8,completed:true});await s.finish();expect(s.totalVolume()).toBe(640);expect(s.records('exercise-0').maxWeight).toBe(80);expect(chartSeries(s.data(),'exercise-0','',0,'volume')[0].value).toBe(640);
 await s.start('d');const current=s.workoutExercises(s.draft()!.id)[0];await s.copyPrevious(current.id);expect(s.sets(current.id).map(x=>x.kind)).toEqual(['warmup','work']);expect(s.sets(current.id).map(x=>x.number)).toEqual([1,2]);
});
it('alternates a superset and starts rest after the completed pair',async()=>{
 await plan(true);await s.start('d');const c=active(),[a,b]=c.exercises();c.open(a);c.nextRecord();await c.complete();expect(c.step()).toBe('record');expect(c.exerciseId()).toBe(b.id);expect(c.remaining()).toBe(0);await c.complete();expect(c.step()).toBe('rest');expect(c.remaining()).toBe(90);c.advance();expect(c.exerciseId()).toBe(a.id);expect(c.currentSet()?.number).toBe(2);
 expect(await s.savePlanExercise({id:'third',dayId:'d',exerciseId:'exercise-9',sets:1,repsMin:8,repsMax:10,rest:90,notes:'',order:2,superset:'A'})).toBe(false);
});
it('restores exact series inputs and running or paused timer after component destruction',async()=>{
 await plan();await s.start('d');const c=active();c.open(c.exercises()[0]);c.nextRecord();c.weight=82.5;c.reps=9;c.setNotes='Da conservare';c.inputChanged();c.ngOnDestroy();components=[];await s.settled();const restored=active();restored.ngOnInit();expect(restored.step()).toBe('record');expect(restored.weight).toBe(82.5);expect(restored.reps).toBe(9);expect(restored.setNotes).toBe('Da conservare');await restored.complete();const end=restored.restEnd();restored.ngOnDestroy();components=[];await s.settled();const originalNow=Date.now();const spy=vi.spyOn(Date,'now').mockReturnValue(originalNow+30000);const afterLock=active();afterLock.ngOnInit();expect(afterLock.step()).toBe('rest');expect(afterLock.restEnd()).toBe(end);expect(afterLock.remaining()).toBeGreaterThanOrEqual(59);expect(afterLock.remaining()).toBeLessThanOrEqual(60);afterLock.pauseRest();const paused=afterLock.remaining();afterLock.ngOnDestroy();components=[];await s.settled();spy.mockReturnValue(originalNow+120000);const afterPause=active();afterPause.ngOnInit();expect(afterPause.paused()).toBe(true);expect(afterPause.remaining()).toBe(paused);
});
it('isolates resume journals by archive and discards a completed workout point',async()=>{
 await plan();await s.start('d');const c=active();c.open(c.exercises()[0]);c.nextRecord();c.remember(true);await s.settled();const resume=injector.get(WorkoutResumeService);expect(resume.read('different-account',s.draft()!.id)).toBeUndefined();await s.updateSet(c.currentSet()!.id,{completed:true});await s.finish();c.ngOnDestroy();components=[];await s.settled();expect((await db.snapshot()).workoutUi).toHaveLength(0);expect(resume.read(s.archiveKey(),'old')).toBeUndefined();
});
it('bases reminders on confirmed copies, honors snooze and migrates old v4 backup data',async()=>{
 const now=Date.parse('2026-10-21T10:00:00Z'),settings=seed().settings[0];expect(backupReminder({...settings,lastBackup:new Date(now).toISOString()},now).due).toBe(true);expect(backupReminder({...settings,backupConfirmedAt:'2026-10-20T10:00:00Z'},now).due).toBe(false);expect(backupReminder({...settings,backupConfirmedAt:'2026-10-10T10:00:00Z'},now).due).toBe(true);expect(backupReminder({...settings,backupSnoozedUntil:'2026-10-22T10:00:00Z'},now).due).toBe(false);expect(backupReminder({...settings,backupReminderDays:0},now).due).toBe(false);
 const old=JSON.parse(await exportBackup(seed()));old.schemaVersion=4;delete old.data.exercisePreferences;delete old.data.workoutUi;const migrated=await importBackup(JSON.stringify(old));expect(migrated.exercisePreferences).toEqual([]);expect(migrated.workoutUi).toEqual([]);
});

it('upgrades an archive from v5 without changing training data and adds empty personal tables',async()=>{
 const name='old-v5-'+crypto.randomUUID(),old=new Dexie(name);
 old.version(5).stores({profiles:'id,role',roles:'id,&name',plans:'id,userId,active,archived',days:'id,planId,order',planExercises:'id,dayId,exerciseId',exercises:'id,name,muscleGroupId,equipment,active',muscleGroups:'id,&name',workouts:'id,userId,planId,dayId,date,status',workoutExercises:'id,workoutId,exerciseId',sets:'id,workoutExerciseId',settings:'id',meals:'id,date,name',scheduledWorkouts:'id,date,dayId,workoutId',measurements:'id,&date'});
 const data=seed();data.profiles[0].name='Il mio profilo';for(const table of old.tables)await table.bulkPut(data[table.name as keyof typeof data]);old.close();const upgraded=new GymDatabase(name);try{const result=await upgraded.snapshot();expect(upgraded.verno).toBe(9);expect(result.profiles).toEqual(data.profiles);expect(result.exercises).toEqual([...data.exercises].sort((a,b)=>a.id.localeCompare(b.id)));expect(result.exercisePreferences).toEqual([]);expect(result.workoutUi).toEqual([]);}finally{await upgraded.delete();}
});
it('roundtrips user-declared iPhone checks and never marks unperformed tests as passed',async()=>{
 await s.change(d=>{d.settings[0].iphoneChecklist={device:'iPhone di prova',ios:'Versione di prova',checks:{lock_timer:{state:'todo'},resume:{state:'pass',note:'Prova dichiarata dall’utente',checkedAt:new Date().toISOString()}}};d.settings[0].backupConfirmedAt=new Date().toISOString();d.settings[0].backupReminderDays=14;});
 const restored=await importBackup(await exportBackup(await db.snapshot()));expect(restored.settings[0].iphoneChecklist?.checks.lock_timer.state).toBe('todo');expect(restored.settings[0].iphoneChecklist?.checks.resume.note).toBe('Prova dichiarata dall’utente');expect(restored.settings[0].backupReminderDays).toBe(14);
});
it('falls back to IndexedDB for resume when the synchronous journal cannot be written',async()=>{
 await plan();await s.start('d');vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage non disponibile');});const c=active();c.open(c.exercises()[0]);c.nextRecord();await s.settled();expect((await db.snapshot()).workoutUi[0]).toMatchObject({step:'record',setId:c.setId()});c.ngOnDestroy();components=[];await s.settled();const restored=active();restored.ngOnInit();expect(restored.step()).toBe('record');expect(restored.currentSet()).toBeDefined();
});
