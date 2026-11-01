import {Component,computed,inject,signal} from '@angular/core';
import {NavigationEnd,Router} from '@angular/router';
import {toSignal} from '@angular/core/rxjs-interop';
import {filter,map} from 'rxjs';
import {routePath} from '../services/mobile-navigation';
import {Store} from '../services/store';
import {WorkoutResumeService,validWorkoutUi} from '../services/workout-resume';
import {DataSet,WorkoutUiState} from '../models/domain';
import {formatSeconds,remainingSeconds} from '../services/rest-clock';
import {recordingTimerState,toggleWorkoutTimer} from '../services/workout-timer';
import {IconComponent} from './icon.component';
@Component({selector:'gt-workout-clock',standalone:true,imports:[IconComponent],template:`
@if(visible();as timer){<section class="workout-clock" aria-label="Recupero dell’allenamento in corso">
 @if(context()){<span class="timer-context">{{context()}}</span>}
 <div class="timer-row"><gt-icon name="clock"/><div class="timer-value"><span>{{remaining()===0&&!timer.paused?'Recupero terminato':timer.paused?'Recupero in pausa':'Recupero'}}</span><strong role="timer" aria-live="off">{{format(remaining())}}</strong><small>{{format(elapsed())}} trascorsi</small></div>
 <button type="button" class="timer-toggle" (click)="toggle()" [disabled]="busy()||(!remaining()&&!timer.paused)" [attr.aria-label]="timer.paused?'Riprendi recupero':'Metti recupero in pausa'" [title]="timer.paused?'Riprendi recupero':'Metti recupero in pausa'">@if(timer.paused){<gt-icon name="play"/>}@else{<span aria-hidden="true">Ⅱ</span>}</button>
 <button type="button" class="timer-return" (click)="returnToRecording()" [disabled]="busy()">Torna alla serie<gt-icon name="arrow"/></button></div>
 </section>}`,styleUrl:'./workout-clock.component.css'})
export class WorkoutClockComponent {
 readonly router=inject(Router);readonly s=inject(Store);private resume=inject(WorkoutResumeService,{optional:true})||new WorkoutResumeService();
 // Router.url is not reactive: when the dock is hidden, no clock signal is read
 // by the template. Track completed navigation so leaving recording reveals it
 // immediately, including when the timer is paused and its state is unchanged.
 private routeUrl=toSignal(this.router.events.pipe(filter((event):event is NavigationEnd=>event instanceof NavigationEnd),map(event=>event.urlAfterRedirects)),{initialValue:this.router.url||'/'});
 readonly clock=signal(Date.now());readonly busy=signal(false);readonly format=formatSeconds;
 private destroyed=false;
 state=computed(()=>{this.clock();const draft=this.s.draft();if(!draft)return undefined;const state=this.read(draft.id);return state&&(state.restEnd>0||state.paused)&&state.restTotal>0?state:undefined;});
 visible=computed(()=>this.outsideSession()?this.state():undefined);
 remaining=computed(()=>{const state=this.state();return state?state.paused?state.pausedSeconds:remainingSeconds(state.restEnd,this.clock()):0;});
 elapsed=computed(()=>{const state=this.state();return state?state.paused?Math.max(0,state.restTotal-state.pausedSeconds):Math.max(0,Math.floor((this.clock()-state.restEnd)/1000)+state.restTotal):0;});
 context=computed(()=>{const state=this.state();if(!state)return '';const exercise=this.s.data().workoutExercises.find(e=>e.id===state.exerciseId&&e.workoutId===state.id);const set=this.s.data().sets.find(s=>s.id===state.setId&&s.workoutExerciseId===exercise?.id);return exercise?(set?'Serie '+set.number+' · ':'')+exercise.name:this.s.draft()?.dayName||'';});
 private timer=setInterval(()=>this.refresh(),1000);
 private refresh=()=>this.clock.set(Date.now());
 constructor(){if(typeof window!=='undefined'){window.addEventListener?.('pageshow',this.refresh);window.addEventListener?.('storage',this.refresh);}if(typeof document!=='undefined')document.addEventListener?.('visibilitychange',this.refresh);}
 private read(id:string,persisted=this.s.data().workoutUi.find(ui=>ui.id===id)){return this.resume.read(this.s.archiveKey(),id,persisted,this.s.archiveRevision());}
 private outsideSession(){return routePath(this.routeUrl())!=='/sessione';}
 private async update(transform:(state:WorkoutUiState,data:DataSet)=>WorkoutUiState){
  if(this.busy()||!this.outsideSession())return false;
  const archive=this.s.archiveKey(),id=this.s.draft()?.id;if(!id)return false;this.busy.set(true);
  try{
   if(await this.s.settled()===false||this.destroyed||archive!==this.s.archiveKey()||id!==this.s.draft()?.id||!this.outsideSession())return false;
   let next:WorkoutUiState|undefined;
   const saved=await this.s.change(data=>{
    if(this.destroyed||archive!==this.s.archiveKey()||!this.outsideSession()||!data.workouts.some(w=>w.id===id&&w.status==='draft'))return;
    const state=this.read(id,data.workoutUi.find(ui=>ui.id===id));if(!state||!state.restTotal||!state.paused&&!state.restEnd)return;
    const result=transform(state,data);if(!validWorkoutUi(result))return;next=result;
    const index=data.workoutUi.findIndex(ui=>ui.id===id);if(index<0)data.workoutUi.push(result);else data.workoutUi[index]=result;
   },'',false);
   if(!saved||!next||this.destroyed||archive!==this.s.archiveKey()||id!==this.s.draft()?.id)return false;
   this.resume.write(archive,next,this.s.archiveRevision());this.refresh();return true;
  }finally{this.busy.set(false);}
 }
 async toggle(){if(!this.remaining()&&!this.state()?.paused)return;await this.update(state=>toggleWorkoutTimer(state,Date.now()));}
 async returnToRecording(){const archive=this.s.archiveKey(),id=this.s.draft()?.id;if(await this.update((state,data)=>recordingTimerState(state,data,Date.now()))&&!this.destroyed&&archive===this.s.archiveKey()&&id===this.s.draft()?.id)await this.router.navigateByUrl('/sessione');}
 ngOnDestroy(){this.destroyed=true;clearInterval(this.timer);if(typeof window!=='undefined'){window.removeEventListener?.('pageshow',this.refresh);window.removeEventListener?.('storage',this.refresh);}if(typeof document!=='undefined')document.removeEventListener?.('visibilitychange',this.refresh);}
}
