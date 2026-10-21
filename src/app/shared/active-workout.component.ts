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
import { ExternalTimerService } from '../services/external-timer';
import type { AppUpdateEvent } from '../services/pwa';
@Component({selector:'gt-active-workout',standalone:true,imports:[FormsModule,LoadProgressionComponent,MachineSetupComponent,MuscleMapComponent,ExerciseThumbComponent,ExerciseVideoComponent,IconComponent],templateUrl:'./active-workout.component.html',styleUrls:['./recording.css']})
export class ActiveWorkoutComponent {
 externalTimer=inject(ExternalTimerService,{optional:true});
 committing=signal(false);s=inject(Store);resume=inject(WorkoutResumeService,{optional:true})||new WorkoutResumeService();workoutId=input.required<string>();finish=output<void>();
 step=signal<WorkoutUiState['step']>('list');tab=signal<WorkoutUiState['tab']>('sets');exerciseId=signal('');setId=signal('');clock=signal(Date.now());restEnd=signal(0);paused=signal(false);pausedSeconds=signal(0);restTotal=signal(90);
 weight=0;reps=8;rpe:number|undefined;setNotes='';kind:'work'|'warmup'='work';rpes=[1,2,3,4,5,6,6.5,7,7.5,8,8.5,9,9.5,10];
 private inputDrafts=new Map<string,{weight:number;reps:number;rpe:number|undefined;setNotes:string;kind:'work'|'warmup'}>();
 private lastCompletionClick=-Infinity;
 private destroyed=false;private timer=setInterval(()=>this.clock.set(Date.now()),1000);private persistTimer:ReturnType<typeof setTimeout>|undefined;private inputTimer:ReturnType<typeof setTimeout>|undefined;
 exercises=computed(()=>this.s.workoutExercises(this.workoutId()));selected=computed(()=>this.exercises().find(e=>e.id===this.exerciseId()));allSets=computed(()=>this.exercises().flatMap(e=>this.s.sets(e.id)));completedSets=computed(()=>this.allSets().filter(s=>s.completed).length);currentSet=computed(()=>this.allSets().find(s=>s.id===this.setId()));
 flowIndex=computed(()=>this.step()==='list'?(this.allSets().length>0&&this.completedSets()===this.allSets().length?4:0):this.step()==='detail'?1:this.step()==='record'?2:3);
 previous=computed(()=>{const e=this.selected();return e?this.s.previous(e.exerciseId,e.workoutId,e.machineSetup):[];});
 remaining=computed(()=>this.paused()?this.pausedSeconds():remainingSeconds(this.restEnd(),this.clock()));restRatio=computed(()=>Math.min(100,this.remaining()/Math.max(1,this.restTotal())*100));
 nextExercise=computed(()=>{const current=this.selected();if(current){if(this.currentSet()?.kind==='warmup'&&this.s.sets(current.id).some(s=>!s.completed))return current;const next=supersetNext(this.exercises(),this.allSets(),current.id).next;if(next)return next;if(this.s.sets(current.id).some(s=>!s.completed))return current;}return this.exercises().find(e=>this.s.sets(e.id).some(s=>!s.completed));});
 ngOnInit(){this.restore();}
 restore(){const state=this.resume.read(this.s.archiveKey(),this.workoutId(),this.s.data().workoutUi.find(x=>x.id===this.workoutId()),this.s.archiveRevision());if(!state)return;const ex=this.exercises().find(e=>e.id===state.exerciseId),set=this.allSets().find(x=>x.id===state.setId&&x.workoutExerciseId===ex?.id);this.exerciseId.set(ex?.id||'');this.setId.set(set?.id||'');this.tab.set(state.tab);this.step.set(state.step==='list'?'list':!ex?'list':state.step==='record'&&!set?'detail':state.step);this.restEnd.set(state.restEnd);this.restTotal.set(state.restTotal);this.paused.set(state.paused);this.pausedSeconds.set(state.pausedSeconds);this.weight=this.s.weight(state.weight);this.reps=state.reps;this.rpe=state.rpe;this.setNotes=state.setNotes;this.kind=state.kind;this.clock.set(Date.now());if(this.step()==='record')void this.saveDraft();this.syncExternalTimer();}
 snapshot():WorkoutUiState{return{id:this.workoutId(),step:this.step(),tab:this.tab(),exerciseId:this.exerciseId(),setId:this.setId(),restEnd:this.restEnd(),restTotal:this.restTotal(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),weight:this.s.kg(this.weight),reps:this.reps,rpe:this.rpe,setNotes:this.setNotes,kind:this.kind,updatedAt:new Date().toISOString()};}
 remember(immediate=false){if(this.s.conflicted())return;this.syncExternalTimer();if(this.destroyed)return;if(this.s.draft()?.id!==this.workoutId()){this.resume.clear(this.s.archiveKey());return;}const state=this.snapshot();if(!validWorkoutUi(state))return;const cached=this.resume.write(this.s.archiveKey(),state,this.s.archiveRevision());clearTimeout(this.persistTimer);if(immediate||!cached)void this.s.rememberWorkout(state);else this.persistTimer=setTimeout(()=>void this.s.rememberWorkout(state),300);}
 captureInputs(){const inputs={weight:this.weight,reps:this.reps,rpe:this.rpe,setNotes:this.setNotes,kind:this.kind};if(this.setId())this.inputDrafts.set(this.setId(),inputs);return inputs;}
 inputChanged(){this.captureInputs();this.remember();clearTimeout(this.inputTimer);this.inputTimer=setTimeout(()=>void this.saveDraft(),200);}
 @HostListener('window:gymtrack:before-update',['$event']) beforeUpdate(event:Event){(event as AppUpdateEvent).waitUntil(this.flushForFinish());}
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
 quickRecord(e:WorkoutLogExercise){if(this.step()==='record')void this.saveDraft();this.open(e);this.nextRecord();}
 record(set:WorkoutLogSet){if(this.step()==='record'&&this.setId()===set.id)return;if(this.step()==='record'&&this.setId()!==set.id)void this.saveDraft();clearTimeout(this.inputTimer);this.setId.set(set.id);const inputs=this.inputDrafts.get(set.id);this.weight=inputs?inputs.weight:this.s.weight(set.weight);this.reps=inputs?inputs.reps:set.reps;this.rpe=inputs?inputs.rpe:set.rpe;this.setNotes=inputs?inputs.setNotes:set.notes||'';this.kind=inputs?inputs.kind:set.kind||'work';this.step.set('record');this.remember();}
 referenceSet=computed(()=>{const e=this.selected(),set=this.currentSet();if(!e||!set)return undefined;return this.s.sets(e.id).filter(s=>s.id!==set.id&&s.number<set.number&&s.completed&&s.kind===set.kind).at(-1)||this.previous()[Math.max(0,this.s.sets(e.id).filter(s=>s.number<set.number&&s.kind!=='warmup').length)];});
 useReference(){const ref=this.referenceSet();if(!ref)return;this.weight=this.s.weight(ref.weight);this.reps=ref.reps;this.rpe=ref.rpe;this.inputChanged();}
 nextRecord(){const e=this.selected();if(!e)return;const sets=this.s.sets(e.id),set=sets.find(s=>!s.completed)||sets[0];if(set)this.record(set);}
 adjustWeight(delta:number){this.weight=Math.max(0,+(this.weight+delta).toFixed(2));this.inputChanged();}
 adjustReps(delta:number){this.reps=Math.min(999,Math.max(1,this.reps+delta));this.inputChanged();}
 async saveDraft(completed?:boolean){const set=this.currentSet();if(!set)return false;const inputs=this.captureInputs();if(!Number.isFinite(inputs.weight)||inputs.weight<0||!Number.isInteger(inputs.reps)||inputs.reps<1||inputs.reps>999){this.s.error.set('Controlla peso e ripetizioni.');return false;}const ok=await this.s.updateSet(set.id,{weight:this.s.kg(inputs.weight),reps:inputs.reps,rpe:inputs.rpe,notes:inputs.setNotes,kind:inputs.kind,...(completed===undefined?{}:{completed})});if(ok){if(this.inputDrafts.get(set.id)===inputs)this.inputDrafts.delete(set.id);this.remember();}return ok;}
 async flushForFinish(){clearTimeout(this.inputTimer);this.clock.set(Date.now());this.remember(true);const ok=(this.step()==='record'||this.inputDrafts.has(this.setId()))?await this.saveDraft():true;await this.s.settled();if(!ok||this.inputDrafts.size){this.s.error.set(this.s.error()||'Alcune modifiche alle serie non sono state salvate. Controlla i valori e riprova.');return false;}return true;}
 async complete(event?:MouseEvent){if(this.committing()||this.step()!=='record')return;if(event){if(event.timeStamp-this.lastCompletionClick<600)return;this.lastCompletionClick=event.timeStamp;}this.committing.set(true);const completedSetId=this.setId();clearTimeout(this.inputTimer);try{if(!await this.saveDraft(true))return;if(this.step()!=='record'||this.setId()!==completedSetId)return;const current=this.selected(),handoff=current?supersetNext(this.exercises(),this.allSets(),current.id):undefined;if(this.kind!=='warmup'&&handoff?.immediate&&handoff.next){this.restEnd.set(0);this.paused.set(false);this.exerciseId.set(handoff.next.id);this.nextRecord();this.s.message.set('Superset '+current?.superset+': passa a '+handoff.next.name+'.');return;}const rest=this.currentSet()?.rest??this.selected()?.rest??90;this.clock.set(Date.now());this.restTotal.set(rest);this.paused.set(false);this.restEnd.set(Date.now()+rest*1000);this.step.set('rest');this.remember(true);}finally{this.committing.set(false);}}
 pauseRest(){this.clock.set(Date.now());if(this.paused()){this.restEnd.set(Date.now()+this.pausedSeconds()*1000);this.paused.set(false);}else{this.pausedSeconds.set(this.remaining());this.paused.set(true);}this.remember(true);}
 adjustRest(delta:number){const seconds=Math.min(7200,Math.max(0,this.remaining()+delta));this.restTotal.set(Math.max(this.restTotal(),seconds));if(this.paused())this.pausedSeconds.set(seconds);else{this.clock.set(Date.now());this.restEnd.set(Date.now()+seconds*1000);}this.remember(true);}
 syncExternalTimer(){if(this.s.draft()?.id!==this.workoutId()){this.externalTimer?.stop();return;}this.externalTimer?.sync({end:this.restEnd(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),title:this.selected()?.name||'Recupero'});}
 async showExternalTimer(){await this.externalTimer?.open({end:this.restEnd(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),title:this.selected()?.name||'Recupero'});}
 formatSeconds=formatSeconds;
 advance(){this.externalTimer?.stop();this.restEnd.set(0);this.paused.set(false);const next=this.nextExercise();if(next){this.exerciseId.set(next.id);this.nextRecord();}else this.navigate('list');this.remember();}
 async usePrevious(id:string){if(this.count(id)&&!confirm('Sostituire le serie allenanti di questo esercizio con gli ultimi valori? Le serie di riscaldamento restano conservate.'))return;const ids=this.s.sets(id).map(s=>s.id);if(await this.s.copyPrevious(id)){for(const key of ids)this.inputDrafts.delete(key);}this.setId.set('');this.remember();}
 saveNotes(id:string,notes:string){void this.s.change(d=>{const e=d.workoutExercises.find(e=>e.id===id);if(e)e.notes=notes;},'',false);}
 async removeSet(set:WorkoutLogSet){if(!set.completed||confirm('Eliminare questa serie completata?'))if(await this.s.removeSet(set.id)){this.inputDrafts.delete(set.id);this.setId.set('');this.navigate('detail');}}
 ngOnDestroy(){clearInterval(this.timer);clearTimeout(this.inputTimer);clearTimeout(this.persistTimer);this.flush();this.destroyed=true;}
}
