import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector} from '@angular/core';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {seed} from '../src/app/core/seed';
import {ScheduledWorkout} from '../src/app/models/domain';
import {BACKUP_VERSION,exportBackup,importBackup} from '../src/app/services/backup';
import {validateCalendarEvent} from '../src/app/services/calendar-event-data';
import {excelProgramConflicts,scheduleConflicts} from '../src/app/services/plan-program';

let db:GymDatabase,injector:EnvironmentInjector,s:Store;
beforeEach(async()=>{
 vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
 db=new GymDatabase('calendar-metadata-'+crypto.randomUUID());
 injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},Store],null as unknown as EnvironmentInjector);
 s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
});
afterEach(async()=>{await s.settled();injector.destroy();await db.delete();vi.unstubAllGlobals();});
async function plan(){
 await s.savePlan('p','Piano esistente','Da conservare');await s.saveDay('day','p','Parte alta');
 await s.savePlanExercise({id:'pe',dayId:'day',exerciseId:'exercise-0',sets:1,repsMin:8,repsMax:10,rest:90,notes:'Indicazioni conservate',order:0});
}
const activity=(extra:Partial<ScheduledWorkout>={}):ScheduledWorkout=>({id:'activity',date:'2026-11-02',kind:'cardio',dayName:'Camminata',planId:'',dayId:'',planName:'',notes:'All’aperto',time:'07:30',durationMinutes:30,estimatedCalories:140,...extra});

it('persists timed workouts and only permits a second same-day session at a distinct explicit time',async()=>{
 await plan();const options={time:'07:00',durationMinutes:60,estimatedCalories:450};
 expect(await s.scheduleWorkout('2026-11-02','day','Prima seduta','first',1,options)).toBe(true);
 const before=await db.snapshot();
 expect(await s.scheduleWorkout('2026-11-02','day','','same',1,{time:'07:00'})).toBe(false);
 expect(await s.scheduleWorkout('2026-11-02','day','','untimed')).toBe(false);expect((await db.snapshot()).scheduledWorkouts).toEqual(before.scheduledWorkouts);
 expect(await s.scheduleWorkout('2026-11-02','day','Seconda seduta','second',1,{time:'18:00'})).toBe(true);
 expect((await db.snapshot()).scheduledWorkouts).toMatchObject([{id:'first',...options},{id:'second',time:'18:00'}]);
 // A legacy caller editing a snapshot must not erase fields it does not know.
 expect(await s.scheduleWorkout('2026-11-02','day','Note modificate','first')).toBe(true);
 expect(s.data().scheduledWorkouts[0]).toMatchObject(options);
 expect(await s.scheduleWorkout('2026-11-03','day','Note modificate','first',1,{time:undefined,durationMinutes:undefined,estimatedCalories:undefined})).toBe(true);
 expect(s.data().scheduledWorkouts[0].time).toBeUndefined();expect(s.data().scheduledWorkouts[0].durationMinutes).toBeUndefined();expect(s.data().scheduledWorkouts[0].estimatedCalories).toBeUndefined();
});

it('saves calendar-only activities without creating a plan or interfering with plan overlap protection',async()=>{
 const profile=structuredClone(s.profile());
 expect(await s.scheduleCalendarActivity({id:'rest',date:'2026-11-02',kind:'rest',title:'Riposo',notes:'Recupero'})).toBe(true);
 expect(await s.scheduleCalendarActivity({id:'cardio',date:'2026-11-02',kind:'cardio',title:'Camminata',time:'07:30',durationMinutes:30,estimatedCalories:140})).toBe(true);
 expect(s.data().plans).toEqual([]);expect(s.profile()).toEqual(profile);
 expect(excelProgramConflicts(s.data(),{startDate:'2026-11-02',endDate:'2026-11-30'})).toEqual([]);
 await plan();expect(await s.scheduleWorkout('2026-11-02','day','','workout')).toBe(true);
 expect(scheduleConflicts(s.data(),['2026-11-02'],'p')).toEqual([]);
 const before=await db.snapshot();expect(await s.startScheduled('cardio')).toBe(false);expect(s.draft()).toBeUndefined();
 expect(await s.toggleCalendarActivity('cardio')).toBe(true);expect((await db.snapshot()).scheduledWorkouts.find(row=>row.id==='cardio')?.done).toBe(true);
 expect(await s.moveCalendarEvent('cardio','2026-11-03')).toBe(false);expect(await s.removeCalendarEvent('cardio')).toBe(false);
 expect(await s.toggleCalendarActivity('cardio')).toBe(true);expect(await s.removeCalendarEvent('cardio')).toBe(true);
 expect(await s.toggleCalendarActivity('rest')).toBe(false);expect(s.profile()).toEqual(before.profiles[0]);
 expect(await s.toggleCalendarActivity('workout')).toBe(false);
});

it('keeps imported prescriptions one-to-one with their calendar entry and completes the plan only after that session',async()=>{
 await plan();await s.scheduleWorkout('2026-11-02','day','Seduta importata','imported',1,{time:'07:00'});
 await s.change(data=>{data.plans[0].program={importId:'import',sourceName:'Scheda.xlsx',sourceKind:'GT-1',startDate:'2026-11-02',endDate:'2026-11-02',weeks:1,fileHash:'a'.repeat(64),importedAt:new Date().toISOString(),sessionCount:1};},'',false);
 const before=await db.snapshot();
 expect(await s.scheduleWorkout('2026-11-02','day','','extra',1,{time:'18:00'})).toBe(false);expect(s.error()).toContain('Usa Sposta');
 expect(await s.scheduleWorkout('2026-11-03','day','','extra-day')).toBe(false);
 expect(await s.scheduleWorkout('2026-11-03','day','','extra-series',2)).toBe(false);
 expect((await db.snapshot()).scheduledWorkouts).toEqual(before.scheduledWorkouts);expect(s.data().plans[0].completedAt).toBeUndefined();
 expect(await s.moveCalendarEvent('imported','2026-11-03','08:00')).toBe(true);
 expect(await s.scheduleWorkout('2026-11-03','day','Nota aggiornata','imported',1,{time:'09:00'})).toBe(true);
 expect(s.data().scheduledWorkouts).toHaveLength(1);
 await s.startScheduled('imported');const workout=s.draft()!,exercise=s.workoutExercises(workout.id)[0];
 expect(s.data().plans[0].completedAt).toBeUndefined();await s.updateSet(s.sets(exercise.id)[0].id,{weight:24,reps:8,completed:true});
 expect(await s.finish()).toBe(true);expect(s.data().plans[0].completedAt).toBeTruthy();expect(s.data().scheduledWorkouts).toHaveLength(1);
});

it('can edit timing on an imported snapshot without truncating pre-existing long notes',async()=>{
 await plan();const notes='Indicazioni Excel complete. '.repeat(140);
 await s.change(data=>{data.scheduledWorkouts.push({id:'long-notes',date:'2026-11-02',planId:'p',dayId:'day',planName:'Piano esistente',dayName:'Parte alta',notes});},'',false);
 expect(await s.scheduleWorkout('2026-11-02','day',notes,'long-notes',1,{time:'08:00'})).toBe(true);
 expect(s.data().scheduledWorkouts[0]).toMatchObject({notes,time:'08:00'});
 const before=await db.snapshot();expect(await s.scheduleWorkout('2026-11-02','day',notes+'Nuovo testo','long-notes')).toBe(false);expect((await db.snapshot()).scheduledWorkouts).toEqual(before.scheduledWorkouts);
});

it('repeats calendar activities atomically and preserves metadata when moving an unstarted entry',async()=>{
 const input={id:'cardio',date:'2026-11-02',kind:'cardio' as const,title:'Corsa',notes:'Ritmo tranquillo',time:'07:30',durationMinutes:30,estimatedCalories:0};
 expect(await s.scheduleCalendarActivity(input,4)).toBe(true);const before=await db.snapshot();
 expect(before.scheduledWorkouts.map(row=>row.date).sort()).toEqual(['2026-11-02','2026-11-09','2026-11-16','2026-11-23']);
 expect(await s.scheduleCalendarActivity({...input,id:'duplicate',date:'2026-10-26'},4)).toBe(false);
 expect((await db.snapshot()).scheduledWorkouts).toEqual(before.scheduledWorkouts);
 expect(await s.moveCalendarEvent('cardio','2026-11-03')).toBe(true);
 expect(s.data().scheduledWorkouts.find(row=>row.id==='cardio')).toEqual({...before.scheduledWorkouts.find(row=>row.id==='cardio'),date:'2026-11-03'});
 expect(await s.moveCalendarEvent('cardio','2026-11-04','')).toBe(true);expect(s.data().scheduledWorkouts[0].time).toBeUndefined();
 expect(s.data().scheduledWorkouts[0].estimatedCalories).toBe(0);
});

it('moves workout schedules with the existing overlap guards and never moves or deletes completed history',async()=>{
 await plan();await s.scheduleWorkout('2026-10-28','day','Sessione conservata','first',1,{time:'07:00',durationMinutes:45,estimatedCalories:300});
 expect(await s.moveCalendarEvent('first','2026-10-29','08:00')).toBe(true);
 const event=s.data().scheduledWorkouts[0];expect(event).toMatchObject({id:'first',date:'2026-10-29',time:'08:00',durationMinutes:45,estimatedCalories:300});
 await s.startScheduled('first');const workout=s.draft()!,exercise=s.workoutExercises(workout.id)[0];
 expect(await s.moveCalendarEvent('first','2026-10-30')).toBe(false);
 await s.updateSet(s.sets(exercise.id)[0].id,{weight:24,reps:8,completed:true});await s.finish();
 const before=await db.snapshot();expect(await s.removeCalendarEvent('first')).toBe(false);expect((await db.snapshot()).workouts).toEqual(before.workouts);expect((await db.snapshot()).sets).toEqual(before.sets);
 await s.scheduleWorkout('2026-10-30','day','','open');await s.startScheduled('open');
 const draft=s.draft()!,savedSets=structuredClone(s.data().sets);
 expect(await s.removeCalendarEvent('open')).toBe(true);expect(s.draft()).toEqual(draft);expect(s.data().sets).toEqual(savedSets);expect(s.completed()).toHaveLength(1);
 // Another plan still blocks a move, while personal activities do not.
 // Use a future date so the conflict fixture never becomes an "already today" event.
 const blockedDate=new Date(Date.now()+45*86400000).toISOString().slice(0,10);
 await s.savePlan('other','Altro piano','');await s.saveDay('other-day','other','Giorno');
 expect(await s.scheduleWorkout(blockedDate,'other-day','','other-event')).toBe(true);
 expect(await s.scheduleWorkout('2026-11-01','day','','movable')).toBe(true);
 expect(await s.moveCalendarEvent('movable',blockedDate)).toBe(false);
 expect(s.data().scheduledWorkouts.find(row=>row.id==='movable')?.date).toBe('2026-11-01');
});

it('roundtrips all new metadata and migrates version 8 backups without replacing legacy data',async()=>{
 const data=seed();data.scheduledWorkouts=[activity(),activity({id:'rest',kind:'rest',dayName:'Riposo',time:undefined,durationMinutes:undefined,estimatedCalories:undefined}),activity({id:'legacy',kind:undefined,planId:'retired-plan',dayId:'retired-day',planName:'Piano precedente',notes:'n'.repeat(10000),time:undefined,durationMinutes:undefined,estimatedCalories:undefined})];
 const json=await exportBackup(data),roundtrip=await importBackup(json);expect(JSON.parse(json).schemaVersion).toBe(BACKUP_VERSION);expect(roundtrip.scheduledWorkouts).toEqual(data.scheduledWorkouts);expect(roundtrip.profiles).toEqual(data.profiles);
 const old=JSON.parse(json);old.schemaVersion=8;old.data.scheduledWorkouts=[{id:'old',date:'2026-10-29',planId:'old-plan',dayId:'old-day',planName:'Scheda precedente',dayName:'Parte alta',notes:'Conservata'}];
 const restored=await importBackup(JSON.stringify(old));expect(restored.scheduledWorkouts).toEqual(old.data.scheduledWorkouts);expect(restored.exercises).toEqual(data.exercises);
});

it.each([{time:'24:00'},{time:'7:00'},{durationMinutes:0},{durationMinutes:1441},{durationMinutes:Infinity},{estimatedCalories:-1},{estimatedCalories:20001},{done:'yes'},{kind:'unknown'},{kind:null},{date:'2026-02-30'},{planId:'not-a-plan'},{workoutId:'unrelated'}])('rejects invalid calendar metadata without changing the durable archive: %j',async patch=>{
 const before=await db.snapshot(),candidate={...activity(),...patch} as ScheduledWorkout;
 expect(()=>validateCalendarEvent(candidate)).toThrow();
 const raw=JSON.parse(await exportBackup(before));raw.data.scheduledWorkouts=[candidate];await expect(importBackup(JSON.stringify(raw))).rejects.toThrow();
 expect(await db.snapshot()).toEqual(before);
});
