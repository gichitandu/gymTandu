import {Component,computed,inject,signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Store} from '../services/store';
import {TodayService} from '../services/today';
import {localDate} from '../models/domain';
import {MuscleWork,muscleWork} from '../services/wellness';
import {IconComponent} from '../shared/icon.component';
@Component({standalone:true,imports:[RouterLink,FormsModule,IconComponent],template:`
<header class="neon-page-heading"><a class="icon-btn ghost" routerLink="/recupero" aria-label="Torna al recovery"><gt-icon name="back"/></a><div><p class="eyebrow">ALLENAMENTO E RECUPERO</p><h1>Focus muscolare</h1></div></header>
<div class="neon-segments"><button (click)="back.set(false)" [class.active]="!back()">Vista frontale</button><button (click)="back.set(true)" [class.active]="back()">Vista posteriore</button></div>
<section class="card muscle-focus-layout"><div class="anatomy-visual"><img [src]="'/training/figures/muscle-'+(back()?'back':'front')+'-v2.png'" [alt]="back()?'Anatomia muscolare, vista posteriore':'Anatomia muscolare, vista frontale'"/><span class="anatomy-caption">{{selected()?.name||'Seleziona un gruppo'}}</span></div><div class="muscle-selector"><label>Periodo<select [ngModel]="days()" (ngModelChange)="days.set(+$event)"><option [ngValue]="7">Ultimi 7 giorni</option><option [ngValue]="28">Ultimi 28 giorni</option><option [ngValue]="90">Ultimi 90 giorni</option><option [ngValue]="0">Tutto lo storico</option></select></label>@for(group of groups();track group.id){<button type="button" (click)="selectedId.set(group.id)" [class.selected]="selected()?.id===group.id" [attr.aria-pressed]="selected()?.id===group.id"><span>{{group.name}}</span><strong>{{group.sets}} <small>serie</small></strong></button>}</div></section>
@if(selected();as group){<section class="card muscle-detail"><div class="card-head"><h2>{{group.name}}</h2><a class="button ghost" routerLink="/catalogo">Catalogo <gt-icon name="arrow"/></a></div><div class="neon-stat-grid"><div><strong>{{group.sets}}</strong><span>Serie allenanti</span></div><div><strong>{{s.formatWeight(group.volume)}}</strong><span>Volume {{s.settings().unit}}</span></div><div><strong>{{group.lastDate?group.lastDate.split('-').reverse().join('/'):'—'}}</strong><span>Ultimo allenamento nel periodo</span></div></div><div class="muscle-feeling"><gt-icon name="activity"/><div><strong>Indolenzimento percepito oggi</strong><p>{{todayLog()?.soreness?.[group.id]!==undefined?feelings[todayLog()!.soreness[group.id]]:'Non ancora registrato'}}</p></div><a class="button ghost" routerLink="/recupero">Check-in</a></div></section>}
<section class="card"><h2>Distribuzione del lavoro</h2><div class="muscle-volume-bars">@for(group of groups();track group.id){@if(group.sets){<button class="ghost" (click)="selectedId.set(group.id)"><span>{{group.name}}</span><i><b [style.width.%]="total()?group.sets/total()*100:0"></b></i><strong>{{total()?Math.round(group.sets/total()*100):0}}%</strong></button>}}@if(!total()){<p class="subtle">Le serie compariranno dopo un allenamento completato.</p>}</div><p class="subtle">Serie completate, escluso il riscaldamento. Ogni serie è attribuita al gruppo principale del catalogo. Il volume considera il solo carico esterno con unità verificata; le illustrazioni mostrano l’anatomia di riferimento.</p></section>
`})
export class MuscleFocusComponent {
 s=inject(Store);clock=inject(TodayService);back=signal(false);days=signal(7);selectedId=signal('');Math=Math;
 groups=computed(()=>{const date=new Date(this.clock.date()+'T12:00:00');date.setDate(date.getDate()-this.days()+1);return muscleWork(this.s.data(),this.days()?localDate(date):'0000-01-01',this.clock.date());});
 selected=computed<MuscleWork|undefined>(()=>this.groups().find(g=>g.id===this.selectedId())||this.groups()[0]);
 total=computed(()=>this.groups().reduce((sum,g)=>sum+g.sets,0));
 todayLog=computed(()=>this.s.data().wellnessLogs.find(row=>row.date===this.clock.date()));
 feelings=['0 / 4 · Nessuno','1 / 4 · Leggero','2 / 4 · Moderato','3 / 4 · Marcato','4 / 4 · Molto marcato'];
}
