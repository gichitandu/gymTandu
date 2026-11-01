import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {ActivatedRoute,Router} from '@angular/router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {WorkoutsComponent} from '../src/app/features/workouts.component';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {ConfirmationService} from '../src/app/services/confirmation';
import {exportBackup,importBackup} from '../src/app/services/backup';
import {localDate} from '../src/app/models/domain';
import {calendarAgenda} from '../src/app/services/calendar-agenda';
import {calendarActivity,moveDate} from '../src/app/services/calendar';
let db:GymDatabase,injector:EnvironmentInjector,s:Store,id:string;
const ask=vi.fn().mockResolvedValue(true);const calendars:CalendarComponent[]=[];
beforeEach(async()=>{ask.mockReset().mockResolvedValue(true);vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});db=new GymDatabase('completed-delete-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}},{provide:Router,useValue:{navigateByUrl:vi.fn()}},{provide:ConfirmationService,useValue:{ask}},Store],null as unknown as EnvironmentInjector);s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));await s.savePlan('p','Piano da conservare','');await s.saveDay('d','p','Parte alta');await s.savePlanExercise({id:'pe',dayId:'d',exerciseId:'exercise-0',sets:1,repsMin:8,repsMax:10,rest:90,notes:'',order:0});await s.scheduleWorkout(localDate(),'d','','schedule');await s.startScheduled('schedule');id=s.draft()!.id;await s.updateSet(s.sets(s.workoutExercises(id)[0].id)[0].id,{completed:true,weight:24,reps:8});await s.finish();});
afterEach(async()=>{for(const calendar of calendars.splice(0))calendar.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.unstubAllGlobals();});
function enable(value=true){return s.change(data=>{data.settings[0].allowCompletedWorkoutDeletion=value;},'',false);}
function history(){return runInInjectionContext(injector,()=>new WorkoutsComponent());}
it('defaults to protection and requires both the saved preference and explicit confirmation',async()=>{const before=await db.snapshot();expect(await s.deleteWorkout(id,{confirmedCompleted:true})).toBe(false);expect(await db.snapshot()).toEqual(before);await enable();expect(await s.deleteWorkout(id)).toBe(false);expect(s.completed()).toHaveLength(1);await enable(false);expect(await s.deleteWorkout(id,{confirmedCompleted:true})).toBe(false);});
it('leaves all data unchanged when confirmation is cancelled',async()=>{await enable();ask.mockResolvedValueOnce(false);const before=await db.snapshot();await history().remove(id);expect(ask).toHaveBeenCalledTimes(1);expect(await db.snapshot()).toEqual(before);});
it('deletes the confirmed session, series and linked appointment while preserving its plan',async()=>{await enable();const before=await db.snapshot(),c=history();c.selectedId.set(id);await Promise.all([c.remove(id),c.remove(id)]);expect(ask).toHaveBeenCalledTimes(1);const after=await db.snapshot();expect(after.workouts).toEqual([]);expect(after.workoutExercises).toEqual([]);expect(after.sets).toEqual([]);expect(after.plans).toEqual(before.plans);expect(after.planExercises).toEqual(before.planExercises);expect(after.scheduledWorkouts).toEqual([]);expect(calendarAgenda(after,localDate())).toEqual([]);expect(c.selectedId()).toBe('');});
it('rechecks a setting disabled while the confirmation is open',async()=>{await enable();let answer!:(value:boolean)=>void;ask.mockReturnValueOnce(new Promise(resolve=>answer=resolve));const pending=history().remove(id);await enable(false);answer(true);await pending;expect(s.completed()).toHaveLength(1);});
it('removes the calendar row and markers after confirmed deletion, with protection enabled by default',async()=>{const c=runInInjectionContext(injector,()=>new CalendarComponent());calendars.push(c);c.choose(localDate());expect(c.canRemove()).toBe(false);await enable();expect(c.canRemove()).toBe(true);await c.quickRemove();expect(ask).toHaveBeenCalledTimes(1);expect(s.completed()).toEqual([]);expect(s.data().scheduledWorkouts).toEqual([]);expect(c.agendaItems()).toEqual([]);expect(c.selectedItem()).toBeUndefined();expect(c.dateMarkers(localDate())).toEqual([]);expect(c.dayStats()).toMatchObject({total:0,completed:0});expect(calendarActivity(s.data()).get(localDate())?.completed||0).toBe(0);});
it('preserves the preference through backup and accepts older archives with protection as default',async()=>{await enable();expect((await importBackup(await exportBackup(s.data()))).settings[0].allowCompletedWorkoutDeletion).toBe(true);const old=JSON.parse(await exportBackup(s.data()));old.schemaVersion=9;delete old.data.settings[0].allowCompletedWorkoutDeletion;const restored=await importBackup(JSON.stringify(old));expect(restored.settings[0].allowCompletedWorkoutDeletion).toBeUndefined();expect(restored.workouts).toEqual(s.data().workouts);old.data.settings[0].allowCompletedWorkoutDeletion='yes';await expect(importBackup(JSON.stringify(old))).rejects.toThrow();});
it('reopens an automatically completed plan when deleting its completed session',async()=>{await enable();await s.change(data=>{data.plans[0].completionReason='automatic';data.plans[0].completedAt=new Date().toISOString();data.plans[0].archived=true;},'',false);expect(await s.deleteWorkout(id,{confirmedCompleted:true})).toBe(true);expect(s.data().plans[0].completedAt).toBeUndefined();expect(s.data().plans[0].archived).toBe(false);expect(s.data().scheduledWorkouts).toEqual([]);});
it('keeps the selected session and calendar unchanged when calendar confirmation is cancelled',async()=>{
 await enable();const c=runInInjectionContext(injector,()=>new CalendarComponent());calendars.push(c);c.choose(localDate());const before=await db.snapshot();ask.mockResolvedValueOnce(false);
 await c.quickRemove();expect(await db.snapshot()).toEqual(before);expect(c.agendaItems()).toHaveLength(1);expect(c.actionBusy()).toBe(false);
});
it('removes every link to the selected session without deleting other appointments on the same day',async()=>{
 await enable();await s.saveDay('other-day','p','Parte bassa');expect(await s.scheduleWorkout(localDate(),'other-day','Da conservare','other-schedule',1,{time:'18:00'})).toBe(true);
 await s.change(data=>{data.scheduledWorkouts.push({...data.scheduledWorkouts.find(event=>event.id==='schedule')!,id:'old-link',date:moveDate(localDate(),-1)});},'',false);
 const unrelated=structuredClone(s.data().scheduledWorkouts.find(event=>event.id==='other-schedule'));
 await history().remove(id);const after=await db.snapshot();expect(after.scheduledWorkouts).toEqual([unrelated]);expect(calendarAgenda(after,moveDate(localDate(),-1))).toEqual([]);expect(calendarAgenda(after,localDate()).map(item=>item.id)).toEqual(['event:other-schedule']);
 const restored=await importBackup(await exportBackup(after));expect(restored.scheduledWorkouts).toEqual([unrelated]);expect(restored.workouts).toEqual([]);
});
it.each([true,false])('deletes an open calendar workout and its series, linked appointment: %s',async linked=>{
 await s.reopenWorkout(id);if(!linked)await s.removeCalendarEvent('schedule');
 const c=runInInjectionContext(injector,()=>new CalendarComponent());calendars.push(c);c.choose(localDate());const plan=structuredClone(s.data().plans);
 expect(c.selectedItem()?.status).toBe('partial');expect(c.canRemove()).toBe(true);await Promise.all([c.quickRemove(),c.quickRemove()]);
 expect(ask).toHaveBeenCalledTimes(1);expect(s.data().workouts).toEqual([]);expect(s.data().sets).toEqual([]);expect(s.data().scheduledWorkouts).toEqual([]);expect(c.agendaItems()).toEqual([]);expect(s.data().plans).toEqual(plan);
});
