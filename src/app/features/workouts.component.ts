import { OpenWorkoutsComponent } from '../shared/open-workouts.component';
import { SectionHeadingComponent } from "../shared/section-heading.component";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { WorkoutEditorComponent } from "../shared/workout-editor.component";
import { ExerciseFilterComponent } from "../shared/exercise-filter.component";
@Component({
  standalone: true,
  styleUrl: "./account-polish.css",
  imports: [OpenWorkoutsComponent,SectionHeadingComponent,
    FormsModule,
    DatePipe,
    RouterLink,
    IconComponent,
    StatusComponent,
    WorkoutEditorComponent,
    ExerciseFilterComponent,
  ],
  template: `<gt-section-heading index="07" eyebrow="STORICO ALLENAMENTI" title="Il lavoro che resta." description="Ogni sessione costruisce la tua storia. Ritrova tutti i dettagli."><a class="button primary" routerLink="/piani"><gt-icon name="plus"/> Allenati</a></gt-section-heading>
    <div class="archive-signal"><div><span>SESSIONI COMPLETATE</span><strong>{{s.completed().length}}</strong></div><div><span>VOLUME CON CARICHI ESTERNI</span><strong>{{s.formatWeight(s.totalVolume())}} <small>{{s.settings().unit}}</small></strong></div><span class="archive-signal-mark" aria-hidden="true"><gt-icon name="activity"/></span></div>
    <gt-status />
    <gt-open-workouts />
    @if (selected(); as w) {
      <button
        class="ghost"
        (click)="selectedId.set('')"
        style="margin-bottom:20px"
      >
        <gt-icon name="back" /> Torna allo storico
      </button>
      <div class="card" style="margin-bottom:20px">
        <div class="card-head">
          <div>
            <h2>{{ w.dayName }}</h2>
            <p>{{ w.planName }} · {{ w.date | date: "dd/MM/yyyy" }}</p>
          </div>
          <span class="pill green">COMPLETATO</span>
        </div>
        <div class="form-grid">
          <label
            >Data<input
              type="date"
              [ngModel]="w.date"
              (ngModelChange)="edit(w.id, 'date', $event)" /></label
          ><label
            >Durata (minuti)<input
              type="number"
              min="1"
              max="1440"
              [ngModel]="w.duration"
              (ngModelChange)="edit(w.id, 'duration', $event)" /></label
          ><label class="wide"
            >Note generali<textarea
              maxlength="2000"
              [ngModel]="w.notes"
              (ngModelChange)="edit(w.id, 'notes', $event)"
            ></textarea>
          </label>
        </div>
        <p class="subtle" style="margin-top:14px">
          Inizio: {{ w.startedAt | date: "HH:mm" }} · Fine:
          {{ w.endedAt | date: "HH:mm" }} · Volume:
          {{ s.formatWeight(s.volume(w.id)) }} {{ s.settings().unit }}
        </p>
        <div class="actions">
          <span class="pill">{{
            s.busy() ? "Salvataggio…" : "Modifiche salvate automaticamente"
          }}</span
          ><button class="danger ghost" (click)="remove(w.id)">
            Elimina allenamento
          </button>
        </div>
      </div>
      <gt-workout-editor [workoutId]="w.id" />
    } @else {
      <div class="filters history-filters">
        <label
          >Piano<select
            [ngModel]="plan()"
            (ngModelChange)="plan.set($event); day.set('')"
          >
            <option value="">Tutti i piani</option>
            @for (p of planOptions(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select></label
        ><label
          >Giorno<select [ngModel]="day()" (ngModelChange)="day.set($event)">
            <option value="">Tutti i giorni</option>
            @for (d of dayOptions(); track d.id) {
              <option [value]="d.id">{{ d.name }}</option>
            }
          </select></label
        ><gt-exercise-filter [exercises]="s.data().exercises" [value]="exercise()"
          [includeAll]="true" (choose)="exercise.set($event)" /><label
          >Dal<input
            type="date"
            [ngModel]="from()"
            (ngModelChange)="from.set($event)" /></label
        ><label
          >Al<input
            type="date"
            [ngModel]="to()"
            (ngModelChange)="to.set($event)"
        /></label>
      </div>
      <p class="subtle" style="margin-bottom:16px">
        {{ filtered().length }} allenamenti trovati
      </p>
      <div class="list workout-timeline">
        @for (w of filtered(); track w.id) {
          <article class="card history-session">
            <div class="card-head">
              <div class="exercise-info">
                <span class="history-date"><strong>{{w.date | date: "dd"}}</strong><small>{{w.date | date: "MM / yyyy"}}</small></span>
                <div>
                  <h2>{{ w.dayName }}</h2>
                  <p>{{ w.planName }} · {{ w.date | date: "dd/MM/yyyy" }}</p>
                </div>
              </div>
              <button (click)="selectedId.set(w.id)">
                Dettagli <gt-icon name="arrow" />
              </button>
            </div>
            <div class="next-meta">
              <span
                ><gt-icon name="weight" />{{
                  s.workoutExercises(w.id).length
                }}
                esercizi</span
              ><span>{{ setCount(w.id) }} serie</span
              ><span><gt-icon name="clock" />{{ w.duration }} min</span
              ><span
                >{{ s.formatWeight(s.volume(w.id)) }}
                {{ s.settings().unit }}</span
              >
            </div>
          </article>
        } @empty {
          <div class="card empty">
            <gt-icon name="calendar" />
            <h3>Nessuna sessione da mostrare</h3>
            <p>
              Completa un allenamento o modifica i filtri per consultare lo
              storico.
            </p>
            <a class="button primary" routerLink="/piani">Scegli un piano</a>
          </div>
        }
      </div>
    }`,
})
export class WorkoutsComponent {
  constructor(){const query=inject(ActivatedRoute).snapshot.queryParamMap;const workout=query.get("workout");if(workout)this.selectedId.set(workout);const date=query.get("date");if(date){this.from.set(date);this.to.set(date);}}
  s = inject(Store);
  plan = signal("");
  day = signal("");
  exercise = signal("");
  from = signal("");
  to = signal("");
  selectedId = signal("");
  selected = computed(() =>
    this.s.completed().find((w) => w.id === this.selectedId()),
  );
  planOptions = computed(() => [
    ...new Map(
      this.s
        .completed()
        .map((w) => [w.planId, { id: w.planId, name: w.planName }]),
    ).values(),
  ]);
  dayOptions = computed(() => [
    ...new Map(
      this.s
        .completed()
        .filter((w) => !this.plan() || w.planId === this.plan())
        .map((w) => [w.dayId, { id: w.dayId, name: w.dayName }]),
    ).values(),
  ]);
  filtered = computed(() =>
    this.s
      .completed()
      .filter(
        (w) =>
          (!this.plan() || w.planId === this.plan()) &&
          (!this.day() || w.dayId === this.day()) &&
          (!this.from() || w.date >= this.from()) &&
          (!this.to() || w.date <= this.to()) &&
          (!this.exercise() ||
            this.s
              .workoutExercises(w.id)
              .some((e) => e.exerciseId === this.exercise())),
      ),
  );
  setCount(id: string) {
    return this.s
      .workoutExercises(id)
      .reduce(
        (n, e) => n + this.s.sets(e.id).filter((s) => s.completed).length,
        0,
      );
  }
  edit(id: string, key: "date" | "notes" | "duration", value: string | number) {
    if (key === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return;
    if (
      key === "duration" &&
      (!Number.isFinite(+value) || +value < 1 || +value > 1440)
    )
      return;
    void this.s.change((d) => {
      const w = d.workouts.find((w) => w.id === id)!;
      if (key === "duration") w.duration = +value;
      else w[key] = String(value);
    });
  }
  async remove(id: string) {
    if (
      confirm(
        "Eliminare definitivamente questo allenamento e tutte le sue serie? Statistiche e record saranno ricalcolati.",
      )
    ) {
      if (await this.s.deleteWorkout(id)) this.selectedId.set("");
    }
  }
}
