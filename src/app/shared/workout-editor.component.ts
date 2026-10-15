import { Component, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { WorkoutLogExercise, WorkoutLogSet } from "../models/domain";
import { IconComponent } from "./icon.component";
@Component({
  selector: "gt-workout-editor",
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: ` @for (e of s.workoutExercises(workoutId()); track e.id) {
      <section class="card" style="margin-bottom:18px">
        <div class="card-head">
          <div class="exercise-info">
            <span class="exercise-thumb"><gt-icon name="weight" /></span>
            <div>
              <h2>{{ e.name }}</h2>
              <p>{{ mode(e) }} · Recupero {{ e.rest }} s</p>
            </div>
          </div>
          <span class="pill"
            >{{ completeCount(e.id) }} / {{ s.sets(e.id).length }} serie</span
          >
        </div>
        @if (e.notes) {
          <p class="subtle" style="margin-bottom:16px">{{ e.notes }}</p>
        }
        @if (previous(e).length) {
          <div class="notice" style="font-size:11px">
            <div
              style="display:flex;align-items:center;justify-content:space-between;gap:10px"
            >
              <b>L’ultima volta</b
              ><button
                (click)="s.copyPrevious(e.id)"
                style="font-size:10px;padding:6px 10px;min-height:32px"
              >
                Copia valori
              </button>
            </div>
            <p style="margin:7px 0 0">
              @for (p of previous(e); track p.id; let last = $last) {
                @if (e.loadMode !== "bodyweight") {
                  {{ s.formatWeight(p.weight) }} {{ s.settings().unit }} ×
                }
                {{ p.reps }} rip{{ last ? "" : " · " }}
              }
            </p>
          </div>
        }
        <div class="table-wrap">
          <table class="set-table">
            <thead>
              <tr>
                <th>Serie</th>
                <th>
                  {{
                    e.loadMode === "bodyweight"
                      ? "Carico"
                      : e.loadMode === "assisted"
                        ? "Assistenza"
                        : e.loadMode === "weighted-bodyweight"
                          ? "Zavorra"
                          : "Peso"
                  }}
                  ({{ s.settings().unit }})
                </th>
                <th>Ripetizioni</th>
                <th class="rpe-column">RPE</th>
                <th>Fatto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (set of s.sets(e.id); track set.id) {
                <tr>
                  <td>{{ set.number }}</td>
                  <td>
                    @if (e.loadMode === "bodyweight") {
                      <span class="muted">Corpo libero</span>
                    } @else {
                      <input
                        [attr.aria-label]="
                          'Peso serie ' + set.number + ' ' + e.name
                        "
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.5"
                        [ngModel]="s.weight(set.weight)"
                        (ngModelChange)="patchNumber(set, 'weight', $event)"
                      />
                    }
                  </td>
                  <td>
                    <input
                      [attr.aria-label]="
                        'Ripetizioni serie ' + set.number + ' ' + e.name
                      "
                      type="number"
                      inputmode="numeric"
                      min="1"
                      max="999"
                      step="1"
                      [ngModel]="set.reps"
                      (ngModelChange)="patchNumber(set, 'reps', $event)"
                    />
                  </td>
                  <td class="rpe-column">
                    <input
                      [attr.aria-label]="'RPE serie ' + set.number"
                      type="number"
                      inputmode="decimal"
                      min="1"
                      max="10"
                      step="0.5"
                      placeholder="—"
                      [ngModel]="set.rpe"
                      (ngModelChange)="patchNumber(set, 'rpe', $event)"
                    />
                  </td>
                  <td>
                    <button
                      [class.set-done]="set.completed"
                      [attr.aria-label]="
                        (set.completed ? 'Segna da completare' : 'Completa') +
                        ' serie ' +
                        set.number
                      "
                      [attr.aria-pressed]="set.completed"
                      (click)="toggle(set, e)"
                    >
                      <gt-icon name="check" />
                    </button>
                  </td>
                  <td>
                    <button
                      class="icon-btn ghost"
                      (click)="remove(set)"
                      [attr.aria-label]="'Elimina serie ' + set.number"
                    >
                      <gt-icon name="trash" />
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="actions">
          <button class="ghost" (click)="s.addSet(e.id)">
            <gt-icon name="plus" /> Aggiungi serie
          </button>
        </div>
        <details style="margin-top:16px">
          <summary class="subtle" style="cursor:pointer">
            Note e recupero delle serie
          </summary>
          @for (set of s.sets(e.id); track set.id) {
            <div class="form-grid" style="margin-top:14px">
              <label
                >Serie {{ set.number }} · recupero (s)<input
                  type="number"
                  min="0"
                  max="3600"
                  [ngModel]="set.rest"
                  (ngModelChange)="patchNumber(set, 'rest', $event)" /></label
              ><label
                >Serie {{ set.number }} · RPE (1–10)<input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  [ngModel]="set.rpe"
                  (ngModelChange)="patchNumber(set, 'rpe', $event)" /></label
              ><label class="wide"
                >Note della serie<input
                  maxlength="500"
                  [ngModel]="set.notes || ''"
                  (ngModelChange)="s.updateSet(set.id, { notes: $event })"
              /></label>
            </div>
          }
        </details>
      </section>
    }
    @if (restUntil > DateNow()) {
      <div class="rest-timer" role="status">
        <gt-icon name="clock" /> Recupero · {{ remaining() }} s
        <button (click)="restUntil = 0">Chiudi</button>
      </div>
    }`,
})
export class WorkoutEditorComponent {
  s = inject(Store);
  workoutId = input.required<string>();
  restUntil = 0;
  private tick = setInterval(() => this.clock.set(Date.now()), 1000);
  clock = signal(Date.now());
  DateNow = () => this.clock();
  ngOnDestroy() {
    clearInterval(this.tick);
  }
  remaining() {
    return Math.max(0, Math.ceil((this.restUntil - this.clock()) / 1000));
  }
  previous(e: WorkoutLogExercise) {
    return this.s.previous(e.exerciseId, e.workoutId);
  }
  mode(e: WorkoutLogExercise) {
    return {
      external: "Carico esterno",
      bodyweight: "Corpo libero",
      "weighted-bodyweight": "Peso aggiunto",
      assisted: "Peso di assistenza",
    }[e.loadMode];
  }
  completeCount(id: string) {
    return this.s.sets(id).filter((s) => s.completed).length;
  }
  patchNumber(
    s: WorkoutLogSet,
    key: "weight" | "reps" | "rpe" | "rest",
    value: number | null,
  ) {
    if (value === null) {
      if (key === "rpe" || key === "rest")
        void this.s.updateSet(s.id, { [key]: undefined });
      return;
    }
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      (key === "reps" &&
        (!Number.isInteger(value) || value < 1 || value > 999)) ||
      (key === "rpe" && (value < 1 || value > 10)) ||
      (key === "rest" && value > 3600)
    ) {
      this.s.error.set("Valore non valido: controlla i limiti del campo.");
      return;
    }
    void this.s.updateSet(s.id, {
      [key]: key === "weight" ? this.s.kg(value) : value,
    });
  }
  async toggle(set: WorkoutLogSet, e: WorkoutLogExercise) {
    if (await this.s.updateSet(set.id, { completed: !set.completed })) {
      if (!set.completed && e.rest) {
        this.clock.set(Date.now());
        this.restUntil = this.clock() + (set.rest ?? e.rest) * 1000;
      }
    }
  }
  remove(set: WorkoutLogSet) {
    if (!set.completed || confirm("Eliminare questa serie già completata?"))
      void this.s.removeSet(set.id);
  }
}
