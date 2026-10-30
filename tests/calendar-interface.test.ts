import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {ActivatedRoute,Router} from '@angular/router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {ConfirmationService} from '../src/app/services/confirmation';

let db:GymDatabase,injector:EnvironmentInjector,s:Store,c:CalendarComponent;
const confirm=vi.fn().mockResolvedValue(true),navigate=vi.fn().mockResolvedValue(true);
beforeEach(async()=>{
 vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
 db=new GymDatabase('calendar-interface-'+crypto.randomUUID());
 injector=createEnvironmentInjector([
  {provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},
  {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}},
  {provide:Router,useValue:{navigateByUrl:navigate}},{provide:ConfirmationService,useValue:{ask:confirm}},Store,
 ],null as unknown as EnvironmentInjector);
 s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
 c=runInInjectionContext(injector,()=>new CalendarComponent());c.choose('2026-10-30');
 await s.savePlan('plan','Piano personale','');await s.saveDay('day','plan','Parte alta');
 await s.savePlanExercise({id:'exercise-entry',dayId:'day',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:10,rest:90,notes:'',order:0});
});
afterEach(async()=>{await s.settled();c.ngOnDestroy();injector.destroy();await db.delete();vi.clearAllMocks();vi.unstubAllGlobals();});

it('shows only the month rows needed while keeping complete Monday-first weeks',()=>{
 c.view.set('month');expect(c.dates()).toHaveLength(35);expect(c.dates()[0]).toBe('2026-09-28');expect(c.dates().at(-1)).toBe('2026-11-01');
 c.choose('2021-02-12');expect(c.dates()).toHaveLength(28);expect(c.dates()[0]).toBe('2021-02-01');expect(c.dates().at(-1)).toBe('2021-02-28');
});

it('duplicates into a reviewable new form and preserves metadata without copying completed state',async()=>{
 await s.scheduleCalendarActivity({id:'cardio',date:'2026-10-30',kind:'cardio',title:'Cardio HIIT',time:'11:00',notes:'Tapis roulant',durationMinutes:20,estimatedCalories:180,done:true});
 const before=structuredClone(s.data().scheduledWorkouts);c.quickDuplicate();
 expect(c.modal()).toBe(true);expect(c.formMode()).toBe('duplicate');expect(c.eventDate).toBe('2026-11-06');expect(c.eventTime).toBe('11:00');
 expect(c.durationMinutes).toBe(20);expect(c.estimatedCalories).toBe(180);expect(s.data().scheduledWorkouts).toEqual(before);
 await Promise.all([c.save(),c.save()]);
 const copy=s.data().scheduledWorkouts.find(event=>event.id!=='cardio')!;
 expect(copy).toMatchObject({date:'2026-11-06',kind:'cardio',dayName:'Cardio HIIT',time:'11:00',durationMinutes:20,estimatedCalories:180,notes:'Tapis roulant'});
 expect(copy.done).toBeUndefined();expect(s.data().scheduledWorkouts.find(event=>event.id==='cardio')).toEqual(before[0]);
});

it('moves a planned workout while preserving its identity, notes and estimates',async()=>{
 await s.scheduleWorkout('2026-10-30','day','Controlla la tecnica','scheduled',1,{time:'08:00',durationMinutes:55,estimatedCalories:310});
 c.quickMove();expect(c.formMode()).toBe('move');c.eventDate='2026-10-31';c.eventTime='09:30';await c.save();
 expect(s.data().scheduledWorkouts).toHaveLength(1);
 expect(s.data().scheduledWorkouts[0]).toMatchObject({id:'scheduled',date:'2026-10-31',time:'09:30',notes:'Controlla la tecnica',durationMinutes:55,estimatedCalories:310,dayId:'day'});
 expect(s.data().workouts).toEqual([]);
});

it('protects completed sessions in quick actions and opens their saved history',async()=>{
 await s.scheduleWorkout('2026-10-30','day','','scheduled');await s.startScheduled('scheduled','2026-10-30');
 const log=s.draft()!,exercise=s.workoutExercises(log.id)[0];await s.updateSet(s.sets(exercise.id)[0].id,{completed:true});await s.finish();
 const item=c.selectedItem()!,before=structuredClone(s.data());
 expect(item.status).toBe('completed');expect(c.canMove(item)).toBe(false);expect(c.canRemove(item)).toBe(false);expect(c.itemCanStart(item)).toBe(false);
 await c.quickRemove();expect(confirm).not.toHaveBeenCalled();await c.viewItem(item);
 expect(navigate).toHaveBeenCalledWith('/allenamenti?workout='+encodeURIComponent(log.id));expect(s.data()).toEqual(before);
});

it('uses the selected row for quick actions and keeps filters and statistics separate from meal calories',async()=>{
 await s.scheduleCalendarActivity({id:'rest',date:'2026-10-30',kind:'rest',title:'Riposo',time:'09:00'});
 await s.scheduleCalendarActivity({id:'cardio',date:'2026-10-30',kind:'cardio',title:'Corsa',time:'11:00',estimatedCalories:0});
 await s.change(data=>{data.meals.push({id:'meal',date:'2026-10-30',name:'Pasto',grams:100,calories:500,protein:10,carbs:50,fat:10,notes:'',source:'manual',createdAt:new Date().toISOString()});},'',false);
 expect(c.dayStats()).toMatchObject({total:1,rest:1,estimatedCalories:0,hasCalories:true,hasDuration:false});
 c.selectFilter('rest');expect(c.visibleAgenda().map(item=>item.id)).toEqual(['event:rest']);
 c.selectFilter('all');c.selectItem(c.agendaItems().find(item=>item.id==='event:cardio')!);c.quickMove();
 expect(c.activityTitle).toBe('Corsa');expect(c.eventTime).toBe('11:00');c.close();
 expect(c.dateMarkers('2026-10-30').map(marker=>marker.kind)).toEqual(expect.arrayContaining(['rest','cardio']));
});

it('confirms removing a planned row and preserves workouts and exercises',async()=>{
 await s.scheduleWorkout('2026-10-30','day','','scheduled');const before=structuredClone(s.data());
 await c.quickRemove();expect(confirm).toHaveBeenCalledTimes(1);expect(s.data().scheduledWorkouts).toEqual([]);
 expect(s.data().workouts).toEqual(before.workouts);expect(s.data().planExercises).toEqual(before.planExercises);expect(s.data().plans).toEqual(before.plans);
});

it('keeps a preserved historical link protected when the linked session is unavailable',async()=>{
 await s.scheduleWorkout('2026-10-30','day','','scheduled');
 await s.change(data=>{data.scheduledWorkouts[0].workoutId='sessione-non-disponibile';},'',false);
 const event=s.data().scheduledWorkouts[0],item=c.selectedItem()!;
 expect(item.workout).toBeUndefined();expect(c.canMove(item)).toBe(false);
 c.quickMove();expect(c.modal()).toBe(false);c.open(event);expect(c.modal()).toBe(false);
 expect(s.data().scheduledWorkouts[0]).toEqual(event);
});
