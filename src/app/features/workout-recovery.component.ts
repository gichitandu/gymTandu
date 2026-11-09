import {Component, effect, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {AuthService} from '../services/auth';
import {WorkoutRecoveryCandidate, WorkoutRecoveryService} from '../services/workout-recovery';
import {confirmationForContext} from '../services/confirmation';
import {DateFieldComponent} from '../shared/date-field.component';
import {localDate} from '../models/domain';
import {importBackup} from '../services/backup';
import {Store} from '../services/store';
import {IconComponent} from '../shared/icon.component';
@Component({standalone: true, imports: [FormsModule, RouterLink, DateFieldComponent, IconComponent], template: `
<header class="page-heading"><a class="button ghost rc3-back" routerLink="/profilo" [queryParams]="{section:'backup'}"><gt-icon name="back"/>Dati e backup</a><h1>Recupera allenamenti</h1></header>
<section class="card rc3-intro"><span class="rc3-ic" aria-hidden="true"><gt-icon name="shield"/></span><p>Cerca una seduta nelle copie disponibili. Puoi recuperare solo quell’allenamento, <strong>mantenendo il resto dell’archivio.</strong></p></section>
@if(auth.canManageBackups()){
  <section class="card recovery-search"><label>Data dell’allenamento<gt-date-field aria-label="Data dell’allenamento da recuperare" [max]="today" [(ngModel)]="date"/></label><button type="button" class="primary" [disabled]="recovery.busy()||!date" (click)="recovery.scan(date)"><gt-icon name="search"/>{{recovery.busy()?'Controllo delle copie…':'Cerca copie dell’allenamento'}}</button></section>
  <details class="card rc3-file"><summary><gt-icon name="note"/>Cerca anche in un backup salvato in File</summary><p>Seleziona il backup GymTrack: verranno mostrate solo le sedute della data scelta. Il file non sostituisce automaticamente l’archivio.</p><input type="file" accept=".json,application/json" aria-label="Backup per recuperare una singola seduta" [disabled]="recovery.busy()" (change)="fromFile($event)"/></details>
  <p class="recovery-status" role="status">{{recovery.message()}}</p>
  <div class="recovery-results">@for(candidate of recovery.candidates();track candidate.key){<article class="card"><div class="recovery-heading"><h2>{{candidate.dayName}}</h2><span class="pill" [class.green]="candidate.finished">{{candidate.finished?'Seduta conclusa':'Serie registrate'}}</span></div><p>{{candidate.planName}} · {{candidate.date.split('-').reverse().join('/')}}</p><p><strong>{{candidate.completed}} serie allenanti completate</strong> · {{candidate.warmups}} riscaldamenti</p><div class="rc3-compare" aria-hidden="true"><span>Questa copia</span><i><b [style.width.%]="bar(candidate.completed,candidate.currentCompleted)"></b></i><em>{{candidate.completed}}</em><span>Archivio attuale</span><i><b class="now" [style.width.%]="bar(candidate.currentCompleted,candidate.completed)"></b></i><em>{{candidate.currentCompleted}}</em></div><p class="subtle">Nell’archivio attuale: {{candidate.currentCompleted}} serie allenanti completate.</p><small>{{candidate.source}}</small>
  <details><summary>Controlla esercizi, carichi e ripetizioni</summary>@for(exercise of candidate.exercises;track $index){<h3>{{exercise.name}}</h3><ul>@for(set of exercise.sets;track $index){<li>{{set.kind==='warmup'?'Riscaldamento':'Serie '+set.number}} · {{set.weight}} kg × {{set.reps}} · {{set.completed?'registrata':'da completare'}}</li>}</ul>}</details>
  <button type="button" class="primary full-width" [disabled]="recovery.busy()" (click)="restore(candidate)">Recupera questa seduta</button></article>}</div>
  @if(recovery.searched()&&!recovery.candidates().length){<section class="card rc3-tip"><p>Se avevi registrato da un’altra icona iPhone o da Safari, apri quello stesso collegamento: il suo archivio locale può essere separato. Non cancellare l’icona precedente né i dati Safari.</p><p class="subtle">Una copia esportata in File può contenere la seduta anche quando le versioni server disponibili non la contengono.</p><a class="button ghost" routerLink="/allenamenti">Controlla lo storico attuale</a></section>}
}@else{<section class="card"><p>Accedi con il tuo account Super Admin per consultare le copie del tuo archivio.</p></section>}
`, styles: [`:host{display:block}.page-heading{margin-bottom:20px}.page-heading h1{margin:20px 0 10px}.page-heading p{line-height:1.6}.recovery-search{display:grid;gap:16px}.recovery-search label{display:grid;gap:8px;font-size:14px}.recovery-search button{min-height:48px}.recovery-status{font-size:13px;line-height:1.7;margin:20px 0;overflow-wrap:anywhere}.recovery-results{display:grid;gap:18px}.recovery-results p{font-size:13px;line-height:1.65;margin:10px 0}.recovery-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.recovery-heading h2{font-size:21px;line-height:1.3;overflow-wrap:anywhere}.recovery-heading .pill{flex:none;font-size:10px}.recovery-results small{display:block;color:var(--muted);font-size:11px;line-height:1.6}.recovery-results details{margin:16px 0;font-size:12px;line-height:1.65}.recovery-results summary{padding:12px 0;cursor:pointer}.recovery-results h3{font-size:13px;margin:16px 0 6px}.recovery-results ul{padding-left:18px}.recovery-results button{min-height:48px}:host>.card p{line-height:1.7;font-size:13px;margin-bottom:14px}@media(max-width:359px){.recovery-heading{flex-direction:column}}
.rc3-back{display:inline-flex;align-items:center;gap:4px;min-height:40px;padding:0 12px 0 6px;border-radius:13px;border:1px solid var(--line);font-size:14px;font-weight:700}.rc3-back gt-icon{width:18px;height:18px}.page-heading{margin-bottom:12px}.page-heading h1{margin:14px 0 0;font-size:24px;font-weight:900;letter-spacing:-.02em}
.card{border:1px solid color-mix(in srgb,var(--text) 12%,transparent);border-radius:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--text) 6%,var(--card)),var(--card));box-shadow:inset 0 1px color-mix(in srgb,#fff 5%,transparent)}
.rc3-intro{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;padding:14px}.rc3-intro p{margin:0;font-size:13px;line-height:1.5;color:color-mix(in srgb,var(--text) 82%,var(--muted))}.rc3-intro strong{color:var(--text)}
.rc3-ic{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:12px;color:var(--green);background:color-mix(in srgb,var(--green) 14%,transparent)}.rc3-ic gt-icon{width:18px;height:18px}
.recovery-search{padding:14px;gap:12px}.recovery-search label{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.recovery-search button{min-height:52px;gap:8px;border-radius:16px;font-weight:800}.recovery-search button gt-icon{width:17px;height:17px}
.rc3-file{margin-top:10px;padding:0 14px}.rc3-file summary{display:flex;align-items:center;gap:10px;min-height:48px;font-size:13px;font-weight:600}.rc3-file summary gt-icon{width:16px;height:16px;color:var(--muted)}.rc3-file[open]{padding-bottom:14px}.rc3-file p{font-size:12px;line-height:1.5;color:var(--muted)}
.recovery-status{margin:14px 4px;font-weight:700;color:var(--green)}
.recovery-results{gap:10px}.recovery-results article{padding:14px}.recovery-results article:first-child{border-color:color-mix(in srgb,var(--accent-text) 40%,transparent)}.recovery-heading h2{font-size:17px;font-weight:800}
.rc3-compare{display:grid;grid-template-columns:auto 1fr auto;gap:8px 10px;align-items:center;margin:12px 0 4px;font-size:12px;color:var(--muted)}.rc3-compare i{height:8px;border-radius:5px;background:color-mix(in srgb,var(--text) 10%,transparent);overflow:hidden}.rc3-compare b{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--accent),var(--accent-text))}.rc3-compare b.now{background:color-mix(in srgb,var(--text) 35%,transparent)}.rc3-compare em{font-style:normal;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums}
.recovery-results button{border-radius:15px;font-weight:800}.rc3-tip{padding:14px;border-color:color-mix(in srgb,var(--warning,#fbbf24) 30%,transparent)}`]})
export class WorkoutRecoveryComponent {
  /* Barra di confronto: solo presentazione. */
  bar(value:number,other:number){const max=Math.max(1,value,other);return Math.round(value/max*100);}
  auth = inject(AuthService); recovery = inject(WorkoutRecoveryService); private confirmation = confirmationForContext();
  today = localDate(); date = inject(ActivatedRoute).snapshot.queryParamMap.get('date') || this.today;
  private store = inject(Store); private started = false;
  constructor() {effect(() => {if (!this.started && this.store.ready() && this.auth.canManageBackups()) {this.started = true; queueMicrotask(() => void this.recovery.scan(this.date));}});}
  async fromFile(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {this.recovery.message.set('Il backup supera il limite di 50 MB. Nessun dato modificato.'); return;}
    try {await this.recovery.scan(this.date, await importBackup(await file.text()));}
    catch(error) {this.recovery.message.set(error instanceof Error ? error.message : 'Backup non valido. Nessun dato modificato.');}
  }
  async restore(candidate: WorkoutRecoveryCandidate) {
    if (!await this.confirmation.ask(`Recuperare “${candidate.dayName}” del ${candidate.date.split('-').reverse().join('/')} con ${candidate.completed} serie allenanti completate? Verrà conservata una copia della situazione attuale. Gli altri allenamenti e il piano restano invariati.`)) return;
    await this.recovery.recover(candidate.key);
  }
}
