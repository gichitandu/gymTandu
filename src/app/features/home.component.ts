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
  styleUrls: ["./home-redesign.css"],
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
  initial = computed(() => this.firstName().slice(0, 1).toLocaleUpperCase('it-IT'));
  weekMinutes = computed(() => Math.round(this.s.completed().filter((w) => this.week.some((day) => day.date === w.date)).reduce((sum, w) => sum + (w.duration || 0), 0)));
  goalRemaining = computed(() => {
    const goal = this.goals()?.workoutsPerWeek;
    return goal ? Math.max(0, goal - this.weekCount()) : undefined;
  });
  headline = computed(() => {
    const left = this.goalRemaining();
    if (left === undefined) return this.weekCount() ? 'ottimo ritmo.' : 'pronto a partire?';
    if (left === 0) return 'obiettivo raggiunto.';
    return left === 1 ? 'sei a un passo.' : 'ancora ' + left + ' allenamenti.';
  });
  /** Giorni consecutivi (fino a oggi, o a ieri se oggi è libero) con un allenamento svolto o un giorno di riposo registrato. */
  streak = computed(() => {
    const active = new Set<string>(this.s.completed().map((w) => w.date));
    for (const event of this.s.data().scheduledWorkouts) if (event.kind === 'rest') active.add(event.date);
    const cursor = new Date(this.today + 'T12:00:00');
    if (!active.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let days = 0;
    while (active.has(localDate(cursor))) { days++; cursor.setDate(cursor.getDate() - 1); }
    return days;
  });
  dayInfo(date: string): { state: 'done' | 'cardio' | 'rest' | 'plan' | 'empty'; height: number } {
    const workouts = this.s.completed().filter((w) => w.date === date);
    if (workouts.length) return { state: 'done', height: Math.min(100, Math.max(34, Math.round(workouts.reduce((sum, w) => sum + (w.duration || 0), 0) / 75 * 100))) };
    const events = this.s.data().scheduledWorkouts.filter((e) => e.date === date);
    const other = events.find((e) => e.kind === 'cardio' || e.kind === 'mobility' || e.kind === 'other');
    if (other) return { state: 'cardio', height: 50 };
    if (events.some((e) => e.kind === 'rest')) return { state: 'rest', height: 30 };
    if (this.planned(date)) return { state: 'plan', height: 0 };
    return { state: 'empty', height: 0 };
  }
  /** Allenamenti completati per settimana nelle ultime 8, come punti 0..100 di una polilinea 132x54. */
  trend = computed(() => {
    const start = new Date(this.today + 'T12:00:00');
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 49);
    const counts = Array.from({ length: 8 }, (_, i) => {
      const from = new Date(start); from.setDate(from.getDate() + i * 7);
      const to = new Date(from); to.setDate(to.getDate() + 6);
      const a = localDate(from), b = localDate(to);
      return this.s.completed().filter((w) => w.date >= a && w.date <= b).length;
    });
    const max = Math.max(1, ...counts);
    const points = counts.map((n, i) => ({ x: 4 + i * (124 / 7), y: 48 - (n / max) * 40 }));
    const line = points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
    const last = points[points.length - 1];
    return { line, area: line + ' L' + last.x.toFixed(1) + ' 54 L' + points[0].x.toFixed(1) + ' 54Z', x: last.x, y: last.y, total: counts.reduce((a, b) => a + b, 0) };
  });
  energyPct = computed(() => Math.min(100, Math.round(((this.wellness()?.energy || 0) / 5) * 100)));
  sleepPct = computed(() => Math.min(100, Math.round(((this.wellness()?.sleepMinutes || 0) / 480) * 100)));
  caloriePct = computed(() => { const goal = this.goals()?.calories; return goal ? Math.min(100, Math.round(this.totals().calories / goal * 100)) : 0; });
  upcomingMuscles = computed(() => {
    const dayId = this.upcoming()?.dayId;
    if (!dayId) return [] as string[];
    const groups = this.s.data().muscleGroups, exercises = this.s.data().exercises, names: string[] = [];
    for (const row of this.s.planExercises(dayId)) {
      const groupId = exercises.find((exercise) => exercise.id === row.exerciseId)?.muscleGroupId;
      const name = groups.find((group) => group.id === groupId)?.name;
      if (name && !names.includes(name)) names.push(name);
    }
    return names.slice(0, 3);
  });
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
