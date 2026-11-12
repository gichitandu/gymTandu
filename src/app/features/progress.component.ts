import { ProfileLinkComponent } from '../shared/profile-link.component';
import { DESIGN_DIRECTIVES } from '../design/design-directives';
import {sessionVolume,exerciseRecords} from '../services/statistics';
import {TodayService} from '../services/today';
import {AppFeaturesService} from '../services/app-features';
import {setupKey} from "../services/training-flow";
import { DataChartComponent, DataPoint } from "../shared/data-chart.component";
import { Router, RouterLink } from "@angular/router";
import { localDate } from "../models/domain";
import { Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { ProgressChartComponent } from "../shared/progress-chart.component";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { ExerciseThumbComponent } from '../shared/exercise-thumb.component';
import { matchesExercise } from '../services/exercise-search';
import { MeasurementSheetComponent } from '../shared/measurement-sheet.component';
import { summarizeTraining } from '../services/training-insights';
import { muscleWork } from '../services/wellness';
import { ActivatedRoute } from '@angular/router';
@Component({
  standalone: true,
  styleUrls: ["./feature-polish.css", "./progress-design.css", "./progress-reference.css", "./progress-redesign.css"],
  imports: [ProfileLinkComponent,...DESIGN_DIRECTIVES,
    FormsModule,
    DataChartComponent,
    RouterLink,
    ProgressChartComponent,
    IconComponent,
    StatusComponent,
    ExerciseThumbComponent,
    MeasurementSheetComponent,
  ],
  template: `<div class="reference-progress pg-simple">
    <p class="el-only el-eyebrow el-over">{{periodEyebrow()}}</p>
    <header class="su-head"><h1 gtDesign="progress.title" gtDesignLabel="progress.title">Progressi</h1><div class="su-actions"><gt-profile-link/></div></header>
    <gt-status />
    <nav class="su-seg" aria-label="Sezione dei progressi"><button type="button" [class.on]="tab()==='training'" [attr.aria-pressed]="tab()==='training'" (click)="tab.set('training')">Allenamento</button><button type="button" [class.on]="tab()==='body'" [attr.aria-pressed]="tab()==='body'" (click)="tab.set('body')">Corpo</button></nav>
    <div class="su-chips pg-period" role="group" aria-label="Periodo">@for(option of periods;track option.value){<button type="button" class="su-chip" [class.on]="period()===option.value" [attr.aria-pressed]="period()===option.value" (click)="period.set(option.value)">{{option.label}}</button>}</div>
    @if(tab()==='training'){
      @if(insight();as item){<section class="pg-insight" aria-label="In evidenza"><div class="pg-insight-top"><span class="su-bubble violet"><gt-icon name="bolt"/></span><span>In evidenza</span></div><h2>{{item.title}}</h2><p>{{item.message}}</p></section>}
      <div class="su-stats pg-kpi">
        <div class="su-stat"><strong>{{overviewSessions().length}}</strong><span>allenamenti @if(sessionDelta()!==null){<b [class.su-up]="sessionDelta()!>0" [class.su-down]="sessionDelta()!<0">{{sessionDelta()!>0?'+':''}}{{sessionDelta()}}</b>}</span></div>
        <div class="su-stat"><strong>@if(overviewDuration();as duration){ {{duration.value}}<small>{{duration.unit}}</small>@if(duration.minutes){ {{duration.minutes}}<small>m</small>} }@else{—}</strong><span>in palestra</span></div>
        <div class="su-stat"><strong>{{overviewSessions().length?compactWeight(overviewVolume()):'—'}}<small>{{overviewSessions().length?compactUnit(overviewVolume()):''}}</small></strong><span>volume @if(weeklyTrend();as trend){<b [class.su-up]="trend.increased">{{trend.label}}</b>}</span></div>
      </div>
      <section class="su-card pg-chart" gtDesign="progress.weeklyChart"><div class="pg-card-head"><h2 gtDesign="progress.weeklyChart.title" gtDesignLabel="progress.weeklyChart.title" gtDesignLabelDefault="Volume per settimana">Volume per settimana</h2><small>{{s.settings().unit}}</small></div>
        <gt-progress-chart initialMetric="weekly" [showFilters]="false" [monthsFilter]="period()>0?period():0" [daysFilter]="period()<0?-period():undefined" [compact]="true" /></section>
      <div class="su-sec pg-records-head"><h2>Record recenti</h2>@if(recentRecords().length){<small>nel periodo</small>}</div>
      @if(recentRecords().length){<div class="su-list pg-records">@for(record of recentRecords();track record.exerciseId+record.date){<a class="su-row" [routerLink]="['/esercizio',record.exerciseId]"><gt-exercise-thumb class="su-thumb" [exercise]="s.exercise(record.exerciseId)"/><span class="su-tx"><strong>{{record.name}}</strong><small>{{s.formatWeight(record.weight)}} {{s.settings().unit}} × {{record.reps}} · {{shortDate(record.date)}}</small></span>@if(record.delta>0){<span class="su-badge amber">+{{s.formatWeight(record.delta)}} {{s.settings().unit}}</span>}@else{<span class="su-badge amber"><gt-icon name="trophy"/>Primo</span>}</a>}</div>}
      @else{<p class="pg-empty pg-records">Qui compariranno i nuovi record quando superi un tuo carico.</p>}
      <div class="su-sec pg-muscles-head"><h2>Muscoli allenati</h2><a routerLink="/focus-muscolare">Mappa<gt-icon name="chevron-right"/></a></div>
      <a class="su-card pg-muscles" routerLink="/focus-muscolare" aria-label="Apri la mappa muscolare">
        <span class="pg-figure" aria-hidden="true"><img src="/training/figures/muscle-front-v2.png" alt="" loading="lazy"/></span>
        <span class="pg-bars">@for(group of muscleTop();track group.id){<span class="pg-bar-row"><span>{{group.name}}</span><span class="su-bar"><i [style.width.%]="group.sets/muscleMax()*100"></i></span><b>{{group.sets}}</b></span>}@empty{<span class="pg-empty">Completa un allenamento per vedere i gruppi allenati.</span>}@if(muscleTop().length){<small>serie nel periodo</small>}</span>
      </a>
      <details class="su-card pg-exercise-chart" gtDesign="progress.exerciseChart"><summary><span class="su-bubble pink"><gt-icon name="chart"/></span><span><strong gtDesign="progress.exerciseChart.title" gtDesignLabel="progress.exerciseChart.title" gtDesignLabelDefault="Grafico di un esercizio">Grafico di un esercizio</strong><small>Peso, volume, ripetizioni e 1RM stimato</small></span><gt-icon name="chevron-down"/></summary><div class="progress-details-body"><gt-progress-chart /></div></details>
      <div class="su-list pg-links">
        @if(s.activePlan();as plan){<a class="su-row" [routerLink]="['/piano',plan.id]"><span class="su-bubble pink"><gt-icon name="layers"/></span><span class="su-tx"><strong>Andamento della scheda</strong><small>{{plan.name}} · {{planDone(plan.id)}} di {{s.days(plan.id).length}} {{s.days(plan.id).length===1?'allenamento':'allenamenti'}}</small></span><gt-icon class="su-chev" name="chevron-right"/></a>}
        <a class="su-row" routerLink="/analisi"><span class="su-bubble blue"><gt-icon name="download"/></span><span class="su-tx"><strong>Analisi ed esporta report</strong><small>Andamento dettagliato, PDF o CSV</small></span><gt-icon class="su-chev" name="chevron-right"/></a>
      </div>
    }@else{
      <section class="su-card pg-weight">
        <div class="pg-card-head"><h2>Peso</h2><button type="button" class="su-btn sm pg-add" (click)="measureOpen.set(true)"><gt-icon name="plus"/>Registra</button></div>
        <div class="pg-big"><strong>{{s.profile().bodyWeight!==undefined?s.formatWeight(s.profile().bodyWeight!):'—'}}<small>{{s.profile().bodyWeight!==undefined?s.settings().unit:''}}</small></strong>@if(weightDelta();as delta){<span [class.su-up]="delta<0" [class.su-down]="delta>0">{{delta>0?'+':''}}{{s.formatWeight(delta)}} {{s.settings().unit}} nel periodo</span>}</div>
        @if(weightPoints().length>1){<gt-data-chart [points]="weightPoints()" [unit]="s.settings().unit" title="Andamento del peso corporeo"/>}@else{<p class="pg-empty">Registra il peso almeno due volte per vedere l’andamento.</p>}
      </section>
      <div class="su-stats two pg-measures">
        <div class="su-stat"><strong>{{lastWaist()??'—'}}<small>{{lastWaist()?'cm':''}}</small></strong><span>girovita @if(waistDelta();as d){<b [class.su-up]="d<0" [class.su-down]="d>0">{{d>0?'+':''}}{{d}} cm</b>}</span></div>
        <div class="su-stat"><strong>{{lastFat()??'—'}}<small>{{lastFat()?'%':''}}</small></strong><span>massa grassa @if(fatDelta();as d){<b [class.su-up]="d<0" [class.su-down]="d>0">{{d>0?'+':''}}{{d}}%</b>}</span></div>
      </div>
      @if(waistPoints().length>1||fatPoints().length>1){<details class="su-card pg-exercise-chart"><summary><span class="su-bubble violet"><gt-icon name="ruler"/></span><span><strong>Grafici delle misure</strong><small>Girovita e massa grassa inseriti da te</small></span><gt-icon name="chevron-down"/></summary><div class="progress-details-body">@if(waistPoints().length>1){<h3>Girovita</h3><gt-data-chart [points]="waistPoints()" unit="cm" title="Misurazioni del girovita"/>}@if(fatPoints().length>1){<h3>Massa grassa</h3><gt-data-chart [points]="fatPoints()" unit="%" title="Percentuale di massa grassa inserita manualmente"/>}</div></details>}
      <div class="su-sec"><h2>Benessere</h2><a routerLink="/recupero">Diario<gt-icon name="chevron-right"/></a></div>
      <section class="su-card pg-wellness">
        <div class="su-stats two"><div class="su-stat"><strong class="pg-green">{{wellnessWeek().energy??'—'}}<small>{{wellnessWeek().energy?'/5':''}}</small></strong><span>energia media</span></div><div class="su-stat"><strong class="pg-blue">{{wellnessWeek().sleep}}</strong><span>sonno medio</span></div></div>
        <div class="pg-week" aria-label="Ore di sonno degli ultimi 7 giorni">@for(day of wellnessWeek().days;track day.date){<span class="pg-day" [class.today]="day.date===today"><i [style.height.%]="day.sleepPct"></i><small>{{day.letter}}</small></span>}</div>
        <p class="pg-note">Ore di sonno degli ultimi 7 giorni, dai check-in «Come stai oggi?».</p>
        <a class="su-btn sm" routerLink="/" [queryParams]="{checkin:1}"><gt-icon name="heart"/>{{wellnessToday()?'Aggiorna il check-in di oggi':'Fai il check-in di oggi'}}</a>
      </section>
      @if(soreToday().length){<div class="su-card pg-sore"><span class="su-bubble amber"><gt-icon name="muscle"/></span><span><strong>Indolenziti oggi</strong><small>{{soreToday().join(' · ')}}</small></span></div>}
    }
    <gt-measurement-sheet [open]="measureOpen()" (closed)="measureOpen.set(false)"/>
</div>`,
})
export class ProgressComponent {
  private router=inject(Router);
  openPlan(id:string){if(id)void this.router.navigate(['/piano',id]);}
  /** Due viste: Allenamento (record, volume, muscoli) e Corpo (peso, misure, benessere). */
  tab=signal<'training'|'body'>(inject(ActivatedRoute,{optional:true})?.snapshot?.queryParamMap?.get('tab')==='corpo'?'body':'training');
  measureOpen=signal(false);
  periodEyebrow(){const value=this.period();return value===-28?'Ultime 4 settimane':value===3?'Ultimi 3 mesi':value===12?'Ultimo anno':'Tutto lo storico';}
  readonly periods=[{value:-28,label:'4 settimane'},{value:3,label:'3 mesi'},{value:12,label:'1 anno'},{value:0,label:'Tutto'}];
  private periodDays=computed(()=>{const p=this.period();if(p<0)return -p;if(p===0)return 3650;const from=this.cutoff();return Math.max(1,Math.round((new Date(this.today+'T12:00:00').getTime()-new Date(from+'T12:00:00').getTime())/86400000)+1);});
  private training=computed(()=>summarizeTraining(this.s.data(),this.periodDays(),this.today));
  insight=computed(()=>this.training().insights[0]);
  sessionDelta=computed(()=>{if(!this.period())return null;const t=this.training();return t.previous.workouts?t.current.workouts-t.previous.workouts:null;});
  compactWeight(value:number){return value>=10000?(value/1000).toLocaleString('it-IT',{maximumFractionDigits:1}):this.s.formatWeight(value);}
  compactUnit(value:number){return value>=10000?(this.s.settings().unit==='kg'?'t':'k'+this.s.settings().unit):this.s.settings().unit;}
  shortDate(date:string){return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});}
  planDone(planId:string){return this.s.completed().filter(w=>w.planId===planId).length;}
  /** Nuovi record nel periodo: serie con il carico più alto mai registrato per quell'esercizio (stessa modalità di carico). */
  recentRecords=computed(()=>{
    const data=this.s.data(),done=data.workouts.filter(w=>w.status==='completed').sort((a,b)=>a.date.localeCompare(b.date)||(a.endedAt||'').localeCompare(b.endedAt||''));
    const best=new Map<string,number>(),out:{exerciseId:string;name:string;weight:number;reps:number;delta:number;date:string}[]=[],from=this.cutoff();
    for(const w of done){for(const row of data.workoutExercises.filter(r=>r.workoutId===w.id&&r.loadMode==='external')){
      const sets=data.sets.filter(set=>set.workoutExerciseId===row.id&&set.completed&&set.kind!=='warmup'&&set.weight>0);if(!sets.length)continue;
      const top=[...sets].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0],previous=best.get(row.exerciseId);
      if(previous===undefined||top.weight>previous){if((!from||w.date>=from)&&previous!==undefined)out.push({exerciseId:row.exerciseId,name:row.name,weight:top.weight,reps:top.reps,delta:top.weight-previous,date:w.date});best.set(row.exerciseId,top.weight);}
    }}
    return out.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
  });
  muscleTop=computed(()=>muscleWork(this.s.data(),this.cutoff()||'0000-01-01',this.today).filter(group=>group.sets>0&&group.id!=='unmapped').slice(0,5));
  muscleMax=computed(()=>Math.max(1,...this.muscleTop().map(group=>group.sets)));
  private measureDelta(key:'weight'|'waist'|'bodyFat'){const rows=this.measurements().filter(m=>m[key]!==undefined&&m[key]!==null);if(rows.length<2)return null;const d=(rows[rows.length-1][key] as number)-(rows[0][key] as number);return Math.round(d*10)/10||null;}
  weightDelta=computed(()=>{const d=this.measureDelta('weight');return d===null?null:this.s.weight(d);});
  waistDelta=computed(()=>this.measureDelta('waist'));
  fatDelta=computed(()=>this.measureDelta('bodyFat'));
  lastWaist=computed(()=>[...this.s.data().measurements].sort((a,b)=>b.date.localeCompare(a.date)).find(m=>m.waist)?.waist);
  lastFat=computed(()=>[...this.s.data().measurements].sort((a,b)=>b.date.localeCompare(a.date)).find(m=>m.bodyFat)?.bodyFat);
  wellnessToday=computed(()=>this.s.data().wellnessLogs.find(log=>log.date===this.today));
  wellnessWeek=computed(()=>{
    const logs=this.s.data().wellnessLogs,days=Array.from({length:7},(_,i)=>{const d=new Date(this.today+'T12:00:00');d.setDate(d.getDate()-6+i);const date=localDate(d),log=logs.find(l=>l.date===date);return {date,letter:['D','L','M','M','G','V','S'][d.getDay()],sleepPct:log?.sleepMinutes?Math.min(100,Math.round(log.sleepMinutes/600*100)):0,log};});
    const energies=days.map(d=>d.log?.energy).filter((v):v is number=>!!v),sleeps=days.map(d=>d.log?.sleepMinutes).filter((v):v is number=>v!==undefined);
    const sleepAvg=sleeps.length?Math.round(sleeps.reduce((a,b)=>a+b,0)/sleeps.length):undefined;
    return {days,energy:energies.length?Math.round(energies.reduce((a,b)=>a+b,0)/energies.length*10)/10:undefined,sleep:sleepAvg===undefined?'—':Math.floor(sleepAvg/60)+' h '+String(sleepAvg%60).padStart(2,'0')};
  });
  soreToday=computed(()=>{const sore=this.wellnessToday()?.soreness||{},groups=this.s.data().muscleGroups;return Object.keys(sore).filter(id=>sore[id]>0).map(id=>groups.find(g=>g.id===id)?.name).filter((name):name is string=>!!name);});
  features=inject(AppFeaturesService,{optional:true});
  constructor(){effect(()=>{if(!this.features?.nutritionEnabled()&&this.category()==='nutrition')this.category.set('weight');});}
  recordCards=computed(()=>[...new Set(this.s.completed().flatMap(w=>this.s.workoutExercises(w.id).map(e=>e.exerciseId)))].map(id=>({id,name:this.s.exercise(id)?.name||this.s.data().workoutExercises.find(e=>e.exerciseId===id)?.name||'Esercizio',weight:this.s.records(id).maxWeight,mode:this.s.exercise(id)?.loadMode})).filter(r=>r.weight>0&&(r.mode==='external'||r.mode==='weighted-bodyweight'||!r.mode)).slice(0,2));
  category=signal<'weight'|'strength'|'body'|'nutrition'>('strength');period=signal(-28);
  overviewPlan=signal('');
  private clock=inject(TodayService,{optional:true});
  get today(){return this.clock?.date()||localDate();}
  cutoff(){if(!this.period())return '';const d=new Date(this.today+'T12:00:00');if(this.period()<0)d.setDate(d.getDate()+this.period()+1);else d.setMonth(d.getMonth()-this.period());return localDate(d);}
  measurements=computed(()=>this.s.data().measurements.filter(m=>!this.cutoff()||m.date>=this.cutoff()).sort((a,b)=>a.date.localeCompare(b.date)));
  dateLabel(date:string){return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});}
  weightPoints=computed(()=>this.measurements().map(m=>({label:this.dateLabel(m.date),value:this.s.weight(m.weight)})));
  waistPoints=computed(()=>this.measurements().filter(m=>m.waist!==undefined).map(m=>({label:this.dateLabel(m.date),value:m.waist!})));
  fatPoints=computed(()=>this.measurements().filter(m=>m.bodyFat!==undefined).map(m=>({label:this.dateLabel(m.date),value:m.bodyFat!})));
  nutritionPoints=computed(()=>{const totals=new Map<string,number>();for(const m of this.s.data().meals)if(!this.cutoff()||m.date>=this.cutoff())totals.set(m.date,(totals.get(m.date)||0)+m.calories);return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:this.dateLabel(date),value}));});
  s = inject(Store);
  overviewSessions=computed(()=>{const plan=this.category()==='strength'?this.overviewPlan():'';const cutoff=this.cutoff();return this.s.completed().filter(row=>(!plan||row.planId===plan)&&(!cutoff||row.date>=cutoff)&&row.date<=this.today);});
  overviewVolume=computed(()=>this.overviewSessions().reduce((sum,row)=>sum+sessionVolume(this.s.data(),row),0));
  overviewDuration=computed(()=>{const known=this.overviewSessions().filter(row=>!row.durationUnknown);if(!known.length)return null;const minutes=Math.round(known.reduce((sum,row)=>sum+row.duration,0));return minutes<60?{value:String(minutes),unit:'min',minutes:0}:{value:String(Math.floor(minutes/60)),unit:'h',minutes:minutes%60};});
  overviewRecord=computed(()=>{
    const exercise=this.selectedExercise();if(!exercise)return null;
    const data={...this.s.data(),workouts:this.overviewSessions()};const records=exerciseRecords(data,exercise.id,this.machine()||undefined);
    if(!records.maxReps)return null;
    if(exercise.loadMode==='bodyweight')return {value:String(records.maxReps),unit:'rip',label:exercise.name,reference:false};
    if(exercise.loadMode==='assisted')return null;
    if(!records.maxWeight)return null;
    return {value:this.s.formatWeight(records.maxWeight),unit:this.s.settings().unit,label:(exercise.loadMode==='weighted-bodyweight'?'Zavorra · ':'')+exercise.name,reference:false};
  });
  weeklyTrend=computed(()=>{
    const current=new Date(this.today+'T12:00:00');current.setDate(current.getDate()-((current.getDay()+6)%7));
    const end=localDate(current);current.setDate(current.getDate()-7);const middle=localDate(current);current.setDate(current.getDate()-7);const start=localDate(current);
    const recent=this.overviewSessions().filter(row=>row.date>=middle&&row.date<end),previous=this.overviewSessions().filter(row=>row.date>=start&&row.date<middle);
    if(!recent.length||!previous.length)return null;
    const first=previous.reduce((sum,row)=>sum+sessionVolume(this.s.data(),row),0),last=recent.reduce((sum,row)=>sum+sessionVolume(this.s.data(),row),0);
    if(first<=0)return null;
    const change=(last-first)/first*100;
    return {label:(change>0?'+':'')+change.toLocaleString('it-IT',{maximumFractionDigits:1})+'%',increased:change>0};
  });
  recordQuery=signal('');recordMode=signal('all');recordFilters=signal(false);
  recordOptions=computed(()=>this.s.data().exercises.filter(exercise=>(this.recordMode()==='all'||exercise.loadMode===this.recordMode())&&matchesExercise(exercise,this.recordQuery())));
  recordPinned=computed(()=>{const exercise=this.selectedExercise();return exercise&&!this.recordOptions().some(row=>row.id===exercise.id)?exercise:undefined;});
  hasRecordData=computed(()=>this.records().maxReps>0);
  exerciseId = signal("");machine=signal("");
  defaultId = computed(() => this.s.data().exercises[0]?.id || "");
  selectedExercise = computed(() =>
    this.s.exercise(this.exerciseId() || this.defaultId()),
  );
  records = computed(() =>
    this.s.records(this.exerciseId() || this.defaultId(),this.machine()||undefined),
  );
  weightRecords = computed(() =>
    Object.entries(this.records().repsByWeight).map(([weight, reps]) => ({
      weight: +weight,
      reps,
    })),
  );
  comparison = computed(() => {
    const id = this.exerciseId() || this.defaultId();
    const rows = this.s.completed().flatMap((w) => {
      const es = this.s
        .workoutExercises(w.id)
        .filter(
          (e) =>
            e.exerciseId === id &&
            (!this.machine()||setupKey(e.machineSetup)===this.machine()) &&
            e.loadMode === this.selectedExercise()?.loadMode,
        );
      const sets = es.flatMap((e) =>
        this.s.sets(e.id).filter((s) => s.completed&&s.kind!=="warmup"),
      );
      if (!sets.length) return [];
      const weight = Math.max(...sets.map((s) => s.weight));
      return [
        {
          date: new Date(w.date + "T12:00:00").toLocaleDateString("it-IT", {
            day: "numeric",
            month: "short",
          }),
          weight,
          reps: Math.max(
            ...sets.filter((s) => s.weight === weight).map((s) => s.reps),
          ),
        },
      ];
    });
    if (rows.length < 2) return null;
    const [after, before] = rows;
    const body = this.selectedExercise()?.loadMode === "bodyweight";
    const assisted = this.selectedExercise()?.loadMode === "assisted";
    const delta = body
      ? after.reps - before.reps
      : after.weight - before.weight;
    const improved = body ? delta > 0 : assisted ? delta < 0 : delta > 0;
    const signed = (n: number) =>
      `${n > 0 ? "+" : ""}${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}`;
    const text = body
      ? `${signed(delta)} ripetizioni`
      : delta
        ? `${signed(this.s.weight(delta))} ${this.s.settings().unit}${assisted ? " di assistenza" : ""} · ${signed(after.reps - before.reps)} rip`
        : `Carico invariato · ${signed(after.reps - before.reps)} rip`;
    return {
      after,
      before,
      improved: improved || (delta === 0 && after.reps > before.reps),
      text,
    };
  });
}
