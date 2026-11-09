import { DESIGN_DIRECTIVES } from "../design/design-directives";
import { sessionVolume, exerciseRecords } from "../services/statistics";
import { TodayService } from "../services/today";
import { AppFeaturesService } from "../services/app-features";
import { setupKey } from "../services/training-flow";
import { DataChartComponent, DataPoint } from "../shared/data-chart.component";
import { Router, RouterLink } from "@angular/router";
import { localDate } from "../models/domain";
import { Component, computed, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { ProgressChartComponent } from "../shared/progress-chart.component";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { matchesExercise } from "../services/exercise-search";
@Component({
  standalone: true,
  styleUrls: [
    "./feature-polish.css",
    "./progress-design.css",
    "./progress-reference.css",
    "./progress-redesign.css",
  ],
  imports: [
    ...DESIGN_DIRECTIVES,
    FormsModule,
    DataChartComponent,
    RouterLink,
    ProgressChartComponent,
    IconComponent,
    StatusComponent,
    ExerciseThumbComponent,
  ],
  template: `<div class="reference-progress">
    <header class="progress-page-heading ref-page-header"><div><h1 gtDesign="progress.title" gtDesignLabel="progress.title">Progressi</h1><p class="ref-progress-subtitle" gtDesign="progress.subtitle" gtDesignLabel="progress.subtitle">Analizza i tuoi risultati</p></div><span class="progress-header-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></header>
    <gt-status />
    <div class="actions" style="margin:0 0 18px"><a class="button primary" routerLink="/analisi"><gt-icon name="chart"/> Analisi avanzate, promemoria e report <gt-icon name="arrow"/></a></div>
    <details class="card progress-exercise-details" gtDesign="progress.exerciseChart">
     <summary><gt-icon name="chart"/><span><strong gtDesign="progress.exerciseChart.title" gtDesignLabel="progress.exerciseChart.title">Progressi per esercizio</strong><small>Peso, volume, ripetizioni e 1RM stimato</small></span><span class="progress-detail-chevron">›</span></summary>
     <div class="progress-details-body"><gt-progress-chart /></div>
    </details>
    <section class="card personal-records-panel reference-records" gtDesign="progress.records">
      <div class="card-head"><h2 gtDesign="progress.records.title" gtDesignLabel="progress.records.title">Record personali</h2><gt-icon name="trophy"/></div>
      <label class="record-search"><span class="sr-only">Cerca esercizio per nome o parola chiave</span><gt-icon name="search"/><input type="search" gtDesign="progress.search" placeholder="Cerca per nome o parola chiave…" autocomplete="off" [ngModel]="recordQuery()" (ngModelChange)="recordQuery.set($event)"/></label>
      <div class="record-selection-row">
        <label class="record-exercise-select"><span>Esercizio</span><select [ngModel]="exerciseId()||defaultId()" gtDesign="progress.exercise" (ngModelChange)="exerciseId.set($event);machine.set('')" aria-label="Esercizio dei record"><option value="" disabled>Seleziona un esercizio</option>@if(recordPinned();as exercise){<option [value]="exercise.id">{{exercise.name}} (selezionato)</option>}@for(exercise of recordOptions();track exercise.id){<option [value]="exercise.id">{{exercise.name}}</option>}</select></label>
        @if(selectedExercise();as exercise){<gt-exercise-thumb class="record-exercise-thumb" [exercise]="exercise"/>}
        <button type="button" class="record-filter-button ref-icon-button" gtDesign="progress.filters" (click)="recordFilters.set(!recordFilters())" [attr.aria-expanded]="recordFilters()" aria-controls="record-filters" aria-label="Filtra gli esercizi e le configurazioni dei record"><gt-icon name="sliders"/></button>
      </div>
      @if(recordQuery().trim()||recordMode()!=='all'){<p class="record-result" role="status">{{recordOptions().length}} risultati@if(recordPinned()){ · Selezione attuale conservata}</p>}
      @if(recordFilters()){
        <div class="record-filters" id="record-filters">
          <label>Modalità di carico<select [ngModel]="recordMode()" (ngModelChange)="recordMode.set($event)"><option value="all">Tutte le modalità</option><option value="external">Carico esterno</option><option value="bodyweight">Corpo libero</option><option value="weighted-bodyweight">Zavorra</option><option value="assisted">Assistito</option></select></label>
          @if(s.configurations(exerciseId()||defaultId()).length){<label>Configurazione dei record<select [ngModel]="machine()" (ngModelChange)="machine.set($event)"><option value="">Tutte le configurazioni</option>@for(config of s.configurations(exerciseId()||defaultId());track config.key){<option [value]="config.key">{{config.label}}</option>}</select></label>}
          <p>Le configurazioni di macchine diverse possono non essere confrontabili.</p>
        </div>
      }
      <div class="stats-grid performance-record-grid reference-record-grid">
        <div class="card stat"><span class="stat-label"><gt-icon name="weight"/><span>{{selectedExercise()?.loadMode==='assisted'?'Assistenza massima registrata':selectedExercise()?.loadMode==='weighted-bodyweight'?'Zavorra massima':'Peso massimo effettivo'}}</span></span><div class="record-value">{{hasRecordData()&&selectedExercise()?.loadMode!=='bodyweight'?s.formatWeight(records().maxWeight):'—'}} @if(hasRecordData()&&selectedExercise()?.loadMode!=='bodyweight'){<small>{{s.settings().unit}}</small>}</div><small class="record-data-state">{{!hasRecordData()?'Nessun dato':selectedExercise()?.loadMode==='bodyweight'?'Non applicabile':'Carico registrato'}}</small></div>
        <div class="card stat"><span class="stat-label"><gt-icon name="bolt"/><span>1RM stimato · Epley</span></span><div class="record-value">{{selectedExercise()?.loadMode==='external'&&records().estimated1RM>0?s.formatWeight(records().estimated1RM):'—'}} @if(selectedExercise()?.loadMode==='external'&&records().estimated1RM>0){<small>{{s.settings().unit}}</small>}</div><small class="record-data-state">{{!hasRecordData()?'Nessun dato':selectedExercise()?.loadMode!=='external'?'Non applicabile':records().estimated1RM>0?'Stima dal carico registrato':'Nessuna stima'}}</small></div>
        <div class="card stat"><span class="stat-label"><gt-icon name="repeat"/><span>Ripetizioni massime</span></span><div class="record-value">{{hasRecordData()?records().maxReps:'—'}} @if(hasRecordData()){<small>rip</small>}</div><small class="record-data-state">{{hasRecordData()?'Serie allenanti completate':'Nessun dato'}}</small></div>
        <div class="card stat"><span class="stat-label"><gt-icon name="layers"/><span>Volume massimo / sessione</span></span><div class="record-value">{{hasRecordData()&&selectedExercise()?.loadMode==='external'?s.formatWeight(records().maxVolume):'—'}} @if(hasRecordData()&&selectedExercise()?.loadMode==='external'){<small>{{s.settings().unit}}</small>}</div><small class="record-data-state">{{!hasRecordData()?'Nessun dato':selectedExercise()?.loadMode!=='external'?'Non applicabile':'Carichi × ripetizioni'}}</small></div>
      </div>
      @if(weightRecords().length){<details class="record-weight-details"><summary>Record di ripetizioni per carico</summary><div class="actions">@for(r of weightRecords();track r.weight){<span class="pill">{{s.formatWeight(r.weight)}} {{s.settings().unit}} × {{r.reps}} rip</span>}</div></details>}
    </section>
    <aside class="card record-information" gtDesign="progress.info"><gt-icon name="info"/><p>{{comparison()?'L’1RM è una stima, non un massimale testato. Per corpo libero, zavorra e assistenza non si calcolano volume e 1RM.':'Registra almeno due sessioni con questo esercizio per confrontare i tuoi progressi.'}}</p></aside>
    <details class="card progress-overview-details"><summary><gt-icon name="chart"/><span gtDesign="progress.overview.title" gtDesignLabel="progress.overview.title">Riepilogo, peso e misure</span><gt-icon name="chevron-down"/></summary><div class="progress-overview-body">
    <div class="segmented progress-tabs ref-tabs" role="group" aria-label="Categoria dei progressi"><button type="button" [class.active]="category()==='strength'" [attr.aria-pressed]="category()==='strength'" (click)="category.set('strength')"><gt-icon name="strength"/>Forza</button><button type="button" [class.active]="category()==='weight'" [attr.aria-pressed]="category()==='weight'" (click)="category.set('weight')"><gt-icon name="scale"/>Peso</button><button type="button" [class.active]="category()==='body'" [attr.aria-pressed]="category()==='body'" (click)="category.set('body')"><gt-icon name="body"/>Corpo</button>@if(features?.nutritionEnabled()){<button type="button" [class.active]="category()==='nutrition'" [attr.aria-pressed]="category()==='nutrition'" (click)="category.set('nutrition')"><gt-icon name="nutrition"/>Pasti</button>}</div>
    @if(category()==='strength'){
     <div class="ref-progress-filters">
      <label class="ref-field"><span>Piano</span><span class="ref-field-control"><select [ngModel]="overviewPlan()" (ngModelChange)="overviewPlan.set($event)" aria-label="Piano dei progressi"><option value="">Tutti i piani</option>@for(plan of s.data().plans;track plan.id){<option [value]="plan.id">{{plan.name}}</option>}</select></span></label>
      <label class="ref-field"><span>Periodo</span><span class="ref-field-control ref-has-icon"><gt-icon name="calendar"/><select [ngModel]="period()" (ngModelChange)="period.set(+$event)" aria-label="Periodo dei progressi"><option [ngValue]="-28">4 settimane</option><option [ngValue]="1">1 mese</option><option [ngValue]="3">3 mesi</option><option [ngValue]="6">6 mesi</option><option [ngValue]="12">1 anno</option><option [ngValue]="0">Tutto</option></select></span></label>
     </div>
    }@else{
     <div class="filters progress-period-filter"><label class="ref-field"><span>Periodo</span><span class="ref-field-control ref-has-icon"><gt-icon name="calendar"/><select [ngModel]="period()" (ngModelChange)="period.set(+$event)"><option [ngValue]="-28">4 settimane</option><option [ngValue]="1">1 mese</option><option [ngValue]="3">3 mesi</option><option [ngValue]="6">6 mesi</option><option [ngValue]="12">1 anno</option><option [ngValue]="0">Tutto</option></select></span></label><a class="button secondary" routerLink="/profilo" [queryParams]="{section:category()==='nutrition'?'goals':'measurements'}">{{category()==='nutrition'?'Obiettivi':'Registra misurazione'}}</a></div>
    }
    <section class="progress-summary-grid ref-progress-summary" aria-label="Statistiche degli allenamenti nel periodo selezionato">
     <div class="progress-summary-tile ref-progress-metric"><div class="ref-progress-metric-top"><gt-icon name="weight"/><span class="ref-badge neutral" gtDesign="progress.sessionsBadge">Nel periodo</span></div><strong class="ref-metric-value">{{overviewSessions().length}}</strong><small>Sedute completate</small></div>
     <div class="progress-summary-tile ref-progress-metric"><div class="ref-progress-metric-top"><gt-icon name="chart"/>@if(weeklyTrend();as trend){<span class="ref-badge" [class.green]="trend.increased" [class.neutral]="!trend.increased" title="Confronto tra le ultime due settimane complete">{{trend.label}}</span>}@else{<span class="ref-badge neutral">Nel periodo</span>}</div><strong class="ref-metric-value">{{overviewSessions().length?s.formatWeight(overviewVolume()):'—'}} <span>{{s.settings().unit}}</span></strong><small>Volume registrato</small></div>
     <div class="progress-summary-tile ref-progress-metric"><div class="ref-progress-metric-top"><gt-icon name="trophy"/><span class="ref-badge violet">{{overviewRecord()?.reference?'Riferimento':'Record'}}</span></div><strong class="ref-metric-value">{{overviewRecord()?overviewRecord()!.value:'—'}} @if(overviewRecord();as record){<span>{{record.unit}}</span>}</strong><small>{{overviewRecord()?.label||selectedExercise()?.name||'Nessun record registrato'}}</small></div>
     <div class="progress-summary-tile ref-progress-metric"><div class="ref-progress-metric-top"><gt-icon name="clock"/><span class="ref-badge neutral">Totale</span></div><strong class="ref-metric-value">@if(overviewDuration();as duration){ {{duration.value}} <span>{{duration.unit}}</span>@if(duration.minutes){<b class="ref-duration-minutes">{{duration.minutes}} <span>m</span></b>}}@else{—}</strong><small>Tempo di allenamento</small></div>
    </section>
    @if(category()==='weight'){<section class="card performance-chart-card"><h2>Peso corporeo ({{s.settings().unit}})</h2><gt-data-chart [points]="weightPoints()" [unit]="s.settings().unit" title="Andamento del peso corporeo"/></section><div class="overview-primary" style="margin-top:16px"><div class="card"><p class="subtle">Peso attuale</p><strong class="record-value">{{s.profile().bodyWeight!==undefined?s.formatWeight(s.profile().bodyWeight!):'—'}} {{s.settings().unit}}</strong></div><div class="card"><p class="subtle">Rilevazioni nel periodo</p><strong class="record-value">{{measurements().length}}</strong></div></div>}
    @if(category()==='weight'&&recordCards().length){<div class="section-title"><h2 gtDesign="progress.records.title" gtDesignLabel="progress.records.title">Record personali</h2><button class="ghost" (click)="category.set('strength')">Vedi tutti ›</button></div><div class="overview-primary">@for(record of recordCards();track record.id){<div class="card"><p class="subtle">{{record.name}}</p><strong class="record-value">{{s.formatWeight(record.weight)}} <small>{{s.settings().unit}}</small></strong></div>}</div>}
    @if(category()==='body'){<section class="card performance-chart-card"><h2>Girovita</h2><gt-data-chart [points]="waistPoints()" unit="cm" title="Misurazioni del girovita"/></section><section class="card" style="margin-top:16px"><h2>Massa grassa registrata</h2><gt-data-chart [points]="fatPoints()" unit="%" title="Percentuale di massa grassa inserita manualmente"/><p class="subtle">Valori inseriti da te, non dedotti da fotografie.</p></section>}
    @if(features?.nutritionEnabled()&&category()==='nutrition'){<section class="card performance-chart-card"><h2>Calorie registrate</h2><gt-data-chart [points]="nutritionPoints()" unit="kcal" title="Calorie dei giorni registrati"/><p class="subtle">Solo i giorni con pasti registrati. Un giorno senza dati non è considerato un giorno a zero calorie.</p></section><a class="button primary full-width" style="margin-top:18px" routerLink="/alimentazione">Apri diario alimentare</a>}
    @if(category()==='strength'){
    <section class="card performance-chart-card weekly-volume-card ref-weekly-card" gtDesign="progress.weeklyChart">
     <div class="card-head"><div><p class="ref-eyebrow">LA TUA COSTANZA</p><h2 gtDesign="progress.weeklyChart.title" gtDesignLabel="progress.weeklyChart.title">Volume settimanale</h2></div><span class="ref-badge neutral">{{s.settings().unit}}</span></div>
     <div class="ref-weekly-summary"><strong>{{overviewSessions().length?s.formatWeight(overviewVolume()):'—'}} <span>{{s.settings().unit}}</span></strong>@if(weeklyTrend();as trend){<span class="ref-badge" [class.green]="trend.increased" [class.neutral]="!trend.increased" title="Confronto tra le ultime due settimane complete">{{trend.label}} ultima settimana</span>}</div>
     <p class="ref-weekly-description">Somma dei carichi esterni registrati nel periodo.</p>
     <gt-progress-chart initialMetric="weekly" [showFilters]="false" [planFilter]="overviewPlan()" [monthsFilter]="period()>0?period():0" [daysFilter]="period()<0?-period():undefined" [compact]="true" />
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
    </div></details>
    <section class="card progress-plan-card"><div class="card-head"><h2>Statistiche del piano</h2><gt-icon name="plans"/></div><label>Scegli un programma<select [ngModel]="''" (ngModelChange)="openPlan($event)"><option value="">Scegli un piano</option>@for(plan of s.data().plans;track plan.id){<option [value]="plan.id">{{plan.name}}{{plan.program?' · '+plan.program.startDate:''}}{{plan.completedAt?' · Concluso':''}}</option>}</select></label></section>
    <nav class="progress-destinations" aria-label="Esplora il tuo percorso"><a routerLink="/focus-muscolare"><gt-icon name="weight"/><span><strong>Focus muscolare</strong><small>Volume e recupero per gruppo</small></span>›</a><a routerLink="/recupero"><gt-icon name="moon"/><span><strong>Recovery</strong><small>Sonno, energia e riposo</small></span>›</a><a routerLink="/sonno"><gt-icon name="moon"/><span><strong>Diario del sonno</strong><small>Durata e qualità del riposo</small></span>›</a></nav>
    <p class="progress-archive-note"><gt-icon name="shield"/> Il tuo percorso è custodito nel tuo archivio personale.</p></div>`,
})
export class ProgressComponent {
  private router = inject(Router);
  openPlan(id: string) {
    if (id) void this.router.navigate(["/piano", id]);
  }
  features = inject(AppFeaturesService, { optional: true });
  constructor() {
    effect(() => {
      if (!this.features?.nutritionEnabled() && this.category() === "nutrition")
        this.category.set("weight");
    });
  }
  recordCards = computed(() =>
    [
      ...new Set(
        this.s
          .completed()
          .flatMap((w) =>
            this.s.workoutExercises(w.id).map((e) => e.exerciseId),
          ),
      ),
    ]
      .map((id) => ({
        id,
        name:
          this.s.exercise(id)?.name ||
          this.s.data().workoutExercises.find((e) => e.exerciseId === id)
            ?.name ||
          "Esercizio",
        weight: this.s.records(id).maxWeight,
        mode: this.s.exercise(id)?.loadMode,
      }))
      .filter(
        (r) =>
          r.weight > 0 &&
          (r.mode === "external" ||
            r.mode === "weighted-bodyweight" ||
            !r.mode),
      )
      .slice(0, 2),
  );
  category = signal<"weight" | "strength" | "body" | "nutrition">("strength");
  period = signal(-28);
  overviewPlan = signal("");
  private clock = inject(TodayService, { optional: true });
  get today() {
    return this.clock?.date() || localDate();
  }
  cutoff() {
    if (!this.period()) return "";
    const d = new Date(this.today + "T12:00:00");
    if (this.period() < 0) d.setDate(d.getDate() + this.period() + 1);
    else d.setMonth(d.getMonth() - this.period());
    return localDate(d);
  }
  measurements = computed(() =>
    this.s
      .data()
      .measurements.filter((m) => !this.cutoff() || m.date >= this.cutoff())
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  dateLabel(date: string) {
    return new Date(date + "T12:00:00").toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
    });
  }
  weightPoints = computed(() =>
    this.measurements().map((m) => ({
      label: this.dateLabel(m.date),
      value: this.s.weight(m.weight),
    })),
  );
  waistPoints = computed(() =>
    this.measurements()
      .filter((m) => m.waist !== undefined)
      .map((m) => ({ label: this.dateLabel(m.date), value: m.waist! })),
  );
  fatPoints = computed(() =>
    this.measurements()
      .filter((m) => m.bodyFat !== undefined)
      .map((m) => ({ label: this.dateLabel(m.date), value: m.bodyFat! })),
  );
  nutritionPoints = computed(() => {
    const totals = new Map<string, number>();
    for (const m of this.s.data().meals)
      if (!this.cutoff() || m.date >= this.cutoff())
        totals.set(m.date, (totals.get(m.date) || 0) + m.calories);
    return [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ label: this.dateLabel(date), value }));
  });
  s = inject(Store);
  overviewSessions = computed(() => {
    const plan = this.category() === "strength" ? this.overviewPlan() : "";
    const cutoff = this.cutoff();
    return this.s
      .completed()
      .filter(
        (row) =>
          (!plan || row.planId === plan) &&
          (!cutoff || row.date >= cutoff) &&
          row.date <= this.today,
      );
  });
  overviewVolume = computed(() =>
    this.overviewSessions().reduce(
      (sum, row) => sum + sessionVolume(this.s.data(), row),
      0,
    ),
  );
  overviewDuration = computed(() => {
    const known = this.overviewSessions().filter((row) => !row.durationUnknown);
    if (!known.length) return null;
    const minutes = Math.round(
      known.reduce((sum, row) => sum + row.duration, 0),
    );
    return minutes < 60
      ? { value: String(minutes), unit: "min", minutes: 0 }
      : {
          value: String(Math.floor(minutes / 60)),
          unit: "h",
          minutes: minutes % 60,
        };
  });
  overviewRecord = computed(() => {
    const exercise = this.selectedExercise();
    if (!exercise) return null;
    const data = { ...this.s.data(), workouts: this.overviewSessions() };
    const records = exerciseRecords(
      data,
      exercise.id,
      this.machine() || undefined,
    );
    if (!records.maxReps) return null;
    if (exercise.loadMode === "bodyweight")
      return {
        value: String(records.maxReps),
        unit: "rip",
        label: exercise.name,
        reference: false,
      };
    if (exercise.loadMode === "assisted") return null;
    if (!records.maxWeight) return null;
    return {
      value: this.s.formatWeight(records.maxWeight),
      unit: this.s.settings().unit,
      label:
        (exercise.loadMode === "weighted-bodyweight" ? "Zavorra · " : "") +
        exercise.name,
      reference: false,
    };
  });
  weeklyTrend = computed(() => {
    const current = new Date(this.today + "T12:00:00");
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
    const end = localDate(current);
    current.setDate(current.getDate() - 7);
    const middle = localDate(current);
    current.setDate(current.getDate() - 7);
    const start = localDate(current);
    const recent = this.overviewSessions().filter(
        (row) => row.date >= middle && row.date < end,
      ),
      previous = this.overviewSessions().filter(
        (row) => row.date >= start && row.date < middle,
      );
    if (!recent.length || !previous.length) return null;
    const first = previous.reduce(
        (sum, row) => sum + sessionVolume(this.s.data(), row),
        0,
      ),
      last = recent.reduce(
        (sum, row) => sum + sessionVolume(this.s.data(), row),
        0,
      );
    if (first <= 0) return null;
    const change = ((last - first) / first) * 100;
    return {
      label:
        (change > 0 ? "+" : "") +
        change.toLocaleString("it-IT", { maximumFractionDigits: 1 }) +
        "%",
      increased: change > 0,
    };
  });
  recordQuery = signal("");
  recordMode = signal("all");
  recordFilters = signal(false);
  recordOptions = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (exercise) =>
          (this.recordMode() === "all" ||
            exercise.loadMode === this.recordMode()) &&
          matchesExercise(exercise, this.recordQuery()),
      ),
  );
  recordPinned = computed(() => {
    const exercise = this.selectedExercise();
    return exercise &&
      !this.recordOptions().some((row) => row.id === exercise.id)
      ? exercise
      : undefined;
  });
  hasRecordData = computed(() => this.records().maxReps > 0);
  exerciseId = signal("");
  machine = signal("");
  defaultId = computed(() => this.s.data().exercises[0]?.id || "");
  selectedExercise = computed(() =>
    this.s.exercise(this.exerciseId() || this.defaultId()),
  );
  records = computed(() =>
    this.s.records(
      this.exerciseId() || this.defaultId(),
      this.machine() || undefined,
    ),
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
            (!this.machine() || setupKey(e.machineSetup) === this.machine()) &&
            e.loadMode === this.selectedExercise()?.loadMode,
        );
      const sets = es.flatMap((e) =>
        this.s.sets(e.id).filter((s) => s.completed && s.kind !== "warmup"),
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
