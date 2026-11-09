import {ExerciseMotionComponent} from './exercise-motion.component';
import {ExerciseReplacementComponent, ExerciseReplacementClosed} from './exercise-replacement.component';
import {exerciseComparison} from '../services/exercise-comparison';
import { matchesExercise } from '../services/exercise-search';
import { NgTemplateOutlet } from '@angular/common';
import { confirmationForContext } from '../services/confirmation';
import { Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { localDate, WorkoutLogExercise, WorkoutLogSet, WorkoutUiState } from '../models/domain';
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
import { TodayService } from '../services/today';
import { coachNextSet, readinessFromWellness } from '../services/coach-shadow';
import type { AppUpdateEvent } from '../services/pwa';
import { FormDraftService } from '../services/form-drafts';
type ActiveSetDraft={weight:number;reps:number;rpe:number|undefined;setNotes:string;kind:'work'|'warmup'};
interface ActiveDraftSnapshot {entries:[string,ActiveSetDraft][];exerciseId:string;setId:string;bases?:Record<string,string>}
@Component({selector:'gt-active-workout',standalone:true,imports:[ExerciseReplacementComponent,ExerciseMotionComponent,NgTemplateOutlet,FormsModule,LoadProgressionComponent,MachineSetupComponent,MuscleMapComponent,ExerciseThumbComponent,ExerciseVideoComponent,IconComponent],templateUrl:'./active-workout.component.html',styleUrls:['./recording.css','./recording-simple.css','./workout-redesign.css','./recording-v3.css']})
export class ActiveWorkoutComponent {
 private confirmation=confirmationForContext();
 externalTimer=inject(ExternalTimerService,{optional:true});
 private todayClock=inject(TodayService,{optional:true});
 committing=signal(false);s=inject(Store);resume=inject(WorkoutResumeService,{optional:true})||new WorkoutResumeService();workoutId=input.required<string>();finish=output<void>();
 replacementOpen=signal(false);
 async openReplacement(){if(this.committing())return;this.committing.set(true);try{if(await this.flushForFinish())this.replacementOpen.set(true);}finally{this.committing.set(false);}}
 replacementClosed(result:ExerciseReplacementClosed){this.replacementOpen.set(false);if(result.applied&&result.activeChanged){this.inputDrafts.clear();this.draftsChanged();this.externalTimer?.stop();this.restEnd.set(0);this.paused.set(false);this.setId.set('');this.nextRecord();this.remember(true);}}
 step=signal<WorkoutUiState['step']>('list');tab=signal<WorkoutUiState['tab']>('sets');exerciseId=signal('');setId=signal('');clock=signal(Date.now());restEnd=signal(0);paused=signal(false);pausedSeconds=signal(0);restTotal=signal(90);
 weight=0;reps=8;rpe:number|undefined;setNotes='';kind:'work'|'warmup'='work';rpes=[1,2,3,4,5,6,6.5,7,7.5,8,8.5,9,9.5,10];
 gymMode=signal(this.s.settings().gymMode!==false);
 setGymMode(enabled:boolean){this.gymMode.set(enabled);void this.s.change(d=>{d.settings[0].gymMode=enabled;},'',false);}swapQuery=signal('');replacementId='';
 weightStep(){const id=this.selected()?.exerciseId,value=id?this.s.preference(id)?.weightStep:undefined;return value?this.s.weight(value):2.5;}
 stepLabel(){return this.weightStep().toLocaleString('it-IT',{maximumFractionDigits:2});}
 async saveIncrement(value:number){const id=this.selected()?.exerciseId;if(id)await this.s.saveWeightStep(id,this.s.kg(Number(value)));}
 alternatives=computed(()=>{const current=this.selected(),base=current?this.s.exercise(current.exerciseId):undefined;return this.s.data().exercises.filter(e=>e.active&&e.id!==current?.exerciseId&&(!base||e.muscleGroupId===base.muscleGroupId)&&matchesExercise(e,this.swapQuery())).slice(0,80);});
 async swapExercise(){if(this.committing()||!this.selected()||!this.replacementId)return;this.committing.set(true);try{if(!await this.flushForFinish())return;if(await this.s.substituteWorkoutExercise(this.exerciseId(),this.replacementId)){for(const set of this.s.sets(this.exerciseId()))this.inputDrafts.delete(set.id);this.draftsChanged();this.setId.set('');this.replacementId='';this.swapQuery.set('');this.restEnd.set(0);this.paused.set(false);this.nextRecord();}}finally{this.committing.set(false);}}
 async undoLast(){if(this.committing())return;this.committing.set(true);try{if(!await this.flushPending(true))return;if(await this.s.undoGymAction()){this.externalTimer?.stop();this.restEnd.set(0);this.paused.set(false);this.inputDrafts.clear();this.setId.set('');const selected=this.selected();if(selected)this.nextRecord();else this.navigate('list');}}finally{this.committing.set(false);}}
 private inputDrafts=new Map<string,ActiveSetDraft>();
 private writes=new Map<string,Promise<boolean>>();
 private draftStorage=inject(FormDraftService,{optional:true});
 private draftSession?:ReturnType<FormDraftService['bind']>;
 private lastCompletionClick=-Infinity;private completionBlockedUntil=0;
 private destroyed=false;private timer=setInterval(()=>this.clock.set(Date.now()),1000);private persistTimer:ReturnType<typeof setTimeout>|undefined;private inputTimer:ReturnType<typeof setTimeout>|undefined;
 exercises=computed(()=>this.s.workoutExercises(this.workoutId()));selected=computed(()=>this.exercises().find(e=>e.id===this.exerciseId()));allSets=computed(()=>this.exercises().flatMap(e=>this.s.sets(e.id)));completedSets=computed(()=>this.allSets().filter(s=>s.completed).length);currentSet=computed(()=>this.allSets().find(s=>s.id===this.setId()));
 workout=computed(()=>this.s.data().workouts.find(workout=>workout.id===this.workoutId()));
 programContext=computed(()=>{const workout=this.workout();if(!workout)return null;const day=this.s.data().days.find(day=>day.id===workout.dayId),plan=this.s.data().plans.find(plan=>plan.id===workout.planId),week=workout.programWeek??day?.week,phase=workout.programPhase??day?.phase;return week||phase?{week,phase,weeks:plan?.program?.weeks,notes:workout.notes}:null;});
 hasPrescription(exercise:WorkoutLogExercise){return exercise.rirMin!==undefined||exercise.repsMin!==undefined||!!(exercise.warmupNotes||exercise.reference||exercise.loadUnit||exercise.notes);}
 rirLabel(exercise:WorkoutLogExercise){return exercise.rirMin===undefined?'':exercise.rirMin+(exercise.rirMax!==undefined&&exercise.rirMax!==exercise.rirMin?'–'+exercise.rirMax:'');}
 repTarget(exercise:WorkoutLogExercise){return exercise.repsMin===undefined?'':exercise.repsMin+(exercise.repsMax!==undefined&&exercise.repsMax!==exercise.repsMin?'–'+exercise.repsMax:'');}
 warmupLines(exercise:WorkoutLogExercise){return(exercise.warmupNotes||'').split(/;|\n/).map(line=>line.trim()).filter(Boolean);}
 flowIndex=computed(()=>this.step()==='list'?(this.allSets().length>0&&this.completedSets()===this.allSets().length?4:0):this.step()==='detail'?1:this.step()==='record'?2:3);
 comparisonCurrent=computed(()=>{const e=this.selected();const sets=e?this.s.sets(e.id).filter(set=>set.completed&&set.kind!=='warmup'):[];return {sets:sets.length,reps:sets.reduce((sum,set)=>sum+set.reps,0),volume:sets.reduce((sum,set)=>sum+set.weight*set.reps,0)};});
 comparison=computed(()=>{const selected=this.selected();return selected?exerciseComparison(this.s.data(),selected):[];});
 previous=computed(()=>{const e=this.selected();return e?this.s.previous(e.exerciseId,e.workoutId,e.machineSetup):[];});
 remaining=computed(()=>this.paused()?this.pausedSeconds():remainingSeconds(this.restEnd(),this.clock()));restRatio=computed(()=>Math.min(100,this.remaining()/Math.max(1,this.restTotal())*100));
 nextExercise=computed(()=>{const current=this.selected();if(current){if(this.currentSet()?.kind==='warmup'&&this.s.sets(current.id).some(s=>!s.completed))return current;const next=supersetNext(this.exercises(),this.allSets(),current.id).next;if(next)return next;if(this.s.sets(current.id).some(s=>!s.completed))return current;}return this.exercises().find(e=>this.s.sets(e.id).some(s=>!s.completed));});
 ngOnInit(){this.restore();this.draftSession=this.draftStorage?.bind<ActiveDraftSnapshot>(this.s.archiveKey(),'active-sets:'+this.workoutId(),()=>this.inputDrafts.size?{entries:[...this.inputDrafts],exerciseId:this.exerciseId(),setId:this.setId(),bases:Object.fromEntries(this.allSets().filter(set=>this.inputDrafts.has(set.id)).map(set=>[set.id,JSON.stringify(set)]))}:null,data=>{
  if(!Array.isArray(data?.entries)||data.entries.length>1000)return;
  const owned=new Set(this.allSets().map(set=>set.id));
  for(const entry of data.entries){if(!Array.isArray(entry)||entry.length!==2)continue;const [id,value]=entry;if(!owned.has(id)||!value||typeof value.setNotes!=='string'||value.setNotes.length>10000||!['work','warmup'].includes(value.kind)||![value.weight,value.reps].every(n=>typeof n==='number'||n===null))continue;if(data.bases?.[id]&&data.bases[id]!==JSON.stringify(this.allSets().find(set=>set.id===id))){this.s.message.set('Una serie è cambiata dall’ultima bozza: sono conservati i valori già salvati.');continue;}this.inputDrafts.set(id,value);}
  const set=this.allSets().find(item=>item.id===data.setId&&this.inputDrafts.has(item.id))||this.allSets().find(item=>this.inputDrafts.has(item.id)),exercise=this.exercises().find(item=>item.id===set?.workoutExerciseId);
  if(set&&exercise){this.exerciseId.set(exercise.id);this.setId.set(set.id);this.applyInputs(this.inputDrafts.get(set.id)!);this.step.set('record');}
 });void this.draftSession?.ready.then(()=>{if(this.step()==='record'&&!this.destroyed)void this.saveDraft();});}
 restore(){const state=this.resume.read(this.s.archiveKey(),this.workoutId(),this.s.data().workoutUi.find(x=>x.id===this.workoutId()),this.s.archiveRevision());if(!state)return;const ex=this.exercises().find(e=>e.id===state.exerciseId),set=this.allSets().find(x=>x.id===state.setId&&x.workoutExerciseId===ex?.id);this.exerciseId.set(ex?.id||'');this.setId.set(set?.id||'');this.tab.set(state.tab);this.step.set(state.step==='list'?'list':!ex?'list':state.step==='record'&&!set?'detail':state.step);this.restEnd.set(state.restEnd);this.restTotal.set(state.restTotal);this.paused.set(state.paused);this.pausedSeconds.set(state.pausedSeconds);this.weight=this.s.weight(state.weight);this.reps=state.reps;this.rpe=state.rpe;this.setNotes=state.setNotes;this.kind=state.kind;this.clock.set(Date.now());if(this.step()==='record'&&!this.draftStorage)void this.saveDraft();this.syncExternalTimer();}
 snapshot():WorkoutUiState{return{id:this.workoutId(),step:this.step(),tab:this.tab(),exerciseId:this.exerciseId(),setId:this.setId(),restEnd:this.restEnd(),restTotal:this.restTotal(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),weight:this.s.kg(this.weight),reps:this.reps,rpe:this.rpe,setNotes:this.setNotes,kind:this.kind,updatedAt:new Date().toISOString()};}
 remember(immediate=false){if(this.s.conflicted())return;this.syncExternalTimer();if(this.destroyed)return;if(this.s.draft()?.id!==this.workoutId()){this.resume.clear(this.s.archiveKey());return;}const state=this.snapshot();if(!validWorkoutUi(state))return;const cached=this.resume.write(this.s.archiveKey(),state,this.s.archiveRevision());clearTimeout(this.persistTimer);if(immediate||!cached)void this.s.rememberWorkout(state);else this.persistTimer=setTimeout(()=>void this.s.rememberWorkout(state),300);}
 captureInputs(){const inputs={weight:this.weight,reps:this.reps,rpe:this.rpe,setNotes:this.setNotes,kind:this.kind};if(this.setId()){this.inputDrafts.set(this.setId(),inputs);this.draftSession?.changed();}return inputs;}
 private applyInputs(inputs:ActiveSetDraft){this.weight=inputs.weight;this.reps=inputs.reps;this.rpe=inputs.rpe;this.setNotes=inputs.setNotes;this.kind=inputs.kind;}
 private draftsChanged(){if(this.inputDrafts.size)this.draftSession?.changed();else void this.draftSession?.clear().catch(()=>{});}
 inputChanged(){this.captureInputs();this.remember();clearTimeout(this.inputTimer);this.inputTimer=setTimeout(()=>void this.saveDraft(),200);}
 @HostListener('window:gymtrack:before-update',['$event']) beforeUpdate(event:Event){(event as AppUpdateEvent).waitUntil(this.flushForFinish());}
 @HostListener('window:pagehide') flush(){this.clock.set(Date.now());this.remember(true);if(this.s.draft()?.id===this.workoutId()){if(this.step()==='record')this.captureInputs();void this.draftSession?.flush();void this.flushPending(false);}}
 @HostListener('document:visibilitychange') visibility(){this.clock.set(Date.now());this.remember(true);if(document.visibilityState==='hidden')this.flush();}
 navigate(step:WorkoutUiState['step']){if(this.step()==='record')void this.saveDraft();this.step.set(step);this.remember();}
 setTab(tab:WorkoutUiState['tab']){this.tab.set(tab);this.remember();}
 muscle(e:WorkoutLogExercise){return this.s.muscle(this.s.exercise(e.exerciseId)?.muscleGroupId||'');}
 secondary(e:WorkoutLogExercise){return (this.s.exercise(e.exerciseId)?.secondaryMuscleIds||[]).map(id=>this.s.muscle(id));}
 setupLabel= (e:WorkoutLogExercise)=>setupSummary(e.machineSetup);
 hasPair(e:WorkoutLogExercise){return !!e.superset&&this.exercises().filter(x=>x.superset===e.superset).length===2;}
 count(id:string){return this.s.sets(id).filter(s=>s.completed).length;}
 open(e:WorkoutLogExercise){this.exerciseId.set(e.id);this.tab.set('sets');this.step.set('detail');this.remember();}
 quickRecord(e:WorkoutLogExercise){if(this.step()==='record')void this.saveDraft();this.open(e);this.nextRecord();}
 record(set:WorkoutLogSet){if(this.step()==='record'&&this.setId()===set.id)return;if(this.step()==='record'&&this.setId()!==set.id)void this.saveDraft();clearTimeout(this.inputTimer);this.setId.set(set.id);const inputs=this.inputDrafts.get(set.id);this.weight=inputs?inputs.weight:this.s.weightInput(set.weight);this.reps=inputs?inputs.reps:set.reps;this.rpe=inputs?inputs.rpe:set.rpe;this.setNotes=inputs?inputs.setNotes:set.notes||'';this.kind=inputs?inputs.kind:set.kind||'work';this.step.set('record');this.remember();this.revealCurrentSet();}
 referenceSet=computed(()=>{const e=this.selected(),set=this.currentSet();if(!e||!set)return undefined;return this.s.sets(e.id).filter(s=>s.id!==set.id&&s.number<set.number&&s.completed&&s.kind===set.kind).at(-1)||this.previous()[Math.max(0,this.s.sets(e.id).filter(s=>s.number<set.number&&s.kind!=='warmup').length)];});
 useReference(){const ref=this.referenceSet();if(!ref)return;this.weight=this.s.weightInput(ref.weight);this.reps=ref.reps;this.rpe=ref.rpe;this.inputChanged();}
 /** Coach Ombra: proposta per la serie allenante in corso, calcolata da storico, serie di oggi e check-in. */
 coachDismissed=signal<ReadonlySet<string>>(new Set());
 coach=computed(()=>{
  const e=this.selected(),set=this.currentSet();
  if(!e||!set||set.kind==='warmup'||set.completed||this.coachDismissed().has(set.id))return null;
  if(!['external','weighted-bodyweight'].includes(e.loadMode)||e.repsMin===undefined||e.repsMax===undefined)return null;
  const working=this.s.sets(e.id).filter(x=>x.kind!=='warmup');
  const done=working.filter(x=>x.completed&&x.number<set.number).map(x=>({weight:x.weight,reps:x.reps,rpe:x.rpe}));
  const reference=this.previous().filter(x=>x.completed&&x.kind!=='warmup').map(x=>({weight:x.weight,reps:x.reps,rpe:x.rpe}));
  const today=this.s.data().wellnessLogs.find(w=>w.date===(this.todayClock?.date()??localDate()));
  const suggestion=coachNextSet({repsMin:e.repsMin,repsMax:e.repsMax,incrementKg:this.s.kg(this.weightStep()),plannedWeight:set.weight,reference,done,readiness:readinessFromWellness(today)});
  return suggestion&&suggestion.basis!=='none'?suggestion:null;
 });
 coachDeltaLabel(){const c=this.coach(),set=this.currentSet();if(!c||!set)return '';const d=c.weight-set.weight;if(Math.abs(d)<0.000001)return 'Mantieni';return (d>0?'+':'−')+this.s.formatWeight(Math.abs(d))+' '+this.s.settings().unit;}
 applyCoach(){const c=this.coach();if(!c)return;this.weight=this.s.weightInput(c.weight);this.reps=c.reps;this.inputChanged();}
 dismissCoach(){const set=this.currentSet();if(!set)return;this.coachDismissed.update(v=>new Set(v).add(set.id));}
 nextRecord(){const e=this.selected();if(!e)return;const sets=this.s.sets(e.id),set=sets.find(s=>!s.completed)||sets[0];if(set)this.record(set);}

 /* Registrazione serie: dati derivati per la nuova interfaccia (nessuna scrittura sull'archivio). */
 restPick=signal<number|undefined>(undefined);restChoices=[60,90,120,180];
 restDefault(){const value=this.currentSet()?.rest??this.selected()?.rest;return value&&value>0?value:90;}
 restShown(){return this.restPick()??this.restDefault();}
 pickRest(value:number){this.restPick.set(this.restPick()===value?undefined:value);}
 fmt(value:number){return value.toLocaleString('it-IT',{maximumFractionDigits:1});}
 setSummary(set:{completed:boolean;weight:number;reps:number}){if(!set.completed)return '—';return this.selected()?.loadMode==='bodyweight'?String(set.reps):this.s.formatWeight(set.weight)+'×'+set.reps;}
 setRpe(value:number){this.rpe=this.rpe===value?undefined:value;this.inputChanged();}
 rirHint(){return this.rpe===undefined?'':Math.max(0,Math.round(10-this.rpe))+' rip. in riserva';}
 lastWorkSet(){return this.previous().find(x=>x.completed&&x.kind!=='warmup');}
 deltaLabel(){const e=this.selected(),last=this.lastWorkSet();if(!e||e.loadMode==='bodyweight'||!last)return '';const delta=+(this.weight-this.s.weight(last.weight)).toFixed(2);return delta===0?'= ultima volta':(delta>0?'+':'−')+this.fmt(Math.abs(delta))+' vs ultima volta';}
 deltaUp(){const last=this.lastWorkSet();return !!last&&this.weight>this.s.weight(last.weight);}
 usePreviousWeight(){const last=this.lastWorkSet();if(!last)return;this.weight=this.s.weightInput(last.weight);this.inputChanged();}
 est1rm(){const e=this.selected();if(!e||e.loadMode==='bodyweight'||!(this.weight>0)||!(this.reps>=1))return 0;return this.reps===1?this.weight:this.weight*(1+this.reps/30);}
 volumeNow(){const e=this.selected();return !e||e.loadMode==='bodyweight'||!(this.weight>0)||!(this.reps>=1)?0:this.weight*this.reps;}
 repsProgress(){const e=this.selected(),target=e?.repsMax??e?.repsMin??10;return Math.min(100,Math.max(0,this.reps/Math.max(1,target)*100));}
 newBest(){const e=this.selected(),rows=this.comparison();if(!e||e.loadMode==='bodyweight'||e.loadMode==='assisted'||!rows.length||!(this.weight>0))return false;return this.weight>Math.max(...rows.map(row=>this.s.weightInput(row.weight)))+0.005;}
 platePlan(){const e=this.selected();if(!e||e.loadMode==='bodyweight'||e.loadMode==='assisted'||e.loadMode==='weighted-bodyweight')return undefined;const lb=this.s.settings().unit!=='kg',bar=lb?45:20,available=lb?[45,35,25,10,5,2.5]:[25,20,15,10,5,2.5,1.25];let side=(this.weight-bar)/2;if(!(side>0))return undefined;const plates:number[]=[];for(const plate of available){while(side>=plate-1e-9){plates.push(plate);side=+(side-plate).toFixed(3);}}return {bar,plates,left:+side.toFixed(2)};}
 warmupIdeas(){const e=this.selected(),set=this.currentSet();if(!e||!set||set.kind==='warmup'||set.number>1||e.loadMode==='bodyweight'||e.loadMode==='assisted'||e.loadMode==='weighted-bodyweight'||!(this.weight>=30))return [];const step=Math.max(.5,this.weightStep());const round=(value:number)=>Math.max(step,Math.round(value/step)*step);return [{weight:round(this.weight*.5),reps:10},{weight:round(this.weight*.7),reps:5},{weight:round(this.weight*.85),reps:3}];}
 spark(){const rows=[...this.comparison()].reverse().map(row=>this.s.weight(row.weight));if(!rows.length||!(this.weight>0))return undefined;const values=[...rows,this.weight],min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);const points=values.map((value,index)=>({x:8+index*(184/Math.max(1,values.length-1)),y:44-(value-min)/span*34}));return {points,line:points.map(point=>point.x.toFixed(1)+','+point.y.toFixed(1)).join(' '),first:values[0],last:values.at(-1)??0};}
 adjustWeight(delta:number){this.weight=Math.max(0,+(this.weight+delta).toFixed(2));this.inputChanged();}
 adjustReps(delta:number){this.reps=Math.min(999,Math.max(1,this.reps+delta));this.inputChanged();}
 invalidWeight(){return !Number.isFinite(this.weight)||this.weight<0;}
 invalidReps(){return !Number.isInteger(this.reps)||this.reps<1||this.reps>999;}
 async saveDraft(completed?:boolean,reportInvalid=false){const set=this.currentSet();if(!set)return false;this.captureInputs();return this.flushSet(set.id,reportInvalid||completed!==undefined,completed);}
 private async flushSet(id:string,reportInvalid:boolean,completed?:boolean):Promise<boolean>{
  for(;;){
   const pending=this.writes.get(id);if(pending){try{await pending;}catch{}continue;}
   const inputs=this.inputDrafts.get(id);if(!inputs){if(completed===undefined)return true;const current=this.allSets().find(set=>set.id===id);if(!current)return false;if(current.completed===completed)return true;const completion=this.s.updateSet(id,{completed},true);this.writes.set(id,completion);try{return await completion;}finally{if(this.writes.get(id)===completion)this.writes.delete(id);}}
   if(!this.allSets().some(set=>set.id===id)){this.inputDrafts.delete(id);this.draftsChanged();return true;}
   if(!Number.isFinite(inputs.weight)||inputs.weight<0||!Number.isInteger(inputs.reps)||inputs.reps<1||inputs.reps>999){if(reportInvalid)this.s.error.set('Controlla peso e ripetizioni.');await this.draftSession?.flush();return false;}
   const job=this.s.updateSet(id,{weight:this.s.kg(inputs.weight),reps:inputs.reps,rpe:inputs.rpe,notes:inputs.setNotes,kind:inputs.kind,...(completed===undefined?{}:{completed})},true);this.writes.set(id,job);
   let ok=false;try{ok=await job;}catch(error){if(reportInvalid)this.s.error.set(error instanceof Error?error.message:'Modifiche alla serie non salvate.');}finally{if(this.writes.get(id)===job)this.writes.delete(id);}
   if(!ok){await this.draftSession?.flush();return false;}
   if(this.inputDrafts.get(id)===inputs){this.inputDrafts.delete(id);this.draftsChanged();this.remember();return true;}
   this.draftSession?.changed();
  }
 }
 async flushPending(reportInvalid=true){const ids=new Set([...this.inputDrafts.keys(),...this.writes.keys()]);const saved=await Promise.all([...ids].map(id=>this.flushSet(id,reportInvalid)));await this.draftSession?.flush();return saved.every(Boolean);}
 async flushForFinish(){clearTimeout(this.inputTimer);this.clock.set(Date.now());this.remember(true);if(this.step()==='record')this.captureInputs();const ok=await this.flushPending(true);await this.s.settled();if(!ok||this.inputDrafts.size){const pending=this.allSets().find(set=>this.inputDrafts.has(set.id));if(pending){this.exerciseId.set(pending.workoutExerciseId);this.setId.set(pending.id);this.applyInputs(this.inputDrafts.get(pending.id)!);this.step.set('record');}this.s.error.set(this.s.error()||'Alcune modifiche alle serie non sono state salvate. Controlla i valori e riprova.');return false;}return true;}
 recordingPast=computed(()=>{const workout=this.s.data().workouts.find(w=>w.id===this.workoutId());return !!workout&&workout.date<localDate(new Date(workout.startedAt));});
 async complete(event?:MouseEvent){if(this.committing()||this.step()!=='record'||!event&&Date.now()<this.completionBlockedUntil)return;if(event){if(event.timeStamp-this.lastCompletionClick<600)return;this.lastCompletionClick=event.timeStamp;}this.committing.set(true);const completedSetId=this.setId(),alreadyCompleted=this.currentSet()?.completed===true;clearTimeout(this.inputTimer);try{if(!await this.saveDraft(true))return;if(this.step()!=='record'||this.setId()!==completedSetId)return;if(alreadyCompleted){this.s.message.set('Serie aggiornata.');if(!this.recordingPast()&&!this.restRunning())this.startRest();this.remember(true);return;}if(this.recordingPast()){this.advance();return;}const current=this.selected(),handoff=current?supersetNext(this.exercises(),this.allSets(),current.id):undefined;if(this.kind!=='warmup'&&handoff?.immediate&&handoff.next){this.restEnd.set(0);this.paused.set(false);this.exerciseId.set(handoff.next.id);this.nextRecord();this.s.message.set('Superset '+current?.superset+': passa a '+handoff.next.name+'.');return;}this.startRest();if(this.gymMode()){this.completionBlockedUntil=Date.now()+600;const next=this.nextExercise();if(next){this.exerciseId.set(next.id);this.setId.set('');this.nextRecord();}else this.navigate('list');}else this.step.set('rest');this.remember(true);}finally{this.committing.set(false);}}
 /** Recupero: parte da solo al salvataggio di ogni serie, con la durata scelta (o quella del piano). */
 restRunning(){return this.paused()||this.restEnd()>Date.now();}
 startRest(seconds=this.restShown()){const rest=Math.min(7200,Math.max(0,seconds));this.restPick.set(undefined);this.clock.set(Date.now());this.restTotal.set(rest||90);this.paused.set(false);this.restEnd.set(rest?Date.now()+rest*1000:0);}
 toggleRest(){if(!this.restEnd()&&!this.paused()){this.startRest();this.remember(true);return;}this.pauseRest();}
 /* Righello del peso: trascinando a sinistra il carico sale, a destra scende; ogni tacca è un incremento. */
 private static RULER_TICK=16;
 rulerDragging=signal(false);private rulerOrigin?:{x:number;weight:number;pointer:number;steps:number};
 rulerShift(){const step=this.weightStep()||2.5,ticks=Math.round((this.weight||0)/step);return -((ticks*ActiveWorkoutComponent.RULER_TICK)%(ActiveWorkoutComponent.RULER_TICK*5));}
 rulerStart(event:PointerEvent){if(this.committing())return;this.rulerOrigin={x:event.clientX,weight:Number.isFinite(this.weight)?this.weight:0,pointer:event.pointerId,steps:0};this.rulerDragging.set(true);(event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);}
 rulerMove(event:PointerEvent){const origin=this.rulerOrigin;if(!origin||origin.pointer!==event.pointerId)return;const steps=Math.round((origin.x-event.clientX)/ActiveWorkoutComponent.RULER_TICK);if(steps===origin.steps)return;origin.steps=steps;const step=this.weightStep()||2.5;this.weight=Math.max(0,+(origin.weight+steps*step).toFixed(2));if(typeof navigator!=='undefined')navigator.vibrate?.(4);this.inputChanged();}
 rulerEnd(event:PointerEvent){if(this.rulerOrigin?.pointer!==event.pointerId)return;this.rulerOrigin=undefined;this.rulerDragging.set(false);}
 rulerKey(event:KeyboardEvent){const delta=event.key==='ArrowRight'||event.key==='ArrowUp'?1:event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:0;if(!delta)return;event.preventDefault();this.adjustWeight(delta*this.weightStep());}
 /* Navigazione tra le serie: precedente e successiva, anche passando all'esercizio vicino. */
 private orderedSets(){return this.exercises().flatMap(e=>this.s.sets(e.id));}
 neighborSet(direction:1|-1){const sets=this.orderedSets(),index=sets.findIndex(set=>set.id===this.setId());return index<0?undefined:sets[index+direction];}
 stepSet(direction:1|-1){const target=this.neighborSet(direction);if(!target||this.committing())return;this.addMenu.set(false);if(target.workoutExerciseId!==this.exerciseId())this.exerciseId.set(target.workoutExerciseId);this.record(target);}
 /* Serie extra: allenante (in coda) o di riscaldamento (prima delle allenanti); si apre subito. */
 addMenu=signal(false);
 async addExtra(kind:'work'|'warmup'){const e=this.selected();if(!e||this.committing())return;this.committing.set(true);try{if(this.step()==='record')await this.saveDraft();const before=new Set(this.s.sets(e.id).map(set=>set.id));if(await this.s.addSet(e.id,kind)===false)return;const added=this.s.sets(e.id).find(set=>!before.has(set.id));this.addMenu.set(false);if(added){this.record(added);this.s.message.set(kind==='warmup'?'Serie di riscaldamento aggiunta.':'Serie allenante aggiunta.');}}finally{this.committing.set(false);}}
 /* Schermata serie v3: navigazione esercizi, etichette serie, righello con valori, range ripetizioni e recupero compatto. Solo presentazione: le scritture restano quelle esistenti. */
 restMenu=signal(false);
 exerciseIndex=computed(()=>this.exercises().findIndex(e=>e.id===this.exerciseId()));
 neighborExercise(direction:1|-1){const index=this.exerciseIndex();return index<0?undefined:this.exercises()[index+direction];}
 goExercise(direction:1|-1){const target=this.neighborExercise(direction);if(!target||this.committing())return;this.addMenu.set(false);this.restMenu.set(false);this.quickRecord(target);}
 setTag(set:WorkoutLogSet){const warm=set.kind==='warmup',same=this.s.sets(set.workoutExerciseId).filter(x=>(x.kind==='warmup')===warm);return (warm?'R':'S')+(same.findIndex(x=>x.id===set.id)+1);}
 setTitle(set:WorkoutLogSet){const tag=this.setTag(set);return (set.kind==='warmup'?'Riscaldamento ':'Serie ')+tag.slice(1);}
 rulerTicks(){const step=this.weightStep()||2.5,weight=Number.isFinite(this.weight)?this.weight:0,center=Math.round(weight/step),ticks:{n:number;x:string;major:boolean;current:boolean;label:string}[]=[];for(let i=-14;i<=14;i++){const n=center+i;if(n<0)continue;const value=+(n*step).toFixed(2),offset=(value-weight)/step*ActiveWorkoutComponent.RULER_TICK,major=n%4===0;ticks.push({n,x:'calc(50% + '+offset.toFixed(1)+'px)',major,current:Math.abs(value-weight)<0.0001,label:major?this.fmt(value):''});}return ticks;}
 repScale(){const e=this.selected();if(!e||e.repsMin===undefined)return undefined;const min=e.repsMin,max=Math.max(min,e.repsMax??min),reps=Number.isFinite(this.reps)&&this.reps>0?this.reps:min,low=Math.max(1,Math.min(min,reps)-2),high=Math.max(max,reps)+2,span=Math.max(1,high-low),pos=(value:number)=>(value-low)/span*100;return {zoneLeft:pos(min),zoneWidth:Math.max(2,pos(max)-pos(min)),marker:pos(Math.min(high,Math.max(low,reps))),inRange:reps>=min&&reps<=max,labels:[...new Set([low,min,max,high])].map(v=>({v,pos:pos(v),goal:v===min||v===max}))};}
 nextSetId(exerciseId:string){return this.s.sets(exerciseId).find(set=>!set.completed)?.id;}
 rpeGoal(){const e=this.selected();if(!e||e.rirMin===undefined)return undefined;const goal=Math.round(10-(e.rirMin+(e.rirMax??e.rirMin))/2);return goal>=6&&goal<=10?goal:undefined;}
 chooseRest(value:number){if(this.restRunning()){const elapsed=Math.max(0,this.restTotal()-this.remaining()),left=Math.min(7200,Math.max(0,value-elapsed));this.restTotal.set(value);this.clock.set(Date.now());if(this.paused())this.pausedSeconds.set(left);else this.restEnd.set(left?Date.now()+left*1000:0);this.remember(true);}else this.restPick.set(value===this.restDefault()?undefined:value);this.restMenu.set(false);}
 startRestNow(){this.startRest();this.restMenu.set(false);this.remember(true);}
 skipRest(){this.externalTimer?.stop();this.restEnd.set(0);this.paused.set(false);this.restMenu.set(false);this.remember(true);}
 private revealCurrentSet(){if(typeof document==='undefined'||typeof requestAnimationFrame==='undefined')return;requestAnimationFrame(()=>{const pill=document.querySelector<HTMLElement>('.rec3-set.current'),strip=pill?.parentElement;if(pill&&strip&&strip.scrollWidth>strip.clientWidth)strip.scrollTo?.({left:pill.offsetLeft-(strip.clientWidth-pill.clientWidth)/2,behavior:'smooth'});});}
 pauseRest(){this.clock.set(Date.now());if(this.paused()){this.restEnd.set(Date.now()+this.pausedSeconds()*1000);this.paused.set(false);}else{this.pausedSeconds.set(this.remaining());this.paused.set(true);}this.remember(true);}
 adjustRest(delta:number){const seconds=Math.min(7200,Math.max(0,this.remaining()+delta));this.restTotal.set(Math.max(this.restTotal(),seconds));if(this.paused())this.pausedSeconds.set(seconds);else{this.clock.set(Date.now());this.restEnd.set(Date.now()+seconds*1000);}this.remember(true);}
 syncExternalTimer(){if(this.s.draft()?.id!==this.workoutId()){this.externalTimer?.stop();return;}this.externalTimer?.sync({end:this.restEnd(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),title:this.selected()?.name||'Recupero'});}
 async showExternalTimer(){await this.externalTimer?.open({end:this.restEnd(),paused:this.paused(),pausedSeconds:this.pausedSeconds(),title:this.selected()?.name||'Recupero'});}
 recoveryElapsed(){return this.paused()?Math.max(0,this.restTotal()-this.pausedSeconds()):Math.max(0,Math.floor((this.clock()-this.restEnd())/1000)+this.restTotal());}
 formatSeconds=formatSeconds;
 advance(){this.externalTimer?.stop();this.restEnd.set(0);this.paused.set(false);const next=this.nextExercise();if(next){this.exerciseId.set(next.id);this.nextRecord();}else this.navigate('list');this.remember();}
 async usePrevious(id:string){if(this.count(id)&&!await this.confirmation.ask('Sostituire le serie allenanti di questo esercizio con gli ultimi valori? Le serie di riscaldamento restano conservate.'))return;const ids=this.s.sets(id).map(s=>s.id);if(await this.s.copyPrevious(id)){for(const key of ids)this.inputDrafts.delete(key);this.draftsChanged();}this.setId.set('');this.remember();}
 saveNotes(id:string,notes:string){void this.s.change(d=>{const e=d.workoutExercises.find(e=>e.id===id);if(e)e.notes=notes;},'',false);}
 async removeSet(set:WorkoutLogSet){
  if(this.committing())return;
  if(set.completed&&!await this.confirmation.ask('Eliminare questa serie completata? Le altre serie restano conservate.'))return;
  this.committing.set(true);
  const current=this.setId()===set.id;
  if(current)clearTimeout(this.inputTimer);
  try{
   const pending=this.writes.get(set.id);if(pending)try{await pending;}catch{}
   const others=[...this.inputDrafts.keys()].filter(id=>id!==set.id);
   if(!(await Promise.all(others.map(id=>this.flushSet(id,true)))).every(Boolean))return;
   if(!await this.s.removeSet(set.id))return;
   this.inputDrafts.delete(set.id);this.draftsChanged();
   if(current){
    this.setId.set('');
    const remaining=this.s.sets(set.workoutExerciseId),next=remaining.find(row=>row.number>=set.number)||remaining.at(-1);
    if(this.step()==='record'&&next)this.record(next);else this.navigate('detail');
   }
   this.remember(true);
  }finally{this.committing.set(false);}
 }
 ngOnDestroy(){clearInterval(this.timer);clearTimeout(this.inputTimer);clearTimeout(this.persistTimer);this.flush();void this.draftSession?.destroy();this.destroyed=true;}
}
