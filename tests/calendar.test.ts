import '@angular/compiler';
import 'fake-indexeddb/auto';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {calendarDays,calendarActivity,weeklyDates,movePeriod,moveDate,parseLocalDate} from '../src/app/services/calendar';
import {ActivatedRoute,Router} from '@angular/router';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {Store} from '../src/app/services/store';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {seed} from '../src/app/core/seed';
import {exportBackup,importBackup} from '../src/app/services/backup';
let db:GymDatabase,injector:EnvironmentInjector,s:Store;let routeDate:string|null=null;
beforeEach(async()=>{routeDate=null;vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});db=new GymDatabase('calendar-test-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(d:any)=>db.replace(d)}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>routeDate}}}},{provide:Router,useValue:{navigateByUrl:vi.fn()}},Store],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));});
afterEach(async()=>{await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();});
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
it('removes linked appointments with deleted workouts while retaining independently saved history',async()=>{
 await plan();await s.scheduleWorkout('2026-10-22','day','','event');await s.startScheduled('event');const workoutId=s.draft()!.id;await s.deleteWorkout(workoutId);expect(s.data().workouts).toEqual([]);expect(s.data().scheduledWorkouts).toEqual([]);
 await s.scheduleWorkout('2026-10-22','day','','event');await s.startScheduled('event');const w=s.draft()!,ex=s.workoutExercises(w.id)[0];await s.updateSet(s.sets(ex.id)[0].id,{completed:true});await s.finish();await s.change(d=>{d.scheduledWorkouts=[];});expect(s.completed()).toHaveLength(1);
});
it('roundtrips calendar, measurements and goals and migrates v3 backups without replacing training data',async()=>{
 const d=seed();d.scheduledWorkouts.push({id:'event',date:'2026-10-22',dayId:'retired-day',planId:'retired-plan',planName:'Piano conservato',dayName:'Giorno conservato',notes:'Snapshot'});d.measurements.push({id:'measure',date:'2026-10-21',weight:75,waist:82,bodyFat:18});d.settings[0].goals={calories:2500,protein:150,workoutsPerWeek:3};
 const restored=await importBackup(await exportBackup(d));expect(restored.scheduledWorkouts).toEqual(d.scheduledWorkouts);expect(restored.measurements).toEqual(d.measurements);expect(restored.settings[0].goals).toEqual(d.settings[0].goals);
 const old=JSON.parse(await exportBackup(d));old.schemaVersion=3;delete old.data.scheduledWorkouts;delete old.data.measurements;const migrated=await importBackup(JSON.stringify(old));expect(migrated.scheduledWorkouts).toEqual([]);expect(migrated.measurements).toEqual([]);expect(migrated.exercises).toEqual(d.exercises);
});

it('repeats on the same weekday through leap years and saves the entire series atomically',async()=>{
 expect(weeklyDates('2024-02-23',4)).toEqual(['2024-02-23','2024-03-01','2024-03-08','2024-03-15']);expect(()=>weeklyDates('2026-10-22',9)).toThrow();expect(()=>weeklyDates('2026-02-30',2)).toThrow();
 await plan();expect(await s.scheduleWorkout('2026-10-22','day','Stesso obiettivo','series',4)).toBe(true);
 const saved=await db.snapshot();expect(saved.scheduledWorkouts.map(e=>e.date).sort()).toEqual(['2026-10-22','2026-10-29','2026-11-05','2026-11-12']);expect(new Set(saved.scheduledWorkouts.map(e=>e.id)).size).toBe(4);
 expect(await s.scheduleWorkout('2026-10-15','day','','conflict',4)).toBe(false);expect((await db.snapshot()).scheduledWorkouts).toEqual(saved.scheduledWorkouts);
 expect(await s.scheduleWorkout('2026-10-23','day','Modificata','series')).toBe(true);expect(s.data().scheduledWorkouts.find(e=>e.id==='series')?.date).toBe('2026-10-23');expect(s.data().scheduledWorkouts).toHaveLength(4);
});
it('counts completed sessions on their actual date without double counting linked calendar entries',()=>{
 const d=seed(),w={id:'w',userId:'local',planId:'p',dayId:'day',planName:'Piano',dayName:'Giorno',date:'2026-10-21',startedAt:new Date().toISOString(),duration:60,notes:'',status:'completed' as const};d.workouts.push(w,{...w,id:'draft',date:'2026-10-22',status:'draft'});
 d.scheduledWorkouts.push({id:'e1',date:'2026-10-22',planId:'p',dayId:'day',planName:'Piano',dayName:'Giorno',notes:'',workoutId:'w'},{id:'e2',date:'2026-10-22',planId:'p',dayId:'other',planName:'Piano',dayName:'Altro',notes:'',workoutId:'draft'});
 d.meals.push({id:'m',date:'2026-10-22',name:'Pasto',grams:100,calories:450,protein:20,carbs:50,fat:15,notes:'',source:'manual',createdAt:new Date().toISOString()});
 const activity=calendarActivity(d);expect(activity.get('2026-10-21')).toMatchObject({completed:1,planned:0});expect(activity.get('2026-10-22')).toEqual({completed:0,planned:1,meals:1,calories:450});
});
it('opens deep links in the default week and limits month totals to the selected month',async()=>{
 routeDate='2026-10-22';await plan();for(const date of ['2026-09-30','2026-10-22','2026-11-01'])await s.scheduleWorkout(date,'day');
 const c=runInInjectionContext(injector,()=>new CalendarComponent());expect(c.view()).toBe('week');expect(c.selected()).toBe('2026-10-22');c.view.set('month');expect(c.periodStats().planned).toBe(1);expect(c.upcoming()).toHaveLength(0);c.view.set('week');c.choose('2026-12-30');expect(c.periodLabel()).toContain('2026');expect(c.periodLabel()).toContain('2027');c.choose('not-a-date');expect(c.selected()).toBe('2026-12-30');
});
it('filters linked sessions once and duplicates a program without changing history',async()=>{
 routeDate='2026-10-22';await plan();await s.scheduleWorkout('2026-10-22','day','','event');
 const c=runInInjectionContext(injector,()=>new CalendarComponent());expect(c.visibleEvents()).toHaveLength(1);c.filter.set('completed');expect(c.visibleEvents()).toHaveLength(0);c.filter.set('all');
 const w={id:'historic',userId:'local',planId:'p',dayId:'day',planName:'Piano',dayName:'Giorno',date:'2026-10-22',startedAt:new Date().toISOString(),duration:60,notes:'',status:'completed' as const};
 await s.change(d=>{d.workouts.push(w);d.scheduledWorkouts[0].workoutId=w.id;},'',false);expect(c.completed()).toHaveLength(0);expect(c.completedCount()).toBe(1);c.filter.set('planned');expect(c.visibleEvents()).toHaveLength(0);
 await c.duplicate(s.data().scheduledWorkouts[0]);expect(c.selected()).toBe('2026-10-29');expect(c.filter()).toBe('all');expect(c.visibleEvents()).toHaveLength(1);expect(c.visibleEvents()[0].workoutId).toBeUndefined();expect(s.completed()[0]).toEqual(w);expect((await db.snapshot()).scheduledWorkouts).toHaveLength(2);
});

it('saves a calendar form once across concurrent taps and keeps the same id when retrying after a failure',async()=>{
 await plan();const c=runInInjectionContext(injector,()=>new CalendarComponent());c.choose('2026-10-22');c.open();c.dayId='day';c.notes='Un solo allenamento';
 const schedule=vi.spyOn(s,'scheduleWorkout');
 await Promise.all([c.save(),c.save(),c.save()]);await c.save();
 expect(schedule).toHaveBeenCalledTimes(1);expect(s.data().scheduledWorkouts).toHaveLength(1);expect(c.saving()).toBe(false);
 c.choose('2026-10-23');c.open();c.dayId='day';schedule.mockResolvedValueOnce(false);
 await c.save();const attemptedId=schedule.mock.lastCall![3];expect(c.modal()).toBe(true);expect(c.saving()).toBe(false);
 await c.save();expect(schedule.mock.lastCall![3]).toBe(attemptedId);expect(s.data().scheduledWorkouts).toHaveLength(2);
});

it('a slow calendar save keeps a newer form and its selected date intact',async()=>{
 await plan();const c=runInInjectionContext(injector,()=>new CalendarComponent());c.choose('2026-10-22');c.open();c.dayId='day';c.notes='Prima programmazione';
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve),schedule=s.scheduleWorkout.bind(s);
 vi.spyOn(s,'scheduleWorkout').mockImplementationOnce(async(...args)=>{await pending;return schedule(...args);});
 const saving=c.save();expect(c.saving()).toBe(true);c.close();c.choose('2026-11-02');c.open();c.dayId='day';c.notes='Nuova bozza';
 release();await saving;
 expect(c.selected()).toBe('2026-11-02');expect(c.modal()).toBe(true);expect(c.eventDate).toBe('2026-11-02');expect(c.notes).toBe('Nuova bozza');
 expect(s.data().scheduledWorkouts).toMatchObject([{date:'2026-10-22',notes:'Prima programmazione'}]);
 await c.save();expect(s.data().scheduledWorkouts.map(e=>e.date).sort()).toEqual(['2026-10-22','2026-11-02']);
});

it('releases the calendar save lock after an unexpected failure and leaves the draft available',async()=>{
 await plan();const c=runInInjectionContext(injector,()=>new CalendarComponent());c.choose('2026-10-22');c.open();c.dayId='day';c.notes='Da riprovare';
 vi.spyOn(s,'scheduleWorkout').mockRejectedValueOnce(new Error('Archivio occupato'));
 await c.save();expect(c.saving()).toBe(false);expect(c.modal()).toBe(true);expect(c.notes).toBe('Da riprovare');expect(s.error()).toBe('Archivio occupato');
 await c.save();expect(s.data().scheduledWorkouts).toHaveLength(1);
});
it('annulla un allenamento iniziato: elimina serie e seduta aperta, ma l’appuntamento torna in programma',async()=>{
 await plan();await s.scheduleWorkout('2026-10-22','day','','event');await s.startScheduled('event');
 const w=s.draft()!,ex=s.workoutExercises(w.id)[0];await s.updateSet(s.sets(ex.id)[0].id,{completed:true,weight:80});
 expect(await s.cancelWorkout(w.id)).toBe(true);
 expect(s.draft()).toBeUndefined();expect(s.data().workouts).toEqual([]);expect(s.data().workoutExercises).toEqual([]);expect(s.data().sets).toEqual([]);
 const event=s.data().scheduledWorkouts.find(e=>e.id==='event')!;expect(event).toBeDefined();expect(event.workoutId).toBeUndefined();
 expect(await s.startScheduled('event')).toBe(true);await s.finish(true);
 expect(await s.cancelWorkout(s.data().workouts[0].id)).toBe(false);expect(s.data().workouts).toHaveLength(1);
});
it('di default il calendario mostra solo il piano attivo e le attività senza piano',async()=>{
 const {calendarPlanScope}=await import('../src/app/services/calendar-agenda');
 const data=seed();
 data.scheduledWorkouts.push(
  {id:'a',date:'2026-11-10',planId:'attivo',dayId:'d1',planName:'Attivo',dayName:'A',notes:''},
  {id:'b',date:'2026-11-10',planId:'vecchio',dayId:'d2',planName:'Vecchio',dayName:'B',notes:''},
  {id:'c',kind:'cardio',date:'2026-11-10',planId:'',dayId:'',planName:'',dayName:'Corsa',notes:''} as any);
 data.workouts.push({id:'w1',userId:'local',planId:'vecchio',dayId:'d2',planName:'Vecchio',dayName:'B',date:'2026-11-03',startedAt:'2026-11-03T08:00:00Z',duration:0,notes:'',status:'completed'} as any);
 const scoped=calendarPlanScope(data,'attivo');
 expect(scoped.scheduledWorkouts.map(e=>e.id)).toEqual(['a','c']);expect(scoped.workouts).toEqual([]);
 expect(calendarPlanScope(data,undefined)).toBe(data);
});
