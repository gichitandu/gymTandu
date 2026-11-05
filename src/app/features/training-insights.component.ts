import {Component,computed,inject,signal} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {TodayService} from '../services/today';
import {IconComponent} from '../shared/icon.component';
import {DataChartComponent} from '../shared/data-chart.component';
import {summarizeTraining,trainingTimeline,trainingReportCsv,workoutReminderIcs} from '../services/training-insights';

@Component({
 standalone:true,host:{class:'gt-insights-print'},imports:[RouterLink,IconComponent,DataChartComponent],
 template:`
 <header class="insights-heading"><a routerLink="/progressi" class="button ghost"><gt-icon name="back"/> Progressi</a><span class="eyebrow">GYMTRACK / ANALISI</span><h1>La tua evoluzione</h1><p>Numeri chiari, suggerimenti spiegati e strumenti per organizzarti.</p></header>
 <section class="insights-section" aria-labelledby="period-heading">
  <h2 id="period-heading">Il tuo periodo</h2>
  <div class="insights-periods" role="group" aria-label="Periodo di analisi">
   @for(days of [7,28,90];track days){<button type="button" [class.insight-selected]="period()===days" [attr.aria-pressed]="period()===days" (click)="period.set(days)">{{days}} giorni</button>}
  </div>
  <div class="insights-stats">
   <div class="card"><span>Sedute completate</span><strong>{{summary().current.workouts}}</strong><small>Precedenti: {{summary().previous.workouts}}</small></div>
   <div class="card"><span>Giorni attivi</span><strong>{{summary().current.activeDays}}</strong><small>Nel periodo selezionato</small></div>
   <div class="card"><span>Serie di lavoro</span><strong>{{summary().current.completedSets}}</strong><small>Riscaldamento escluso</small></div>
   <div class="card"><span>Volume carico esterno</span><strong>{{volumeDisplay()}}</strong><small>{{s.settings().unit}} · non include corpo libero</small></div>
  </div>
  <p class="insights-note">Le durate mancanti non vengono interpretate come zero. {{summary().current.unknownDurations}} sedute senza durata verificabile.</p>
  <div class="insights-charts"><div class="card"><h3>Sedute per settimana</h3><gt-data-chart [points]="sessionTimeline()" title="Sedute settimanali" unit="sedute"/></div><div class="card"><h3>Volume esterno per settimana</h3><gt-data-chart [points]="volumeTimeline()" title="Volume settimanale" [unit]="s.settings().unit"/></div></div>
 </section>
 <section class="insights-section" aria-labelledby="suggestions-heading">
  <h2 id="suggestions-heading">Indicazioni per il tuo percorso</h2>
  <p class="insights-note">Sono osservazioni basate sui dati registrati, non prescrizioni automatiche. Il piano e i carichi non vengono modificati.</p>
  <div class="insights-advice">
   @for(item of summary().insights;track item.kind+item.title){<article class="card"><gt-icon [name]="item.kind==='recovery'?'heart':item.kind==='schedule'?'calendar':'chart'"/><div><h3>{{item.title}}</h3><p>{{item.message}}</p></div></article>}
   @if(!summary().insights.length){<p class="card">Registra le prime sedute per ricevere indicazioni contestuali.</p>}
  </div>
  @if(s.draft();as workout){<section class="card"><h3>Prossimi carichi · sessione in corso</h3>
   <p class="insights-note">Analisi della seduta precedente confrontabile. Gli aumenti non vengono applicati automaticamente.</p>
   @for(row of progression();track row.id){<div class="insights-progression"><strong>{{row.name}}</strong><p>{{row.title}} · {{row.reason}}</p>@if(row.eligible&&row.nextWeight!==undefined){<small>Proposta da confermare in sessione: {{s.formatWeight(row.nextWeight)}} {{s.settings().unit}}</small>}</div>}
   <a class="button primary" routerLink="/sessione">Valuta le proposte nella sessione <gt-icon name="arrow"/></a></section>}
 </section>
 <section class="insights-section" aria-labelledby="reminder-heading">
  <h2 id="reminder-heading">Prossimo allenamento e promemoria</h2>
  @if(nextWorkout();as event){
   <div class="card insights-reminder"><div><strong>{{event.dayName}}</strong><p>{{event.date}}{{event.time?' · '+event.time:''}}</p></div>
    <button type="button" class="primary" (click)="saveReminder(event)">Aggiungi al calendario <gt-icon name="calendar"/></button>
   </div>
   <p class="insights-note">La voce viene creata solo quando la importi nel calendario del dispositivo. Per gli orari specificati include un avviso 60 minuti prima, modificabile nell'app Calendario.</p>
  }@else{<p class="card">Non risultano allenamenti futuri programmati. <a routerLink="/calendario">Apri calendario</a> per aggiungerne uno.</p>}
  <a routerLink="/profilo" [queryParams]="{section:'settings'}" class="insights-link">Gestisci notifiche push e promemoria già disponibili <gt-icon name="arrow"/></a>
 </section>
 <section class="insights-section insights-export" aria-labelledby="export-heading">
  <h2 id="export-heading">Report dei tuoi allenamenti</h2><p class="insights-note">Il report include soltanto le sedute completate nel periodo selezionato. Rimane sul dispositivo finché non decidi di condividerlo.</p>
  <div class="insights-export-actions"><button type="button" class="primary" (click)="downloadReport()"><gt-icon name="download"/> Esporta CSV</button><button type="button" (click)="printReport()"><gt-icon name="note"/> Stampa / salva in PDF</button></div>
  <p class="insights-note">Periodo: {{summary().current.from}} — {{summary().current.to}}. Per il PDF usa la funzione di stampa del browser.</p>
 </section>
 `,
 styles:[`
 :host{display:block;max-width:1060px;margin:0 auto;padding-bottom:36px;color:var(--text)}
 .insights-heading{margin-bottom:26px}.insights-heading>a{margin-bottom:22px}.insights-heading h1{font-size:clamp(29px,6vw,42px);font-weight:800;letter-spacing:-1.1px;margin:6px 0}.insights-heading p,.insights-note{color:var(--muted);font-size:13px;line-height:1.65}
 .insights-section{margin:26px 0}.insights-section h2{font-size:20px;margin:0 0 14px}
 .insights-periods{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
 .insights-periods button{border-radius:14px;background:var(--card);padding:10px 16px}
 .insights-periods .insight-selected{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
 .insights-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
 .insights-stats .card{padding:18px;display:flex;flex-direction:column;gap:10px;min-width:0}
 .insights-stats span{font-size:12px;color:var(--muted)}.insights-stats strong{font-size:clamp(21px,3vw,30px);font-weight:800;overflow-wrap:anywhere}.insights-stats small{font-size:11px;color:var(--muted)}
 .insights-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.insights-charts .card{min-width:0}.insights-charts h3{font-size:14px;margin:0 0 12px}.insights-advice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
 .insights-advice .card{display:flex;align-items:flex-start;gap:12px;padding:18px}
 .insights-advice gt-icon{color:var(--accent-text)}.insights-advice h3{font-size:14px;margin:0 0 8px}.insights-advice p{font-size:12px;color:var(--muted);line-height:1.6;margin:0}
 .insights-reminder{display:flex;align-items:center;justify-content:space-between;gap:12px}.insights-reminder p{color:var(--muted);margin:7px 0 0}
 .insights-progression{padding:12px 0;border-bottom:1px solid var(--line)}.insights-progression p,.insights-progression small{color:var(--muted);font-size:12px;line-height:1.5}.insights-link{display:inline-flex;align-items:center;gap:8px;color:var(--accent-text);font-size:12px;margin-top:12px}
 .insights-export-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:15px}
 button.primary{background:linear-gradient(115deg,var(--theme-button-start,var(--accent)),var(--theme-button-end,var(--accent)));color:var(--accent-ink);border-color:var(--accent)}
 @media(max-width:720px){.insights-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.insights-advice,.insights-charts{grid-template-columns:1fr}.insights-reminder{align-items:stretch;flex-direction:column}.insights-reminder button{width:100%}}
 @media print{.insights-heading>a,.insights-periods,.insights-export-actions,.insights-link,.insights-reminder button{display:none!important}:host{color:#111}.card{break-inside:avoid;box-shadow:none;border:1px solid #bbb}.insights-advice{grid-template-columns:1fr}}
 `]
})
export class TrainingInsightsComponent {
 readonly s=inject(Store);private clock=inject(TodayService);
 readonly period=signal(28);
 readonly summary=computed(()=>summarizeTraining(this.s.data(),this.period(),this.clock.date()));
 readonly timeline=computed(()=>trainingTimeline(this.s.data(),this.period(),this.clock.date()));
 readonly sessionTimeline=computed(()=>this.timeline().map(row=>({label:row.label,value:row.sessions})));
 readonly volumeTimeline=computed(()=>this.timeline().map(row=>({label:row.label,value:this.s.weight(row.volume)})));
 readonly volumeDisplay=computed(()=>this.s.formatWeight(this.summary().current.externalVolume));
 readonly progression=computed(()=>this.s.draft()?this.s.workoutExercises(this.s.draft()!.id).map(row=>({id:row.id,name:row.name,...this.s.progression(row.id,this.s.data().exercisePreferences.find(pref=>pref.id===row.exerciseId)?.weightStep??2.5)})):[]);
 readonly nextWorkout=computed(()=>this.s.data().scheduledWorkouts
  .filter(e=>(e.kind??'workout')==='workout'&&e.date>=this.clock.date()&&!e.done&&!this.s.completed().some(w=>w.id===e.workoutId))
  .sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''))[0]);
 private download(content:string,name:string,type:string){
  const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 downloadReport(){
  const period=this.summary().current;
  this.download(trainingReportCsv(this.s.data(),period.from,period.to,this.s.settings().unit),'gymtrack-report-'+period.to+'.csv','text/csv;charset=utf-8');
 }
 saveReminder(event:{id:string;date:string;dayName:string;time?:string}){
  try{this.download(workoutReminderIcs(event),'gymtrack-'+event.date+'.ics','text/calendar;charset=utf-8');}
  catch(error){this.s.error.set(error instanceof Error?error.message:'Promemoria non generato.');}
 }
 printReport(){window.print();}
}
