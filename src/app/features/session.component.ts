import { Component, inject, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { StatusComponent } from "../shared/status.component";
import { IconComponent } from "../shared/icon.component";
import { WorkoutEditorComponent } from "../shared/workout-editor.component";
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    StatusComponent,
    IconComponent,
    WorkoutEditorComponent,
  ],
  template: `<gt-status />
    @if (s.draft(); as w) {
      <div class="session-header">
        <div class="page-heading">
          <div>
            <p class="eyebrow">ALLENAMENTO IN CORSO</p>
            <h1>{{ w.dayName }}</h1>
            <p class="subtle">
              {{ w.planName }} · {{ elapsed(w.startedAt) }} min ·
              {{ s.busy() ? "Salvataggio…" : "Salvato sul dispositivo" }}
            </p>
          </div>
          <button class="primary" (click)="finish()" [disabled]="s.busy()">
            Concludi <gt-icon name="check" />
          </button>
        </div>
        <div class="progress-bars">
          @for (set of allSets(w.id); track set.id) {
            <i [class.done]="set.completed"></i>
          }
        </div>
      </div>
      <gt-workout-editor [workoutId]="w.id" />
      <section class="card">
        <h2>Il tuo allenamento, a modo tuo</h2>
        <div class="form-grid" style="margin-top:18px">
          <label
            >Data effettiva<input
              type="date"
              [ngModel]="w.date"
              (ngModelChange)="update(w.id, 'date', $event)" /></label
          ><label
            >Note generali<textarea
              maxlength="2000"
              [ngModel]="w.notes"
              (ngModelChange)="update(w.id, 'notes', $event)"
            ></textarea>
          </label>
        </div>
        <div class="actions">
          <button class="primary" (click)="finish()" [disabled]="s.busy()">
            Concludi allenamento</button
          ><a class="button" routerLink="/">Salva e torna alla Home</a
          ><button class="danger ghost" (click)="discard(w.id)">
            Scarta sessione
          </button>
        </div>
      </section>
    } @else if (s.ready()) {
      <div class="card empty">
        <gt-icon name="weight" />
        <h3>Pronto per allenarti?</h3>
        <p>Scegli un giorno dal tuo piano per iniziare una nuova sessione.</p>
        <a class="button primary" routerLink="/piani">Vai ai piani</a>
      </div>
    }`,
})
export class SessionComponent {
  s = inject(Store);
  router = inject(Router);
  clock = signal(Date.now());
  timer = setInterval(() => this.clock.set(Date.now()), 10000);
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  elapsed(date: string) {
    return Math.max(
      0,
      Math.floor((this.clock() - new Date(date).getTime()) / 60000),
    );
  }
  allSets(id: string) {
    return this.s.workoutExercises(id).flatMap((e) => this.s.sets(e.id));
  }
  update(id: string, key: "date" | "notes", value: string) {
    if (key === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    void this.s.change((d) => {
      d.workouts.find((w) => w.id === id)![key] = value;
    });
  }
  async finish() {
    if (await this.s.finish()) await this.router.navigateByUrl("/allenamenti");
  }
  async discard(id: string) {
    if (
      confirm(
        "Scartare la sessione in corso? Le serie registrate saranno eliminate.",
      )
    ) {
      if (await this.s.deleteWorkout(id)) await this.router.navigateByUrl("/");
    }
  }
}
