import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {FormBuilder} from '@angular/forms';
import {ActivatedRoute,Router} from '@angular/router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {PlansComponent} from '../src/app/features/plans.component';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {SessionComponent} from '../src/app/features/session.component';
import {ActiveWorkoutComponent} from '../src/app/shared/active-workout.component';
import {localDate} from '../src/app/models/domain';
import {calendarActivity,moveDate} from '../src/app/services/calendar';
import {exportBackup,importBackup} from '../src/app/services/backup';

let db:GymDatabase,injector:EnvironmentInjector,s:Store;
const sessions:SessionComponent[]=[];
const active:ActiveWorkoutComponent[]=[];
beforeEach(async()=>{
  vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
  db=new GymDatabase('tandu-regression-'+crypto.randomUUID());
  injector=createEnvironmentInjector([
    {provide:GYM_REPOSITORY,useValue:{storageKey:db.name,read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},
    {provide:Router,useValue:{navigateByUrl:vi.fn().mockResolvedValue(true)}},
    {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}},FormBuilder,Store,
  ],null as unknown as EnvironmentInjector);
  s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
  await s.change(data=>{data.profiles[0].name='Tandu';},'',false);
  await s.savePlan('tandu-plan','Piano Tandu','Da conservare');
  await s.saveDay('day-a','tandu-plan','Giorno A');
  await s.savePlanExercise({id:'entry-a',dayId:'day-a',exerciseId:'exercise-0',sets:2,repsMin:8,repsMax:10,rest:90,notes:'Note personali',order:0,targetWeight:80});
});
afterEach(async()=>{for(const c of sessions.splice(0))c.ngOnDestroy();for(const c of active.splice(0))c.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function complete(date=localDate(),weight=80){
  expect(await s.start('day-a',date)).toBe(true);
  const w=s.draft()!,exercise=s.workoutExercises(w.id)[0];
  expect(await s.updateSet(s.sets(exercise.id)[0].id,{weight,reps:8,completed:true})).toBe(true);
  expect(await s.finish()).toBe(true);return w.id;
}
it('reopens the existing user archive without resetting its plan or records',async()=>{
  await complete();const before=await db.snapshot();await s.init();
  expect(await db.snapshot()).toEqual(before);expect(s.profile().name).toBe('Tandu');expect(s.data().plans[0].id).toBe('tandu-plan');
});
it('deletes only the chosen plan structure while retaining every recorded set, calendar snapshot and other plan',async()=>{
  await complete();await s.scheduleWorkout(localDate(),'day-a','Conserva evento','event');
  await s.savePlan('other','Altro piano','Intatto');await s.saveDay('other-day','other','Altro giorno');
  const before=await db.snapshot();
  expect(await s.deletePlan('tandu-plan')).toBe(true);
  const after=await db.snapshot();
  expect(after.plans).toEqual(before.plans.filter(p=>p.id!=='tandu-plan'));expect(after.days).toEqual(before.days.filter(d=>d.planId!=='tandu-plan'));expect(after.planExercises).toEqual([]);
  for(const name of ['profiles','settings','workouts','workoutExercises','sets','exercises','muscleGroups','scheduledWorkouts','meals','measurements'] as const)expect(after[name]).toEqual(before[name]);
  const restored=await importBackup(await exportBackup(after));expect(restored.workouts).toEqual(before.workouts);expect(restored.sets).toEqual(before.sets);
});
it('requires a named confirmation and does not call deletion when the user cancels',async()=>{
  const component=runInInjectionContext(injector,()=>new PlansComponent()),remove=vi.spyOn(s,'deletePlan'),before=await db.snapshot();
  const confirm=vi.fn().mockReturnValue(false);vi.stubGlobal('confirm',confirm);
  await component.removePlan(s.data().plans[0]);
  expect(confirm.mock.calls[0][0]).toContain('Piano Tandu');expect(remove).not.toHaveBeenCalled();expect(await db.snapshot()).toEqual(before);
  confirm.mockReturnValue(true);await component.removePlan(s.data().plans[0]);expect(remove).toHaveBeenCalledExactlyOnceWith('tandu-plan');
});
it('refuses to delete a plan belonging to an unfinished session',async()=>{
  await s.start('day-a');const before=await db.snapshot();
  expect(await s.deletePlan('tandu-plan')).toBe(false);expect(s.error()).toContain('sessione aperta');expect(await db.snapshot()).toEqual(before);
});
it('records a past workout on its chosen date and keeps its entered duration through completion and backup',async()=>{
  const past=moveDate(localDate(),-7),plan=structuredClone(s.data().plans[0]);
  expect(await s.start('day-a',past)).toBe(true);const w=s.draft()!,exercise=s.workoutExercises(w.id)[0];
  const session=runInInjectionContext(injector,()=>new SessionComponent());sessions.push(session);
  session.update(w.id,'duration',55);await s.settled();await s.updateSet(s.sets(exercise.id)[0].id,{weight:82.5,reps:8,completed:true});await session.finish();
  expect(s.completed()[0]).toMatchObject({id:w.id,date:past,duration:55});expect(s.data().plans[0]).toEqual(plan);expect(calendarActivity(s.data()).get(past)?.completed).toBe(1);
  const restored=await importBackup(await exportBackup(s.data()));expect(restored.workouts[0].date).toBe(past);expect(restored.workouts[0].duration).toBe(55);
});
it('preserves an already open session when another past date is selected',async()=>{
  await s.start('day-a');const before=await db.snapshot();
  expect(await s.start('day-a',moveDate(localDate(),-1))).toBe(false);expect(await db.snapshot()).toEqual(before);
});
it('rejects impossible/future dates and coalesces repeated starts without duplicating a workout',async()=>{
  const before=await db.snapshot();expect(await s.start('day-a','2026-02-30')).toBe(false);expect(await s.start('day-a',moveDate(localDate(),1))).toBe(false);expect(await db.snapshot()).toEqual(before);
  const past=moveDate(localDate(),-2);await Promise.all([s.start('day-a',past),s.start('day-a',past)]);expect(s.data().workouts).toHaveLength(1);expect(s.draft()!.date).toBe(past);
});
it('prefills from sessions before the selected date, without copying future records into a past workout',async()=>{
  await complete(moveDate(localDate(),-14),60);await complete(localDate(),100);
  await s.change(data=>{data.settings[0].prefill=true;},'',false);
  await s.start('day-a',moveDate(localDate(),-7));const w=s.draft()!,exercise=s.workoutExercises(w.id)[0];
  expect(s.sets(exercise.id)[0].weight).toBe(60);expect(s.previous('exercise-0',w.id)[0].weight).toBe(60);expect(s.completed()).toHaveLength(2);
});
it('starts an old calendar appointment on its own date',async()=>{
  const past=moveDate(localDate(),-3);await s.scheduleWorkout(past,'day-a','','old-event');
  const calendar=runInInjectionContext(injector,()=>new CalendarComponent());await calendar.start(s.data().scheduledWorkouts[0]);
  expect(s.draft()!.date).toBe(past);expect(s.data().scheduledWorkouts[0].workoutId).toBe(s.draft()!.id);
});
it('moves directly to the next historical set without a rest timer or notification permission prompt',async()=>{
  await s.start('day-a',moveDate(localDate(),-4));const w=s.draft()!;
  const c=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());active.push(c);Object.defineProperty(c,'workoutId',{value:()=>w.id});
  const timer={requestAutomaticPermission:vi.fn(),stop:vi.fn(),sync:vi.fn()};Object.defineProperty(c,'externalTimer',{value:timer});
  const exercise=s.workoutExercises(w.id)[0],sets=s.sets(exercise.id);c.open(exercise);c.record(sets[0]);c.weight=80;c.reps=8;
  await c.complete({timeStamp:1000} as MouseEvent);
  expect(c.recordingPast()).toBe(true);expect(c.step()).toBe('record');expect(c.currentSet()!.id).toBe(sets[1].id);expect(c.restEnd()).toBe(0);expect(timer.requestAutomaticPermission).not.toHaveBeenCalled();expect(s.sets(exercise.id)[0].completed).toBe(true);
});
