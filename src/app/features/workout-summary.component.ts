import {Component,computed,inject,signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {buildWorkoutSummary} from '../services/workout-summary';
import {IconComponent} from '../shared/icon.component';
@Component({standalone:true,imports:[RouterLink,IconComponent],styleUrl:'./workout-summary.component.css',template:`
<div class="workout-summary">
 @if(summary().workout;as workout){
 <div class="summary-symbol"><gt-icon name="check"/></div><p class="summary-eyebrow">ALLENAMENTO CONCLUSO</p><h1>{{workout.dayName}}</h1><p class="summary-caption">{{workout.planName}} · {{date(workout.date)}}</p>
 <section class="summary-metrics"><div class="card"><strong>{{summary().completed}}</strong><span>serie allenanti</span></div><div class="card"><strong>{{summary().duration===null?'—':summary().duration}}<small>{{summary().duration===null?'':' min'}}</small></strong><span>{{summary().duration===null?'durata non indicata':'durata'}}</span></div><div class="card"><strong>{{summary().volumeKnown?s.formatWeight(summary().volume):'—'}}</strong><span>volume · {{s.settings().unit}}</span></div><div class="card"><strong>{{summary().reps}}</strong><span>ripetizioni allenanti</span></div></section>
 @if(summary().pending){<p class="summary-note">{{summary().pending}} serie non completate, conservate nello storico.</p>}
 @if(summary().warmups){<p class="summary-note">{{summary().warmups}} serie di riscaldamento escluse dal volume allenante.</p>}
 @if(summary().improvements.length){<section class="card summary-records"><h2>Nuovi record</h2>@for(record of summary().improvements;track $index){<div><gt-icon name="trophy"/><span><strong>{{record.name}}</strong><small>{{record.kind==='load'?s.formatWeight(record.before):record.before}} → {{record.kind==='load'?s.formatWeight(record.after):record.after}} {{record.kind==='load'?s.settings().unit:'rip.'}}</small></span></div>}<p>Confronto con le sedute precedenti della stessa configurazione.</p></section>}
 @if(summary().comparisons.length){<section class="card summary-records"><h2>Rispetto all’ultima seduta</h2>@for(row of summary().comparisons;track $index){<div><span><strong>{{row.name}}</strong><small>{{row.kind==='load'?'Carico massimo':'Ripetizioni massime'}} · {{date(row.date)}}</small><small>{{row.kind==='load'?s.formatWeight(row.before):row.before}} → {{row.kind==='load'?s.formatWeight(row.after):row.after}} {{row.kind==='load'?s.settings().unit:'rip.'}}</small></span></div>}</section>}
 <section class="card summary-exercises"><h2>La tua seduta</h2>@for(row of summary().rows;track row.id){<div><strong>{{row.name}}</strong>@if(row.substitutedFrom){<small>Al posto di {{row.substitutedFrom.name}}</small>}<span>{{s.sets(row.id).filter(completed).length}} / {{s.sets(row.id).length}} serie</span></div>}</section>
 <div class="summary-actions"><a class="button primary" routerLink="/allenamenti" [queryParams]="{workout:workout.id}">Vedi dettagli</a><a class="button ghost" routerLink="/">Torna alla Home</a>@if(planId()){<a class="button ghost" [routerLink]="['/piano',planId()]">Statistiche del piano</a>}</div>
 }@else{<section class="card"><h1>Riepilogo non disponibile</h1><a class="button" routerLink="/allenamenti">Apri storico</a></section>}
</div>`})
export class WorkoutSummaryComponent{
 readonly s=inject(Store);private id=signal('');readonly summary=computed(()=>buildWorkoutSummary(this.s.data(),this.id()));readonly planId=computed(()=>this.s.data().plans.find(p=>p.id===this.summary().workout?.planId)?.id);
 completed=(set:{completed:boolean})=>set.completed;
 constructor(){inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params=>this.id.set(params.get('id')||''));}
 date(value:string){return new Date(value+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
}
