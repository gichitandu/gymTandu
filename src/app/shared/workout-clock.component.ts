import {Component,computed,inject,signal} from '@angular/core';
import {Router,RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {formatSeconds,remainingSeconds} from '../services/rest-clock';
@Component({selector:'gt-workout-clock',standalone:true,imports:[RouterLink],template:`
@if(!router.url.startsWith('/sessione')){@if(state();as timer){<a routerLink="/sessione" class="workout-clock" aria-label="Apri il cronometro del recupero"><span>{{timer.paused?'Recupero in pausa':'Cronometro recupero'}}</span><strong>{{format(elapsed())}}</strong><small>{{format(remaining())}} rimanenti · Apri timer</small></a>}}`,styles:[`
.workout-clock{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(88px + env(safe-area-inset-bottom));z-index:36;display:grid;gap:3px;padding:12px 16px;border:1px solid var(--blue);border-radius:18px;background:var(--card);color:var(--text);box-shadow:0 8px 30px #0006;text-decoration:none;max-width:calc(100vw - 24px)}span,small{font-size:11px;color:var(--muted)}strong{font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums}@media(min-width:1000px){.workout-clock{bottom:24px}}` ]})
export class WorkoutClockComponent {
 router=inject(Router);s=inject(Store);clock=signal(Date.now());format=formatSeconds;
 state=computed(()=>{const draft=this.s.draft();return draft?this.s.data().workoutUi.find(ui=>ui.id===draft.id&&(ui.restEnd>0||ui.paused)):undefined;});
 remaining=computed(()=>{const state=this.state();return state?state.paused?state.pausedSeconds:remainingSeconds(state.restEnd,this.clock()):0;});
 elapsed=computed(()=>{const state=this.state();return state?state.paused?Math.max(0,state.restTotal-state.pausedSeconds):Math.max(0,Math.floor((this.clock()-state.restEnd)/1000)+state.restTotal):0;});
 private timer=setInterval(()=>this.clock.set(Date.now()),1000);
 ngOnDestroy(){clearInterval(this.timer);}
}
