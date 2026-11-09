import { confirmationForContext } from "../services/confirmation";
import { setupSummary } from "../services/training-flow";
import { ExerciseVideoComponent } from "./exercise-video.component";
import { Component, HostListener, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { WorkoutLogExercise, WorkoutLogSet } from "../models/domain";
import { IconComponent } from "./icon.component";
import type { AppUpdateEvent } from "../services/pwa";
import { FormDraftService } from "../services/form-drafts";

type NumberField = "weight" | "reps" | "rpe" | "rest";
type SetDraft = Partial<Record<NumberField, number | null | undefined>> & {
  notes?: string;
  kind?: "work" | "warmup";
};
@Component({
  selector: "gt-workout-editor",
  standalone: true,
  imports: [FormsModule, IconComponent, ExerciseVideoComponent],
  styleUrl: "./workout-editor.css",
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
        <p class="subtle" style="margin-bottom:12px">{{setupSummary(e.machineSetup)}}{{e.superset?' · Superset '+e.superset:''}}</p><gt-exercise-video [exercise]="s.exercise(e.exerciseId)" />
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
                (click)="copyPrevious(e.id)" [disabled]="s.busy()"
                style="font-size:12px;padding:8px 12px;min-height:44px"
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
                <tr class="set-entry">
                  <td class="set-type" [attr.data-label]="'Serie '+set.number"><span class="desktop-set-number">{{set.number}}</span><select [attr.aria-label]="'Tipo di serie '+set.number" [ngModel]="kindValue(set)" (ngModelChange)="patchKind(set,$event)" (blur)="flushRow(set.id)"><option value="work">Allenante</option><option value="warmup">Riscaldamento</option></select></td>
                  <td [attr.data-label]="(e.loadMode==='assisted'?'Assistenza':e.loadMode==='weighted-bodyweight'?'Zavorra':'Peso')+' ('+s.settings().unit+')'">
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
                        [ngModel]="numberValue(set, 'weight')"
                        (ngModelChange)="patchNumber(set, 'weight', $event)"
                        (blur)="flushRow(set.id)"
                      />
                    }
                  </td>
                  <td data-label="Ripetizioni">
                    <input
                      [attr.aria-label]="
                        'Ripetizioni serie ' + set.number + ' ' + e.name
                      "
                      type="number"
                      inputmode="numeric"
                      min="1"
                      max="999"
                      step="1"
                      [ngModel]="numberValue(set, 'reps')"
                      (ngModelChange)="patchNumber(set, 'reps', $event)"
                      (blur)="flushRow(set.id)"
                    />
                  </td>
                  <td class="rpe-column" data-label="RPE (facoltativo)">
                    <input
                      [attr.aria-label]="'RPE serie ' + set.number"
                      type="number"
                      inputmode="decimal"
                      min="1"
                      max="10"
                      step="0.5"
                      placeholder="—"
                      [ngModel]="numberValue(set, 'rpe')"
                      (ngModelChange)="patchNumber(set, 'rpe', $event)"
                      (blur)="flushRow(set.id)"
                    />
                  </td>
                  <td data-label="Serie completata">
                    <button
                      [class.set-done]="set.completed"
                      [attr.aria-label]="
                        (set.completed ? 'Segna da completare' : 'Completa') +
                        ' serie ' +
                        set.number
                      "
                      [attr.aria-pressed]="set.completed"
                      [disabled]="toggling().has(set.id)"
                      (click)="toggle(set, e)"
                    >
                      <gt-icon name="check" />
                    </button>
                  </td>
                  <td class="set-remove" data-label="Elimina serie">
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
                  [ngModel]="numberValue(set, 'rest')"
                  (ngModelChange)="patchNumber(set, 'rest', $event)" (blur)="flushRow(set.id)" /></label
              ><label
                >Serie {{ set.number }} · RPE (1–10)<input
                  type="number"
                  min="1"
                  max="10"
                  step="0.5"
                  [ngModel]="numberValue(set, 'rpe')"
                  (ngModelChange)="patchNumber(set, 'rpe', $event)" (blur)="flushRow(set.id)" /></label
              ><label class="wide"
                >Note della serie<input
                  maxlength="500"
                  [ngModel]="notesValue(set)"
                  (ngModelChange)="patchNotes(set, $event)" (blur)="flushRow(set.id)"
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
  private confirmation = confirmationForContext();
  setupSummary = setupSummary;
  s = inject(Store);
  workoutId = input.required<string>();
  private drafts = new Map<string, SetDraft>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private writes = new Map<string, Promise<boolean>>();
  private draftStorage = inject(FormDraftService, { optional: true });
  private draftSession?: ReturnType<FormDraftService["bind"]>;
  toggling = signal(new Set<string>());
  restUntil = 0;
  private tick = setInterval(() => this.clock.set(Date.now()), 1000);
  clock = signal(Date.now());
  DateNow = () => this.clock();
  ngOnInit() {
    this.draftSession = this.draftStorage?.bind<{
      entries: [string, SetDraft][];
      bases?: Record<string, string>;
    }>(
      this.s.archiveKey(),
      "history-sets:" + this.workoutId(),
      () =>
        this.drafts.size
          ? {
              entries: [...this.drafts],
              bases: Object.fromEntries(
                this.s
                  .workoutExercises(this.workoutId())
                  .flatMap((exercise) => this.s.sets(exercise.id))
                  .filter((set) => this.drafts.has(set.id))
                  .map((set) => [set.id, JSON.stringify(set)]),
              ),
            }
          : null,
      (data) => {
        if (!Array.isArray(data?.entries) || data.entries.length > 1000) return;
        const owned = new Set(
          this.s
            .workoutExercises(this.workoutId())
            .flatMap((exercise) => this.s.sets(exercise.id))
            .map((set) => set.id),
        );
        for (const entry of data.entries) {
          if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            !owned.has(entry[0]) ||
            !entry[1] ||
            typeof entry[1] !== "object"
          )
            continue;
          const allowed = ["weight", "reps", "rpe", "rest", "notes", "kind"];
          if (Object.keys(entry[1]).some((key) => !allowed.includes(key)))
            continue;
          const set = this.s
            .workoutExercises(this.workoutId())
            .flatMap((exercise) => this.s.sets(exercise.id))
            .find((set) => set.id === entry[0]);
          if (
            data.bases?.[entry[0]] &&
            data.bases[entry[0]] !== JSON.stringify(set)
          ) {
            this.s.message.set(
              "Una serie è cambiata dall’ultima bozza: sono conservati i valori già salvati.",
            );
            continue;
          }
          this.drafts.set(entry[0], entry[1]);
        }
      },
    );
  }
  ngOnDestroy() {
    clearInterval(this.tick);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    void this.draftSession?.flush();
    void this.flushAll(false);
    void this.draftSession?.destroy();
  }
  @HostListener("window:gymtrack:before-update", ["$event"]) beforeUpdate(
    event: Event,
  ) {
    (event as AppUpdateEvent).waitUntil(this.flushAll());
  }
  @HostListener("window:pagehide") flushOnHide() {
    void this.draftSession?.flush();
    void this.flushAll(false);
  }
  remaining() {
    return Math.max(0, Math.ceil((this.restUntil - this.clock()) / 1000));
  }
  previous(e: WorkoutLogExercise) {
    return this.s.previous(e.exerciseId, e.workoutId, e.machineSetup);
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
  numberValue(set: WorkoutLogSet, key: NumberField) {
    const draft = this.drafts.get(set.id);
    return draft && Object.hasOwn(draft, key)
      ? draft[key]
      : key === "weight"
        ? this.s.weightInput(set.weight)
        : set[key];
  }
  notesValue(set: WorkoutLogSet) {
    return this.drafts.get(set.id)?.notes ?? set.notes ?? "";
  }
  kindValue(set: WorkoutLogSet) {
    return this.drafts.get(set.id)?.kind ?? set.kind ?? "work";
  }
  patchNumber(set: WorkoutLogSet, key: NumberField, value: number | null) {
    this.queueDraft(set.id, { [key]: value });
  }
  patchNotes(set: WorkoutLogSet, notes: string) {
    this.queueDraft(set.id, { notes });
  }
  patchKind(set: WorkoutLogSet, kind: "work" | "warmup") {
    this.queueDraft(set.id, { kind });
  }
  private queueDraft(id: string, patch: SetDraft) {
    this.drafts.set(id, { ...this.drafts.get(id), ...patch });
    this.draftSession?.changed();
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.flushRow(id, false);
      }, 200),
    );
  }
  private draftsChanged() {
    if (this.drafts.size) this.draftSession?.changed();
    else void this.draftSession?.clear().catch(() => {});
  }
  private validatedPatch(draft: SetDraft): Partial<WorkoutLogSet> | undefined {
    const patch: Partial<WorkoutLogSet> = {};
    for (const key of ["weight", "reps", "rpe", "rest"] as const) {
      if (!Object.hasOwn(draft, key)) continue;
      const value = draft[key];
      if (value === null || value === undefined) {
        if (key === "rpe" || key === "rest") {
          patch[key] = undefined;
          continue;
        }
        return undefined;
      }
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        (key === "reps" &&
          (!Number.isInteger(value) || value < 1 || value > 999)) ||
        (key === "rpe" && (value < 1 || value > 10)) ||
        (key === "rest" && value > 3600)
      )
        return undefined;
      patch[key] = key === "weight" ? this.s.kg(value) : value;
    }
    if (draft.notes !== undefined) {
      if (draft.notes.length > 500) return undefined;
      patch.notes = draft.notes;
    }
    if (draft.kind !== undefined) patch.kind = draft.kind;
    return patch;
  }
  async flushRow(id: string, report = true): Promise<boolean> {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    for (;;) {
      const pending = this.writes.get(id);
      if (pending) {
        try {
          if (!(await pending)) return false;
        } catch {
          return false;
        }
        continue;
      }
      const draft = this.drafts.get(id);
      if (!draft) return true;
      const patch = this.validatedPatch(draft);
      if (!patch) {
        if (report)
          this.s.error.set("Valore non valido: controlla i limiti del campo.");
        await this.draftSession?.flush();
        return false;
      }
      const job = this.s.updateSet(id, patch);
      this.writes.set(id, job);
      let saved = false;
      try {
        saved = await job;
      } catch (error) {
        this.s.error.set(
          error instanceof Error
            ? error.message
            : "Modifiche alla serie non salvate. Riprova.",
        );
      } finally {
        if (this.writes.get(id) === job) this.writes.delete(id);
      }
      if (!saved) {
        await this.draftSession?.flush();
        return false;
      }
      // Keep inputs typed while an older write was pending on screen. Only the
      // exact draft accepted by this write can be removed from the local form.
      if (this.drafts.get(id) === draft) this.drafts.delete(id);
      this.draftsChanged();
    }
  }
  async flushAll(report = true) {
    const ids = new Set([...this.drafts.keys(), ...this.writes.keys()]);
    const saved = await Promise.all(
      [...ids].map((id) => this.flushRow(id, report)),
    );
    await this.draftSession?.flush();
    return saved.every(Boolean);
  }
  async toggle(set: WorkoutLogSet, e: WorkoutLogExercise) {
    if (this.toggling().has(set.id)) return;
    this.toggling.update((ids) => new Set([...ids, set.id]));
    try {
      if (!(await this.flushRow(set.id))) return;
      const current = this.s.sets(e.id).find((item) => item.id === set.id);
      if (!current) return;
      if (await this.s.updateSet(set.id, { completed: !current.completed })) {
        if (!current.completed && (current.rest ?? e.rest)) {
          this.clock.set(Date.now());
          this.restUntil = this.clock() + (current.rest ?? e.rest) * 1000;
        }
      }
    } finally {
      this.toggling.update(
        (ids) => new Set([...ids].filter((id) => id !== set.id)),
      );
    }
  }
  async copyPrevious(id: string) {
    if (
      this.s.sets(id).some((set) => set.kind !== "warmup") &&
      !(await this.confirmation.ask(
        "Sostituire le serie allenanti con i valori precedenti? Nello storico verrà conservato lo stato delle serie completate; le serie di riscaldamento restano conservate.",
      ))
    )
      return;
    if (!(await this.flushAll())) return;
    const ids = this.s.sets(id).map((set) => set.id);
    if (await this.s.copyPrevious(id)) {
      for (const key of ids) this.drafts.delete(key);
      this.draftsChanged();
    }
  }
  async remove(set: WorkoutLogSet) {
    if (
      set.completed &&
      !(await this.confirmation.ask("Eliminare questa serie già completata?"))
    )
      return;
    clearTimeout(this.timers.get(set.id));
    this.timers.delete(set.id);
    const pending = this.writes.get(set.id);
    if (pending) await pending;
    if (await this.s.removeSet(set.id)) {
      this.drafts.delete(set.id);
      this.draftsChanged();
    }
  }
}
