import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {Router} from '@angular/router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Store} from '../src/app/services/store';
import {WorkoutResumeService} from '../src/app/services/workout-resume';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {WorkoutClockComponent} from '../src/app/shared/workout-clock.component';
import {recordingTimerState,toggleWorkoutTimer} from '../src/app/services/workout-timer';
import {WorkoutUiState} from '../src/app/models/domain';
let db:GymDatabase,injector:EnvironmentInjector,s:Store,widget:WorkoutClockComponent;
let state:WorkoutUiState;const route={url:'/progressi',navigateByUrl:vi.fn().mockResolvedValue(true)};
beforeEach(async()=>{
 const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubGlobal('document',Object.assign(new EventTarget(),{body:{classList:{toggle:()=>{}}}}));
 route.url='/progressi';route.navigateByUrl.mockClear();
 db=new GymDatabase('timer-dock-'+crypto.randomUUID());injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{revision:()=>db.currentRevision(),read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},{provide:Router,useValue:route},WorkoutResumeService,Store],null as unknown as EnvironmentInjector);
 s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));await s.savePlan('p','Piano','');await s.saveDay('d','p','Parte alta');await s.savePlanExercise({id:'pe',dayId:'d',exerciseId:'exercise-0',sets:2,repsMin:8,repsMax:10,rest:90,notes:'',order:0});await s.start('d');
 const exercise=s.workoutExercises(s.draft()!.id)[0],set=s.sets(exercise.id)[0];const now=Date.now();state={id:s.draft()!.id,step:'record',tab:'sets',exerciseId:exercise.id,setId:set.id,restEnd:now+90000,restTotal:90,paused:false,pausedSeconds:0,weight:25,reps:9,setNotes:'Da conservare',kind:'work',updatedAt:new Date(now).toISOString()};
 await s.rememberWorkout(state);widget=runInInjectionContext(injector,()=>new WorkoutClockComponent());
});
afterEach(async()=>{widget.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('pauses durably, freezes time through navigation, then resumes with a fresh absolute deadline',async()=>{
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+30000);widget.clock.set(now+30000);const before=structuredClone(s.data());await widget.toggle();
 const paused=s.data().workoutUi[0];expect(paused.paused).toBe(true);expect(paused.pausedSeconds).toBeGreaterThanOrEqual(59);expect(paused.pausedSeconds).toBeLessThanOrEqual(60);
 const remaining=widget.remaining();route.url='/calendario';widget.clock.set(now+100000);expect(widget.remaining()).toBe(remaining);
 vi.mocked(Date.now).mockReturnValue(now+100000);await widget.toggle();expect(s.data().workoutUi[0].restEnd).toBe(now+100000+remaining*1000);expect(s.data().workoutUi[0].paused).toBe(false);
 expect(s.data().sets).toEqual(before.sets);expect(s.data().workouts).toEqual(before.workouts);
});
it('returns directly to current pending inputs without changing weight, reps, notes or timer',async()=>{
 const before=structuredClone(s.data());await widget.returnToRecording();expect(route.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/sessione');
 expect(s.data().workoutUi[0]).toMatchObject({step:'record',setId:state.setId,weight:25,reps:9,setNotes:'Da conservare',restEnd:state.restEnd});expect(s.data().sets).toEqual(before.sets);
});
it('opens the next incomplete set after recovery instead of editing the saved completed one',async()=>{
 await s.updateSet(state.setId,{weight:25,reps:8,completed:true});await s.rememberWorkout({...state,step:'rest'});const next=s.sets(state.exerciseId)[1];await widget.returnToRecording();
 expect(s.data().workoutUi[0]).toMatchObject({step:'record',setId:next.id,exerciseId:next.workoutExerciseId,restEnd:state.restEnd});expect(s.data().sets.find(set=>set.id===state.setId)?.completed).toBe(true);
});
it('does not overwrite the live recording screen and suppresses repeated control taps',async()=>{
 route.url='/sessione';const before=structuredClone(s.data().workoutUi);await widget.toggle();expect(s.data().workoutUi).toEqual(before);
 route.url='/profilo';await Promise.all([widget.toggle(),widget.toggle()]);expect(s.data().workoutUi[0].paused).toBe(true);
});
it('cancels a pending action when the active session changes',async()=>{
 let release!:(value:boolean)=>void;vi.spyOn(s,'settled').mockReturnValueOnce(new Promise(resolve=>release=resolve));const pending=widget.toggle();await s.finish(true);release(true);await pending;expect(widget.state()).toBeUndefined();expect(s.completed()).toHaveLength(1);
});
it('uses a newer revision-compatible resume journal and never revives an obsolete one',()=>{
 const resume=injector.get(WorkoutResumeService),newer={...state,paused:true,pausedSeconds:37,updatedAt:new Date(Date.parse(state.updatedAt)+1000).toISOString()};
 resume.write(s.archiveKey(),newer,s.archiveRevision());widget.clock.set(Date.parse(state.updatedAt)+10000);expect(widget.remaining()).toBe(37);
 resume.write(s.archiveKey(),newer,(s.archiveRevision()||0)+1);widget.clock.set(Date.parse(state.updatedAt)+20000);expect(widget.state()?.paused).toBe(false);
});
it('uses monotonic timestamps and freezes seconds without corrupting pending input fields',()=>{
 const now=Date.parse(state.updatedAt);const paused=toggleWorkoutTimer(state,now);expect(paused.updatedAt>state.updatedAt).toBe(true);expect(paused.weight).toBe(25);expect(paused.setNotes).toBe('Da conservare');
 const returned=recordingTimerState(paused,s.data(),now);expect(returned.updatedAt>paused.updatedAt).toBe(true);expect(returned.restEnd).toBe(state.restEnd);expect(returned.paused).toBe(true);
});
