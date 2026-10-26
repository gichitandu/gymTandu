import {AuthService} from '../services/auth';
import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
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
  imports: [DateFieldComponent,
    FormsModule,
    RouterLink,
    StatusComponent,
    IconComponent,
    ActiveWorkoutComponent,
  ],
  styleUrl:'./session-simple.css',
  template: `<gt-status />
    @if(s.draft();as w){
      @if(s.conflicted()){<p class="notice" role="alert">Archivio da verificare. @if(auth?.canManageBackups()){<a routerLink="/profilo" [queryParams]="{section:'backup'}">Apri backup e ripristino</a>}@else{Contatta un Super Admin.}</p>}
      @if(requestedDate){<p class="notice" role="status">Sessione aperta: <strong>{{w.dayName}} · {{formatDate(w.date)}}</strong>. Terminala prima di registrare il {{formatDate(requestedDate)}}.</p>}
      <header class="session-header session-compact">
        <div class="simple-session-heading"><a class="button ghost" routerLink="/piani" aria-label="Torna ai piani"><gt-icon name="back"/></a><div><h1>{{w.dayName}}</h1><p>{{w.planName}}</p></div><button class="ghost session-finish" aria-label="Termina allenamento" (click)="finish()" [disabled]="s.busy()||finishing()">{{finishing()?'Salvataggio…':'Termina'}}</button></div>
        <div class="simple-session-meta"><gt-date-field class="compact" aria-label="Data allenamento" [max]="today" [ngModel]="w.date" (ngModelChange)="update(w.id,'date',$event)"/><span>{{completedSets(w.id)}} / {{allSets(w.id).length}} serie</span></div>
      </header>
      <gt-active-workout [workoutId]="w.id" (finish)="finish()" />
      <details class="session-options session-simple-options"><summary>Note e dettagli dell’allenamento</summary>
        <div class="form-grid"><label class="wide">Note<textarea maxlength="2000" [ngModel]="w.notes" (ngModelChange)="update(w.id,'notes',$event)"></textarea></label>
        @if(w.date < today){<label>Durata (minuti)<input type="number" inputmode="numeric" min="1" max="1440" [ngModel]="w.duration||null" (ngModelChange)="update(w.id,'duration',$event)" placeholder="Es. 60"/></label>}
        </div><p class="subtle">{{w.duration>0?w.duration+' min registrati':elapsed(w.startedAt)}}</p>
        <div class="actions"><a class="button ghost" routerLink="/">Torna alla Home</a><button class="danger ghost" (click)="discard(w.id)">Elimina sessione aperta</button></div>
      </details>
    }@else if(s.ready()){
      <div class="card empty"><gt-icon name="weight"/><h3>Nessun allenamento aperto</h3><a class="button primary" routerLink="/piani">Scegli allenamento</a></div>
    }`,
})
export class SessionComponent {
  auth=inject(AuthService,{optional:true});
 private confirmation=confirmationForContext();
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
      if(withoutCompletedSets&&!await this.confirmation.ask('Nessuna serie è stata segnata come completata. Vuoi terminare comunque l’allenamento? Tutti i valori inseriti saranno conservati nello storico e potrai registrare un altro giorno.'))return;
      if (await this.s.finish(withoutCompletedSets)) {
        active?.externalTimer?.stop();
        await this.router.navigateByUrl("/allenamenti");
      }
    } finally { this.finishing.set(false); }
  }
  async discard(id: string) {
    if (
      await this.confirmation.ask(
        "Scartare la sessione in corso? Le serie registrate saranno eliminate.",
      )
    ) {
      if (await this.s.deleteWorkout(id)) await this.router.navigateByUrl("/");
    }
  }
}
