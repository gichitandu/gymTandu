import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { ProgressChartComponent } from "../shared/progress-chart.component";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ProgressChartComponent,
    IconComponent,
    StatusComponent,
  ],
  template: `<div class="page-heading">
      <div>
        <p class="eyebrow">MISURA. MIGLIORA. RIPETI.</p>
        <h1>I tuoi progressi</h1>
        <p class="subtle">I numeri raccontano la tua costanza.</p>
      </div>
      <span class="pill green">DATI REALI · ARCHIVIO LOCALE</span>
    </div>
    <gt-status />
    <section class="card">
      <div class="card-head">
        <div>
          <h2>L’evoluzione del tuo allenamento</h2>
          <p>Peso, volume, ripetizioni e 1RM stimato per esercizio.</p>
        </div>
        <gt-icon name="chart" />
      </div>
      <gt-progress-chart />
    </section>
    <section class="card" style="margin-top:20px">
      <div class="card-head">
        <div>
          <h2>Record personali</h2>
          <p>Il tuo punto di partenza per il prossimo obiettivo.</p>
        </div>
        <gt-icon name="trophy" />
      </div>
      <label style="max-width:400px"
        >Esercizio<select
          [ngModel]="exerciseId() || defaultId()"
          (ngModelChange)="exerciseId.set($event)"
        >
          @for (e of s.data().exercises; track e.id) {
            <option [value]="e.id">{{ e.name }}</option>
          }
        </select></label
      >
      <div class="stats-grid">
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
    <div class="split" style="margin-top:20px">
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
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Volume settimanale</h2>
            <p>La somma del lavoro con carichi esterni.</p>
          </div>
        </div>
        <gt-progress-chart initialMetric="weekly" />
      </section>
    </div>`,
})
export class ProgressComponent {
  s = inject(Store);
  exerciseId = signal("");
  defaultId = computed(() => this.s.data().exercises[0]?.id || "");
  selectedExercise = computed(() =>
    this.s.exercise(this.exerciseId() || this.defaultId()),
  );
  records = computed(() =>
    this.s.records(this.exerciseId() || this.defaultId()),
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
            e.loadMode === this.selectedExercise()?.loadMode,
        );
      const sets = es.flatMap((e) =>
        this.s.sets(e.id).filter((s) => s.completed),
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
