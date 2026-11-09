import {Component,computed,inject,signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {buildWorkoutSummary} from '../services/workout-summary';
import {IconComponent} from '../shared/icon.component';
@Component({standalone:true,imports:[RouterLink,IconComponent],styleUrl:'./workout-summary.component.css',template:`
<div class="workout-summary">
 @if(summary().workout;as workout){
 <div class="summary-top"><a class="summary-close" routerLink="/" aria-label="Chiudi e torna alla Home"><gt-icon name="close"/></a></div>
 <section class="summary-hero"><div class="summary-symbol"><gt-icon name="check"/></div><p class="summary-eyebrow">Allenamento concluso</p><h1>{{workout.dayName}}</h1><p class="summary-caption">{{workout.planName}} · {{date(workout.date)}}</p></section>
 <section class="summary-metrics"><div class="card"><span class="metric-icon m-sets"><gt-icon name="plans"/></span><strong>{{summary().completed}}</strong><span>serie allenanti</span></div><div class="card"><span class="metric-icon m-time"><gt-icon name="clock"/></span><strong>{{summary().duration===null?'—':summary().duration}}<small>{{summary().duration===null?'':' min'}}</small></strong><span>{{summary().duration===null?'durata non indicata':'durata'}}</span></div><div class="card"><span class="metric-icon m-volume"><gt-icon name="weight"/></span><strong>{{summary().volumeKnown?s.formatWeight(summary().volume):'—'}}<small>{{summary().volumeKnown?' '+s.settings().unit:''}}</small></strong><span>volume</span></div><div class="card"><span class="metric-icon m-reps"><gt-icon name="repeat"/></span><strong>{{summary().reps}}</strong><span>ripetizioni allenanti</span></div></section>
 @if(summary().improvements.length){<section class="card summary-records"><div class="summary-card-head"><h2>Nuovi record · {{summary().improvements.length}}</h2><small>stessa configurazione</small></div>@for(record of summary().improvements;track $index){<div class="summary-row"><span class="record-medal"><gt-icon name="trophy"/></span><span><strong>{{record.name}}</strong><small>{{record.kind==='load'?'Carico massimo':'Ripetizioni massime'}} · {{record.kind==='load'?s.formatWeight(record.before):record.before}} → <b>{{record.kind==='load'?s.formatWeight(record.after):record.after}} {{record.kind==='load'?s.settings().unit:'rip.'}}</b></small></span></div>}</section>}
 @if(summary().comparisons.length){<section class="card summary-records summary-compare"><div class="summary-card-head"><h2>Rispetto all’ultima seduta</h2></div>@for(row of summary().comparisons;track $index){<div class="summary-row"><span><strong>{{row.name}}</strong><small>{{row.kind==='load'?'Carico massimo':'Ripetizioni massime'}} · {{date(row.date)}}</small></span><span class="compare-values">{{row.kind==='load'?s.formatWeight(row.before):row.before}} → <b>{{row.kind==='load'?s.formatWeight(row.after):row.after}}</b> {{row.kind==='load'?s.settings().unit:'rip.'}}</span></div>}</section>}
 <section class="card summary-exercises" aria-label="La tua seduta">@for(row of summary().rows;track row.id){<div class="summary-exercise"><span class="summary-exercise-name"><strong>{{row.name}}</strong>@if(row.substitutedFrom){<small>Al posto di {{row.substitutedFrom.name}}</small>}</span><span class="set-dots" aria-hidden="true">@for(set of s.sets(row.id);track set.id){<i [class.on]="set.completed"></i>}</span><span class="set-count">{{s.sets(row.id).filter(completed).length}}/{{s.sets(row.id).length}}</span></div>}</section>
 @if(summary().pending){<p class="summary-note">{{summary().pending}} serie non completate, conservate nello storico.</p>}
 @if(summary().warmups){<p class="summary-note">{{summary().warmups}} serie di riscaldamento escluse dal volume allenante.</p>}
 <div class="summary-actions"><a class="button primary summary-main" routerLink="/allenamenti" [queryParams]="{workout:workout.id}">Vedi dettagli</a><div class="summary-secondary">@if(planId()){<a class="button ghost" [routerLink]="['/piano',planId()]"><gt-icon name="chart"/>Statistiche piano</a>}<a class="button ghost" routerLink="/"><gt-icon name="home"/>Home</a></div></div>
 }@else{<section class="card"><h1>Riepilogo non disponibile</h1><a class="button" routerLink="/allenamenti">Apri storico</a></section>}
</div>`})
export class WorkoutSummaryComponent{
 readonly s=inject(Store);private id=signal('');readonly summary=computed(()=>buildWorkoutSummary(this.s.data(),this.id()));readonly planId=computed(()=>this.s.data().plans.find(p=>p.id===this.summary().workout?.planId)?.id);
 completed=(set:{completed:boolean})=>set.completed;
 constructor(){inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params=>this.id.set(params.get('id')||''));}
 date(value:string){return new Date(value+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
}
