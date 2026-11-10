import {ExerciseMotionComponent} from '../shared/exercise-motion.component';
import {Component,computed,inject,signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute,Router,RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {buildWorkoutPreview} from '../services/workout-preview';
import {confirmationForContext} from '../services/confirmation';
import {ExerciseThumbComponent} from '../shared/exercise-thumb.component';
import {IconComponent} from '../shared/icon.component';
import {TrainingPlanExercise,localDate} from '../models/domain';

@Component({standalone:true,imports:[ExerciseMotionComponent,RouterLink,ExerciseThumbComponent,IconComponent],templateUrl:'./workout-preview.component.html',styleUrls:['./workout-preview.component.css','./workout-preview-v3.css']})
export class WorkoutPreviewComponent {
  readonly s=inject(Store);
  private route=inject(ActivatedRoute);
  private scheduledId=signal('');private dayId=signal('');private returnTo=signal('');
  readonly preview=computed(()=>buildWorkoutPreview(this.s.data(),{scheduledId:this.scheduledId(),dayId:this.dayId()}));
  readonly backPath=computed(()=>{
    const back=this.returnTo();
    if(back==='home')return '/';
    if(back==='piani')return '/piani';
    if(back==='piano'&&this.preview().planId)return '/piano/'+encodeURIComponent(this.preview().planId!);
    return back==='calendario'||this.scheduledId()?'/calendario':'/piani';
  });
  readonly backParams=computed(()=>this.backPath()==='/calendario'&&this.preview().date?{date:this.preview().date}:this.backPath()==='/piani'&&this.preview().planId?{plan:this.preview().planId,...(this.preview().week?{week:this.preview().week}:{})}:{});
  constructor(){
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params=>{
      this.scheduledId.set(params.get('scheduled')||'');this.dayId.set(params.get('day')||'');this.returnTo.set(params.get('return')||'');
    });
  }
  private router=inject(Router,{optional:true});private confirmation=confirmationForContext();
  readonly starting=signal(false);
  private event=computed(()=>this.scheduledId()?this.s.data().scheduledWorkouts.find(row=>row.id===this.scheduledId()):undefined);
  private previewDayId=computed(()=>this.event()?.dayId||this.dayId());
  /** Allenamento già aperto proprio per questa scheda/giorno. */
  readonly openHere=computed(()=>{const draft=this.s.draft();return !!draft&&(draft.dayId===this.previewDayId()||!!this.event()&&draft.id===this.event()!.workoutId);});
  readonly openElsewhere=computed(()=>!!this.s.draft()&&!this.openHere());
  readonly canStart=computed(()=>{
    const preview=this.preview();if(!preview.available||!preview.exercises.length)return false;
    if(this.s.data().plans.find(plan=>plan.id===preview.planId)?.completedAt)return false;
    const event=this.event();if(event&&this.s.data().workouts.some(w=>w.id===event.workoutId&&w.status==='completed'))return false;
    return true;
  });
  readonly startLabel=computed(()=>this.openHere()?'Riprendi allenamento':this.preview().date&&this.preview().date!>localDate()?'Inizia oggi':'Inizia allenamento');
  async startNow(){
    if(this.starting())return;
    if(this.openHere()){await this.router?.navigateByUrl('/sessione');return;}
    this.starting.set(true);
    try{
      // Stessa regola della scheda: una seduta programmata nel passato si registra nella sua data, una futura oggi (con conferma).
      const today=localDate(),dayId=this.previewDayId(),day=this.s.data().days.find(row=>row.id===dayId);
      const event=this.event()||(day?.sessionDate?this.s.data().scheduledWorkouts.find(row=>row.dayId===dayId):this.s.data().scheduledWorkouts.find(row=>(row.kind??'workout')==='workout'&&row.dayId===dayId&&row.date===today&&!row.workoutId));
      let ok=false;
      if(event){
        if(event.date>today&&!await this.confirmation.ask('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;
        const linked=event.workoutId?this.s.data().workouts.find(w=>w.id===event.workoutId):undefined,date=linked?.status==='draft'||event.date>today?undefined:event.date;
        ok=await this.s.startScheduled(event.id,date);
      }else{
        if(day?.sessionDate&&day.sessionDate>today&&!await this.confirmation.ask('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;
        ok=await this.s.start(dayId);
      }
      if(ok)await this.router?.navigateByUrl('/sessione');
    }
    finally{this.starting.set(false);}
  }
  /** Miglior serie dell'ultima volta che hai fatto l'esercizio. */
  lastTime(exerciseId:string|undefined){
    if(!exerciseId)return '';
    const data=this.s.data(),workouts=data.workouts.filter(w=>w.status==='completed').sort((a,b)=>b.date.localeCompare(a.date)||(b.endedAt||'').localeCompare(a.endedAt||''));
    for(const workout of workouts){
      const rows=data.workoutExercises.filter(row=>row.workoutId===workout.id&&row.exerciseId===exerciseId);if(!rows.length)continue;
      const ids=new Set(rows.map(row=>row.id)),sets=data.sets.filter(set=>ids.has(set.workoutExerciseId)&&set.completed&&set.kind!=='warmup');if(!sets.length)continue;
      const best=[...sets].sort((a,b)=>b.weight-a.weight||b.reps-a.reps)[0],mode=rows[0].loadMode;
      return mode==='bodyweight'||!best.weight?best.reps+' rip.':this.s.formatWeight(best.weight)+' '+this.s.settings().unit+' × '+best.reps;
    }
    return '';
  }
  date(value:string){const date=new Date(value+'T12:00:00');return Number.isNaN(date.getTime())?value:date.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
  range(min:number|undefined,max:number|undefined){return min===undefined?String(max??'—'):max===undefined||max===min?String(min):min+'–'+max;}
  rest(seconds:number){if(seconds<60)return seconds.toLocaleString('it-IT')+' s';const minutes=Math.floor(seconds/60),remaining=seconds%60;return minutes+' min'+(remaining?' '+remaining.toLocaleString('it-IT')+' s':'');}
  hasAdvice(item:Readonly<TrainingPlanExercise>,description?:string){return !!(item.warmupNotes||item.reference||item.notes||description);}
}
