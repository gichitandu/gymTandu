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
@Component({standalone:true,imports:[RouterLink,IconComponent,ExerciseThumbComponent,ExerciseMotionComponent,ExerciseVideoComponent,MachineSetupComponent,MuscleMapComponent,StatusComponent],styles:[`
 :host{display:block;max-width:620px;margin:0 auto}
 .ex3-head{gap:10px}.ex3-head .icon-btn{flex:none;width:44px;min-width:44px;height:44px;border-radius:14px;border:1px solid var(--line);background:color-mix(in srgb,var(--text) 4%,transparent)}
 .ex3-head .eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--accent-text)}.ex3-head h1{font-size:24px;font-weight:900;letter-spacing:-.02em;line-height:1.15;overflow-wrap:anywhere}
 .ex3-fav{font-size:20px;color:var(--muted)}.ex3-fav.on{color:var(--warning,#fcd34d);border-color:color-mix(in srgb,var(--warning,#fcd34d) 45%,transparent)}
 .card{margin:0 0 12px;border:1px solid color-mix(in srgb,var(--text) 12%,transparent);border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--text) 6%,var(--card)),var(--card));box-shadow:inset 0 1px color-mix(in srgb,#fff 5%,transparent)}
 .exercise-detail-hero{padding:12px;overflow:hidden}.exercise-detail-hero>gt-exercise-thumb{border-radius:16px}
 .ex3-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
 .ex3-chip{display:inline-flex;align-items:center;height:28px;padding:0 11px;border-radius:999px;background:color-mix(in srgb,var(--text) 9%,transparent);color:color-mix(in srgb,var(--text) 85%,var(--muted));font-size:12px;font-weight:700}
 .ex3-chip.main{background:color-mix(in srgb,var(--accent) 15%,transparent);color:var(--accent-text)}.ex3-chip.off{background:color-mix(in srgb,var(--danger,#fb7185) 12%,transparent);color:color-mix(in srgb,var(--danger,#fb7185) 85%,var(--text))}
 .exercise-instructions{padding:14px}.exercise-instructions h2{margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
 .exercise-instructions p{font-size:14px;line-height:1.55;color:color-mix(in srgb,var(--text) 85%,var(--muted))}
 .exercise-instructions .button{min-height:44px;gap:6px;border-radius:14px;color:var(--accent-text)}
 `],template:`
<header class="neon-page-heading ex3-head"><a class="icon-btn ghost" routerLink="/catalogo" aria-label="Torna al catalogo"><gt-icon name="back"/></a><div><p class="eyebrow">CATALOGO ESERCIZI</p><h1>{{exercise()?.name||'Esercizio'}}</h1></div>@if(exercise();as e){<button [attr.aria-label]="s.isFavorite(e.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti'" [attr.aria-pressed]="s.isFavorite(e.id)" (click)="s.toggleFavorite(e.id)" [disabled]="s.busy()" class="icon-btn ghost ex3-fav" [class.on]="s.isFavorite(e.id)">{{s.isFavorite(e.id)?'★':'☆'}}</button>}</header>
<gt-status/>
@if(exercise();as e){
 <section class="card exercise-detail-hero"><gt-exercise-thumb [exercise]="e"/><div class="ex3-chips"><span class="ex3-chip main">{{s.muscle(e.muscleGroupId)}}</span><span class="ex3-chip">{{e.equipment}}</span>@if(!e.active){<span class="ex3-chip off">Disattivato</span>}</div><gt-exercise-motion [exercise]="e" [showSequence]="showSequence()"/></section>
 <section class="card exercise-instructions"><h2>Esecuzione</h2><p>{{e.description||'Non sono ancora presenti indicazioni per questa variante.'}}</p><gt-exercise-video [exercise]="e"/></section>
 <section class="card exercise-instructions"><h2>Muscoli coinvolti</h2><gt-muscle-map [primary]="s.muscle(e.muscleGroupId)" [secondary]="secondary()"/><p class="subtle">Gruppi assegnati nel tuo catalogo.</p><a class="button ghost" routerLink="/focus-muscolare">Apri il tuo focus muscolare <gt-icon name="arrow"/></a></section>
 <section class="card exercise-instructions"><h2>La tua configurazione</h2><gt-machine-setup [exerciseId]="e.id"/>@if(e.tags.length){<div class="ex3-chips">@for(tag of e.tags;track tag){<span class="ex3-chip">{{tag}}</span>}</div>}</section>
}@else{<section class="card empty"><h2>Esercizio non disponibile</h2><p>Potrebbe essere stato rimosso dal catalogo.</p><a class="button ghost" routerLink="/catalogo">Apri catalogo</a></section>}
`})
export class ExerciseDetailComponent{
 s=inject(Store);private route=inject(ActivatedRoute);private params=toSignal(this.route.paramMap,{initialValue:this.route.snapshot.paramMap});
 private query=toSignal(this.route.queryParamMap,{initialValue:this.route.snapshot.queryParamMap});
 showSequence=computed(()=>this.query().get('motion')==='1');
 exercise=computed(()=>this.s.exercise(this.params().get('id')||''));
 secondary=computed(()=>this.exercise()?.secondaryMuscleIds.map(id=>this.s.muscle(id))||[]);
}
