import { confirmationForContext } from '../services/confirmation';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ExternalTimerService } from '../services/external-timer';
import { Store } from '../services/store';
@Component({standalone:true,selector:'gt-open-workouts',imports:[DatePipe,RouterLink],template:`
@for(w of s.openWorkouts();track w.id){<section class="card pending-session" aria-label="Allenamento da riprendere"><div><span class="pill">Da riprendere</span><h3>{{w.dayName}}</h3><p>{{w.planName}} · {{w.date | date:'dd/MM/yyyy'}}</p><small>{{completed(w.id)}} / {{sets(w.id).length}} serie</small></div><div class="pending-actions"><a class="button primary" routerLink="/sessione" [queryParams]="{workout:w.id}">Riprendi</a><details><summary aria-label="Opzioni sessione aperta">⋯</summary><button class="ghost" (click)="close(w.id)" [disabled]="!!closing()||s.busy()">{{closing()===w.id?'Chiusura…':'Termina allenamento'}}</button></details></div></section>}
`,styles:[`.pending-session{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;padding:16px}.pending-session>div:first-child{min-width:0}.pending-session .pill{font-size:10px;color:#eac16b}.pending-session h3{font-size:17px;margin:8px 0 4px;overflow-wrap:anywhere}.pending-session p,.pending-session small{font-size:12px;color:var(--muted);margin:0;line-height:1.5}.pending-actions{display:flex;gap:8px;align-items:center;flex:none}.pending-actions>a{min-height:44px;padding:10px 12px;font-size:13px}.pending-actions details{position:relative}.pending-actions summary{min-width:44px;min-height:44px;display:grid;place-items:center;cursor:pointer;list-style:none;font-size:22px}.pending-actions summary::-webkit-details-marker{display:none}.pending-actions details>button{position:absolute;right:0;top:100%;z-index:8;min-width:190px;box-shadow:0 12px 32px #0006;background:var(--raised);white-space:nowrap}@media(max-width:400px){.pending-session{flex-wrap:wrap}.pending-actions{margin-left:auto}}`]})
export class OpenWorkoutsComponent {
 private confirmation=confirmationForContext();
 s=inject(Store);closing=signal('');private timer=inject(ExternalTimerService,{optional:true});
 sets(id:string){return this.s.workoutExercises(id).flatMap(exercise=>this.s.sets(exercise.id));}
 completed(id:string){return this.sets(id).filter(set=>set.completed).length;}
 async close(id:string){
  if(this.closing()||this.s.busy())return;
  const workout=this.s.openWorkouts().find(w=>w.id===id);if(!workout)return;
  this.closing.set(id);
  try{
  if(!await this.confirmation.ask({title:'Terminare l’allenamento?',confirmLabel:'Termina allenamento',detail:workout.planName+' · '+workout.dayName+'\n'+workout.date.split('-').reverse().join('/')+' · '+this.completed(id)+' serie confermate',message:`Terminare “${workout.planName} · ${workout.dayName}”? Le serie e tutti i valori inseriti resteranno nello storico. Le serie non confermate non saranno segnate come eseguite.`,tone:'info'}))return;
  await this.s.settled();if(await this.s.finish(true,id))this.timer?.stop();
  }finally{this.closing.set('');}
 }
}
