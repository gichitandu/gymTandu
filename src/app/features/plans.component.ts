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
} from "../models/domain";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
@Component({
  standalone: true,
  imports: [
    A11yModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    IconComponent,
    StatusComponent,
  ],
  template: ` <div class="page-heading">
      <div>
        <p class="eyebrow">IL TUO PERCORSO</p>
        <h1>Piani di allenamento</h1>
        <p class="subtle">Una struttura solida. Spazio per migliorare.</p>
      </div>
      <button class="primary" (click)="openPlan()" [disabled]="!s.ready()">
        <gt-icon name="plus" /> Nuovo piano
      </button>
    </div>
    <gt-status />
    <div class="filters">
      <button [class.primary]="!archived()" (click)="archived.set(false)">
        I miei piani</button
      ><button [class.primary]="archived()" (click)="archived.set(true)">
        Archivio</button
      ><a class="button ghost" routerLink="/catalogo"
        >Catalogo esercizi <gt-icon name="arrow"
      /></a>
    </div>
    <div class="list">
      @for (p of plans(); track p.id) {
        <section class="card plan-card" [class.plan-active]="p.active">
          <div class="card-head">
            <div>
              <span class="pill" [class.green]="p.active">{{
                p.active
                  ? "PIANO ATTIVO"
                  : p.archived
                    ? "ARCHIVIATO"
                    : "PIANO PERSONALE"
              }}</span>
              <h2 style="margin-top:13px">{{ p.name }}</h2>
            </div>
            <button (click)="expanded.set(expanded() === p.id ? '' : p.id)">
              {{ expanded() === p.id ? "Chiudi" : "Apri piano" }}
            </button>
          </div>
          <p>{{ p.description || "Il tuo programma personalizzato." }}</p>
          <p class="subtle">
            {{ s.days(p.id).length }} giorni · Rotazione libera{{
              p.archived ? " · Storico conservato" : ""
            }}
          </p>
          <div class="actions">
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
          </div>
          @if (expanded() === p.id) {
            @for (day of s.days(p.id); track day.id) {
              <div class="day">
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
                  <div class="exercise-row">
                    <div class="exercise-info">
                      <span class="exercise-thumb"
                        ><gt-icon name="weight"
                      /></span>
                      <div>
                        <strong>{{ s.exercise(pe.exerciseId)?.name }}</strong
                        ><small
                          >{{ pe.sets }} serie × {{ pe.repsMin }}–{{
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
          (keydown.escape)="modal.set('')"
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
            <button (click)="modal.set('')" aria-label="Chiudi">×</button>
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
                  [disabled]="planForm.invalid || s.busy()"
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
                  [disabled]="dayForm.invalid || s.busy()"
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
                  >Cerca nel catalogo<input
                    [ngModel]="exerciseSearch()"
                    (ngModelChange)="exerciseSearch.set($event)"
                    [ngModelOptions]="{ standalone: true }"
                    placeholder="Nome o attrezzatura…" /></label
                ><label class="wide"
                  >Esercizio<select formControlName="exerciseId">
                    <option value="">Seleziona un esercizio</option>
                    @for (g of s.data().muscleGroups; track g.id) {
                      @if(exercisesForGroup(g.id).length) {<optgroup [label]="g.name">@for(e of exercisesForGroup(g.id);track e.id){<option [value]="e.id">{{e.name}} · {{e.equipment}}</option>}</optgroup>}
                    }
                  </select></label
                ><label
                  >Serie<input
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
                ><label class="wide"
                  >Note<textarea
                    formControlName="notes"
                    maxlength="1000"
                  ></textarea>
                </label>
              </div>
              <div class="actions">
                <button
                  class="primary"
                  [disabled]="exerciseForm.invalid || s.busy()"
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
  s = inject(Store);
  router = inject(Router);
  fb = inject(FormBuilder);
  archived = signal(false);
  expanded = signal("");
  modal = signal("");
  editId = "";
  parentId = "";
  exerciseSearch = signal("");
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
          `${e.name} ${e.equipment}`
            .toLowerCase()
            .includes(this.exerciseSearch().toLowerCase()),
      ),
  );
  exercisesForGroup(id:string) { return this.availableExercises().filter(e=>e.muscleGroupId===id); }
  planForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    description: [""],
  });
  dayForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    weekday: [""],
  });
  exerciseForm = this.fb.group({
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
  openPlan(p?: TrainingPlan) {
    this.editId = p?.id || "";
    this.planForm.reset({
      name: p?.name || "",
      description: p?.description || "",
    });
    this.modal.set("plan");
  }
  async savePlan() {
    if (this.planForm.invalid) return;
    const v = this.planForm.getRawValue();
    const id = this.editId || uid();
    if (await this.s.savePlan(id, v.name, v.description)) {
      this.expanded.set(id);
      this.modal.set("");
    }
  }
  openDay(planId: string, day?: TrainingPlanDay) {
    this.parentId = planId;
    this.editId = day?.id || "";
    this.dayForm.reset({
      name: day?.name || "",
      weekday: day?.weekday === undefined ? "" : String(day.weekday),
    });
    this.modal.set("day");
  }
  async saveDay() {
    if (this.dayForm.invalid) return;
    const v = this.dayForm.getRawValue();
    if (
      await this.s.saveDay(
        this.editId || uid(),
        this.parentId,
        v.name,
        v.weekday === "" ? undefined : Number(v.weekday),
      )
    ) {
      this.expanded.set(this.parentId);
      this.modal.set("");
    }
  }
  activate(id: string) {
    void this.s.change((d) => {
      d.plans.forEach((p) => (p.active = p.id === id && !p.archived));
    }, "Piano attivo aggiornato.");
  }
  archive(p: TrainingPlan) {
    if (
      !p.archived &&
      !confirm(
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
  removeDay(day: TrainingPlanDay) {
    if (
      confirm(
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
    this.parentId = dayId;
    this.editId = e?.id || "";
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
      notes: e?.notes || "",
    });
    this.modal.set("exercise");
  }
  async saveExercise() {
    if (this.exerciseForm.invalid) return;
    const v = this.exerciseForm.getRawValue();
    if (v.repsMin! > v.repsMax!) {
      this.s.error.set(
        "Le ripetizioni minime non possono superare le massime.",
      );
      return;
    }
    if (
      await this.s.savePlanExercise({
        id: this.editId || uid(),
        dayId: this.parentId,
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
          this.s.data().planExercises.find((e) => e.id === this.editId)
            ?.order ?? this.s.planExercises(this.parentId).length,
      })
    )
      this.modal.set("");
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
  removeExercise(e: TrainingPlanExercise) {
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
}
