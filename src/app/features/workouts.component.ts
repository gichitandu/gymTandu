import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { WorkoutEditorComponent } from "../shared/workout-editor.component";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    IconComponent,
    StatusComponent,
    WorkoutEditorComponent,
  ],
  template: `<div class="page-heading">
      <div>
        <p class="eyebrow">IL LAVORO CHE CONTA</p>
        <h1>I tuoi allenamenti</h1>
        <p class="subtle">Ogni sessione è un passo avanti.</p>
      </div>
      <a class="button primary" routerLink="/piani"
        ><gt-icon name="plus" /> Allenati</a
      >
    </div>
    <gt-status />
    @if (s.draft()) {
      <div class="notice">
        Hai un allenamento in corso.
        <a class="link" routerLink="/sessione">Riprendi la sessione →</a>
      </div>
    }
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
      <div class="filters">
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
        ><label
          >Esercizio<select
            [ngModel]="exercise()"
            (ngModelChange)="exercise.set($event)"
          >
            <option value="">Tutti gli esercizi</option>
            @for (e of s.data().exercises; track e.id) {
              <option [value]="e.id">{{ e.name }}</option>
            }
          </select></label
        ><label
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
      <div class="list">
        @for (w of filtered(); track w.id) {
          <article class="card">
            <div class="card-head">
              <div class="exercise-info">
                <span class="exercise-thumb"><gt-icon name="weight" /></span>
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
