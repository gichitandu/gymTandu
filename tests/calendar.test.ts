import '@angular/compiler';
import 'fake-indexeddb/auto';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import {createEnvironmentInjector,EnvironmentInjector} from '@angular/core';
import {calendarDays,movePeriod,moveDate,parseLocalDate} from '../src/app/services/calendar';
import {Store} from '../src/app/services/store';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {seed} from '../src/app/core/seed';
import {exportBackup,importBackup} from '../src/app/services/backup';
let db:GymDatabase,injector:EnvironmentInjector,s:Store;
beforeEach(async()=>{vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});db=new GymDatabase('calendar-test-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(d:any)=>db.replace(d)}},Store],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));});
afterEach(async()=>{injector.destroy();await db.delete();vi.unstubAllGlobals();});
it('calculates daily, Monday-first weekly and month views including year and leap-day boundaries',()=>{
 expect(calendarDays('2026-10-21','day')).toEqual(['2026-10-21']);expect(calendarDays('2026-10-21','week')).toEqual(['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
 const month=calendarDays('2024-02-29','month');expect(month).toHaveLength(42);expect(month).toContain('2024-02-29');expect(calendarDays('2027-01-01','week')[0]).toBe('2026-12-28');expect(movePeriod('2026-01-31','month',1)).toBe('2026-02-28');expect(movePeriod('2024-01-31','month',1)).toBe('2024-02-29');expect(moveDate('2026-12-31',1)).toBe('2027-01-01');expect(()=>parseLocalDate('2026-02-30')).toThrow();
});
async function plan(){await s.savePlan('p','Piano calendario','');await s.saveDay('day','p','Giorno 1');await s.savePlanExercise({id:'pe',dayId:'day',exerciseId:'exercise-0',sets:1,repsMin:8,repsMax:10,rest:90,notes:'',order:0});}
it('persists planned sessions, rejects duplicates and links only one event to a running workout',async()=>{
 await plan();expect(await s.scheduleWorkout('2026-10-22','day','', 'event-1')).toBe(true);expect(await s.scheduleWorkout('2026-10-22','day','', 'duplicate')).toBe(false);expect(await s.scheduleWorkout('2026-02-30','day','', 'invalid')).toBe(false);
 expect(await s.scheduleWorkout('2026-10-23','day','', 'event-2')).toBe(true);expect(await s.startScheduled('event-1')).toBe(true);const workout=s.draft()!;expect(s.data().scheduledWorkouts.find(e=>e.id==='event-1')?.workoutId).toBe(workout.id);expect(await s.startScheduled('event-2')).toBe(false);
 const ex=s.workoutExercises(workout.id)[0],set=s.sets(ex.id)[0];await s.updateSet(set.id,{completed:true,weight:80,reps:8});expect(await s.finish()).toBe(true);expect(s.completed()[0].id).toBe(workout.id);expect(await s.startScheduled('event-1')).toBe(false);
 const read=await db.snapshot();expect(read.scheduledWorkouts).toHaveLength(2);expect(read.workouts[0].status).toBe('completed');
});
it('removes calendar entries independently from historical workouts and unlinks deleted workouts',async()=>{
 await plan();await s.scheduleWorkout('2026-10-22','day','','event');await s.startScheduled('event');const workoutId=s.draft()!.id;await s.deleteWorkout(workoutId);expect(s.data().scheduledWorkouts[0].workoutId).toBeUndefined();expect(s.data().scheduledWorkouts).toHaveLength(1);
 await s.startScheduled('event');const w=s.draft()!,ex=s.workoutExercises(w.id)[0];await s.updateSet(s.sets(ex.id)[0].id,{completed:true});await s.finish();await s.change(d=>{d.scheduledWorkouts=[];});expect(s.completed()).toHaveLength(1);
});
it('roundtrips calendar, measurements and goals and migrates v3 backups without replacing training data',async()=>{
 const d=seed();d.scheduledWorkouts.push({id:'event',date:'2026-10-22',dayId:'retired-day',planId:'retired-plan',planName:'Piano conservato',dayName:'Giorno conservato',notes:'Snapshot'});d.measurements.push({id:'measure',date:'2026-10-21',weight:75,waist:82,bodyFat:18});d.settings[0].goals={calories:2500,protein:150,workoutsPerWeek:3};
 const restored=await importBackup(await exportBackup(d));expect(restored.scheduledWorkouts).toEqual(d.scheduledWorkouts);expect(restored.measurements).toEqual(d.measurements);expect(restored.settings[0].goals).toEqual(d.settings[0].goals);
 const old=JSON.parse(await exportBackup(d));old.schemaVersion=3;delete old.data.scheduledWorkouts;delete old.data.measurements;const migrated=await importBackup(JSON.stringify(old));expect(migrated.scheduledWorkouts).toEqual([]);expect(migrated.measurements).toEqual([]);expect(migrated.exercises).toEqual(d.exercises);
});
