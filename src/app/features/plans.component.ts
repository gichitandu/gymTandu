import { confirmationForContext } from '../services/confirmation';
import { OpenWorkoutsComponent } from '../shared/open-workouts.component';
import { SectionHeadingComponent } from "../shared/section-heading.component";
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
import { Router, RouterLink } from "@angular/router";
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
  styleUrl: "./feature-polish.css",
  imports: [OpenWorkoutsComponent,SectionHeadingComponent,
    A11yModule,ExerciseScopeComponent,
    ExerciseFamiliesComponent,
    ExerciseThumbComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    IconComponent,
    StatusComponent,
  ],
  template: `<gt-section-heading index="02" eyebrow="Disegna la tua evoluzione" title="Piani di allenamento" description="La struttura del tuo percorso. Il prossimo livello si costruisce qui.">
      <button class="primary create-plan" (click)="openPlan()" [disabled]="!s.ready()">
        <gt-icon name="plus" /> <span class="desktop-button-label">Nuovo piano</span>
      </button>
    </gt-section-heading>
    <gt-status />
    <gt-open-workouts />
    @if(draftNotice()){<p class="notice" role="status">{{draftNotice()}}</p>}
    <div class="segmented plan-tabs">
      <button [class.active]="!archived()" (click)="archived.set(false)">
        Attivi</button
      ><button [class.active]="archived()" (click)="archived.set(true)">
        Archivio</button
      ><a class="button ghost" routerLink="/catalogo"
        >Catalogo esercizi <gt-icon name="arrow"
      /></a>
    </div>
    <div class="plan-collection-label"><span>{{archived()?'La tua memoria di allenamento':'La tua collezione personale'}}</span><b>{{plans().length.toString().padStart(2,'0')}} <small>piani</small></b></div>
    <div class="list plan-collection">
      @for (p of plans(); track p.id; let planIndex=$index) {
        <section class="card plan-card" [class.plan-active]="p.active" [class.is-open]="expanded()===p.id">
          <div class="plan-topline"><span class="plan-edition">PERCORSO <b>{{(planIndex+1).toString().padStart(2,'0')}}</b></span><div class="plan-day-markers" aria-hidden="true">@for(day of s.days(p.id);track day.id){<i></i>}</div><small>{{s.days(p.id).length}} giorni</small></div>
          <div class="card-head"><gt-exercise-thumb [exercise]="thumbnailExercise(p.id)"/>
            <div>
              <span class="pill" [class.green]="p.active">{{
                p.active
                  ? "PIANO ATTIVO"
                  : p.archived
                    ? "ARCHIVIATO"
                    : "PIANO PERSONALE"
              }}</span>
              <h2>{{ p.name }}</h2><p class="plan-subtitle">{{p.description || "Programma personalizzato"}}</p><small class="plan-count">{{s.days(p.id).length}} giorni · {{exerciseCount(p.id)}} esercizi</small>
            </div>
            <button [attr.aria-label]="(expanded()===p.id?'Chiudi ':'Apri ')+p.name" [attr.aria-expanded]="expanded()===p.id" (click)="expanded.set(expanded() === p.id ? '' : p.id)">
              <span aria-hidden="true">{{ expanded() === p.id ? "⌃" : "›" }}</span>
            </button>
          </div>
          <div class="plan-day-preview" aria-label="Giorni del piano">@for(day of s.days(p.id);track day.id){<span><b>{{(day.order+1).toString().padStart(2,'0')}}</b>{{day.name}}</span>}@empty{<span>Il primo giorno ti aspetta</span>}</div>
          <div class="actions plan-management-actions">
            @if (!p.archived) {
              @if (!p.active) {
                <button (click)="activate(p.id)">Attiva piano</button>
              }
              <button (click)="openPlan(p)">Modifica</button
              ><button (click)="openDay(p.id)">+ Giorno</button>
            }
            <button class="ghost" (click)="s.duplicatePlan(p.id)">
              Duplica</button
            ><button class="ghost" (click)="archive(p)">
              {{ p.archived ? "Ripristina" : "Archivia" }}
            </button>
            <button type="button" class="ghost danger" (click)="removePlan(p)" [disabled]="s.busy()||!!deletingPlan()">{{deletingPlan()===p.id?'Eliminazione…':'Elimina piano'}}</button>
          </div>
          @if (expanded() === p.id) {
            @for (day of s.days(p.id); track day.id) {
              <div class="day plan-training-day">
                <div class="day-head">
                  <div>
                    <h3>{{ day.order + 1 }}. {{ day.name }}</h3>
                    <small class="muted">{{
                      day.weekday === undefined
                        ? "Rotazione libera"
                        : weekdays[day.weekday]
                    }}</small>
                  </div>
                  <div class="inline-actions">
                    @if (!p.archived) {
                      <button
                        (click)="moveDay(day, -1)"
                        aria-label="Sposta giorno prima"
                        [disabled]="day.order === 0"
                      >
                        ↑</button
                      ><button
                        (click)="moveDay(day, 1)"
                        aria-label="Sposta giorno dopo"
                        [disabled]="day.order === s.days(p.id).length - 1"
                      >
                        ↓</button
                      ><button (click)="openDay(p.id, day)">Modifica</button
                      ><button (click)="s.duplicateDay(day.id)">Duplica</button
                      ><button class="danger" (click)="removeDay(day)">
                        Elimina
                      </button>
                    }
                  </div>
                </div>
                @for (pe of s.planExercises(day.id); track pe.id) {
                  <div class="exercise-row plan-exercise-row">
                    <div class="exercise-info">
                      <gt-exercise-thumb [exercise]="s.exercise(pe.exerciseId)"/>
                      <div>
                        <strong>{{ s.exercise(pe.exerciseId)?.name }}</strong
                        ><small
                          >{{ pe.sets }} serie allenanti × {{ pe.repsMin }}–{{
                            pe.repsMax
                          }}
                          rip · {{ pe.rest }} s recupero
                          @if (pe.targetWeight !== undefined) {
                            · {{ s.formatWeight(pe.targetWeight) }}
                            {{ s.settings().unit }}
                          }
                          @if (pe.rpe) {
                            · RPE {{ pe.rpe }}
                          }
                        </small>
                        @if(pe.superset){<span class="superset-tag">Superset {{pe.superset}}</span>}@if(pe.warmupSets){<small>+ {{pe.warmupSets}} serie di riscaldamento</small>}
                        @if (pe.notes) {
                          <small>{{ pe.notes }}</small>
                        }
                      </div>
                    </div>
                    @if (!p.archived) {
                      <div class="inline-actions">
                        <button
                          (click)="moveExercise(pe, -1)"
                          [disabled]="pe.order === 0"
                          aria-label="Sposta esercizio prima"
                        >
                          ↑</button
                        ><button
                          (click)="moveExercise(pe, 1)"
                          [disabled]="
                            pe.order === s.planExercises(day.id).length - 1
                          "
                          aria-label="Sposta esercizio dopo"
                        >
                          ↓</button
                        ><button (click)="openExercise(day.id, pe)">
                          Modifica</button
                        ><button
                          (click)="removeExercise(pe)"
                          class="danger"
                          aria-label="Rimuovi esercizio"
                        >
                          ×
                        </button>
                      </div>
                    }
                  </div>
                } @empty {
                  <p class="subtle">
                    Aggiungi il primo esercizio a questo giorno.
                  </p>
                }
                @if (!p.archived) {
                  <div class="actions">
                    <button (click)="openExercise(day.id)">
                      <gt-icon name="plus" /> Aggiungi esercizio</button
                    ><button
                      class="primary"
                      [disabled]="!s.planExercises(day.id).length || s.busy()"
                      (click)="start(day.id)"
                    >
                      {{
                        s.draft() ? "Riprendi sessione" : "Inizia allenamento"
                      }}
                      <gt-icon name="arrow" />
                    </button>
                  </div>
                }
                <details class="past-workout-entry" style="margin-top:14px">
                  <summary style="min-height:44px;align-content:center;cursor:pointer">Registra un allenamento passato</summary>
                  <p class="subtle" style="margin:10px 0">Scegli la data in cui ti sei allenato, poi inserisci e conferma le serie effettuate.</p>
                  <div class="form-grid"><label>Data dell’allenamento<input type="date" [max]="today" [ngModel]="pastDates[day.id]||''" (ngModelChange)="pastDates[day.id]=$event" [attr.aria-label]="'Data allenamento passato · '+day.name"/></label><button type="button" class="primary" (click)="startPast(day.id)" [disabled]="!pastDates[day.id]||!s.planExercises(day.id).length||s.busy()||startingPast()">{{startingPast()?'Apertura…':'Registra per questa data'}}</button></div>
                  @if(s.draft()){<p class="subtle" style="margin-top:10px">La sessione aperta è conservata. <a routerLink="/sessione">Riprendila</a> prima di iniziarne un’altra.</p>}
                </details>
              </div>
            } @empty {
              <div class="empty">
                <h3>Da dove vuoi iniziare?</h3>
                <p>
                  Crea un giorno, ad esempio Push, Pull, Legs oppure Giorno A.
                </p>
                <button (click)="openDay(p.id)">
                  Aggiungi il primo giorno
                </button>
              </div>
            }
          }
        </section>
      } @empty {
        <div class="card empty">
          <gt-icon name="plans" />
          <h3>
            {{
              archived()
                ? "Nessun piano archiviato"
                : "Il tuo prossimo livello parte da qui"
            }}
          </h3>
          <p>
            Crea una scheda su misura, scegli gli esercizi e imposta la tua
            rotazione.
          </p>
          @if (!archived()) {
            <button class="primary" (click)="openPlan()">
              Crea il primo piano
            </button>
          }
        </div>
      }
    </div>
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
                  >Nome del giorno<input
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
                  Salva giorno
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
                    max="3600"
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
  fb = inject(FormBuilder);
  archived = signal(false);
  expanded = signal("");
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
    rest: [90, [Validators.required, Validators.min(0), Validators.max(3600)]],
    targetWeight: [null as number | null, Validators.min(0)],
    rpe: [null as number | null, [Validators.min(1), Validators.max(10)]],
    notes: [""],
  });
  ngOnInit(){
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
      this.expanded.set(value.expanded);this.archived.set(value.archived);this.exerciseSearch.set(value.search);this.scope.set(value.scope);
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
  async start(day: string) {
    if (await this.s.start(day)) await this.router.navigateByUrl("/sessione");
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
