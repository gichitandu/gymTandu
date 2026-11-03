import { DESIGN_DIRECTIVES } from '../design/design-directives';
import {sleepLabel} from '../services/wellness';
import {AppFeaturesService} from '../services/app-features';
import { AuthService } from '../services/auth';
import { BackupReminderComponent } from "../shared/backup-reminder.component";
import { Component, computed, inject } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { localDate } from "../models/domain";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { TodayService } from '../services/today';
interface HomeUpcomingSession {
  kind:'draft'|'scheduled'|'plan';title:string;planName:string;planId:string;dayId:string;
  eventId?:string;date?:string;time?:string;durationMinutes?:number;periodLabel:string;
  exerciseCount:number;setCount:number;activePlan:boolean;
}

@Component({
  standalone: true,
  imports: [...DESIGN_DIRECTIVES,
    BackupReminderComponent,
    RouterLink,
    IconComponent,
    StatusComponent,
  ],
  templateUrl: "./home.component.html",
  styleUrls: ["./home-simple.css", "./home-reference.css"],
})
export class HomeComponent {
  s = inject(Store);
  features=inject(AppFeaturesService,{optional:true});
  auth=inject(AuthService,{optional:true});
  router = inject(Router);
  private todayClock = inject(TodayService,{optional:true});
  get today() { return this.todayClock?.date() || localDate(); }
  wellness=computed(()=>this.s.data().wellnessLogs.find(row=>row.date===this.today));
  sleepLabel=sleepLabel;
  focusLabel=computed(()=>{
    const dayId=this.s.draft()?.dayId||this.nextScheduled()?.dayId||this.nextDay()?.id;
    const exerciseId=dayId?this.s.planExercises(dayId)[0]?.exerciseId:undefined;
    const groupId=this.s.data().exercises.find(exercise=>exercise.id===exerciseId)?.muscleGroupId;
    return this.s.data().muscleGroups.find(group=>group.id===groupId)?.name||'Esplora';
  });
  weeklyProgress=computed(()=>{const goal=this.goals()?.workoutsPerWeek;return goal?Math.min(100,Math.round(this.weekCount()/goal*100)):0;});
  trainingMinutes=computed(()=>Math.round(this.s.completed().reduce((sum,row)=>sum+row.duration,0)));
  goals = computed(() => this.s.settings().goals);
  private concluded(planId:string){return !!this.s.data().plans.find(plan=>plan.id===planId)?.completedAt;}
  nextDay=computed(()=>{const day=this.s.nextDay();return day&&!this.concluded(day.planId)?day:undefined;});
  Math = Math;
  firstName = computed(
    () => this.s.profile().name.trim().split(/\s+/)[0] || "atleta",
  );
  greeting = computed(() => 'Ciao ' + this.firstName());
  get todayLabel() { return new Date(this.today+'T12:00:00').toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }); }
  totals = computed(() =>
    this.s
      .data()
      .meals.filter((m) => m.date === this.today)
      .reduce(
        (a, m) => ({
          calories: a.calories + m.calories,
          protein: a.protein + m.protein,
          carbs: a.carbs + m.carbs,
          fat: a.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
  );
  nextScheduled = computed(
    () =>
      this.s
        .data()
        .scheduledWorkouts.filter(
          (e) =>
            (e.kind??'workout')==='workout' && e.date >= this.today &&
            !this.concluded(e.planId)&&
            !this.s.completed().some((w) => w.id === e.workoutId),
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0],
  );
  upcoming=computed<HomeUpcomingSession|undefined>(()=>{
    const draft=this.s.draft(),event=this.nextScheduled(),day=this.nextDay();
    const selectedDayId=draft?.dayId||event?.dayId||day?.id;
    if(!selectedDayId)return;
    const selectedDay=this.s.data().days.find(item=>item.id===selectedDayId);
    const planId=draft?.planId||event?.planId||day!.planId;
    const plan=this.s.data().plans.find(item=>item.id===planId);
    const schedule=draft?this.s.data().scheduledWorkouts.find(item=>item.workoutId===draft.id):event;
    const rows=draft?this.s.workoutExercises(draft.id):this.s.planExercises(selectedDayId);
    const ids=new Set(rows.map(item=>item.id));
    const setCount=draft?this.s.data().sets.filter(item=>ids.has(item.workoutExerciseId)&&item.kind!=='warmup').length:this.s.planExercises(selectedDayId).reduce((total,item)=>total+item.sets,0);
    const week=draft?.programWeek||selectedDay?.week;
    return {
      kind:draft?'draft':event?'scheduled':'plan',title:draft?.dayName||event?.dayName||day!.name,
      planName:draft?.planName||event?.planName||plan?.name||'',planId,dayId:selectedDayId,
      eventId:!draft?event?.id:undefined,date:draft?.date||event?.date,time:schedule?.time,
      durationMinutes:schedule?.durationMinutes,
      periodLabel:week?'Settimana '+week:selectedDay?'Giorno '+(selectedDay.order+1):'',
      exerciseCount:rows.length,setCount,activePlan:!!plan?.active&&!plan.archived&&!plan.completedAt,
    };
  });
  get todayShortLabel(){return new Date(this.today+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});}
  sessionWhen(session:HomeUpcomingSession){
    if(!session.date)return 'Prossima seduta';
    return (session.date===this.today?'Oggi':this.dateLabel(session.date))+(session.time?' · '+session.time:'');
  }
  sessionPreview(session:HomeUpcomingSession){return session.kind==='scheduled'?{scheduled:session.eventId,return:'home'}:{day:session.dayId,return:'home'};}
  private weekDays = computed(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(this.today+'T12:00:00');
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
    return {
      date: localDate(d),
      label: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][i],
      x: 8 + i * 14,
      y: [74, 40, 20, 13, 20, 40, 74][i],
    };
  }));
  get week() { return this.weekDays(); }
  weekCount = computed(
    () =>
      this.s
        .completed()
        .filter((w) => this.week.some((day) => day.date === w.date)).length,
  );
  done(date: string) {
    return this.s.completed().some((w) => w.date === date);
  }
  planned(date: string) {
    return this.s
      .data()
      .scheduledWorkouts.some(
        (e) =>
          (e.kind??'workout')==='workout' && e.date === date &&
          !this.concluded(e.planId)&&
          !this.s.completed().some((w) => w.id === e.workoutId),
      );
  }
  dayAria(date: string) {
    return (
      this.dateLabel(date) +
      ": " +
      (this.done(date)
        ? "allenamento svolto"
        : this.planned(date)
          ? "allenamento programmato"
          : "nessun allenamento")
    );
  }
  dateLabel(date: string) {
    return new Date(date + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  async start(id: string) {
    const day=this.s.data().days.find(day=>day.id===id);if(day&&this.concluded(day.planId)){await this.router.navigateByUrl('/piano/'+encodeURIComponent(day.planId));return;}
    if (await this.s.start(id)) await this.router.navigateByUrl("/sessione");
  }
  async startEvent(id: string) {
    const e = this.s.data().scheduledWorkouts.find((e) => e.id === id);
    if(e&&this.concluded(e.planId)){await this.router.navigateByUrl('/piano/'+encodeURIComponent(e.planId));return;}
    if (e?.date !== this.today) {
      await this.router.navigate(["/calendario"], {
        queryParams: { date: e?.date },
      });
      return;
    }
    if (await this.s.startScheduled(id))
      await this.router.navigateByUrl("/sessione");
  }
}
