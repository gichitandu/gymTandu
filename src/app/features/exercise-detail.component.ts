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
 :host{display:block;max-width:none;margin:0 auto}
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
 .ex-numbers .su-stats{margin-bottom:10px}.ex-record{color:var(--warning,#f5c765)}
 .ex-chart{padding:12px;border-radius:16px;background:color-mix(in srgb,var(--text) 4%,transparent);border:1px solid color-mix(in srgb,var(--text) 8%,transparent)}
 .ex-chart-head,.ex-chart-foot{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:700}.ex-chart-foot{font-size:11px;font-weight:600;color:var(--muted)}
 .ex-chart svg{display:block;width:100%;height:90px;margin:8px 0 4px;overflow:visible}
 .ex-line{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.ex-area{fill:color-mix(in srgb,var(--accent) 18%,transparent)}.ex-dot{fill:var(--text)}
 `],template:`
<header class="neon-page-heading ex3-head"><a class="icon-btn ghost" routerLink="/catalogo" aria-label="Torna al catalogo"><gt-icon name="back"/></a><div><p class="eyebrow">ESERCIZIO</p><h1>{{exercise()?.name||'Esercizio'}}</h1></div>@if(exercise();as e){<button [attr.aria-label]="s.isFavorite(e.id)?'Rimuovi dai preferiti':'Aggiungi ai preferiti'" [attr.aria-pressed]="s.isFavorite(e.id)" (click)="s.toggleFavorite(e.id)" [disabled]="s.busy()" class="icon-btn ghost ex3-fav" [class.on]="s.isFavorite(e.id)">{{s.isFavorite(e.id)?'★':'☆'}}</button>}</header>
<gt-status/>
@if(exercise();as e){
 <section class="card exercise-detail-hero"><gt-exercise-thumb [exercise]="e"/><div class="ex3-chips"><span class="ex3-chip main">{{s.muscle(e.muscleGroupId)}}</span><span class="ex3-chip">{{e.equipment}}</span>@if(!e.active){<span class="ex3-chip off">Disattivato</span>}</div><gt-exercise-motion [exercise]="e" [showSequence]="showSequence()"/></section>
 <section class="card exercise-instructions ex-numbers"><h2>I tuoi numeri</h2>
  @if(history().length){
   <div class="su-stats"><div class="su-stat"><strong class="ex-record">{{fmt(record()!.weight)}}<small>{{unit(record()!.weight)}}</small></strong><span>record × {{record()!.reps}}</span></div><div class="su-stat"><strong>{{oneRm()?fmt(oneRm()!):'—'}}<small>{{oneRm()?s.settings().unit:''}}</small></strong><span>1RM stimato</span></div><div class="su-stat"><strong>{{fmt(last()!.weight)}}<small>{{unit(last()!.weight)}}</small></strong><span>ultima × {{last()!.reps}}</span></div></div>
   @if(trend();as chart){<div class="ex-chart"><div class="ex-chart-head"><span>Carico migliore per seduta</span>@if(chart.delta){<b [class.su-up]="chart.delta>0" [class.su-down]="chart.delta<0">{{chart.delta>0?'+':''}}{{s.formatWeight(chart.delta)}} {{s.settings().unit}}</b>}</div><svg viewBox="0 0 320 90" preserveAspectRatio="none" role="img" [attr.aria-label]="'Andamento su '+history().length+' sedute'"><path [attr.d]="chart.area" class="ex-area"/><path [attr.d]="chart.line" class="ex-line"/><circle [attr.cx]="chart.x" [attr.cy]="chart.y" r="4.5" class="ex-dot"/></svg><div class="ex-chart-foot"><span>{{dateLabel(history()[0].date)}}</span><span>{{dateLabel(history()[history().length-1].date)}}</span></div></div>}
   <p class="subtle">{{history().length}} {{history().length===1?'seduta registrata':'sedute registrate'}} con questo esercizio.</p>
  }@else{<p>Quando registrerai questo esercizio qui vedrai record, 1RM stimato e andamento.</p>}
 </section>
 <section class="card exercise-instructions"><h2>Esecuzione</h2><p>{{e.description||'Non sono ancora presenti indicazioni per questa variante.'}}</p><gt-exercise-video [exercise]="e"/></section>
 <section class="card exercise-instructions"><h2>Muscoli coinvolti</h2><gt-muscle-map [primary]="s.muscle(e.muscleGroupId)" [secondary]="secondary()"/><p class="subtle">Gruppi assegnati nel tuo catalogo.</p></section>
 <section class="card exercise-instructions"><h2>La tua configurazione</h2><gt-machine-setup [exerciseId]="e.id"/>@if(e.tags.length){<div class="ex3-chips">@for(tag of e.tags;track tag){<span class="ex3-chip">{{tag}}</span>}</div>}</section>
}@else{<section class="card empty"><h2>Esercizio non disponibile</h2><p>Potrebbe essere stato rimosso dal catalogo.</p><a class="button ghost" routerLink="/catalogo">Apri catalogo</a></section>}
`})
export class ExerciseDetailComponent{
 s=inject(Store);private route=inject(ActivatedRoute);private params=toSignal(this.route.paramMap,{initialValue:this.route.snapshot.paramMap});
 private query=toSignal(this.route.queryParamMap,{initialValue:this.route.snapshot.queryParamMap});
 showSequence=computed(()=>this.query().get('motion')==='1');
 exercise=computed(()=>this.s.exercise(this.params().get('id')||''));
 secondary=computed(()=>this.exercise()?.secondaryMuscleIds.map(id=>this.s.muscle(id))||[]);
 /** Miglior serie per ogni seduta completata con questo esercizio, dalla più vecchia. */
 history=computed(()=>{
  const id=this.exercise()?.id;if(!id)return [] as {date:string;weight:number;reps:number}[];
  const data=this.s.data(),done=new Map(data.workouts.filter(w=>w.status==='completed').map(w=>[w.id,w.date]));
  const rows=data.workoutExercises.filter(row=>row.exerciseId===id&&done.has(row.workoutId)),out:{date:string;weight:number;reps:number}[]=[];
  for(const row of rows){const sets=data.sets.filter(set=>set.workoutExerciseId===row.id&&set.completed&&set.kind!=='warmup');if(!sets.length)continue;const best=[...sets].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0];out.push({date:done.get(row.workoutId)!,weight:best.weight,reps:best.reps});}
  return out.sort((a,b)=>a.date.localeCompare(b.date));
 });
 record=computed(()=>[...this.history()].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0]);
 last=computed(()=>this.history().at(-1));
 oneRm=computed(()=>{const best=this.history().filter(h=>h.weight>0&&h.reps>0&&h.reps<=12).map(h=>h.weight*(1+h.reps/30));return best.length?Math.round(Math.max(...best)*2)/2:undefined;});
 trend=computed(()=>{
  const rows=this.history().slice(-12);if(rows.length<2)return undefined;
  const values=rows.map(r=>r.weight),min=Math.min(...values),max=Math.max(...values),span=max-min||1;
  const points=values.map((v,i)=>({x:4+i*(312/(values.length-1)),y:82-((v-min)/span)*70}));
  const line=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');const end=points[points.length-1];
  return {line,area:line+' L'+end.x.toFixed(1)+' 90 L4 90Z',x:end.x,y:end.y,delta:values[values.length-1]-values[0]};
 });
 fmt(value:number){return value>0?this.s.formatWeight(value):'—';}
 unit(value:number){return value>0?this.s.settings().unit:'';}
 dateLabel(date:string){return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});}
}
