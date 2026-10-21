import { Component, inject, signal, viewChild } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { StatusComponent } from "../shared/status.component";
import { IconComponent } from "../shared/icon.component";
import { ActiveWorkoutComponent } from "../shared/active-workout.component";
import { localDate } from '../models/domain';
import { parseLocalDate } from '../services/calendar';
@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    StatusComponent,
    IconComponent,
    ActiveWorkoutComponent,
  ],
  template: `<gt-status />
    @if (s.draft(); as w) {
      @if(requestedDate){<div class="card" role="status" style="margin-bottom:16px"><strong>Non è stato aperto un nuovo allenamento per il {{formatDate(requestedDate)}}.</strong><p>Questa è la sessione che blocca la registrazione: <strong>{{w.planName}} · {{w.dayName}} · {{formatDate(w.date)}}</strong>.</p><p class="subtle">Controlla i dati e premi “Termina allenamento”. Le serie inserite resteranno conservate; poi potrai registrare l’altra data dai Piani.</p></div>}
      <div class="session-header">
        <div class="page-heading">
          <div>
            <p class="eyebrow">{{ w.date < today ? 'REGISTRAZIONE DI UN ALLENAMENTO PASSATO':'ALLENAMENTO IN CORSO'}}</p>
            <h1>{{ w.dayName }}</h1>
            <p class="subtle">
              {{ w.planName }} · {{ elapsed(w.startedAt) }} ·
              {{ s.busy() ? "Salvataggio…" : "Salvato sul dispositivo" }}
            </p>
          </div>
          <button class="primary" (click)="finish()" [disabled]="s.busy() || finishing()">
            Termina allenamento <gt-icon name="check" />
          </button>
        </div>
        <div class="progress-bars">
          @for (set of allSets(w.id); track set.id) {
            <i [class.done]="set.completed"></i>
          }
        </div>
        <div class="form-grid" style="margin-top:14px"><label>Data effettiva dell’allenamento<input type="date" [max]="today" [ngModel]="w.date" (ngModelChange)="update(w.id,'date',$event)"/></label>
        @if(w.date < today){<label>Durata effettiva (minuti, facoltativa)<input type="number" inputmode="numeric" min="1" max="1440" [ngModel]="w.duration||null" (ngModelChange)="update(w.id,'duration',$event)" placeholder="Es. 60"/></label>}</div>
      </div>
      <gt-active-workout [workoutId]="w.id" (finish)="finish()" />
      <div class="card session-completion" style="margin-top:16px">
        <p class="subtle">{{ completedSets(w.id) }} / {{ allSets(w.id).length }} serie confermate. Per registrare un altro giorno, termina questa sessione: i valori inseriti resteranno conservati.</p>
        <button class="primary full-width" style="margin-top:12px" (click)="finish()" [disabled]="s.busy() || finishing()">{{finishing()?'Salvataggio…':'Termina allenamento'}} <gt-icon name="check" /></button>
      </div>
      <details class="card session-options"><summary>Data, note e salvataggio</summary>
        <h2 style="margin-top:16px">Il tuo allenamento</h2>
        <div class="form-grid" style="margin-top:18px">
          <label class="wide"
            >Note generali<textarea
              maxlength="2000"
              [ngModel]="w.notes"
              (ngModelChange)="update(w.id, 'notes', $event)"
            ></textarea>
          </label>
        </div>
        <div class="actions">
          <button class="primary" (click)="finish()" [disabled]="s.busy() || finishing()">
            Termina allenamento</button
          ><a class="button" routerLink="/">Torna alla Home (sessione aperta)</a
          ><button class="danger ghost" (click)="discard(w.id)">
            Scarta sessione
          </button>
        </div>
      </details>
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
  requestedDate = inject(ActivatedRoute,{optional:true})?.snapshot.queryParamMap.get('requestedDate') || '';
  formatDate(date:string){try{return parseLocalDate(date).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});}catch{return date;}}
  activeWorkout = viewChild(ActiveWorkoutComponent);
  finishing = signal(false);
  router = inject(Router);
  clock = signal(Date.now());
  get today(){return localDate(new Date(this.clock()));}
  timer = setInterval(() => this.clock.set(Date.now()), 1000);
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  elapsed(date:string){const seconds=Math.max(0,Math.floor((this.clock()-new Date(date).getTime())/1000));return `${Math.floor(seconds/3600).toString().padStart(2,'0')}:${Math.floor(seconds%3600/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
  allSets(id: string) {
    return this.s.workoutExercises(id).flatMap((e) => this.s.sets(e.id));
  }
  completedSets(id:string){return this.allSets(id).filter(set=>set.completed).length;}
  update(id: string, key: "date" | "notes" | "duration", value: string | number | null) {
    if(key==='date'){try{parseLocalDate(String(value));if(String(value)>this.today)throw Error('Scegli oggi o una data passata.');}catch(error){this.s.error.set(error instanceof Error?error.message:'Data non valida.');return;}}
    if(key==='duration'&&(value===null||value===''||!Number.isInteger(+value)||+value<1||+value>1440))return;
    void this.s.change((d) => {
      const workout=d.workouts.find(w=>w.id===id);if(!workout)throw Error('Allenamento non trovato.');
      if(key==='duration')workout.duration=Number(value);else workout[key]=String(value);
    });
  }
  async finish() {
    if(this.finishing())return;
    this.finishing.set(true);
    try {
      const active=this.activeWorkout();
      if(active&&!await active.flushForFinish())return;
      await this.s.settled();
      const workout=this.s.draft();
      if(!workout)return;
      const withoutCompletedSets=this.completedSets(workout.id)===0;
      if(withoutCompletedSets&&!confirm('Nessuna serie è stata segnata come completata. Vuoi terminare comunque l’allenamento? Tutti i valori inseriti saranno conservati nello storico e potrai registrare un altro giorno.'))return;
      if (await this.s.finish(withoutCompletedSets)) {
        active?.externalTimer?.stop();
        await this.router.navigateByUrl("/allenamenti");
      }
    } finally { this.finishing.set(false); }
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
