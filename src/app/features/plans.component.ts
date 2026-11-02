import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import { OpenWorkoutsComponent } from '../shared/open-workouts.component';
import {ExerciseScope,ExerciseScopeComponent} from "../shared/exercise-scope.component";
import { ExerciseFamiliesComponent } from "../shared/exercise-families.component";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { matchesExercise } from "../services/exercise-search";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, computed, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import {
  TrainingPlan,
  TrainingPlanDay,
  TrainingPlanExercise,
  now,
  uid,
  localDate,
} from "../models/domain";
import { TodayService } from '../services/today';
import { parseLocalDate } from '../services/calendar';
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { DraftSession, FormDraftService } from "../services/form-drafts";
type PlanEditorDraft = {
  kind: string; editId: string; saveId: string; parentId: string; baseline: string;
  expanded: string; archived: boolean; search: string; scope: ExerciseScope; unit?:'kg'|'lb';
  plan: ReturnType<PlansComponent['planForm']['getRawValue']>;
  day: ReturnType<PlansComponent['dayForm']['getRawValue']>;
  exercise: ReturnType<PlansComponent['exerciseForm']['getRawValue']>;
};
@Component({
  standalone: true,
  styleUrls: ["./feature-polish.css", "./plans-simple.css"],
  imports: [DateFieldComponent,OpenWorkoutsComponent,
    A11yModule,ExerciseScopeComponent,
    ExerciseFamiliesComponent,
    ExerciseThumbComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    IconComponent,
    StatusComponent,
  ],
  template: `<div class="compact-plans">
    <header class="plans-heading"><div><h1>Allenati</h1><p>Il tuo programma, senza cercare.</p></div><div class="plan-heading-actions"><button type="button" class="primary new-plan" (click)="openPlan()" [disabled]="!s.ready()" aria-label="Nuovo piano"><gt-icon name="plus"/></button></div></header>
    <gt-status />
    <gt-open-workouts />
    @if(draftNotice()){<p class="notice" role="status">{{draftNotice()}}</p>}
    <nav class="neon-segments plans-navigation" aria-label="Allenamenti"><button type="button" [class.active]="hub()==='today'" (click)="hub.set('today')">Oggi</button><button type="button" [class.active]="hub()==='plans'&&!archived()" (click)="hub.set('plans');archived.set(false)">Piani</button><a routerLink="/allenamenti">Storico</a></nav>
    @if(hub()==='today'){
      <section class="card training-today-card">
        <p class="training-kicker">{{s.draft()?'SEDUTA APERTA':'IL TUO PROSSIMO ALLENAMENTO'}}</p>
        @if(todayCover();as exercise){<gt-exercise-thumb class="training-today-cover" [exercise]="exercise"/>}@else{<img class="training-today-art" src="/training/dumbbell.png" alt=""/>}
        <div class="training-today-copy">@if(s.draft();as draft){<h2>{{draft.dayName}}</h2><p>{{draft.planName}}</p><a class="button primary full-width" routerLink="/sessione"><gt-icon name="play"/>Riprendi allenamento</a>}@else if(todayDay();as day){<h2>{{day.name}}</h2><p>{{s.activePlan()?.name}}@if(day.week){ · Settimana {{day.week}}}</p><div class="training-inline-metrics"><span><gt-icon name="weight"/>{{s.planExercises(day.id).length}} esercizi</span><span><gt-icon name="plans"/>{{todaySetCount()}} serie</span>@if(day.weekday!==undefined){<span><gt-icon name="calendar"/>{{weekdays[day.weekday]}}</span>}</div><div class="training-today-actions"><a class="button primary" routerLink="/anteprima-allenamento" [queryParams]="{day:day.id,return:'piani'}">Vedi la seduta<gt-icon name="arrow"/></a><button class="ghost" (click)="start(day.id)" [disabled]="s.busy()||!s.planExercises(day.id).length"><gt-icon name="play"/>Inizia allenamento</button></div>}@else{<h2>Costruisci il tuo percorso</h2><p>Crea o attiva un piano per trovare qui il prossimo allenamento.</p><button class="primary full-width" (click)="hub.set('plans');openPlan()">Crea piano<gt-icon name="plus"/></button>}</div>
      </section>
      @if(s.activePlan();as plan){<a class="card training-path" [routerLink]="['/piano',plan.id]"><div class="card-head"><h3>Il tuo percorso</h3><span class="pill green">Attivo</span></div><strong>{{plan.name}}</strong><div class="training-path-stats"><span>{{completedForPlan(plan.id)}} sedute registrate</span><span>{{s.days(plan.id).length}} allenamenti nel piano<gt-icon name="arrow"/></span></div></a>}
      <div class="training-tool-grid"><a routerLink="/catalogo"><gt-icon name="weight"/><strong>Catalogo esercizi</strong><small>Tecnica e movimenti</small></a><a routerLink="/importa-excel"><gt-icon name="download"/><strong>Importa un piano</strong><small>Dal tuo file Excel</small></a></div>
      <div class="training-hub-links"><a class="card" routerLink="/calendario"><gt-icon name="calendar"/><span><strong>Programmazione</strong><small>Allenamenti, attività e riposo</small></span><gt-icon name="arrow"/></a><a class="card" routerLink="/recupero"><gt-icon name="moon"/><span><strong>Come ti senti oggi?</strong><small>Apri il check-in recovery</small></span><gt-icon name="arrow"/></a></div>
    }
    <div [hidden]="hub()==='today'">
    <div class="plans-list-heading"><h2>{{archived()?'Piani archiviati':'I miei piani'}}</h2><button type="button" class="ghost archive-toggle" [class.selected]="archived()" (click)="archived.set(!archived())">{{archived()?'Piani attivi':'Archivio'}}<gt-icon name="clock"/></button></div>
    <a class="excel-archive-link" routerLink="/importa-excel" [queryParams]="{tab:'archive'}"><gt-icon name="download"/>Excel importati<gt-icon name="arrow"/></a>
    <div class="list simple-plan-list">
      @for(p of plans();track p.id){
        <section class="card simple-plan">
          <div class="simple-plan-top"><gt-exercise-thumb class="plan-cover-thumb" [exercise]="thumbnailExercise(p.id)"/>
            <button type="button" class="simple-plan-title" [attr.aria-expanded]="expanded()===p.id" (click)="expanded.set(expanded()===p.id?'':p.id)"><span><strong>{{p.name}}</strong><small>{{p.program?p.program.weeks+' settimane · ':''}}{{s.days(p.id).length}} allenamenti</small></span><span class="plan-chevron" aria-hidden="true">{{expanded()===p.id?'⌃':'›'}}</span></button>
            @if(p.completedAt){<span class="pill green">Concluso</span>}@else if(p.active){<span class="pill green">Attivo</span>}
            <details class="simple-menu" #planMenu><summary [attr.aria-label]="'Gestisci '+p.name">⋯</summary><div class="simple-menu-panel">
              @if(!p.archived&&!p.completedAt){@if(!p.active){<button type="button" (click)="planMenu.open=false;activate(p.id)">Attiva piano</button>}<button type="button" (click)="planMenu.open=false;openPlan(p)">Modifica piano</button>}
              @if(!p.program){<button type="button" (click)="planMenu.open=false;s.duplicatePlan(p.id)">Duplica piano</button>}<button type="button" (click)="planMenu.open=false;showDashboard(p.id)">Statistiche del piano</button>@if(!p.completedAt){<button type="button" (click)="planMenu.open=false;showDashboard(p.id,true)">Termina piano</button>}@if(!p.completedAt){<button type="button" (click)="planMenu.open=false;archive(p)">{{p.archived?'Ripristina':'Archivia'}}</button>}
              <button type="button" class="danger" (click)="planMenu.open=false;removePlan(p)" [disabled]="s.busy()||!!deletingPlan()">Elimina piano</button>
            </div></details>
          </div>
          @if(expanded()===p.id){
            @if(p.description){@if(p.program){<details class="program-description"><summary>Note del programma</summary><p class="simple-plan-description">{{p.description}}</p></details>}@else{<p class="simple-plan-description">{{p.description}}</p>}}
            @if(p.program){<div class="program-week-picker"><label>Settimana<select [ngModel]="weekFor(p)" (ngModelChange)="selectWeek(p.id,$event)">@for(week of weeksFor(p);track week){<option [ngValue]="week">Settimana {{week}} / {{p.program.weeks}}</option>}</select></label><a class="button ghost" [routerLink]="['/piano',p.id]">Statistiche</a></div>}
            <div class="simple-days">
              @for(day of visibleDays(p);track day.id){
                <details class="simple-day">
                  <summary class="simple-day-summary"><span><strong>{{day.name}}</strong><small>{{day.sessionDate?dateLabel(dayDate(day))+' · ':day.weekday===undefined?'':weekdays[day.weekday]+' · '}}{{s.planExercises(day.id).length}} esercizi</small></span><span class="day-chevron" aria-hidden="true">›</span></summary>
                  <div class="simple-day-body">@if(day.phase||day.notes){<div class="day-guidance">@if(day.phase){<span class="pill">{{day.phase}}</span>}@if(day.notes){<details><summary>Indicazioni della seduta</summary><p>{{day.notes}}</p></details>}</div>}<div class="simple-day-tools"><a class="button ghost plan-preview-link" routerLink="/anteprima-allenamento" [queryParams]="{day:day.id,return:'piani'}">Vedi allenamento<gt-icon name="arrow"/></a>
                    @if(!p.archived&&!p.completedAt){<details class="simple-menu" #dayMenu><summary [attr.aria-label]="'Gestisci '+day.name">⋯</summary><div class="simple-menu-panel"><button type="button" (click)="dayMenu.open=false;openDay(p.id,day)">Modifica allenamento</button><button type="button" (click)="dayMenu.open=false;s.duplicateDay(day.id)">Duplica</button><button type="button" (click)="dayMenu.open=false;moveDay(day,-1)" [disabled]="day.order===0">Sposta prima</button><button type="button" (click)="dayMenu.open=false;moveDay(day,1)" [disabled]="day.order===s.days(p.id).length-1">Sposta dopo</button><button type="button" class="danger" (click)="dayMenu.open=false;removeDay(day)">Elimina allenamento</button></div></details>}
                  </div>
                  <div class="simple-exercises"><div>
                    @for(pe of s.planExercises(day.id);track pe.id){<div class="simple-exercise-row"><gt-exercise-thumb [exercise]="s.exercise(pe.exerciseId)"/><div><strong>{{s.exercise(pe.exerciseId)?.name}}</strong><small>{{pe.sets}} × {{pe.repsMin}}–{{pe.repsMax}} rip · {{pe.rest}} s</small>@if(pe.targetWeight!==undefined){<small>{{s.formatWeight(pe.targetWeight)}} {{s.settings().unit}}</small>}@if(pe.superset){<small>Superset {{pe.superset}}</small>}@if(pe.warmupSets){<small>{{pe.warmupSets}} serie di riscaldamento</small>}@if(pe.rirMin!==undefined){<small>RIR {{pe.rirMin}}{{pe.rirMax!==undefined&&pe.rirMax!==pe.rirMin?'–'+pe.rirMax:''}}</small>}@if(pe.rpe){<small>RPE {{pe.rpe}}</small>}@if(pe.warmupNotes||pe.reference||pe.notes){<details class="exercise-guidance"><summary>Riscaldamento e note</summary>@if(pe.warmupNotes){<small><b>Riscaldamento:</b> {{pe.warmupNotes}}</small>}@if(pe.reference){<small><b>Riferimento:</b> {{pe.reference}}{{pe.loadUnit?' · '+pe.loadUnit:''}}</small>}@if(pe.notes){<small>{{pe.notes}}</small>}</details>}</div>
                      @if(!p.archived&&!p.completedAt){<details class="simple-menu" #exerciseMenu><summary [attr.aria-label]="'Gestisci '+s.exercise(pe.exerciseId)?.name">⋯</summary><div class="simple-menu-panel"><button type="button" (click)="exerciseMenu.open=false;openExercise(day.id,pe)">Modifica esercizio</button><button type="button" (click)="exerciseMenu.open=false;moveExercise(pe,-1)" [disabled]="pe.order===0">Sposta prima</button><button type="button" (click)="exerciseMenu.open=false;moveExercise(pe,1)" [disabled]="pe.order===s.planExercises(day.id).length-1">Sposta dopo</button><button type="button" class="danger" (click)="exerciseMenu.open=false;removeExercise(pe)">Rimuovi esercizio</button></div></details>}
                    </div>}@empty{<p class="subtle">Nessun esercizio.</p>}
                    @if(!p.archived&&!p.completedAt){<button type="button" class="ghost full-width" (click)="openExercise(day.id)">+ Esercizio</button>}
                  </div></div>
                  @if(!p.archived&&!p.completedAt){<div class="simple-day-start">@if(s.planExercises(day.id).length){@if(completedDayWorkout(day);as workout){<a class="button ghost full-width" routerLink="/allenamenti" [queryParams]="{workout:workout.id}">Vedi allenamento concluso</a>}@else{<button type="button" class="primary full-width" (click)="start(day.id)" [disabled]="s.busy()">{{s.draft()?'Riprendi sessione':'Inizia'}}</button>}}</div>}
                  @if(!p.archived&&!p.completedAt){<details class="past-workout-entry"><summary>Registra per un’altra data</summary><div class="form-grid"><label>Data<gt-date-field [max]="today" [ngModel]="pastDates[day.id]||''" (ngModelChange)="pastDates[day.id]=$event" [aria-label]="'Data allenamento passato · '+day.name"></gt-date-field></label><button type="button" class="primary" (click)="startPast(day.id)" [disabled]="!pastDates[day.id]||!s.planExercises(day.id).length||s.busy()||startingPast()">{{startingPast()?'Apertura…':'Registra'}}</button></div>@if(s.draft()){<p class="subtle"><a routerLink="/sessione">Riprendi la sessione aperta</a> prima di registrarne un’altra.</p>}</details>}
                  </div>
                </details>
              }@empty{<p class="subtle plan-empty">Nessun allenamento nel piano.</p>}
            </div>
          }
          @if(!p.archived&&!p.program){<button type="button" class="ghost add-plan-workout" (click)="openDay(p.id)" [disabled]="s.busy()">+ Allenamento</button>}
          <a class="plan-statistics-link" [routerLink]="['/piano',p.id]"><gt-icon name="chart"/>Statistiche del piano<gt-icon name="arrow"/></a>
        </section>
      }@empty{<div class="card empty"><h2>{{archived()?'Nessun piano archiviato':'Nessun piano'}}</h2>@if(!archived()){<button type="button" class="primary" (click)="openPlan()">Crea piano</button>}</div>}
    </div>
    <a class="button ghost catalog-entry" routerLink="/catalogo"><gt-icon name="weight"/>Catalogo esercizi<gt-icon name="arrow"/></a>
    </div></div>
    @if (modal()) {
      <div class="modal-backdrop">
        <section
          class="modal"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="closeModal()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-modal"
        >
          <div class="modal-head">
            <h2 id="plan-modal">
              {{
                modal() === "plan"
                  ? "Il tuo piano"
                  : modal() === "day"
                    ? "Giorno di allenamento"
                    : "Esercizio del piano"
              }}
            </h2>
            <button (click)="closeModal()" [disabled]="saving()" aria-label="Chiudi">×</button>
          </div>
          @if (modal() === "plan") {
            <form [formGroup]="planForm" (ngSubmit)="savePlan()">
              <div class="form-grid">
                <label class="wide"
                  >Nome del piano<input
                    formControlName="name"
                    maxlength="100"
                    placeholder="Es. Upper / Lower" /></label
                ><label class="wide"
                  >Descrizione<textarea
                    formControlName="description"
                    maxlength="1000"
                  ></textarea>
                </label>
              </div>
              <div class="actions">
                <button
                  class="primary"
                  [disabled]="planForm.invalid || saving() || s.busy()"
                >
                  Salva piano
                </button>
              </div>
            </form>
          }
          @if (modal() === "day") {
            <form [formGroup]="dayForm" (ngSubmit)="saveDay()">
              <div class="form-grid">
                <label class="wide"
                  >Nome dell’allenamento<input
                    formControlName="name"
                    maxlength="80"
                    placeholder="Es. Giorno A · Push" /></label
                ><label class="wide"
                  >Giorno della settimana (opzionale)<select
                    formControlName="weekday"
                  >
                    <option value="">Nessuno · rotazione libera</option>
                    @for (w of weekdays; track w; let i = $index) {
                      <option [value]="i">{{ w }}</option>
                    }
                  </select></label
                >
              </div>
              <div class="actions">
                <button
                  class="primary"
                  [disabled]="dayForm.invalid || saving() || s.busy()"
                >
                  Salva allenamento
                </button>
              </div>
            </form>
          }
          @if (modal() === "exercise") {
            <form [formGroup]="exerciseForm" (ngSubmit)="saveExercise()">
              <div class="form-grid">
                <label class="wide"
                  >Cerca esercizio per nome<input
                    type="search"
                    [ngModel]="exerciseSearch()"
                    (ngModelChange)="exerciseSearch.set($event)"
                    [ngModelOptions]="{ standalone: true }"
                    placeholder="Es. panca manubri · anche parole parziali" /></label>
                <gt-exercise-scope class="wide" [value]="scope()" (choose)="scope.set($event)"/><gt-exercise-families class="wide" [query]="exerciseSearch()" (choose)="exerciseSearch.set($event)"/>
                <div class="wide exercise-picker">
                  <p class="subtle" role="status">{{availableExercises().length}} risultati · tocca un esercizio per selezionarlo</p>
                  <div class="exercise-picker-results" role="group" aria-label="Esercizi trovati">
                    @for(e of availableExercises();track e.id){
                      <button type="button" class="exercise-pick" [class.exercise-picked]="exerciseForm.controls.exerciseId.value===e.id" [attr.aria-pressed]="exerciseForm.controls.exerciseId.value===e.id" (click)="chooseExercise(e.id)">
                        <gt-exercise-thumb [exercise]="e"/>
                        <span><strong>{{e.name}}</strong><small>{{s.muscle(e.muscleGroupId)}} · {{e.equipment}}</small></span>
                        <span class="pick-check" aria-hidden="true">{{exerciseForm.controls.exerciseId.value===e.id?'✓':'+'}}</span>
                      </button>
                    }@empty{<p class="subtle">Nessun esercizio trovato. Prova meno parole o scegli Tutti.</p>}
                  </div>
                  @if(s.exercise(exerciseForm.controls.exerciseId.value||'');as selected){
                    <div class="exercise-selection"><gt-exercise-thumb [exercise]="selected"/><span><small>ESERCIZIO SELEZIONATO</small><strong>{{selected.name}}</strong><small>Illustrazione indicativa del movimento; le foto personali hanno precedenza.</small></span></div>
                  }
                </div>
                <label
                  >Serie allenanti<input
                    type="number"
                    min="1"
                    max="30"
                    formControlName="sets" /></label
                ><label
                  >Recupero (secondi)<input
                    type="number"
                    min="0"
                    max="7200"
                    formControlName="rest" /></label
                ><label
                  >Ripetizioni minime<input
                    type="number"
                    min="1"
                    max="999"
                    formControlName="repsMin" /></label
                ><label
                  >Ripetizioni massime<input
                    type="number"
                    min="1"
                    max="999"
                    formControlName="repsMax" /></label
                ><label
                  >Peso target ({{ s.settings().unit }}, opzionale)<input
                    type="number"
                    min="0"
                    step="0.5"
                    formControlName="targetWeight" /></label
                ><label
                  >RPE target (1–10, opzionale)<input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    formControlName="rpe" /></label
                ><label>Serie di riscaldamento<input type="number" inputmode="numeric" min="0" max="5" formControlName="warmupSets"/></label><label>Superset<select formControlName="superset"><option value="">Nessuno</option><option value="A">Gruppo A</option><option value="B">Gruppo B</option><option value="C">Gruppo C</option><option value="D">Gruppo D</option></select></label><p class="subtle wide">Assegna lo stesso gruppo a due esercizi per alternarli. Il recupero parte dopo la coppia. I riscaldamenti restano separati dai record.</p><button type="button" class="wide" [disabled]="!exerciseForm.controls.exerciseId.value" (click)="s.toggleFavorite(exerciseForm.controls.exerciseId.value!)">{{s.isFavorite(exerciseForm.controls.exerciseId.value||'')?'★ Rimuovi dai preferiti':'☆ Aggiungi ai preferiti'}}</button><label class="wide"
                  >Note<textarea
                    formControlName="notes"
                    maxlength="1000"
                  ></textarea>
                </label>
              </div>
              <div class="actions">
                <button
                  class="primary"
                  [disabled]="exerciseForm.invalid || saving() || s.busy()"
                >
                  Salva esercizio</button
                ><a class="button ghost" routerLink="/catalogo"
                  >Gestisci catalogo</a
                >
              </div>
            </form>
          }
        </section>
      </div>
    }`,
})
export class PlansComponent {
 private confirmation=confirmationForContext();
  exerciseCount(id:string){return this.s.days(id).reduce((n,d)=>n+this.s.planExercises(d.id).length,0);}
  thumbnailExercise(id:string){const day=this.s.days(id)[0],entry=day?this.s.planExercises(day.id)[0]:undefined;return entry?this.s.exercise(entry.exerciseId):undefined;}
  s = inject(Store);
  router = inject(Router);
  private route = inject(ActivatedRoute,{optional:true});
  selectedWeeks=signal<Record<string,number>>({});
  fb = inject(FormBuilder);
  hub=signal<'today'|'plans'>('today');
  todayCover=computed(()=>{const dayId=this.s.draft()?.dayId||this.todayDay()?.id;const entry=dayId?this.s.planExercises(dayId)[0]:undefined;return entry?this.s.exercise(entry.exerciseId):undefined;});
  todaySetCount=computed(()=>{const day=this.todayDay();return day?this.s.planExercises(day.id).reduce((total,row)=>total+row.sets,0):0;});
  completedForPlan(id:string){return this.s.completed().filter(workout=>workout.planId===id).length;}
  todayDay=computed(()=>{const day=this.s.nextDay();return day&&!this.s.data().plans.find(p=>p.id===day.planId)?.completedAt?day:undefined;});
  archived = signal(false);
  expanded = signal(this.s.activePlan?.()?.id||"");
  modal = signal("");
  saving = signal(false);
  deletingPlan=signal('');startingPast=signal(false);pastDates:Record<string,string>={};
  private todayClock=inject(TodayService,{optional:true});
  get today(){return this.todayClock?.date()||localDate();}
  draftNotice = signal('');
  private drafts = inject(FormDraftService,{optional:true});
  private draftSession?: DraftSession<PlanEditorDraft>;
  private draftSubscriptions: {unsubscribe():void}[] = [];
  private formBaseline = '';
  private restoringDraft = false;
  private destroyed = false;
  private restoreTimer?: ReturnType<typeof setTimeout>;
  private formSaveId = "";
  editId = "";
  parentId = "";
  exerciseSearch = signal("");scope=signal<ExerciseScope>("all");
  selectedCatalogId = signal("");
  weekdays = [
    "Lunedì",
    "Martedì",
    "Mercoledì",
    "Giovedì",
    "Venerdì",
    "Sabato",
    "Domenica",
  ];
  plans = computed(() =>
    this.s.data().plans.filter((p) => p.archived === this.archived()),
  );
  availableExercises = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (e) =>
          e.active &&
          (this.scope()==='all'||(this.scope()==='favorites'?this.s.isFavorite(e.id):this.s.recentExerciseIds().includes(e.id))) &&
          matchesExercise(e,this.exerciseSearch()),
      ),
  );
  exercisesForGroup(id:string) { return this.availableExercises().filter(e=>e.muscleGroupId===id); }
  chooseExercise(id:string) { this.exerciseForm.controls.exerciseId.setValue(id);this.exerciseForm.controls.exerciseId.markAsTouched();this.selectedCatalogId.set(id); }
  planForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    description: [""],
  });
  dayForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    weekday: [""],
  });
  exerciseForm = this.fb.group({
    warmupSets:[0,[Validators.min(0),Validators.max(5),Validators.pattern(/^\d+$/)]],superset:[""],
    exerciseId: ["", Validators.required],
    sets: [
      3,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(30),
        Validators.pattern(/^\d+$/),
      ],
    ],
    repsMin: [
      8,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
        Validators.pattern(/^\d+$/),
      ],
    ],
    repsMax: [
      12,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(999),
        Validators.pattern(/^\d+$/),
      ],
    ],
    rest: [90, [Validators.required, Validators.min(0), Validators.max(7200)]],
    targetWeight: [null as number | null, Validators.min(0)],
    rpe: [null as number | null, [Validators.min(1), Validators.max(10)]],
    notes: [""],
  });
  ngOnInit(){
    const selected=this.route?.snapshot?.queryParamMap?.get('plan');
    if(selected){this.hub.set('plans');this.expanded.set(selected);const plan=this.s.data().plans.find(p=>p.id===selected);if(plan){this.archived.set(plan.archived);const week=Number(this.route?.snapshot?.queryParamMap?.get('week'));if(plan.program&&Number.isInteger(week)&&week>=1&&week<=plan.program.weeks)this.selectWeek(plan.id,week);}}
    if(!this.drafts)return;
    this.draftSession=this.drafts.bind(this.s.archiveKey(),'plans-editor',()=>this.captureDraft(),value=>this.restoreDraft(value));
    const changed=()=>{if(!this.restoringDraft)this.draftSession?.changed();};
    this.draftSubscriptions=[this.planForm.valueChanges.subscribe(changed),this.dayForm.valueChanges.subscribe(changed),this.exerciseForm.valueChanges.subscribe(changed)];
  }
  private activeValue(){return this.modal()==='plan'?this.planForm.getRawValue():this.modal()==='day'?this.dayForm.getRawValue():this.exerciseForm.getRawValue();}
  private hasChanges(){return !!this.modal()&&JSON.stringify(this.activeValue())!==this.formBaseline;}
  private captureDraft():PlanEditorDraft|null{
    if(!this.hasChanges())return null;
    return {kind:this.modal(),editId:this.editId,saveId:this.formSaveId,parentId:this.parentId,baseline:this.formBaseline,expanded:this.expanded(),archived:this.archived(),search:this.exerciseSearch(),scope:this.scope(),unit:this.s.settings?.()?.unit||'kg',plan:this.planForm.getRawValue(),day:this.dayForm.getRawValue(),exercise:this.exerciseForm.getRawValue()};
  }
  private appliedDraft(value:PlanEditorDraft){
    const data=this.s.data();
    if(value.kind==='plan'){const plan=data.plans.find(item=>item.id===value.saveId);return !!plan&&plan.name===value.plan.name.trim()&&plan.description===value.plan.description.trim();}
    if(value.kind==='day'){const day=data.days.find(item=>item.id===value.saveId);return !!day&&day.name===value.day.name.trim()&&day.weekday===(value.day.weekday===''?undefined:Number(value.day.weekday));}
    const entry=data.planExercises.find(item=>item.id===value.saveId),form=value.exercise;
    const kg=form.targetWeight===null?undefined:value.unit==='lb'?form.targetWeight/2.2046226218:form.targetWeight;
    return !!entry&&entry.exerciseId===form.exerciseId&&entry.sets===form.sets&&entry.repsMin===form.repsMin&&entry.repsMax===form.repsMax&&entry.rest===form.rest&&entry.targetWeight===kg&&entry.rpe===(form.rpe??undefined)&&entry.notes===(form.notes||'')&&(entry.warmupSets||0)===(form.warmupSets||0)&&(entry.superset||'')===(form.superset||'');
  }
  private restoreDraft(value:PlanEditorDraft){
    if(this.destroyed||this.modal())return;
    if(typeof this.s.ready==='function'&&!this.s.ready()){this.restoreTimer=setTimeout(()=>this.restoreDraft(value),100);return;}
    if(!value){void this.draftSession?.clear();return;}
    const data=this.s.data();
    const stale=!['plan','day','exercise'].includes(value.kind)||!value.saveId||!value.plan||!value.day||!value.exercise||typeof value.baseline!=='string'||
      value.kind==='plan'&&!!value.editId&&!data.plans.some(p=>p.id===value.editId)||
      value.kind==='day'&&(!data.plans.some(p=>p.id===value.parentId)||!!value.editId&&!data.days.some(d=>d.id===value.editId&&d.planId===value.parentId))||
      value.kind==='exercise'&&(!data.days.some(d=>d.id===value.parentId)||!!value.editId&&!data.planExercises.some(e=>e.id===value.editId&&e.dayId===value.parentId));
    if(stale||this.appliedDraft(value)){this.draftNotice.set(stale?'La bozza precedente si riferiva a un elemento non più disponibile. L’archivio è rimasto invariato.':'');this.clearStoredDraft();return;}
    const unit=this.s.settings?.()?.unit||'kg';
    if(value.unit&&value.unit!==unit&&value.exercise.targetWeight!==null){
      const convert=(weight:number)=>unit==='lb'?weight*2.2046226218:weight/2.2046226218;
      value.exercise.targetWeight=convert(value.exercise.targetWeight);
      if(value.kind==='exercise'){try{const baseline=JSON.parse(value.baseline);if(baseline.targetWeight!==null)baseline.targetWeight=convert(baseline.targetWeight);value.baseline=JSON.stringify(baseline);}catch{/* An old baseline can remain conservative and ask before discard. */}}
    }
    this.restoringDraft=true;
    try{
      this.planForm.reset(value.plan);this.dayForm.reset(value.day);this.exerciseForm.reset(value.exercise);
      const existing=(value.kind==='plan'?data.plans:value.kind==='day'?data.days:data.planExercises).some(item=>item.id===value.saveId);
      this.editId=existing?value.saveId:value.editId;this.formSaveId=value.saveId;this.parentId=value.parentId;this.formBaseline=value.baseline;
      this.hub.set('plans');this.expanded.set(value.expanded);this.archived.set(value.archived);this.exerciseSearch.set(value.search);this.scope.set(value.scope);
      this.selectedCatalogId.set(value.exercise.exerciseId||'');this.modal.set(value.kind);this.draftNotice.set('Bozza recuperata. Controlla i valori e salva quando sei pronto.');
    }finally{this.restoringDraft=false;}
  }
  private beginEditor(retry:()=>void){
    if(this.saving())return false;
    if(this.hasChanges()){void this.confirmation.ask('Scartare le modifiche non salvate prima di aprire un altro modulo?').then(ok=>{if(ok&&!this.destroyed&&!this.saving()){this.editorSaved();retry();}});return false;}
    if(this.modal())this.clearStoredDraft();
    clearTimeout(this.restoreTimer);this.draftNotice.set('');return true;
  }
  private editorOpened(){this.formBaseline=JSON.stringify(this.activeValue());this.draftSession?.changed();}
  private clearStoredDraft(){void this.draftSession?.clear().catch(()=>{/* Pending cleanup is retried by the draft service before exit. */});}
  private editorSaved(){this.modal.set('');this.formBaseline='';this.draftNotice.set('');this.clearStoredDraft();}
  ngOnDestroy(){clearTimeout(this.restoreTimer);void this.draftSession?.destroy();this.destroyed=true;this.draftSubscriptions.forEach(subscription=>subscription.unsubscribe());}
  openPlan(p?: TrainingPlan) {
    if(!this.beginEditor(()=>this.openPlan(p)))return;
    this.hub.set('plans');
    this.editId = p?.id || "";
    this.formSaveId = p?.id || uid();
    this.planForm.reset({
      name: p?.name || "",
      description: p?.description || "",
    });
    this.modal.set("plan");
    this.editorOpened();
  }
  async savePlan() {
    if (this.planForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.planForm.disable({emitEvent:false});
    try {
    const v = this.planForm.getRawValue();
    const id = this.formSaveId ||= this.editId || uid();
    if (await this.s.savePlan(id, v.name, v.description)) {
      this.expanded.set(id);
      this.editorSaved();
    }
    } finally { this.planForm.enable({emitEvent:false});this.saving.set(false); }
  }
  openDay(planId: string, day?: TrainingPlanDay) {
    if(!this.beginEditor(()=>this.openDay(planId, day)))return;
    this.parentId = planId;
    this.editId = day?.id || "";
    this.formSaveId = day?.id || uid();
    this.dayForm.reset({
      name: day?.name || "",
      weekday: day?.weekday === undefined ? "" : String(day.weekday),
    });
    this.modal.set("day");
    this.editorOpened();
  }
  async saveDay() {
    if (this.dayForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.dayForm.disable({emitEvent:false});
    try {
    const v = this.dayForm.getRawValue();
    if (
      await this.s.saveDay(
        this.formSaveId ||= this.editId || uid(),
        this.parentId,
        v.name,
        v.weekday === "" ? undefined : Number(v.weekday),
      )
    ) {
      this.expanded.set(this.parentId);
      this.editorSaved();
    }
    } finally { this.dayForm.enable({emitEvent:false});this.saving.set(false); }
  }
  activate(id: string) {
    void this.s.change((d) => {
      d.plans.forEach((p) => (p.active = p.id === id && !p.archived));
    }, "Piano attivo aggiornato.");
  }
  async archive(p: TrainingPlan) {
    if (
      !p.archived &&
      !await this.confirmation.ask(
        "Archiviare il piano? Tutti gli allenamenti storici saranno conservati.",
      )
    )
      return;
    void this.s.change(
      (d) => {
        const x = d.plans.find((x) => x.id === p.id)!;
        x.archived = !p.archived;
        x.active = false;
        x.updatedAt = now();
      },
      p.archived ? "Piano ripristinato." : "Piano archiviato.",
    );
  }
  async removePlan(plan:TrainingPlan){
    if(this.deletingPlan())return;
    if(!await this.confirmation.ask({title:'Eliminare il piano?',confirmLabel:'Elimina piano',detail:plan.name+' · '+this.s.days(plan.id).length+' giorni',message:`Eliminare il piano “${plan.name}” con i giorni e gli esercizi programmati? Gli allenamenti già registrati e le loro serie resteranno nello storico. Gli altri piani non saranno modificati.`,tone:'danger'}))return;
    this.deletingPlan.set(plan.id);
    try{if(await this.s.deletePlan(plan.id)){if(this.expanded()===plan.id)this.expanded.set('');}}
    finally{this.deletingPlan.set('');}
  }
  async removeDay(day: TrainingPlanDay) {
    if (
      await this.confirmation.ask(
        "Eliminare questo giorno e i suoi esercizi? Lo storico rimane disponibile.",
      )
    )
      void this.s.change((d) => {
        d.days = d.days.filter((x) => x.id !== day.id);
        d.planExercises = d.planExercises.filter((e) => e.dayId !== day.id);
        d.days
          .filter((x) => x.planId === day.planId)
          .sort((a, b) => a.order - b.order)
          .forEach((x, i) => (x.order = i));
      });
  }
  moveDay(day: TrainingPlanDay, dir: number) {
    void this.s.change((d) => {
      const rows = d.days
        .filter((x) => x.planId === day.planId)
        .sort((a, b) => a.order - b.order);
      const idx = rows.findIndex((x) => x.id === day.id);
      const other = rows[idx + dir];
      if (other)
        [rows[idx].order, other.order] = [other.order, rows[idx].order];
    });
  }
  openExercise(dayId: string, e?: TrainingPlanExercise) {
    if(!this.beginEditor(()=>this.openExercise(dayId, e)))return;
    this.parentId = dayId;
    this.editId = e?.id || "";
    this.formSaveId = e?.id || uid();
    this.selectedCatalogId.set(e?.exerciseId || "");
    this.exerciseSearch.set("");
    this.exerciseForm.reset({
      exerciseId: e?.exerciseId || "",
      sets: e?.sets || 3,
      repsMin: e?.repsMin || 8,
      repsMax: e?.repsMax || 12,
      rest: e?.rest ?? 90,
      targetWeight:
        e?.targetWeight === undefined ? null : this.s.weight(e.targetWeight),
      rpe: e?.rpe ?? null,
      notes: e?.notes || "",warmupSets:e?.warmupSets||0,superset:e?.superset||"",
    });
    this.modal.set("exercise");
    this.editorOpened();
  }
  async closeModal(){if(this.saving())return;if(this.hasChanges()&&!await this.confirmation.ask('Scartare le modifiche non salvate?'))return;this.editorSaved();}
  async saveExercise() {
    if (this.exerciseForm.invalid || this.saving()) return;
    const v = this.exerciseForm.getRawValue();
    if (v.repsMin! > v.repsMax!) {
      this.s.error.set(
        "Le ripetizioni minime non possono superare le massime.",
      );
      return;
    }
    this.saving.set(true);
    this.exerciseForm.disable({emitEvent:false});
    try {
    if (
      await this.s.savePlanExercise({
        ...this.s.data().planExercises.find(entry=>entry.id===this.editId),
        id: this.formSaveId ||= this.editId || uid(),
        dayId: this.parentId,
        warmupSets:v.warmupSets||0,superset:v.superset||undefined,
        exerciseId: v.exerciseId!,
        sets: v.sets!,
        repsMin: v.repsMin!,
        repsMax: v.repsMax!,
        rest: v.rest!,
        targetWeight:
          v.targetWeight === null ? undefined : this.s.kg(v.targetWeight),
        rpe: v.rpe ?? undefined,
        notes: v.notes || "",
        order:
          this.s.data().planExercises.find((e) => e.id === (this.formSaveId || this.editId))
            ?.order ?? this.s.planExercises(this.parentId).length,
      })
    )
      this.editorSaved();
    } finally { this.exerciseForm.enable({emitEvent:false});this.saving.set(false); }
  }
  moveExercise(e: TrainingPlanExercise, dir: number) {
    void this.s.change((d) => {
      const rows = d.planExercises
        .filter((x) => x.dayId === e.dayId)
        .sort((a, b) => a.order - b.order);
      const idx = rows.findIndex((x) => x.id === e.id);
      if (rows[idx + dir])
        [rows[idx].order, rows[idx + dir].order] = [
          rows[idx + dir].order,
          rows[idx].order,
        ];
    });
  }
  async removeExercise(e: TrainingPlanExercise) {
    if(!await this.confirmation.ask('Rimuovere questo esercizio dal giorno del piano? Lo storico degli allenamenti resta conservato.'))return;
    void this.s.change((d) => {
      d.planExercises = d.planExercises.filter((x) => x.id !== e.id);
      d.planExercises
        .filter((x) => x.dayId === e.dayId)
        .sort((a, b) => a.order - b.order)
        .forEach((x, i) => (x.order = i));
    });
  }
  weeksFor(plan:TrainingPlan){return [...new Set(this.s.days(plan.id).map(day=>day.week).filter((week):week is number=>week!==undefined))].sort((a,b)=>a-b);}
  weekFor(plan:TrainingPlan){const options=this.weeksFor(plan),requested=this.selectedWeeks()[plan.id];if(requested&&options.includes(requested))return requested;const next=this.s.days(plan.id).find(day=>day.sessionDate&&this.dayDate(day)>=this.today&&!this.completedDayWorkout(day));return next?.week||(plan.program&&plan.program.endDate<this.today?options.at(-1):options[0])||1;}
  selectWeek(planId:string,week:number){this.selectedWeeks.update(values=>({...values,[planId]:Number(week)}));}
  visibleDays(plan:TrainingPlan){return plan.program?this.s.days(plan.id).filter(day=>day.week===this.weekFor(plan)):this.s.days(plan.id);}
  dayDate(day:TrainingPlanDay){return this.s.data().scheduledWorkouts.find(event=>event.dayId===day.id)?.date||day.sessionDate||'';}
  dateLabel(value:string){try{return parseLocalDate(value).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});}catch{return value;}}
  completedDayWorkout(day:TrainingPlanDay){if(!day.sessionDate)return undefined;const event=this.s.data().scheduledWorkouts.find(event=>event.dayId===day.id),linked=event?.workoutId?this.s.data().workouts.find(workout=>workout.id===event.workoutId):undefined;return linked?.status==='completed'?linked:undefined;}
  showDashboard(planId:string,finish=false){void this.router.navigateByUrl('/piano/'+encodeURIComponent(planId)+(finish?'?finish=1':''));}
  async start(dayId: string) {
    const day=this.s.data().days.find(day=>day.id===dayId),event=day?.sessionDate?this.s.data().scheduledWorkouts.find(event=>event.dayId===dayId):undefined;
    if(event){
      if(event.date>this.today&&!await this.confirmation.ask('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;
      const linked=event.workoutId?this.s.data().workouts.find(workout=>workout.id===event.workoutId):undefined,date=linked?.status==='draft'||event.date>this.today?undefined:event.date;
      if(await this.s.startScheduled(event.id,date))await this.router.navigateByUrl('/sessione');
      return;
    }
    if (await this.s.start(dayId)) await this.router.navigateByUrl("/sessione");
  }
  async startPast(day:string){
    if(this.startingPast())return;
    const date=this.pastDates[day];
    try{parseLocalDate(date);if(date>this.today)throw Error('Scegli oggi o una data passata.');}
    catch(error){this.s.error.set(error instanceof Error?error.message:'Scegli la data dell’allenamento.');return;}
    this.startingPast.set(true);
    try{
      if(await this.s.start(day,date))await this.router.navigateByUrl('/sessione');
      else if(this.s.draft())await this.router.navigateByUrl('/sessione?requestedDate='+encodeURIComponent(date));
    }
    finally{this.startingPast.set(false);}
  }
}
