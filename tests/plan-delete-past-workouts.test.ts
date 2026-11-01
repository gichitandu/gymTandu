import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {FormBuilder} from '@angular/forms';
import {ActivatedRoute,Router} from '@angular/router';
import {Subject} from 'rxjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {PlansComponent} from '../src/app/features/plans.component';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {SessionComponent} from '../src/app/features/session.component';
import {OpenWorkoutsComponent} from '../src/app/shared/open-workouts.component';
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
    {provide:Router,useValue:{events:new Subject<unknown>().asObservable(),navigateByUrl:vi.fn().mockResolvedValue(true)}},
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
it.each([true,false,undefined])('keeps the in-app recovery working without requesting notification permission with legacy preference %s',async enabled=>{
  await s.change(data=>{data.settings[0].externalTimerEnabled=enabled;},'',false);await s.start('day-a');const workout=s.draft()!,plans=structuredClone(s.data().plans);
  const c=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());active.push(c);Object.defineProperty(c,'workoutId',{value:()=>workout.id});
  const timer={requestAutomaticPermission:vi.fn(),stop:vi.fn(),sync:vi.fn()};Object.defineProperty(c,'externalTimer',{value:timer});
  const exercise=s.workoutExercises(workout.id)[0],set=s.sets(exercise.id)[0];c.open(exercise);c.record(set);c.weight=80;c.reps=8;
  await c.complete({timeStamp:1000} as MouseEvent);
  expect(c.step()).toBe('record');expect(c.remaining()).toBeGreaterThan(0);expect(timer.requestAutomaticPermission).not.toHaveBeenCalled();
  c.pauseRest();const paused=c.remaining();expect(c.paused()).toBe(true);c.adjustRest(15);expect(c.remaining()).toBe(paused+15);c.pauseRest();expect(c.paused()).toBe(false);expect(c.remaining()).toBe(paused+15);
  expect(s.sets(exercise.id)[0]).toMatchObject({id:set.id,completed:true,weight:80,reps:8});expect(s.data().plans).toEqual(plans);
});
it('closes an unconfirmed past session only after confirmation, preserving inputs and unlocking another date',async()=>{
  const past=moveDate(localDate(),-4);await s.start('day-a',past);
  const workout=s.draft()!,exercise=s.workoutExercises(workout.id)[0],set=s.sets(exercise.id)[0];
  await s.updateSet(set.id,{weight:77.5,reps:9,notes:'Dati inseriti',completed:false});
  const before=await db.snapshot();const confirm=vi.fn().mockReturnValue(false);vi.stubGlobal('confirm',confirm);
  const session=runInInjectionContext(injector,()=>new SessionComponent());sessions.push(session);
  await session.finish();expect(s.draft()?.id).toBe(workout.id);expect(await db.snapshot()).toEqual(before);
  confirm.mockReturnValue(true);await Promise.all([session.finish(),session.finish()]);
  expect(s.draft()).toBeUndefined();expect(s.completed()).toHaveLength(1);expect(s.completed()[0]).toMatchObject({id:workout.id,date:past});
  expect([...s.data().sets].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...before.sets].sort((a,b)=>a.id.localeCompare(b.id)));expect(s.data().plans).toEqual(before.plans);expect(s.data().planExercises).toEqual(before.planExercises);
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(await s.start('day-a',moveDate(localDate(),-2))).toBe(true);expect(s.draft()!.id).not.toBe(workout.id);
  expect(s.data().sets.find(item=>item.id===set.id)).toMatchObject({weight:77.5,reps:9,notes:'Dati inseriti',completed:false});
});
it('flushes the final edits before closing a past workout and stops its external timer',async()=>{
  await s.start('day-a',moveDate(localDate(),-3));const workout=s.draft()!;
  const c=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());active.push(c);Object.defineProperty(c,'workoutId',{value:()=>workout.id});
  const stop=vi.fn();Object.defineProperty(c,'externalTimer',{value:{stop,sync:vi.fn()}});
  c.quickRecord(s.workoutExercises(workout.id)[0]);c.weight=72.5;c.reps=12;c.inputChanged();
  vi.stubGlobal('confirm',vi.fn().mockReturnValue(true));
  const session=runInInjectionContext(injector,()=>new SessionComponent());sessions.push(session);Object.defineProperty(session,'activeWorkout',{value:()=>c});
  await session.finish();expect(s.draft()).toBeUndefined();expect(s.data().sets.find(set=>set.id===c.setId())).toMatchObject({weight:72.5,reps:12});expect(stop).toHaveBeenCalled();
});
it('identifies the blocking session and opens it directly when a different past date is requested',async()=>{
  const openDate=moveDate(localDate(),-4),requestedDate=moveDate(localDate(),-1);
  await s.start('day-a',openDate);const before=await db.snapshot();
  const component=runInInjectionContext(injector,()=>new PlansComponent());component.pastDates['day-a']=requestedDate;
  await component.startPast('day-a');
  expect(s.error()).toContain('Piano Tandu');expect(s.error()).toContain('Giorno A');expect(s.error()).toContain('Termina allenamento');
  expect(injector.get(Router).navigateByUrl).toHaveBeenCalledWith('/sessione?requestedDate='+requestedDate);
  expect(await db.snapshot()).toEqual(before);expect(component.startingPast()).toBe(false);
});

it('lists an unfinished workout and closes only the selected session after confirmation',async()=>{
  await complete(moveDate(localDate(),-7));await s.start('day-a',moveDate(localDate(),-4));const open=s.draft()!;
  const exercise=s.workoutExercises(open.id)[0];await s.updateSet(s.sets(exercise.id)[0].id,{weight:92.5,reps:9});
  const before=await db.snapshot();const component=runInInjectionContext(injector,()=>new OpenWorkoutsComponent());
  expect(s.openWorkouts().map(w=>w.id)).toEqual([open.id]);const confirm=vi.fn().mockReturnValue(false);vi.stubGlobal('confirm',confirm);
  await component.close(open.id);expect(await db.snapshot()).toEqual(before);
  confirm.mockReturnValue(true);await Promise.all([component.close(open.id),component.close(open.id)]);
  expect(s.openWorkouts()).toHaveLength(0);expect(s.completed()).toHaveLength(2);
  expect([...s.data().sets].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...before.sets].sort((a,b)=>a.id.localeCompare(b.id)));
  expect(s.data().plans).toEqual(before.plans);expect(s.data().workouts.find(w=>w.status==='completed'&&w.id!==open.id)).toEqual(before.workouts.find(w=>w.id!==open.id));
  expect(confirm).toHaveBeenCalledTimes(2);expect(component.closing()).toBe('');expect(await s.start('day-a',moveDate(localDate(),-1))).toBe(true);
});
it('does not close the current session when the requested id no longer exists',async()=>{
  await s.start('day-a');const before=await db.snapshot();await s.finish(true,'missing-session');expect(await db.snapshot()).toEqual(before);
});
it('uses the custom dialog to await a decision without modifying the archive underneath it',async()=>{
  const {ConfirmationService}=await import('../src/app/services/confirmation');const dialog=new ConfirmationService();
  const child=createEnvironmentInjector([{provide:ConfirmationService,useValue:dialog}],injector);
  await s.start('day-a',moveDate(localDate(),-1));const before=await db.snapshot(),id=s.draft()!.id;
  const component=runInInjectionContext(child,()=>new OpenWorkoutsComponent());
  const pending=component.close(id);expect(dialog.current()?.title).toBe('Terminare l’allenamento?');expect(dialog.current()?.detail).toContain('Piano Tandu');
  expect(await db.snapshot()).toEqual(before);await component.close(id);dialog.answer(false);await pending;expect(await db.snapshot()).toEqual(before);
  const accepted=component.close(id);dialog.answer(true);await accepted;expect(s.draft()).toBeUndefined();expect(s.completed()[0].id).toBe(id);
  expect([...s.data().sets].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...before.sets].sort((a,b)=>a.id.localeCompare(b.id)));child.destroy();
});
it('adds seven distinct workouts to one plan through the editor without replacing existing entries',async()=>{
  await complete(moveDate(localDate(),-1));const before=await db.snapshot();
  const component=runInInjectionContext(injector,()=>new PlansComponent());
  for(let index=1;index<7;index++){
    component.openDay('tandu-plan');component.dayForm.patchValue({name:'Allenamento '+(index+1),weekday:String(index)});await component.saveDay();
    expect(s.days('tandu-plan')).toHaveLength(index+1);
  }
  expect(new Set(s.days('tandu-plan').map(day=>day.id)).size).toBe(7);
  expect(s.days('tandu-plan').map(day=>day.order)).toEqual([0,1,2,3,4,5,6]);
  const after=await db.snapshot();for(const table of ['workouts','workoutExercises','sets','planExercises'] as const)expect(after[table]).toEqual(before[table]);
  expect(after.days.find(day=>day.id==='day-a')).toEqual(before.days[0]);
  expect(await s.saveDay('eighth','tandu-plan','Ottavo')).toBe(true);expect(s.days('tandu-plan')).toHaveLength(8);
  await s.duplicateDay('day-a');expect(s.days('tandu-plan')).toHaveLength(9);
  expect(await s.saveDay('day-a','tandu-plan','Primo aggiornato',0)).toBe(true);expect(s.days('tandu-plan')).toHaveLength(9);
  const restored=await importBackup(await exportBackup(s.data()));expect(restored.days).toHaveLength(9);expect(restored.workouts).toEqual(before.workouts);
});

it('protects finished workouts from deletion and reopens them without losing any recorded data',async()=>{
  const id=await complete(moveDate(localDate(),-3));const before=await db.snapshot();
  expect(await s.deleteWorkout(id)).toBe(false);expect(await db.snapshot()).toEqual(before);
  expect(await s.reopenWorkout(id)).toBe(true);expect(s.draft()!.id).toBe(id);expect(s.draft()!.date).toBe(before.workouts[0].date);expect(s.draft()!.endedAt).toBeUndefined();
  const after=await db.snapshot();expect(after.sets).toEqual(before.sets);expect(after.workoutExercises).toEqual(before.workoutExercises);expect(after.plans).toEqual(before.plans);
  expect(await s.finish()).toBe(true);expect(s.completed()[0].id).toBe(id);
});
it('does not replace a session already open when reopening a completed workout',async()=>{
  const id=await complete();await s.start('day-a');const before=await db.snapshot();expect(await s.reopenWorkout(id)).toBe(false);expect(await db.snapshot()).toEqual(before);
});

it('shows a live recovery clock after navigation and freezes elapsed time when paused',async()=>{
  const {WorkoutClockComponent}=await import('../src/app/shared/workout-clock.component');await s.start('day-a');const id=s.draft()!.id;
  const end=Date.now()+90000;
  const state={id,step:'rest' as const,tab:'sets' as const,exerciseId:'',setId:'',restEnd:end,restTotal:90,paused:false,pausedSeconds:0,weight:0,reps:8,setNotes:'',kind:'work' as const,updatedAt:new Date().toISOString()};
  await s.rememberWorkout(state);const widget=runInInjectionContext(injector,()=>new WorkoutClockComponent());
  try{widget.clock.set(end-45000);expect(widget.elapsed()).toBe(45);expect(widget.remaining()).toBe(45);
  widget.clock.set(end+15000);expect(widget.elapsed()).toBe(105);expect(widget.remaining()).toBe(0);
  await s.rememberWorkout({...state,paused:true,pausedSeconds:30});widget.clock.set(end+30000);expect(widget.elapsed()).toBe(60);expect(widget.remaining()).toBe(30);
  }finally{widget.ngOnDestroy();}
});
