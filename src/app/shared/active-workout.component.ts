import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '../services/store';
import { WorkoutLogExercise, WorkoutLogSet } from '../models/domain';
import { ExerciseThumbComponent } from './exercise-thumb.component';
import { ExerciseVideoComponent } from './exercise-video.component';
import { IconComponent } from './icon.component';
@Component({selector:'gt-active-workout',standalone:true,imports:[FormsModule,ExerciseThumbComponent,ExerciseVideoComponent,IconComponent],template:`
@if(step()==='list'){
<div class="section-title"><h2>Allenamento in corso</h2><span class="pill green">{{completedSets()}} / {{allSets().length}} serie</span></div>
<div class="training-list">@for(e of exercises();track e.id){<button class="card training-list-row" (click)="open(e)"><gt-exercise-thumb [exercise]="s.exercise(e.exerciseId)"/><span><strong>{{e.name}}</strong><small>{{count(e.id)}} / {{s.sets(e.id).length}} serie · {{muscle(e)}}</small></span><span class="exercise-state" [class.complete]="count(e.id)===s.sets(e.id).length">{{count(e.id)===s.sets(e.id).length?'✓':'›'}}</span></button>}</div><button class="primary full-width workout-end" (click)="finish.emit()" [disabled]="s.busy()">Termina allenamento</button>
}@else if(selected();as e){
<div class="focus-heading"><button class="icon-btn ghost" aria-label="Torna al riepilogo" (click)="step.set('list')"><gt-icon name="back"/></button><div><h2>{{e.name}}</h2><p class="subtle">{{muscle(e)}} · {{s.exercise(e.exerciseId)?.equipment}}</p></div><span class="pill">{{count(e.id)}}/{{s.sets(e.id).length}}</span></div>
@if(step()==='detail'){
<gt-exercise-thumb class="exercise-feature-image" [exercise]="s.exercise(e.exerciseId)"/><gt-exercise-video [exercise]="s.exercise(e.exerciseId)"/>
<div class="segmented"><button [class.active]="tab()==='sets'" (click)="tab.set('sets')">Serie</button><button [class.active]="tab()==='history'" (click)="tab.set('history')">Storico</button><button [class.active]="tab()==='notes'" (click)="tab.set('notes')">Note</button></div>
@if(tab()==='sets'){<div class="card focus-set-list"><div class="focus-set-row table-caption"><span>#</span><span>Peso ({{s.settings().unit}})</span><span>Rip.</span><span>RPE</span></div>@for(set of s.sets(e.id);track set.id){<button class="focus-set-row" [class.is-complete]="set.completed" (click)="record(set)"><span>{{set.number}}</span><span>{{e.loadMode==='bodyweight'?'—':s.formatWeight(set.weight)}}</span><span>{{set.reps}}</span><span>{{set.rpe??'—'}} {{set.completed?'✓':'›'}}</span></button>}<button class="ghost full-width" (click)="s.addSet(e.id)">+ Aggiungi serie</button></div><button class="primary full-width" (click)="nextRecord()">{{count(e.id)===s.sets(e.id).length?'Rivedi le serie':'Registra prossima serie'}}</button>}
@if(tab()==='history'){<section class="card"><h3>Ultimo allenamento</h3>@if(previous().length){<div class="previous-values">@for(p of previous();track p.id){<span>{{s.formatWeight(p.weight)}} {{s.settings().unit}} × {{p.reps}}</span>}</div><button class="primary full-width" (click)="s.copyPrevious(e.id)">Usa gli ultimi valori</button>}@else{<p class="subtle">Nessun dato precedente per questo esercizio.</p>}</section>}
@if(tab()==='notes'){<section class="card"><label>Note dell’esercizio<textarea [ngModel]="e.notes" (ngModelChange)="saveNotes(e.id,$event)" maxlength="2000"></textarea></label><p class="subtle" style="margin-top:12px">Recupero previsto: {{e.rest}} secondi.</p></section>}
<div class="actions"><button (click)="step.set('list')">Riepilogo allenamento</button></div>
}
@if(step()==='record'&&currentSet();as set){
<p class="focus-series-label">Serie {{set.number}} di {{s.sets(e.id).length}}</p>
@if(e.loadMode!=='bodyweight'){<div class="weight-entry"><button class="stepper" aria-label="Riduci peso" (click)="adjustWeight(-2.5)">−</button><div class="weight-orbit"><input type="number" inputmode="decimal" aria-label="Peso della serie" [(ngModel)]="weight" (change)="saveDraft()" min="0" step="0.5"/><span>{{s.settings().unit}}{{e.loadMode==='assisted'?' assistenza':e.loadMode==='weighted-bodyweight'?' zavorra':''}}</span></div><button class="stepper" aria-label="Aumenta peso" (click)="adjustWeight(2.5)">+</button></div>}
<div class="reps-entry"><button class="stepper" aria-label="Riduci ripetizioni" (click)="adjustReps(-1)">−</button><label><input type="number" inputmode="numeric" aria-label="Ripetizioni della serie" [(ngModel)]="reps" (change)="saveDraft()" min="1" max="999"/><span>ripetizioni</span></label><button class="stepper" aria-label="Aumenta ripetizioni" (click)="adjustReps(1)">+</button></div>
<label class="rpe-control">RPE (facoltativo)<select [(ngModel)]="rpe" (ngModelChange)="saveDraft()"><option [ngValue]="undefined">Non indicato</option>@for(value of rpes;track value){<option [ngValue]="value">{{value}}</option>}</select></label>
<label>Note della serie<input [(ngModel)]="setNotes" (change)="saveDraft()" maxlength="500" placeholder="Sensazioni, tecnica…"/></label>
<button class="primary full-width complete-series" (click)="complete()" [disabled]="committing()">{{committing()?'Salvataggio…':'Completa serie'}} <gt-icon name="check"/></button><div class="series-dots">@for(x of s.sets(e.id);track x.id){<button [class.complete]="x.completed" [attr.aria-label]="'Apri serie '+x.number" (click)="record(x)">{{x.completed?'✓':x.number}}</button>}</div><div class="actions"><button class="ghost" (click)="step.set('detail')">Torna alle serie</button><button class="ghost danger" (click)="removeSet(set)">Elimina serie</button></div>
}
@if(step()==='rest'){
<h2 class="rest-title">Timer recupero</h2><div class="rest-orbit" [style.--rest-progress]="restRatio()+'%'" role="timer" [attr.aria-label]="'Recupero: '+remaining()+' secondi'"><div><strong>{{formatSeconds(remaining())}}</strong><span>{{remaining()===0?'Recupero terminato':paused()?'In pausa':'Respira. Preparati.'}}</span></div></div><div class="timer-controls"><button aria-label="Riduci recupero di 15 secondi" (click)="adjustRest(-15)">−15 s</button><button (click)="pauseRest()" [attr.aria-label]="paused()?'Riprendi timer':'Metti timer in pausa'">{{paused()?'▶':'Ⅱ'}}</button><button aria-label="Aumenta recupero di 15 secondi" (click)="adjustRest(15)">+15 s</button></div><div class="card next-exercise-preview"><p class="subtle">{{nextExercise()?.id===e.id?'Prossima serie':'Prossimo esercizio'}}</p>@if(nextExercise();as next){<div class="exercise-info"><gt-exercise-thumb [exercise]="s.exercise(next.exerciseId)"/><div><h3>{{next.name}}</h3><p class="subtle">{{count(next.id)}}/{{s.sets(next.id).length}} serie completate</p></div></div>}@else{<h3>Tutte le serie sono registrate</h3>}</div><button class="primary full-width" (click)="advance()">{{nextExercise()?'Continua allenamento':'Vai al riepilogo'}}</button><button class="ghost full-width" (click)="step.set('list')">Riepilogo in tempo reale</button>
}
}
@if(remaining()>0&&step()!=='rest'){<button class="compact-rest-chip" (click)="step.set('rest')"><gt-icon name="clock"/> {{formatSeconds(remaining())}} · Apri recupero</button>}
`})
export class ActiveWorkoutComponent {
 committing=signal(false);
 s=inject(Store);workoutId=input.required<string>();finish=output<void>();step=signal<'list'|'detail'|'record'|'rest'>('list');tab=signal<'sets'|'history'|'notes'>('sets');exerciseId=signal('');setId=signal('');clock=signal(Date.now());restEnd=signal(0);paused=signal(false);pausedSeconds=signal(0);restTotal=signal(90);weight=0;reps=8;rpe:number|undefined;setNotes='';rpes=[1,2,3,4,5,6,6.5,7,7.5,8,8.5,9,9.5,10];
 private timer=setInterval(()=>this.clock.set(Date.now()),1000);
 exercises=computed(()=>this.s.workoutExercises(this.workoutId()));selected=computed(()=>this.exercises().find(e=>e.id===this.exerciseId()));allSets=computed(()=>this.exercises().flatMap(e=>this.s.sets(e.id)));completedSets=computed(()=>this.allSets().filter(s=>s.completed).length);currentSet=computed(()=>this.allSets().find(s=>s.id===this.setId()));
 previous=computed(()=>{const e=this.selected();return e?this.s.previous(e.exerciseId,e.workoutId):[];});
 remaining=computed(()=>this.paused()?this.pausedSeconds():Math.max(0,Math.ceil((this.restEnd()-this.clock())/1000)));
 restRatio=computed(()=>Math.min(100,this.remaining()/Math.max(1,this.restTotal())*100));
 nextExercise=computed(()=>{const current=this.selected();if(current&&this.s.sets(current.id).some(s=>!s.completed))return current;return this.exercises().find(e=>this.s.sets(e.id).some(s=>!s.completed));});
 muscle(e:WorkoutLogExercise){return this.s.muscle(this.s.exercise(e.exerciseId)?.muscleGroupId||'');}
 count(id:string){return this.s.sets(id).filter(s=>s.completed).length;}
 open(e:WorkoutLogExercise){this.exerciseId.set(e.id);this.tab.set('sets');this.step.set('detail');}
 record(s:WorkoutLogSet){this.setId.set(s.id);this.weight=this.s.weight(s.weight);this.reps=s.reps;this.rpe=s.rpe;this.setNotes=s.notes||'';this.step.set('record');}
 nextRecord(){const e=this.selected();if(!e)return;const sets=this.s.sets(e.id),set=sets.find(s=>!s.completed)||sets[0];if(set)this.record(set);}
 adjustWeight(delta:number){this.weight=Math.max(0,+(this.weight+delta).toFixed(2));void this.saveDraft();}
 adjustReps(delta:number){this.reps=Math.min(999,Math.max(1,this.reps+delta));void this.saveDraft();}
 async saveDraft(completed?:boolean){const set=this.currentSet();if(!set)return false;if(!Number.isFinite(this.weight)||this.weight<0||!Number.isInteger(this.reps)||this.reps<1||this.reps>999){this.s.error.set('Controlla peso e ripetizioni.');return false;}return this.s.updateSet(set.id,{weight:this.s.kg(this.weight),reps:this.reps,rpe:this.rpe,notes:this.setNotes,...(completed===undefined?{}:{completed})});}
 async complete(){if(this.committing())return;this.committing.set(true);try{if(!await this.saveDraft(true))return;const rest=this.currentSet()?.rest??this.selected()?.rest??90;this.clock.set(Date.now());this.restTotal.set(rest);this.paused.set(false);this.restEnd.set(Date.now()+rest*1000);this.step.set('rest');}finally{this.committing.set(false);}}
 pauseRest(){this.clock.set(Date.now());if(this.paused()){this.restEnd.set(Date.now()+this.pausedSeconds()*1000);this.paused.set(false);}else{this.pausedSeconds.set(this.remaining());this.paused.set(true);}}
 adjustRest(delta:number){const seconds=Math.max(0,this.remaining()+delta);this.restTotal.set(Math.max(this.restTotal(),seconds));if(this.paused())this.pausedSeconds.set(seconds);else{this.clock.set(Date.now());this.restEnd.set(Date.now()+seconds*1000);}}
 formatSeconds(seconds:number){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
 advance(){this.restEnd.set(0);this.paused.set(false);const next=this.nextExercise();if(next){this.exerciseId.set(next.id);this.nextRecord();}else this.step.set('list');}
 saveNotes(id:string,notes:string){void this.s.change(d=>{const e=d.workoutExercises.find(e=>e.id===id);if(e)e.notes=notes;},'',false);}
 async removeSet(set:WorkoutLogSet){if(!set.completed||confirm('Eliminare questa serie completata?'))if(await this.s.removeSet(set.id))this.step.set('detail');}
 ngOnDestroy(){clearInterval(this.timer);}
}
