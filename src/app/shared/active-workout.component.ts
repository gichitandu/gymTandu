import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { WorkoutLogExercise, WorkoutLogSet, WorkoutUiState } from '../models/domain';
import { ExerciseThumbComponent } from './exercise-thumb.component';
import { ExerciseVideoComponent } from './exercise-video.component';
import { MuscleMapComponent } from './muscle-map.component';
import { MachineSetupComponent } from './machine-setup.component';
import { remainingSeconds, formatSeconds } from '../services/rest-clock';
import { setupSummary,supersetNext } from '../services/training-flow';
import { validWorkoutUi,WorkoutResumeService } from '../services/workout-resume';
import { IconComponent } from './icon.component';
import { LoadProgressionComponent } from './load-progression.component';
@Component({selector:'gt-active-workout',standalone:true,imports:[FormsModule,LoadProgressionComponent,MachineSetupComponent,MuscleMapComponent,ExerciseThumbComponent,ExerciseVideoComponent,IconComponent],templateUrl:'./active-workout.component.html'})
export class ActiveWorkoutComponent {
 committing=signal(false);s=inject(Store);resume=inject(WorkoutResumeService,{optional:true})||new WorkoutResumeService();workoutId=input.required<string>();finish=output<void>();
 step=signal<WorkoutUiState['step']>('list');tab=signal<WorkoutUiState['tab']>('sets');exerciseId=signal('');setId=signal('');clock=signal(Date.now());restEnd=signal(0);paused=signal(false);pausedSeconds=signal(0);restTotal=signal(90);
 weight=0;reps=8;rpe:number|undefined;setNotes='';kind:'work'|'warmup'='work';rpes=[1,2,3,4,5,6,6.5,7,7.5,8,8.5,9,9.5,10];
 private destroyed=false;private timer=setInterval(()=>this.clock.set(Date.now()),1000);private persistTimer:ReturnType<typeof setTimeout>|undefined;private inputTimer:ReturnType<typeof setTimeout>|undefined;
 exercises=computed(()=>this.s.workoutExercises(this.workoutId()));selected=computed(()=>this.exercises().find(e=>e.id===this.exerciseId()));allSets=computed(()=>this.exercises().flatMap(e=>this.s.sets(e.id)));completedSets=computed(()=>this.allSets().filter(s=>s.completed).length);currentSet=computed(()=>this.allSets().find(s=>s.id===this.setId()));
 flowIndex=computed(()=>this.step()==='list'?(this.allSets().length>0&&this.completedSets()===this.allSets().length?4:0):this.step()==='detail'?1:this.step()==='record'?2:3);
 previous=computed(()=>{const e=this.selected();return e?this.s.previous(e.exerciseId,e.workoutId,e.machineSetup):[];});
 remaining=computed(()=>this.paused()?this.pausedSeconds():remainingSeconds(this.restEnd(),this.clock()));restRatio=computed(()=>Math.min(100,this.remaining()/Math.max(1,this.restTotal())*100));
 nextExercise=computed(()=>{const current=this.selected();if(current){if(this.currentSet()?.kind==='warmup'&&this.s.sets(current.id).some(s=>!s.completed))return current;const next=supersetNext(this.exercises(),this.allSets(),current.id).next;if(next)return next;if(this.s.sets(current.id).some(s=>!s.completed))return current;}return this.exercises().find(e=>this.s.sets(e.id).some(s=>!s.completed));});
 ngOnInit(){this.restore();}
 restore(){const state=this.resume.read(this.s.archiveKey(),this.workoutId(),this.s.data().workoutUi.find(x=>x.id===this.workoutId()));if(!state)return;const ex=this.exercises().find(e=>e.id===state.exerciseId),set=this.allSets().find(x=>x.id===state.setId&&x.workoutExerciseId===ex?.id);this.exerciseId.set(ex?.id||'');this.setId.set(set?.id||'');this.tab.set(state.tab);this.step.set(state.step==='list'?'list':!ex?'list':state.step==='record'&&!set?'detail':state.step);this.restEnd.set(state.restEnd);this.restTotal.set(state.restTotal);this.paused.set(state.paused);this.pausedSeconds.set(state.pausedSeconds);this.weight=this.s.weight(state.weight);this.reps=state.reps;this.rpe=state.rpe;this.setNotes=state.setNotes;this.kind=state.kind;this.clock.set(Date.now());if(this.step()==='record')void this.saveDraft();}
 snapshot():WorkoutUiState{return{id:this.workoutId(),step:this.step(),tab:this.tab(),exerciseId:this.exerciseId(),setId:this.setId(),restEnd:this.restEnd(),restTotal:this.restTotal(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),weight:this.s.kg(this.weight),reps:this.reps,rpe:this.rpe,setNotes:this.setNotes,kind:this.kind,updatedAt:new Date().toISOString()};}
 remember(immediate=false){if(this.destroyed)return;if(this.s.draft()?.id!==this.workoutId()){this.resume.clear(this.s.archiveKey());return;}const state=this.snapshot();if(!validWorkoutUi(state))return;const cached=this.resume.write(this.s.archiveKey(),state);clearTimeout(this.persistTimer);if(immediate||!cached)void this.s.rememberWorkout(state);else this.persistTimer=setTimeout(()=>void this.s.rememberWorkout(state),300);}
 inputChanged(){this.remember();clearTimeout(this.inputTimer);this.inputTimer=setTimeout(()=>void this.saveDraft(),200);}
 @HostListener('window:pagehide') flush(){this.clock.set(Date.now());this.remember(true);if(this.s.draft()?.id===this.workoutId()&&this.step()==='record')void this.saveDraft();}
 @HostListener('document:visibilitychange') visibility(){this.clock.set(Date.now());this.remember(true);if(document.visibilityState==='hidden'&&this.step()==='record')void this.saveDraft();}
 navigate(step:WorkoutUiState['step']){if(this.step()==='record')void this.saveDraft();this.step.set(step);this.remember();}
 setTab(tab:WorkoutUiState['tab']){this.tab.set(tab);this.remember();}
 muscle(e:WorkoutLogExercise){return this.s.muscle(this.s.exercise(e.exerciseId)?.muscleGroupId||'');}
 secondary(e:WorkoutLogExercise){return (this.s.exercise(e.exerciseId)?.secondaryMuscleIds||[]).map(id=>this.s.muscle(id));}
 setupLabel= (e:WorkoutLogExercise)=>setupSummary(e.machineSetup);
 hasPair(e:WorkoutLogExercise){return !!e.superset&&this.exercises().filter(x=>x.superset===e.superset).length===2;}
 count(id:string){return this.s.sets(id).filter(s=>s.completed).length;}
 open(e:WorkoutLogExercise){this.exerciseId.set(e.id);this.tab.set('sets');this.step.set('detail');this.remember();}
 record(set:WorkoutLogSet){clearTimeout(this.inputTimer);this.setId.set(set.id);this.weight=this.s.weight(set.weight);this.reps=set.reps;this.rpe=set.rpe;this.setNotes=set.notes||'';this.kind=set.kind||'work';this.step.set('record');this.remember();}
 nextRecord(){const e=this.selected();if(!e)return;const sets=this.s.sets(e.id),set=sets.find(s=>!s.completed)||sets[0];if(set)this.record(set);}
 adjustWeight(delta:number){this.weight=Math.max(0,+(this.weight+delta).toFixed(2));this.inputChanged();}
 adjustReps(delta:number){this.reps=Math.min(999,Math.max(1,this.reps+delta));this.inputChanged();}
 async saveDraft(completed?:boolean){const set=this.currentSet();if(!set)return false;if(!Number.isFinite(this.weight)||this.weight<0||!Number.isInteger(this.reps)||this.reps<1||this.reps>999){this.s.error.set('Controlla peso e ripetizioni.');return false;}const ok=await this.s.updateSet(set.id,{weight:this.s.kg(this.weight),reps:this.reps,rpe:this.rpe,notes:this.setNotes,kind:this.kind,...(completed===undefined?{}:{completed})});if(ok)this.remember();return ok;}
 async complete(){if(this.committing())return;this.committing.set(true);clearTimeout(this.inputTimer);try{if(!await this.saveDraft(true))return;const current=this.selected(),handoff=current?supersetNext(this.exercises(),this.allSets(),current.id):undefined;if(this.kind!=='warmup'&&handoff?.immediate&&handoff.next){this.restEnd.set(0);this.paused.set(false);this.exerciseId.set(handoff.next.id);this.nextRecord();this.s.message.set('Superset '+current?.superset+': passa a '+handoff.next.name+'.');return;}const rest=this.currentSet()?.rest??this.selected()?.rest??90;this.clock.set(Date.now());this.restTotal.set(rest);this.paused.set(false);this.restEnd.set(Date.now()+rest*1000);this.step.set('rest');this.remember(true);}finally{this.committing.set(false);}}
 pauseRest(){this.clock.set(Date.now());if(this.paused()){this.restEnd.set(Date.now()+this.pausedSeconds()*1000);this.paused.set(false);}else{this.pausedSeconds.set(this.remaining());this.paused.set(true);}this.remember(true);}
 adjustRest(delta:number){const seconds=Math.min(7200,Math.max(0,this.remaining()+delta));this.restTotal.set(Math.max(this.restTotal(),seconds));if(this.paused())this.pausedSeconds.set(seconds);else{this.clock.set(Date.now());this.restEnd.set(Date.now()+seconds*1000);}this.remember(true);}
 formatSeconds=formatSeconds;
 advance(){this.restEnd.set(0);this.paused.set(false);const next=this.nextExercise();if(next){this.exerciseId.set(next.id);this.nextRecord();}else this.navigate('list');this.remember();}
 async usePrevious(id:string){if(this.count(id)&&!confirm('Sostituire le serie allenanti di questo esercizio con gli ultimi valori? Le serie di riscaldamento restano conservate.'))return;await this.s.copyPrevious(id);this.setId.set('');this.remember();}
 saveNotes(id:string,notes:string){void this.s.change(d=>{const e=d.workoutExercises.find(e=>e.id===id);if(e)e.notes=notes;},'',false);}
 async removeSet(set:WorkoutLogSet){if(!set.completed||confirm('Eliminare questa serie completata?'))if(await this.s.removeSet(set.id)){this.setId.set('');this.navigate('detail');}}
 ngOnDestroy(){clearInterval(this.timer);clearTimeout(this.inputTimer);clearTimeout(this.persistTimer);this.flush();this.destroyed=true;}
}
