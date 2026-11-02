import {Component,computed,inject} from '@angular/core';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {Store} from '../services/store';
import {IconComponent} from '../shared/icon.component';
import {ExerciseThumbComponent} from '../shared/exercise-thumb.component';
import {ExerciseMotionComponent} from '../shared/exercise-motion.component';
import {ExerciseVideoComponent} from '../shared/exercise-video.component';
import {MachineSetupComponent} from '../shared/machine-setup.component';
import {MuscleMapComponent} from '../shared/muscle-map.component';
import {StatusComponent} from '../shared/status.component';
@Component({standalone:true,imports:[RouterLink,IconComponent,ExerciseThumbComponent,ExerciseMotionComponent,ExerciseVideoComponent,MachineSetupComponent,MuscleMapComponent,StatusComponent],template:`
<header class="neon-page-heading"><a class="icon-btn ghost" routerLink="/catalogo" aria-label="Torna al catalogo"><gt-icon name="back"/></a><div><p class="eyebrow">CATALOGO ESERCIZI</p><h1>{{exercise()?.name||'Esercizio'}}</h1></div>@if(exercise();as e){<button class="icon-btn ghost" [attr.aria-label]="s.isFavorite(e.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti'" [attr.aria-pressed]="s.isFavorite(e.id)" (click)="s.toggleFavorite(e.id)" [disabled]="s.busy()">{{s.isFavorite(e.id)?'★':'☆'}}</button>}</header>
<gt-status/>
@if(exercise();as e){
 <section class="card exercise-detail-hero"><gt-exercise-thumb [exercise]="e"/><div class="actions"><span class="pill">{{s.muscle(e.muscleGroupId)}}</span><span class="pill">{{e.equipment}}</span>@if(!e.active){<span class="pill">Disattivato</span>}</div><gt-exercise-motion [exercise]="e" [showSequence]="showSequence()"/></section>
 <section class="card exercise-instructions"><h2>Esecuzione</h2><p>{{e.description||'Non sono ancora presenti indicazioni per questa variante.'}}</p><gt-exercise-video [exercise]="e"/></section>
 <section class="card exercise-instructions"><h2>Muscoli coinvolti</h2><gt-muscle-map [primary]="s.muscle(e.muscleGroupId)" [secondary]="secondary()"/><p class="subtle">Gruppi assegnati nel tuo catalogo.</p><a class="button ghost" routerLink="/focus-muscolare">Apri il tuo focus muscolare <gt-icon name="arrow"/></a></section>
 <section class="card exercise-instructions"><h2>La tua configurazione</h2><gt-machine-setup [exerciseId]="e.id"/>@if(e.tags.length){<div class="actions">@for(tag of e.tags;track tag){<span class="pill">{{tag}}</span>}</div>}</section>
}@else{<section class="card empty"><h2>Esercizio non disponibile</h2><p>Potrebbe essere stato rimosso dal catalogo.</p><a class="button ghost" routerLink="/catalogo">Apri catalogo</a></section>}
`})
export class ExerciseDetailComponent{
 s=inject(Store);private route=inject(ActivatedRoute);private params=toSignal(this.route.paramMap,{initialValue:this.route.snapshot.paramMap});
 private query=toSignal(this.route.queryParamMap,{initialValue:this.route.snapshot.queryParamMap});
 showSequence=computed(()=>this.query().get('motion')==='1');
 exercise=computed(()=>this.s.exercise(this.params().get('id')||''));
 secondary=computed(()=>this.exercise()?.secondaryMuscleIds.map(id=>this.s.muscle(id))||[]);
}
