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
import { ExerciseFilterComponent } from "../shared/exercise-filter.component";
@Component({
  standalone: true,
  styleUrls: ["./feature-polish.css", "./progress-design.css"],
  imports: [
    FormsModule,
    DataChartComponent,
    RouterLink,
    ProgressChartComponent,
    IconComponent,
    StatusComponent,
    ExerciseFilterComponent,
  ],
  template: `<header class="progress-page-heading"><h1>Progressi</h1><span class="data-source-label"><i></i>Il tuo percorso</span></header>
    <gt-status />
    <div class="segmented progress-tabs" role="group" aria-label="Categoria dei progressi"><button [class.active]="category()==='strength'" [attr.aria-pressed]="category()==='strength'" (click)="category.set('strength')">Forza</button><button [class.active]="category()==='weight'" [attr.aria-pressed]="category()==='weight'" (click)="category.set('weight')">Peso</button><button [class.active]="category()==='body'" [attr.aria-pressed]="category()==='body'" (click)="category.set('body')">Corpo</button>@if(features?.nutritionEnabled()){<button [class.active]="category()==='nutrition'" [attr.aria-pressed]="category()==='nutrition'" (click)="category.set('nutrition')">Pasti</button>}</div>
    <section class="progress-summary-grid" aria-label="Il tuo percorso in numeri">
     <div class="progress-summary-tile"><gt-icon name="weight"/><div><strong>{{s.completed().length}}</strong><small>Sedute completate</small></div></div>
     <div class="progress-summary-tile"><gt-icon name="fire"/><div><strong>{{s.formatWeight(s.totalVolume())}} <span>{{s.settings().unit}}</span></strong><small>Volume totale</small></div></div>
     <div class="progress-summary-tile"><gt-icon name="clock"/><div><strong>{{trainingDuration()}}</strong><small>Tempo di allenamento</small></div></div>
     <div class="progress-summary-tile"><gt-icon name="activity"/><div><strong>{{s.data().measurements.length}}</strong><small>Rilevazioni corporee</small></div></div>
    </section>
    @if(category()!=='strength'&&(category()!=='nutrition'||features?.nutritionEnabled())){<div class="filters progress-period-filter"><label>Periodo<select [ngModel]="period()" (ngModelChange)="period.set(+$event)"><option value="1">1 mese</option><option value="3">3 mesi</option><option value="6">6 mesi</option><option value="12">1 anno</option><option value="0">Tutto</option></select></label><a class="button ghost" routerLink="/profilo" [queryParams]="{section:category()==='nutrition'?'goals':'measurements'}">{{category()==='nutrition'?'Obiettivi':'Registra misurazione'}}</a></div>}
    @if(category()==='weight'){<section class="card performance-chart-card"><h2>Peso corporeo ({{s.settings().unit}})</h2><gt-data-chart [points]="weightPoints()" [unit]="s.settings().unit" title="Andamento del peso corporeo"/></section><div class="overview-primary" style="margin-top:16px"><div class="card"><p class="subtle">Peso attuale</p><strong class="record-value">{{s.profile().bodyWeight!==undefined?s.formatWeight(s.profile().bodyWeight!):'—'}} {{s.settings().unit}}</strong></div><div class="card"><p class="subtle">Rilevazioni nel periodo</p><strong class="record-value">{{measurements().length}}</strong></div></div>}
    @if(category()==='weight'&&recordCards().length){<div class="section-title"><h2>Record personali</h2><button class="ghost" (click)="category.set('strength')">Vedi tutti ›</button></div><div class="overview-primary">@for(record of recordCards();track record.id){<div class="card"><p class="subtle">{{record.name}}</p><strong class="record-value">{{s.formatWeight(record.weight)}} <small>{{s.settings().unit}}</small></strong></div>}</div>}
    @if(category()==='body'){<section class="card performance-chart-card"><h2>Girovita</h2><gt-data-chart [points]="waistPoints()" unit="cm" title="Misurazioni del girovita"/></section><section class="card" style="margin-top:16px"><h2>Massa grassa registrata</h2><gt-data-chart [points]="fatPoints()" unit="%" title="Percentuale di massa grassa inserita manualmente"/><p class="subtle">Valori inseriti da te, non dedotti da fotografie.</p></section>}
    @if(features?.nutritionEnabled()&&category()==='nutrition'){<section class="card performance-chart-card"><h2>Calorie registrate</h2><gt-data-chart [points]="nutritionPoints()" unit="kcal" title="Calorie dei giorni registrati"/><p class="subtle">Solo i giorni con pasti registrati. Un giorno senza dati non è considerato un giorno a zero calorie.</p></section><a class="button primary full-width" style="margin-top:18px" routerLink="/alimentazione">Apri diario alimentare</a>}
    @if(category()==='strength'){
    <section class="card performance-chart-card weekly-volume-card">
     <div class="card-head"><h2>Volume settimanale</h2><gt-icon name="chart"/></div>
     <gt-progress-chart initialMetric="weekly" />
    </section>
    <details class="card progress-exercise-details">
     <summary><gt-icon name="chart"/><span><strong>Progressi per esercizio</strong><small>Peso, volume, ripetizioni e 1RM stimato</small></span><span class="progress-detail-chevron">›</span></summary>
     <div class="progress-details-body"><gt-progress-chart /></div>
    </details>
    <section class="card personal-records-panel" style="margin-top:20px">
      <div class="card-head">
        <div>
          <h2>Record personali</h2>
        </div>
        <gt-icon name="trophy" />
      </div>
      <gt-exercise-filter style="max-width:400px" [exercises]="s.data().exercises"
        [value]="exerciseId() || defaultId()" (choose)="exerciseId.set($event);machine.set('')" />
      @if(s.configurations(exerciseId()||defaultId()).length){<label style="margin-top:12px">Configurazione dei record<select [ngModel]="machine()" (ngModelChange)="machine.set($event)"><option value="">Tutte le configurazioni</option>@for(config of s.configurations(exerciseId()||defaultId());track config.key){<option [value]="config.key">{{config.label}}</option>}</select></label>}
      <div class="stats-grid performance-record-grid">
        <div class="card stat">
          <span class="stat-label">{{
            selectedExercise()?.loadMode === "assisted"
              ? "Assistenza massima registrata"
              : selectedExercise()?.loadMode === "weighted-bodyweight"
                ? "Zavorra massima"
                : "Peso massimo effettivo"
          }}</span>
          <div class="record-value">
            {{
              selectedExercise()?.loadMode === "bodyweight"
                ? "—"
                : s.formatWeight(records().maxWeight)
            }}
            <small>{{ s.settings().unit }}</small>
          </div>
        </div>
        <div class="card stat">
          <span class="stat-label">1RM stimato · Epley</span>
          <div class="record-value">
            {{
              selectedExercise()?.loadMode === "external"
                ? s.formatWeight(records().estimated1RM)
                : "—"
            }}
            <small>{{ s.settings().unit }}</small>
          </div>
        </div>
        <div class="card stat">
          <span class="stat-label">Ripetizioni massime</span>
          <div class="record-value">
            {{ records().maxReps }} <small>rip</small>
          </div>
        </div>
        <div class="card stat">
          <span class="stat-label">Volume massimo / sessione</span>
          <div class="record-value">
            {{
              selectedExercise()?.loadMode === "external"
                ? s.formatWeight(records().maxVolume)
                : "—"
            }}
            <small>{{ s.settings().unit }}</small>
          </div>
        </div>
      </div>
      <p class="subtle">
        Statistiche riferite alla modalità di carico attuale dell’esercizio.
        L’1RM è una stima, non un massimale testato. Per corpo libero, zavorra e
        assistenza non si calcolano volume e 1RM. Nell’assistito, meno
        assistenza a parità di ripetizioni indica un miglioramento.
      </p>
      @if (weightRecords().length) {
        <details style="margin-top:18px">
          <summary class="subtle">Record di ripetizioni per carico</summary>
          <div class="actions">
            @for (r of weightRecords(); track r.weight) {
              <span class="pill"
                >{{ s.formatWeight(r.weight) }} {{ s.settings().unit }} ×
                {{ r.reps }} rip</span
              >
            }
          </div>
        </details>
      }
    </section>
    <div class="progress-comparison" style="margin-top:20px">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Una sessione alla volta</h2>
            <p>
              Ultima sessione vs precedente · carico massimo e ripetizioni a
              quel carico
            </p>
          </div>
          <gt-icon name="activity" />
        </div>
        @if (comparison(); as c) {
          <div class="split">
            <div>
              <p class="subtle">Precedente · {{ c.before.date }}</p>
              <div class="record-value">
                {{
                  selectedExercise()?.loadMode === "bodyweight"
                    ? ""
                    : s.formatWeight(c.before.weight) +
                      " " +
                      s.settings().unit +
                      " × "
                }}{{ c.before.reps }} <small>rip</small>
              </div>
            </div>
            <div>
              <p class="subtle">Ultima · {{ c.after.date }}</p>
              <div class="record-value">
                {{
                  selectedExercise()?.loadMode === "bodyweight"
                    ? ""
                    : s.formatWeight(c.after.weight) +
                      " " +
                      s.settings().unit +
                      " × "
                }}{{ c.after.reps }} <small>rip</small>
              </div>
            </div>
          </div>
          <p class="pill" style="margin-top:20px" [class.green]="c.improved">
            {{ c.text }}
          </p>
        } @else {
          <div class="empty">
            <h3>Il confronto arriverà presto</h3>
            <p>Completa almeno due sessioni con questo esercizio.</p>
          </div>
        }
      </section>
    </div>}
    <section class="card progress-plan-card"><div class="card-head"><h2>Statistiche del piano</h2><gt-icon name="plans"/></div><label>Scegli un programma<select [ngModel]="''" (ngModelChange)="openPlan($event)"><option value="">Scegli un piano</option>@for(plan of s.data().plans;track plan.id){<option [value]="plan.id">{{plan.name}}{{plan.program?' · '+plan.program.startDate:''}}{{plan.completedAt?' · Concluso':''}}</option>}</select></label></section>
    <nav class="progress-destinations" aria-label="Esplora il tuo percorso"><a routerLink="/focus-muscolare"><gt-icon name="weight"/><span><strong>Focus muscolare</strong><small>Volume e recupero per gruppo</small></span>›</a><a routerLink="/recupero"><gt-icon name="moon"/><span><strong>Recovery</strong><small>Sonno, energia e riposo</small></span>›</a><a routerLink="/sonno"><gt-icon name="moon"/><span><strong>Diario del sonno</strong><small>Durata e qualità del riposo</small></span>›</a></nav>
    <p class="progress-archive-note"><gt-icon name="shield"/> Il tuo percorso è custodito nel tuo archivio personale.</p>`,
})
export class ProgressComponent {
  private router=inject(Router);
  openPlan(id:string){if(id)void this.router.navigate(['/piano',id]);}
  features=inject(AppFeaturesService,{optional:true});
  constructor(){effect(()=>{if(!this.features?.nutritionEnabled()&&this.category()==='nutrition')this.category.set('weight');});}
  recordCards=computed(()=>[...new Set(this.s.completed().flatMap(w=>this.s.workoutExercises(w.id).map(e=>e.exerciseId)))].map(id=>({id,name:this.s.exercise(id)?.name||this.s.data().workoutExercises.find(e=>e.exerciseId===id)?.name||'Esercizio',weight:this.s.records(id).maxWeight,mode:this.s.exercise(id)?.loadMode})).filter(r=>r.weight>0&&(r.mode==='external'||r.mode==='weighted-bodyweight'||!r.mode)).slice(0,2));
  category=signal<'weight'|'strength'|'body'|'nutrition'>('strength');period=signal(3);
  cutoff(){if(!this.period())return '';const d=new Date();d.setMonth(d.getMonth()-this.period());return localDate(d);}
  measurements=computed(()=>this.s.data().measurements.filter(m=>!this.cutoff()||m.date>=this.cutoff()).sort((a,b)=>a.date.localeCompare(b.date)));
  dateLabel(date:string){return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});}
  weightPoints=computed(()=>this.measurements().map(m=>({label:this.dateLabel(m.date),value:this.s.weight(m.weight)})));
  waistPoints=computed(()=>this.measurements().filter(m=>m.waist!==undefined).map(m=>({label:this.dateLabel(m.date),value:m.waist!})));
  fatPoints=computed(()=>this.measurements().filter(m=>m.bodyFat!==undefined).map(m=>({label:this.dateLabel(m.date),value:m.bodyFat!})));
  nutritionPoints=computed(()=>{const totals=new Map<string,number>();for(const m of this.s.data().meals)if(!this.cutoff()||m.date>=this.cutoff())totals.set(m.date,(totals.get(m.date)||0)+m.calories);return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:this.dateLabel(date),value}));});
  s = inject(Store);
  trainingDuration=computed(()=>{const minutes=Math.round(this.s.completed().reduce((sum,row)=>sum+row.duration,0));return minutes<60?minutes+' min':Math.floor(minutes/60)+' h'+(minutes%60?' '+minutes%60+' min':'');});
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
