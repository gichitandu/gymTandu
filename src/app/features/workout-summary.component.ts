import {Component,computed,inject,signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {confirmationForContext} from '../services/confirmation';
import {WorkoutLogExercise,WorkoutLogSet} from '../models/domain';
import {Store} from '../services/store';
import {buildWorkoutSummary} from '../services/workout-summary';
import {coachHistory,coachNextSession,exerciseWeightStep,isCompoundExercise} from '../services/coach-shadow';
import {readSetFeedback} from '../services/coach-expert-adapter';
import {coachSessionReview} from '../services/coach-review';
import {CoachAiService,coachAiSessionContext,type CoachAiAdvice} from '../services/coach-ai';
import {IconComponent} from '../shared/icon.component';
@Component({standalone:true,imports:[RouterLink,IconComponent],styleUrl:'./workout-summary.component.css',template:`
<div class="workout-summary">
 @if(summary().workout;as workout){
 <div class="summary-top"><a class="summary-close" [routerLink]="closePath()" aria-label="Chiudi"><gt-icon name="close"/></a><details class="summary-menu" #menu><summary class="summary-close" aria-label="Altre azioni: riapri o elimina"><gt-icon name="more"/></summary><div class="summary-menu-panel"><button type="button" (click)="menu.open=false;reopen(workout.id)" [disabled]="s.busy()||reopening()||deleting()"><gt-icon name="repeat"/>{{reopening()?'Riapertura…':'Riapri e modifica'}}</button>@if(s.settings().allowCompletedWorkoutDeletion){<button type="button" class="danger" (click)="menu.open=false;remove(workout.id)" [disabled]="s.busy()||reopening()||deleting()"><gt-icon name="trash"/>{{deleting()?'Eliminazione…':'Elimina allenamento'}}</button>}@else{<a routerLink="/profilo" [queryParams]="{section:'settings'}"><gt-icon name="settings"/>Abilita l’eliminazione</a>}</div></details></div>
 <section class="summary-hero"><div class="summary-symbol"><gt-icon name="check"/></div><p class="summary-eyebrow">Allenamento completato</p><h1>{{workout.dayName}}</h1><p class="summary-caption">{{workout.planName}} · {{date(workout.date)}}</p></section>
 <section class="summary-metrics"><div class="card"><span class="metric-icon m-sets"><gt-icon name="plans"/></span><strong>{{summary().completed}}</strong><span>serie allenanti</span></div><div class="card"><span class="metric-icon m-time"><gt-icon name="clock"/></span><strong>{{summary().duration===null?'—':summary().duration}}<small>{{summary().duration===null?'':' min'}}</small></strong><span>{{summary().duration===null?'durata non indicata':'durata'}}</span></div><div class="card"><span class="metric-icon m-volume"><gt-icon name="weight"/></span><strong>{{summary().volumeKnown?s.formatWeight(summary().volume):'—'}}<small>{{summary().volumeKnown?' '+s.settings().unit:''}}</small></strong><span>volume</span></div><div class="card"><span class="metric-icon m-reps"><gt-icon name="repeat"/></span><strong>{{summary().reps}}</strong><span>ripetizioni allenanti</span></div></section>
 @if(summary().improvements.length){<section class="card summary-records"><div class="summary-card-head"><h2>Nuovi record · {{summary().improvements.length}}</h2><small>stessa configurazione</small></div>@for(record of summary().improvements;track $index){<div class="summary-row"><span class="record-medal"><gt-icon name="trophy"/></span><span><strong>{{record.name}}</strong><small>{{record.kind==='load'?'Carico massimo':'Ripetizioni massime'}} · {{record.kind==='load'?s.formatWeight(record.before):record.before}} → <b>{{record.kind==='load'?s.formatWeight(record.after):record.after}} {{record.kind==='load'?s.settings().unit:'rip.'}}</b></small></span></div>}</section>}
 @if(summary().comparisons.length){<section class="card summary-records summary-compare"><div class="summary-card-head"><h2>Rispetto all’ultima seduta</h2></div>@for(row of summary().comparisons;track $index){<div class="summary-row"><span><strong>{{row.name}}</strong><small>{{row.kind==='load'?'Carico massimo':'Ripetizioni massime'}} · {{date(row.date)}}</small></span><span class="compare-values">{{row.kind==='load'?s.formatWeight(row.before):row.before}} → <b>{{row.kind==='load'?s.formatWeight(row.after):row.after}}</b> {{row.kind==='load'?s.settings().unit:'rip.'}}</span></div>}</section>}
 @if(coachNext().length){<section class="card summary-records summary-coach" aria-label="Coach Ombra: consigli per la prossima seduta"><div class="summary-card-head"><h2>Coach Ombra · prossima volta</h2></div>@for(row of coachNext();track row.id){<div class="summary-row"><span><strong>{{row.name}}</strong><small>{{row.coach.reason}}</small></span><span class="compare-values coach-next" [attr.data-coach-action]="row.coach.action"><b>{{row.target}}</b><small>{{row.coach.title}}</small></span></div>}</section>}
 @if(review();as r){<section class="card summary-records summary-review" aria-label="Valutazione del Coach">
  <div class="summary-card-head"><h2>Valutazione del Coach</h2><small>{{r.workingSets}} {{r.workingSets===1?'serie allenante':'serie allenanti'}}</small></div>
  @if(r.declared){<div class="review-effort"><span class="review-bar" aria-hidden="true"><i class="ok" [style.width.%]="(r.effective-r.failure)/r.declared*100"></i><i class="fail" [style.width.%]="r.failure/r.declared*100"></i><i class="easy" [style.width.%]="r.easy/r.declared*100"></i></span><small><b class="ok">{{r.effective-r.failure}}</b> utili · <b class="fail">{{r.failure}}</b> a cedimento · <b class="easy">{{r.easy}}</b> facili<span> su {{r.declared}} con sforzo indicato</span></small></div>}
  @for(item of r.insights;track $index){<div class="summary-row review-item" [attr.data-tone]="item.tone"><span class="review-dot" aria-hidden="true"><gt-icon [name]="item.tone==='good'?'check':item.tone==='warn'?'shield':'info'"/></span><span><strong>{{item.title}}</strong><small>{{item.text}}</small></span></div>}
  @if(aiAdvice();as a){<div class="review-ai-answer" [attr.data-stance]="a.stance" aria-live="polite"><strong><gt-icon name="sparkle"/>{{a.headline||'Il parere del coach'}}</strong>@if(a.answer){<p class="review-ai-reply">{{a.answer}}</p>}<p>{{a.advice}}</p>@if(a.positives.length){<h3>Punti di forza</h3><ul>@for(item of a.positives;track $index){<li>{{item}}</li>}</ul>}@if(a.improvements.length){<h3>Da correggere</h3><ul>@for(item of a.improvements;track $index){<li>{{item}}</li>}</ul>}@if(a.focus){<p class="review-ai-focus"><b>Priorità per la prossima seduta:</b> {{a.focus}}</p>}<small>Risposta AI ({{a.provider==='gemini'?'Gemini':'Workers AI'}}): i carichi proposti restano quelli del Coach Ombra.@if(a.remaining!==undefined){ Analisi AI rimaste oggi: {{a.remaining}}.}</small></div>}
  @if(coachAi?.online()){@if(aiOpen()){<div class="review-ai-form"><label for="summary-coach-question">Domanda per il coach <small>(facoltativa)</small></label><textarea id="summary-coach-question" rows="2" maxlength="300" [value]="aiQuestion()" (input)="aiQuestion.set($any($event.target).value)" placeholder="Es. come organizzo la prossima settimana? Perché ho perso ripetizioni?" [disabled]="coachAi?.busy()"></textarea><div><button type="button" class="su-btn su-primary" (click)="askCoach()" [disabled]="coachAi?.busy()">{{coachAi?.busy()?'Il coach sta analizzando…':'Analizza la seduta'}}</button><button type="button" class="review-ai-close" (click)="coachAi?.cancel();aiOpen.set(false)">{{coachAi?.busy()?'Annulla':'Chiudi'}}</button></div></div>}@else{<button type="button" class="review-ai-open" (click)="aiOpen.set(true)"><gt-icon name="sparkle"/>{{aiAdvice()?'Altra domanda al coach AI':'Analisi completa con il coach AI'}}</button>}}
  @if(aiError();as error){<p class="review-ai-error" role="alert">{{error}}</p>}
 </section>}
 @if(workout.notes){<section class="card summary-notes"><gt-icon name="note"/><p>{{workout.notes}}</p></section>}
 <div class="summary-section-title"><h2>Le tue serie</h2><small>R = riscaldamento</small></div>
 <section class="card summary-exercises" aria-label="Le serie dell’allenamento">@for(row of summary().rows;track row.id){<div class="summary-exercise ws-exercise"><span class="summary-exercise-name"><strong>{{row.name}}</strong>@if(row.substitutedFrom){<small>Al posto di {{row.substitutedFrom.name}}</small>}</span><span class="set-count">{{s.sets(row.id).filter(completed).length}}/{{s.sets(row.id).length}}</span><span class="ws-sets">@for(set of s.sets(row.id);track set.id){<span class="ws-set" [class.off]="!set.completed" [class.warm]="set.kind==='warmup'">{{setLabel(row,set)}}</span>}</span></div>}</section>
 @if(summary().pending){<p class="summary-note">{{summary().pending}} {{summary().pending===1?'serie non completata, conservata':'serie non completate, conservate'}} nello storico.</p>}
 @if(summary().warmups){<p class="summary-note">{{summary().warmups}} {{summary().warmups===1?'serie di riscaldamento esclusa':'serie di riscaldamento escluse'}} dal volume allenante.</p>}
 <div class="summary-actions"><a class="su-btn su-primary summary-main" [routerLink]="closePath()">Fatto</a></div>
 }@else{<section class="card"><h1>Riepilogo non disponibile</h1><a class="button" routerLink="/allenamenti">Apri l’elenco degli allenamenti</a></section>}
</div>`})
export class WorkoutSummaryComponent{
 readonly s=inject(Store);private id=signal('');readonly summary=computed(()=>buildWorkoutSummary(this.s.data(),this.id()));readonly planId=computed(()=>this.s.data().plans.find(p=>p.id===this.summary().workout?.planId)?.id);
 /** Coach Ombra: cosa fare la prossima volta, solo per gli esercizi che non hanno già una seduta più recente. */
 readonly coachNext=computed(()=>{
  const data=this.s.data(),workout=this.summary().workout;if(!workout)return [];
  const later=new Set(data.workouts.filter(w=>w.id!==workout.id&&(w.date>workout.date||w.date===workout.date&&w.startedAt>workout.startedAt)).map(w=>w.id));
  const unit=(kg:number)=>this.s.formatWeight(kg)+' '+this.s.settings().unit;
  return this.summary().rows.flatMap(row=>{
   if(row.repsMin===undefined||row.repsMax===undefined||data.workoutExercises.some(e=>e.exerciseId===row.exerciseId&&later.has(e.workoutId)))return [];
   const completed=this.s.sets(row.id).filter(set=>set.completed&&set.kind!=='warmup').map(set=>{const f=readSetFeedback(set.notes);return {weight:set.weight,reps:set.reps,rpe:set.rpe,...(f?{rir:f.rir??null,technique:f.technique,pain:f.pain}:{})};});
   const coach=coachNextSession({repsMin:row.repsMin,repsMax:row.repsMax,incrementKg:this.s.preference(row.exerciseId)?.weightStep??(this.s.settings().unit==='kg'?exerciseWeightStep(data,row.exerciseId,row.machineSetup):undefined)??this.s.kg(2.5),incrementInferred:!this.s.preference(row.exerciseId)?.weightStep&&this.s.settings().unit==='kg'&&!!exerciseWeightStep(data,row.exerciseId,row.machineSetup),loadMode:row.loadMode,targetRpe:row.rirMin===undefined?undefined:10-(row.rirMin+(row.rirMax??row.rirMin))/2,history:coachHistory(data,row,12),completed,formatWeight:unit,compound:isCompoundExercise(this.s.exercise(row.exerciseId)??row),bodyWeight:workout.bodyWeight??data.profiles[0]?.bodyWeight});
   if(!coach)return [];
   // Schema per serie: «40 kg × 10 · 9 · 9 rip.» oppure «42,5 kg × 8 · 40 kg × 10» se i carichi cambiano.
   const plan=coach.sets?.length?coach.sets:[{weight:coach.weight,reps:coach.reps}],sameLoad=plan.every(item=>Math.abs(item.weight-plan[0].weight)<0.000001);
   const target=row.loadMode==='bodyweight'?plan.map(item=>item.reps).join(' · ')+' rip.':sameLoad?unit(plan[0].weight)+' × '+plan.map(item=>item.reps).join(' · ')+' rip.':plan.map(item=>unit(item.weight)+' × '+item.reps).join(' · ');
   return [{id:row.id,name:row.name,coach,target}];
  });
 });
 /** Valutazione del Coach: qualità dello sforzo, segnali da correggere e volume per muscolo. */
 readonly review=computed(()=>coachSessionReview(this.s.data(),this.id()));
 /* Coach con l'AI: analisi della seduta su richiesta, con la valutazione del Coach come base. */
 readonly coachAi=inject(CoachAiService,{optional:true});readonly aiOpen=signal(false);readonly aiQuestion=signal('');
 private aiResult=signal<{id:string;advice?:CoachAiAdvice;error?:string}|null>(null);
 readonly aiAdvice=computed(()=>{const r=this.aiResult();return r&&r.id===this.id()?r.advice??null:null;});
 readonly aiError=computed(()=>{const r=this.aiResult();return r&&r.id===this.id()?r.error??'':'';});
 async askCoach(){
  const workout=this.summary().workout,review=this.review(),ai=this.coachAi;if(!ai||!workout||!review||ai.busy())return;
  const id=workout.id,context=coachAiSessionContext({dayName:workout.dayName,planName:workout.planName,date:workout.date,duration:this.summary().duration,unit:this.s.settings().unit,review,
   next:this.coachNext().map(row=>({name:row.name,target:row.target,title:row.coach.title})),records:this.summary().improvements,toUnit:kg=>this.s.weight(kg)});
  this.aiResult.set(null);
  try{const advice=await ai.ask('session',context,this.aiQuestion());this.aiResult.set({id,advice});this.aiOpen.set(false);this.aiQuestion.set('');}
  catch(error){this.aiResult.set({id,error:error instanceof Error?error.message:'Analisi del coach non riuscita. Riprova.'});}
 }
 completed=(set:{completed:boolean})=>set.completed;
 private router=inject(Router);private confirmation=confirmationForContext();
 readonly reopening=signal(false);readonly deleting=signal(false);private from=signal('');
 /** Da dove sei arrivato: calendario/elenco se aperto da lì, altrimenti Oggi. */
 readonly closePath=computed(()=>this.from()==='calendario'?'/calendario':this.from()==='elenco'?'/allenamenti':'/');
 constructor(){const route=inject(ActivatedRoute);route.paramMap.pipe(takeUntilDestroyed()).subscribe(params=>this.id.set(params.get('id')||''));route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params=>this.from.set(params.get('from')||''));}
 setLabel(row:WorkoutLogExercise,set:WorkoutLogSet){const prefix=set.kind==='warmup'?'R ':'';if(!set.completed&&!set.weight)return prefix+'—';return prefix+(row.loadMode==='bodyweight'||!set.weight?set.reps+' rip.':this.s.formatWeight(set.weight)+'×'+set.reps);}
 async reopen(id:string){if(this.reopening())return;this.reopening.set(true);try{if(await this.s.reopenWorkout(id))await this.router.navigateByUrl('/sessione');}finally{this.reopening.set(false);}}
 async remove(id:string){
  if(this.deleting()||this.reopening()||this.s.busy())return;
  const workout=this.s.data().workouts.find(w=>w.id===id);if(!workout||workout.status==='completed'&&!this.s.settings().allowCompletedWorkoutDeletion)return;
  const archive=this.s.archiveKey();this.deleting.set(true);
  try{if(!await this.confirmation.ask({title:'Eliminare questo allenamento?',message:workout.dayName+' · '+workout.date.split('-').reverse().join('/')+'. La sessione, tutte le sue serie e la relativa voce nel calendario saranno eliminate definitivamente. Statistiche e record saranno ricalcolati. Il piano e gli altri allenamenti restano conservati.',confirmLabel:'Elimina allenamento',tone:'danger'}))return;
   if(archive!==this.s.archiveKey())return;
   if(await this.s.deleteWorkout(id,{confirmedCompleted:true}))await this.router.navigateByUrl(this.closePath());
  }finally{this.deleting.set(false);}
 }
 date(value:string){return new Date(value+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
}
