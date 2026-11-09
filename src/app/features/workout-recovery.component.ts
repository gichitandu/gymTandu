import { Component, effect, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { AuthService } from "../services/auth";
import {
  WorkoutRecoveryCandidate,
  WorkoutRecoveryService,
} from "../services/workout-recovery";
import { confirmationForContext } from "../services/confirmation";
import { DateFieldComponent } from "../shared/date-field.component";
import { localDate } from "../models/domain";
import { importBackup } from "../services/backup";
import { Store } from "../services/store";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DateFieldComponent],
  template: `
<header class="page-heading"><a class="button ghost" routerLink="/profilo" [queryParams]="{section:'backup'}">‹ Dati e backup</a><h1>Recupera allenamenti</h1><p class="subtle">Cerca una seduta nelle copie disponibili. Puoi recuperare solo quell’allenamento, mantenendo il resto dell’archivio.</p></header>
@if(auth.canManageBackups()){
  <section class="card recovery-search"><label>Data dell’allenamento<gt-date-field aria-label="Data dell’allenamento da recuperare" [max]="today" [(ngModel)]="date"/></label><button type="button" class="primary" [disabled]="recovery.busy()||!date" (click)="recovery.scan(date)">{{recovery.busy()?'Controllo delle copie…':'Cerca copie dell’allenamento'}}</button></section>
  <details class="card" style="margin-top:16px"><summary>Cerca anche in un backup salvato in File</summary><p>Seleziona il backup GymTrack: verranno mostrate solo le sedute della data scelta. Il file non sostituisce automaticamente l’archivio.</p><input type="file" accept=".json,application/json" aria-label="Backup per recuperare una singola seduta" [disabled]="recovery.busy()" (change)="fromFile($event)"/></details>
  <p class="recovery-status" role="status">{{recovery.message()}}</p>
  <div class="recovery-results">@for(candidate of recovery.candidates();track candidate.key){<article class="card"><div class="recovery-heading"><h2>{{candidate.dayName}}</h2><span class="pill" [class.green]="candidate.finished">{{candidate.finished?'Seduta conclusa':'Serie registrate'}}</span></div><p>{{candidate.planName}} · {{candidate.date.split('-').reverse().join('/')}}</p><p><strong>{{candidate.completed}} serie allenanti completate</strong> · {{candidate.warmups}} riscaldamenti</p><p class="subtle">Nell’archivio attuale: {{candidate.currentCompleted}} serie allenanti completate.</p><small>{{candidate.source}}</small>
  <details><summary>Controlla esercizi, carichi e ripetizioni</summary>@for(exercise of candidate.exercises;track $index){<h3>{{exercise.name}}</h3><ul>@for(set of exercise.sets;track $index){<li>{{set.kind==='warmup'?'Riscaldamento':'Serie '+set.number}} · {{set.weight}} kg × {{set.reps}} · {{set.completed?'registrata':'da completare'}}</li>}</ul>}</details>
  <button type="button" class="primary full-width" [disabled]="recovery.busy()" (click)="restore(candidate)">Recupera questa seduta</button></article>}</div>
  @if(recovery.searched()&&!recovery.candidates().length){<section class="card"><p>Se avevi registrato da un’altra icona iPhone o da Safari, apri quello stesso collegamento: il suo archivio locale può essere separato. Non cancellare l’icona precedente né i dati Safari.</p><p class="subtle">Una copia esportata in File può contenere la seduta anche quando le versioni server disponibili non la contengono.</p><a class="button ghost" routerLink="/allenamenti">Controlla lo storico attuale</a></section>}
}@else{<section class="card"><p>Accedi con il tuo account Super Admin per consultare le copie del tuo archivio.</p></section>}
`,
  styles: [
    `:host{display:block}.page-heading{margin-bottom:20px}.page-heading h1{margin:20px 0 10px}.page-heading p{line-height:1.6}.recovery-search{display:grid;gap:16px}.recovery-search label{display:grid;gap:8px;font-size:14px}.recovery-search button{min-height:48px}.recovery-status{font-size:13px;line-height:1.7;margin:20px 0;overflow-wrap:anywhere}.recovery-results{display:grid;gap:18px}.recovery-results p{font-size:13px;line-height:1.65;margin:10px 0}.recovery-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.recovery-heading h2{font-size:21px;line-height:1.3;overflow-wrap:anywhere}.recovery-heading .pill{flex:none;font-size:10px}.recovery-results small{display:block;color:var(--muted);font-size:11px;line-height:1.6}.recovery-results details{margin:16px 0;font-size:12px;line-height:1.65}.recovery-results summary{padding:12px 0;cursor:pointer}.recovery-results h3{font-size:13px;margin:16px 0 6px}.recovery-results ul{padding-left:18px}.recovery-results button{min-height:48px}:host>.card p{line-height:1.7;font-size:13px;margin-bottom:14px}@media(max-width:359px){.recovery-heading{flex-direction:column}}`,
  ],
})
export class WorkoutRecoveryComponent {
  auth = inject(AuthService);
  recovery = inject(WorkoutRecoveryService);
  private confirmation = confirmationForContext();
  today = localDate();
  date =
    inject(ActivatedRoute).snapshot.queryParamMap.get("date") || this.today;
  private store = inject(Store);
  private started = false;
  constructor() {
    effect(() => {
      if (!this.started && this.store.ready() && this.auth.canManageBackups()) {
        this.started = true;
        queueMicrotask(() => void this.recovery.scan(this.date));
      }
    });
  }
  async fromFile(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.recovery.message.set(
        "Il backup supera il limite di 50 MB. Nessun dato modificato.",
      );
      return;
    }
    try {
      await this.recovery.scan(
        this.date,
        await importBackup(await file.text()),
      );
    } catch (error) {
      this.recovery.message.set(
        error instanceof Error
          ? error.message
          : "Backup non valido. Nessun dato modificato.",
      );
    }
  }
  async restore(candidate: WorkoutRecoveryCandidate) {
    if (
      !(await this.confirmation.ask(
        `Recuperare “${candidate.dayName}” del ${candidate.date.split("-").reverse().join("/")} con ${candidate.completed} serie allenanti completate? Verrà conservata una copia della situazione attuale. Gli altri allenamenti e il piano restano invariati.`,
      ))
    )
      return;
    await this.recovery.recover(candidate.key);
  }
}
