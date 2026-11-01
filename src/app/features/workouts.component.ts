import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import { OpenWorkoutsComponent } from '../shared/open-workouts.component';
import { SectionHeadingComponent } from "../shared/section-heading.component";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { ExerciseFilterComponent } from "../shared/exercise-filter.component";
@Component({
  standalone: true,
  styleUrl: "./account-polish.css",
  imports: [DateFieldComponent,OpenWorkoutsComponent,SectionHeadingComponent,
    FormsModule,
    DatePipe,
    RouterLink,
    IconComponent,
    StatusComponent,
    ExerciseFilterComponent,
  ],
  template: `<gt-section-heading index="07" title="Storico"><a class="button primary" routerLink="/piani"><gt-icon name="plus"/> Allenati</a></gt-section-heading>
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
        <p class="subtle">Durata: {{w.duration>0?w.duration+' minuti':'non indicata'}}</p>@if(w.notes){<p>{{w.notes}}</p>}
        <p class="subtle" style="margin-top:14px">
          Inizio: {{ w.startedAt | date: "HH:mm" }} · Fine:
          {{ w.endedAt | date: "HH:mm" }} · Volume:
          {{ s.formatWeight(s.volume(w.id)) }} {{ s.settings().unit }}
        </p>
        <div class="actions">
          <span class="pill">{{
            s.busy() ? "Salvataggio…" : "Allenamento terminato · sola lettura"
          }}</span
          ><button class="primary" (click)="reopen(w.id)" [disabled]="s.busy()||reopening()||deleting()">{{reopening()?'Riapertura…':'Riapri allenamento'}}</button>
          <a class="button ghost" routerLink="/profilo" [queryParams]="{section:'settings'}"><gt-icon name="settings"/>Configura eliminazione</a>
          @if(s.settings().allowCompletedWorkoutDeletion){<button type="button" class="ghost danger" (click)="remove(w.id)" [disabled]="s.busy()||reopening()||deleting()">{{deleting()?'Eliminazione…':'Elimina allenamento'}}</button>}
        </div>
      </div>
      <a class="button ghost" [routerLink]="['/riepilogo',w.id]">Riepilogo allenamento</a><p class="subtle">Per modificare la sessione, riaprila. Puoi configurare l’eliminazione dei terminati in Profilo → Impostazioni.</p>
      @for(exercise of s.workoutExercises(w.id);track exercise.id){<section class="card" style="margin-top:12px"><h3>{{exercise.name}}</h3>@if(exercise.substitutedFrom){<p class="subtle">Al posto di {{exercise.substitutedFrom.name}} · solo questa seduta</p>}@for(set of s.sets(exercise.id);track set.id){<p>Serie {{set.number}} · {{s.formatWeight(set.weight)}} {{s.settings().unit}} × {{set.reps}} · {{set.completed?'Confermata':'Non eseguita'}}</p>}</section>}
    } @else {
      <div class="history-filters" role="group" aria-label="Filtri dello storico allenamenti">
        <label class="history-plan-filter"
          >Piano<select
            [ngModel]="plan()"
            (ngModelChange)="plan.set($event); day.set('')"
          >
            <option value="">Tutti i piani</option>
            @for (p of planOptions(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select></label
        ><label class="history-day-filter"
          >Giorno<select [ngModel]="day()" (ngModelChange)="day.set($event)">
            <option value="">Tutti i giorni</option>
            @for (d of dayOptions(); track d.id) {
              <option [value]="d.id">{{ d.name }}</option>
            }
          </select></label
        ><gt-exercise-filter [exercises]="s.data().exercises" [value]="exercise()"
          [includeAll]="true" (choose)="exercise.set($event)" /><label class="history-from-filter"
          >Data iniziale<gt-date-field aria-label="Data iniziale dello storico"
            [ngModel]="from()"
            (ngModelChange)="from.set($event)" ></gt-date-field></label
        ><label class="history-to-filter"
          >Data finale<gt-date-field aria-label="Data finale dello storico"
            [ngModel]="to()"
            (ngModelChange)="to.set($event)"
        ></gt-date-field></label>
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
              ><span><gt-icon name="clock" />{{w.duration>0?w.duration+' min':'Durata non indicata'}}</span
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
 private confirmation=confirmationForContext();
  constructor(){const query=inject(ActivatedRoute).snapshot.queryParamMap;const workout=query.get("workout");if(workout)this.selectedId.set(workout);const date=query.get("date");if(date){this.from.set(date);this.to.set(date);}}
  s = inject(Store);
  router=inject(Router);reopening=signal(false);deleting=signal(false);
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
  async reopen(id:string){
    if(this.reopening())return;
    this.reopening.set(true);
    try{if(await this.s.reopenWorkout(id)){this.selectedId.set('');await this.router.navigateByUrl('/sessione');}}finally{this.reopening.set(false);}
  }
  async remove(id: string) {
    if(this.deleting()||this.reopening()||this.s.busy())return;
    const workout=this.s.data().workouts.find(w=>w.id===id);if(!workout)return;
    if(workout.status==='completed'&&!this.s.settings().allowCompletedWorkoutDeletion)return;
    const archive=this.s.archiveKey();this.deleting.set(true);
    try{if(!await this.confirmation.ask({title:'Eliminare questo allenamento?',message:workout.dayName+' · '+workout.date.split('-').reverse().join('/')+'. La sessione e tutte le sue serie saranno eliminate definitivamente. Statistiche e record saranno ricalcolati. La programmazione nel calendario resta disponibile.',confirmLabel:'Elimina allenamento',tone:'danger'}))return;
      if(archive!==this.s.archiveKey())return;
      if(await this.s.deleteWorkout(id,{confirmedCompleted:true}))this.selectedId.set('');
    }finally{this.deleting.set(false);}
  }
}
