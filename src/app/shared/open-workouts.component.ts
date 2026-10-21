import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ExternalTimerService } from '../services/external-timer';
import { Store } from '../services/store';
@Component({standalone:true,selector:'gt-open-workouts',imports:[DatePipe,RouterLink],template:`
@if(s.openWorkouts().length){<section class="card" style="margin-bottom:20px" aria-label="Allenamenti rimasti aperti">
<h2>Allenamenti rimasti aperti ({{s.openWorkouts().length}})</h2>
<p class="subtle">Queste sessioni bloccano la registrazione di un altro giorno. Puoi controllarle o chiuderle conservando tutti i valori inseriti.</p>
<div class="list" style="margin-top:16px">@for(w of s.openWorkouts();track w.id){<article class="card">
<h3>{{w.dayName}}</h3><p>{{w.planName}} · {{w.date | date:'dd/MM/yyyy'}}</p>
<p class="subtle">{{completed(w.id)}} / {{sets(w.id).length}} serie confermate · Aperto il {{w.startedAt | date:'dd/MM/yyyy HH:mm'}}</p>
<div class="actions" style="margin-top:12px"><a class="button" routerLink="/sessione" [queryParams]="{workout:w.id}">Apri e controlla</a><button class="primary" (click)="close(w.id)" [disabled]="!!closing() || s.busy()">{{closing()===w.id?'Chiusura…':'Termina allenamento'}}</button></div>
</article>}</div></section>}`})
export class OpenWorkoutsComponent {
 s=inject(Store);closing=signal('');private timer=inject(ExternalTimerService,{optional:true});
 sets(id:string){return this.s.workoutExercises(id).flatMap(exercise=>this.s.sets(exercise.id));}
 completed(id:string){return this.sets(id).filter(set=>set.completed).length;}
 async close(id:string){
  if(this.closing()||this.s.busy())return;
  const workout=this.s.openWorkouts().find(w=>w.id===id);if(!workout)return;
  if(!confirm(`Terminare “${workout.planName} · ${workout.dayName}” del ${workout.date.split('-').reverse().join('/')}? Le serie e tutti i valori inseriti resteranno nello storico. Le serie non confermate non saranno segnate come eseguite.`))return;
  this.closing.set(id);
  try{await this.s.settled();if(await this.s.finish(true,id))this.timer?.stop();}finally{this.closing.set('');}
 }
}
