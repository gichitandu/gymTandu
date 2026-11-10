import {Component,computed,effect,inject,input,output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Store} from '../services/store';
import {TodayService} from '../services/today';
import {confirmationForContext} from '../services/confirmation';
import {localDate,uid} from '../models/domain';
import {DateFieldComponent} from './date-field.component';
import {IconComponent} from './icon.component';

/** Registra peso e misure dove si guardano i grafici (Progressi › Corpo). Stessa regola del Profilo: una misurazione per data. */
@Component({selector:'gt-measurement-sheet',standalone:true,imports:[FormsModule,DateFieldComponent,IconComponent],template:`
@if(open()){
<div class="su-sheet-backdrop" (click)="close()"></div>
<section class="su-sheet" role="dialog" aria-modal="true" aria-labelledby="measure-title">
  <div class="su-grab"></div>
  <header class="su-sheet-head"><div><h2 id="measure-title">Registra peso e misure</h2><p>Una misurazione per giorno: la stessa data viene aggiornata.</p></div><button type="button" class="su-iconbtn" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></header>
  <span class="su-label">Data</span>
  <gt-date-field name="measure-date" [(ngModel)]="date" [max]="today()" aria-label="Data della misurazione"></gt-date-field>
  <span class="su-label">Peso ({{s.settings().unit}})</span>
  <input class="su-field" type="number" inputmode="decimal" step="0.1" min="1" max="1500" [(ngModel)]="weight" placeholder="Es. 78,4" aria-label="Peso"/>
  <div class="ms-two">
    <label><span class="su-label">Girovita (cm)</span><input class="su-field" type="number" inputmode="decimal" step="0.1" min="1" max="300" [(ngModel)]="waist" placeholder="Facoltativo"/></label>
    <label><span class="su-label">Massa grassa (%)</span><input class="su-field" type="number" inputmode="decimal" step="0.1" min="1" max="80" [(ngModel)]="bodyFat" placeholder="Facoltativa"/></label>
  </div>
  <button type="button" class="su-btn su-primary ms-save" (click)="save()" [disabled]="saving()||s.busy()"><gt-icon name="check"/>{{saving()?'Salvataggio…':'Salva misurazione'}}</button>
  @if(recent().length){<span class="su-label">Ultime misurazioni</span><div class="su-list">@for(m of recent();track m.id){<div class="su-row"><span class="su-tx"><strong>{{s.formatWeight(m.weight)}} {{s.settings().unit}}</strong><small>{{label(m.date)}}{{m.waist?' · girovita '+m.waist+' cm':''}}{{m.bodyFat?' · '+m.bodyFat+'% grasso':''}}</small></span><button type="button" class="su-iconbtn" (click)="remove(m.id)" [disabled]="s.busy()" [attr.aria-label]="'Rimuovi la misurazione del '+label(m.date)"><gt-icon name="trash"/></button></div>}</div>}
</section>}`,styles:[`.ms-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ms-two label{display:block;min-width:0}.ms-save{margin-top:18px}`]})
export class MeasurementSheetComponent {
 s=inject(Store);private clock=inject(TodayService,{optional:true});private confirmation=confirmationForContext();
 open=input(false);closed=output<void>();
 today(){return this.clock?.date()||localDate();}
 date=this.today();weight:number|null=null;waist:number|null=null;bodyFat:number|null=null;saving=signal(false);
 recent=computed(()=>[...this.s.data().measurements].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5));
 constructor(){effect(()=>{if(!this.open())return;this.date=this.today();const last=this.recent()[0];this.weight=last?this.s.weight(last.weight):null;this.waist=null;this.bodyFat=null;});}
 label(date:string){return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});}
 close(){this.closed.emit();}
 async save(){
  if(this.saving())return;
  const date=this.date,weight=this.weight===null||this.weight===undefined||(this.weight as unknown)===''?0:this.s.kg(Number(this.weight));
  const waist=this.waist===null||(this.waist as unknown)===''?undefined:Number(this.waist),bodyFat=this.bodyFat===null||(this.bodyFat as unknown)===''?undefined:Number(this.bodyFat);
  if(!Number.isFinite(weight)||weight<=0||weight>700||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>this.today()){this.s.error.set('Controlla la data e il peso.');return;}
  if(waist!==undefined&&!(waist>=1&&waist<=300)||bodyFat!==undefined&&!(bodyFat>=1&&bodyFat<=80)){this.s.error.set('Controlla girovita e massa grassa.');return;}
  this.saving.set(true);
  try{if(await this.s.change(d=>{const old=d.measurements.find(m=>m.date===date);const measurement={id:old?.id||uid(),date,weight,waist:waist??old?.waist,bodyFat:bodyFat??old?.bodyFat};if(old)Object.assign(old,measurement);else d.measurements.push(measurement);const latest=[...d.measurements].sort((a,b)=>b.date.localeCompare(a.date))[0];if(latest)d.profiles[0].bodyWeight=latest.weight;},'Misurazione salvata.',false))this.close();}
  finally{this.saving.set(false);}
 }
 async remove(id:string){if(await this.confirmation.ask('Rimuovere questa misurazione?'))await this.s.change(d=>{d.measurements=d.measurements.filter(m=>m.id!==id);const latest=[...d.measurements].sort((a,b)=>b.date.localeCompare(a.date))[0];if(latest)d.profiles[0].bodyWeight=latest.weight;},'Misurazione rimossa.',false);}
}
