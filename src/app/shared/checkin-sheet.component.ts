import {Component,computed,effect,inject,input,output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Store} from '../services/store';
import {TodayService} from '../services/today';
import {WellnessLog} from '../models/domain';
import {validWellness} from '../services/wellness';
import {IconComponent} from './icon.component';

/** «Come stai oggi?»: energia, sonno e muscoli indolenziti in un solo pannello (sostituisce Recovery, Sonno e Riposo come punto d'ingresso). */
@Component({selector:'gt-checkin-sheet',standalone:true,imports:[FormsModule,IconComponent],template:`
@if(open()){
<div class="su-sheet-backdrop" (click)="close()"></div>
<section class="su-sheet checkin" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
  <div class="su-grab"></div>
  <header class="su-sheet-head"><div><h2 id="checkin-title">Come stai oggi?</h2><p>{{dateLabel()}}</p></div><button type="button" class="su-iconbtn" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></header>

  <span class="su-label">Energia</span>
  <div class="ck-levels" role="radiogroup" aria-label="Energia">
    @for(level of levels;track level.value){<button type="button" role="radio" [attr.aria-checked]="energy()===level.value" [class.on]="energy()===level.value" [style.--c]="level.color" (click)="energy.set(level.value)">{{level.value}}<small>{{level.label}}</small></button>}
  </div>

  <span class="su-label">Quanto hai dormito</span>
  <div class="ck-step"><button type="button" class="su-iconbtn" (click)="sleep(-15)" aria-label="Meno sonno"><gt-icon name="minus"/></button><output aria-live="polite">@if(sleepMinutes()===null){<span class="ck-none">Non indicato</span>}@else{ {{hours()}} <small>h</small> {{minutes()}} <small>min</small> }</output><button type="button" class="su-iconbtn" (click)="sleep(15)" aria-label="Più sonno"><gt-icon name="plus"/></button></div>

  <span class="su-label">Muscoli indolenziti</span>
  <div class="su-chips">
    <button type="button" class="su-chip" [class.on]="!soreCount()" (click)="soreness.set({})">Nessuno</button>
    @for(group of groups();track group.id){<button type="button" class="su-chip" [class.on]="!!soreness()[group.id]" [attr.aria-pressed]="!!soreness()[group.id]" (click)="toggleSore(group.id)">{{group.name}}</button>}
  </div>

  <span class="su-label">Note</span>
  <textarea class="su-field" [(ngModel)]="notes" maxlength="2000" placeholder="Facoltative"></textarea>

  <details class="ck-more"><summary>Altri dettagli · stress e qualità del sonno <gt-icon name="chevron-down"/></summary>
    <span class="su-label">Qualità del sonno</span>
    <div class="ck-levels small">@for(value of [1,2,3,4,5];track value){<button type="button" [class.on]="sleepQuality()===value" (click)="sleepQuality.set(sleepQuality()===value?null:value)">{{value}}</button>}</div>
    <span class="su-label">Stress</span>
    <div class="ck-levels small">@for(value of [1,2,3,4,5];track value){<button type="button" [class.on]="stress()===value" (click)="stress.set(stress()===value?null:value)">{{value}}</button>}</div>
  </details>

  <button type="button" class="su-btn su-primary ck-save" (click)="save()" [disabled]="saving()||s.busy()"><gt-icon name="check"/>{{saving()?'Salvataggio…':'Salva'}}</button>
</section>}`,styles:[`
.ck-levels{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
.ck-levels button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:54px;border-radius:15px;border:var(--su-stroke);background:color-mix(in srgb,var(--text) 5%,transparent);color:var(--c,var(--muted));font:inherit;font-size:17px;font-weight:850;cursor:pointer}
.ck-levels button small{font-size:9.5px;font-weight:700;color:var(--muted)}
.ck-levels button.on{background:color-mix(in srgb,var(--c,var(--accent)) 17%,transparent);border-color:color-mix(in srgb,var(--c,var(--accent)) 60%,transparent);box-shadow:0 0 0 3px color-mix(in srgb,var(--c,var(--accent)) 14%,transparent)}
.ck-levels.small button{min-height:42px;font-size:15px;color:var(--text)}
.ck-step{display:flex;align-items:center;gap:10px}
.ck-step .su-iconbtn{width:52px;height:52px;border-radius:16px}
.ck-step output{flex:1;display:flex;align-items:baseline;justify-content:center;gap:4px;min-height:52px;padding-top:10px;border-radius:16px;background:color-mix(in srgb,var(--bg) 60%,var(--card));font-size:24px;font-weight:850;font-variant-numeric:tabular-nums}
.ck-step small{font-size:13px;color:var(--muted);font-weight:700}
.ck-none{font-size:15px;font-weight:650;color:var(--muted)}
.ck-more{margin-top:14px}
.ck-more summary{display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none;cursor:pointer;font-size:13px;color:var(--muted);padding:6px 2px}
.ck-more summary::-webkit-details-marker{display:none}
.ck-more summary gt-icon{width:16px;height:16px}
.ck-save{margin-top:18px}
`]})
export class CheckinSheetComponent {
 s=inject(Store);private clock=inject(TodayService,{optional:true});
 open=input(false);presetEnergy=input<number|null>(null);closed=output<void>();
 readonly levels=[{value:1,label:'Scarico',color:'#ff9fb0'},{value:2,label:'Stanco',color:'#ffc58a'},{value:3,label:'Normale',color:'#f5e07a'},{value:4,label:'Bene',color:'#a8e6b8'},{value:5,label:'Al top',color:'#70D4AD'}];
 energy=signal<number|null>(null);sleepMinutes=signal<number|null>(null);sleepQuality=signal<number|null>(null);stress=signal<number|null>(null);soreness=signal<Record<string,number>>({});notes='';saving=signal(false);
 groups=computed(()=>this.s.data().muscleGroups.filter(group=>!/da classificare/i.test(group.name)).slice(0,12));
 soreCount=computed(()=>Object.keys(this.soreness()).length);
 hours=computed(()=>Math.floor((this.sleepMinutes()??0)/60));
 minutes=computed(()=>String((this.sleepMinutes()??0)%60).padStart(2,'0'));
 private today(){return this.clock?.date()||new Date().toISOString().slice(0,10);}
 dateLabel(){return new Date(this.today()+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});}
 constructor(){effect(()=>{if(!this.open())return;const row=this.s.data().wellnessLogs.find(log=>log.date===this.today());this.energy.set(this.presetEnergy()??row?.energy??null);this.sleepMinutes.set(row?.sleepMinutes??null);this.sleepQuality.set(row?.sleepQuality??null);this.stress.set(row?.stress??null);this.soreness.set({...(row?.soreness||{})});this.notes=row?.notes||'';});}
 sleep(delta:number){const now=this.sleepMinutes();this.sleepMinutes.set(Math.max(0,Math.min(1440,(now??450)+(now===null?0:delta))));}
 toggleSore(id:string){const next={...this.soreness()};if(next[id])delete next[id];else next[id]=2;this.soreness.set(next);}
 close(){this.closed.emit();}
 async save(){
  if(this.saving())return;
  const date=this.today(),existing=this.s.data().wellnessLogs.find(log=>log.date===date);
  const row:WellnessLog={...(existing||{}),id:existing?.id||'wellness-'+date,date,soreness:{...this.soreness()},notes:this.notes} as WellnessLog;
  for(const [key,value] of [['energy',this.energy()],['sleepMinutes',this.sleepMinutes()],['sleepQuality',this.sleepQuality()],['stress',this.stress()]] as const){if(value===null)delete (row as any)[key];else (row as any)[key]=value;}
  if(!validWellness(row)){this.s.error.set('Controlla i valori del check-in.');return;}
  if(row.energy==null&&row.sleepMinutes==null&&row.sleepQuality==null&&row.stress==null&&!row.notes.trim()&&!Object.keys(row.soreness).length){this.s.error.set('Indica almeno un dato prima di salvare.');return;}
  this.saving.set(true);
  try{if(await this.s.saveWellness(row))this.close();}finally{this.saving.set(false);}
 }
}
