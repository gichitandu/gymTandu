import { ProfileLinkComponent } from '../shared/profile-link.component';
import { DESIGN_DIRECTIVES } from '../design/design-directives';
import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import { OpenWorkoutsComponent } from '../shared/open-workouts.component';
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { ExerciseFilterComponent } from "../shared/exercise-filter.component";
@Component({
  standalone: true,
  styleUrls: ["./account-polish.css", "./history-v3.css"],
  imports: [ProfileLinkComponent,...DESIGN_DIRECTIVES,DateFieldComponent,OpenWorkoutsComponent,
    FormsModule,
    DatePipe,
    RouterLink,
    IconComponent,
    StatusComponent,
    ExerciseFilterComponent,
  ],
  template: `<header class="su-head"><h1>Calendario</h1><div class="su-actions"><a class="su-iconbtn" routerLink="/calendario" [queryParams]="{add:1}" aria-label="Aggiungi al calendario"><gt-icon name="plus"/></a><gt-profile-link/></div></header>
    <nav class="su-seg" aria-label="Vista del calendario"><a routerLink="/calendario">Settimana</a><a routerLink="/calendario" [queryParams]="{view:'month'}">Mese</a><a class="on" aria-current="page" routerLink="/allenamenti">Elenco</a></nav>
    <gt-status />
    <gt-open-workouts />
    @if (selected(); as w) {
      <button type="button" class="history-back" (click)="selectedId.set('')"><gt-icon name="back" />Storico</button>
      <section class="history-done-card">
        <div class="history-done-top"><span class="history-done-pill"><gt-icon name="check"/>Completato</span><span class="history-readonly">{{ s.busy() ? "Salvataggio…" : "Sola lettura" }}</span></div>
        <h2>{{ w.dayName }}</h2>
        <p class="history-done-sub">{{ w.planName }} · {{ longDate(w.date) }}</p>
        <p class="history-done-time">{{ w.startedAt | date: "HH:mm" }} – {{ w.endedAt | date: "HH:mm" }}</p>
        <div class="history-done-stats"><div><b>{{w.duration>0?w.duration:'—'}}</b><small>min</small></div><div><b>{{ setCount(w.id) }}</b><small>serie</small></div><div><b>{{ s.formatWeight(s.volume(w.id)) }}</b><small>{{ s.settings().unit }}</small></div><div><b>{{ repCount(w.id) }}</b><small>rip</small></div></div>
      </section>
      <div class="history-detail-actions"><a class="button ghost" [routerLink]="['/riepilogo',w.id]"><gt-icon name="trophy"/>Riepilogo</a><button type="button" class="ghost" (click)="reopen(w.id)" [disabled]="s.busy()||reopening()||deleting()"><gt-icon name="repeat"/>{{reopening()?'Riapertura…':'Riapri'}}</button></div>
      @if(w.notes){<section class="card history-notes"><gt-icon name="note"/><p>{{w.notes}}</p></section>}
      <div class="history-section-title"><span>Esercizi · {{ s.workoutExercises(w.id).length }}</span><small>R = riscaldamento</small></div>
      @for(exercise of s.workoutExercises(w.id);track exercise.id){<section class="card history-exercise"><h3>{{exercise.name}}</h3>@if(exercise.substitutedFrom){<p class="subtle">Al posto di {{exercise.substitutedFrom.name}} · solo questa seduta</p>}<div class="history-sets">@for(set of s.sets(exercise.id);track set.id){<span class="history-set" [class.done]="set.completed" [class.warm]="set.kind==='warmup'" [attr.aria-label]="'Serie '+set.number+': '+s.formatWeight(set.weight)+' '+s.settings().unit+' per '+set.reps+(set.completed?', confermata':', non eseguita')"><small>{{set.kind==='warmup'?'R':'S'+set.number}}</small><b>{{set.completed?s.formatWeight(set.weight)+'×'+set.reps:'—'}}</b></span>}</div></section>}
      <details class="card history-more"><summary>Altre azioni<gt-icon name="chevron-down"/></summary><div class="history-more-body"><p class="subtle">Per modificare la sessione, riaprila. Puoi configurare l’eliminazione dei terminati in Profilo → Impostazioni.</p><a class="button ghost" routerLink="/profilo" [queryParams]="{section:'settings'}"><gt-icon name="settings"/>Configura eliminazione</a>@if(s.settings().allowCompletedWorkoutDeletion){<button type="button" class="ghost danger" (click)="remove(w.id)" [disabled]="s.busy()||reopening()||deleting()">{{deleting()?'Eliminazione…':'Elimina allenamento'}}</button>}</div></details>
    } @else {
      <details class="history-filter-panel"><summary><gt-icon name="sliders"/>Filtri@if(activeFilters()){<span class="history-filter-count">{{activeFilters()}}</span>}<gt-icon name="chevron-down"/></summary>
      <div gtDesign="history.filters" class="history-filters" role="group" aria-label="Filtri dello storico allenamenti">
        <label class="history-plan-filter"
          >Piano<select gtDesign="history.plan"
            [ngModel]="plan()"
            (ngModelChange)="plan.set($event); day.set('')"
          >
            <option value="">Tutti i piani</option>
            @for (p of planOptions(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select></label
        ><label class="history-day-filter"
          >Giorno<select [ngModel]="day()" (ngModelChange)="day.set($event)">
            <option value="">Tutti i giorni</option>
            @for (d of dayOptions(); track d.id) {
              <option [value]="d.id">{{ d.name }}</option>
            }
          </select></label
        ><gt-exercise-filter [exercises]="s.data().exercises" [value]="exercise()"
          [includeAll]="true" (choose)="exercise.set($event)" /><label class="history-from-filter"
          >Data iniziale<gt-date-field aria-label="Data iniziale dello storico"
            [ngModel]="from()"
            (ngModelChange)="from.set($event)" ></gt-date-field></label
        ><label class="history-to-filter"
          >Data finale<gt-date-field aria-label="Data finale dello storico"
            [ngModel]="to()"
            (ngModelChange)="to.set($event)"
        ></gt-date-field></label>
      </div></details>
      <section class="history-overview" aria-label="Riepilogo degli allenamenti trovati"><div><small>Allenamenti</small><b>{{ filtered().length }}</b></div><div><small>Serie</small><b>{{ overview().sets }}</b></div><div><small>Volume</small><b>{{ s.formatWeight(overview().volume) }}<em>{{ s.settings().unit }}</em></b></div></section>
      <div class="hx3-list">
        @for (group of groups(); track group.key) {
          <div class="history-month"><span>{{ group.label }}</span><small>{{ group.items.length }} {{ group.items.length===1?'seduta':'sedute' }}</small></div>
          @for (w of group.items; track w.id) {
          <a class="card hx3-session" [routerLink]="['/riepilogo',w.id]" [queryParams]="{from:'elenco'}" [attr.aria-label]="'Riepilogo di '+w.dayName+' del '+(w.date | date: 'dd/MM/yyyy')">
            <span class="hx3-date"><strong>{{w.date | date: "dd"}}</strong><small>{{ weekday(w.date) }}</small></span>
            <span class="hx3-text"><strong>{{ w.dayName }}</strong><small>{{ w.planName }}</small>
              <span class="hx3-meta"><span>{{ s.workoutExercises(w.id).length }} es.</span><span>{{ setCount(w.id) }} serie</span><span>{{w.duration>0?w.duration+' min':'durata n.d.'}}</span><span>{{ s.formatWeight(s.volume(w.id)) }} {{ s.settings().unit }}</span></span></span>
            <gt-icon name="chevron-right" />
          </a>
          }
        } @empty {
          <div class="card empty">
            <gt-icon name="calendar" />
            <h3>Nessuna sessione da mostrare</h3>
            <p>
              Completa un allenamento o modifica i filtri per consultare lo
              storico.
            </p>
            <a class="button primary" routerLink="/piani">Vai alle schede</a>
          </div>
        }
      </div>
    }`,
})
export class WorkoutsComponent {
 private confirmation=confirmationForContext();
  constructor(){const query=inject(ActivatedRoute).snapshot.queryParamMap;const workout=query.get("workout");if(workout){this.selectedId.set(workout);queueMicrotask(()=>void this.router.navigate(['/riepilogo',workout],{queryParams:{from:'elenco'},replaceUrl:true}));}const date=query.get("date");if(date){this.from.set(date);this.to.set(date);}}
  s = inject(Store);
  router=inject(Router);reopening=signal(false);deleting=signal(false);
  plan = signal("");
  day = signal("");
  exercise = signal("");
  from = signal("");
  to = signal("");
  selectedId = signal("");
  selected = computed(() =>
    this.s.completed().find((w) => w.id === this.selectedId()),
  );
  planOptions = computed(() => [
    ...new Map(
      this.s
        .completed()
        .map((w) => [w.planId, { id: w.planId, name: w.planName }]),
    ).values(),
  ]);
  dayOptions = computed(() => [
    ...new Map(
      this.s
        .completed()
        .filter((w) => !this.plan() || w.planId === this.plan())
        .map((w) => [w.dayId, { id: w.dayId, name: w.dayName }]),
    ).values(),
  ]);
  filtered = computed(() =>
    this.s
      .completed()
      .filter(
        (w) =>
          (!this.plan() || w.planId === this.plan()) &&
          (!this.day() || w.dayId === this.day()) &&
          (!this.from() || w.date >= this.from()) &&
          (!this.to() || w.date <= this.to()) &&
          (!this.exercise() ||
            this.s
              .workoutExercises(w.id)
              .some((e) => e.exerciseId === this.exercise())),
      ),
  );
  /* Storico v3: valori solo di presentazione. */
  activeFilters(){return [this.plan(),this.day(),this.exercise(),this.from(),this.to()].filter(Boolean).length;}
  overview=computed(()=>{const list=this.filtered();return {sets:list.reduce((n,w)=>n+this.setCount(w.id),0),volume:list.reduce((n,w)=>n+this.s.volume(w.id),0)};});
  groups=computed(()=>{const out:{key:string;label:string;items:ReturnType<WorkoutsComponent['filtered']>}[]=[];for(const w of this.filtered()){const key=w.date.slice(0,7);let group=out.find(g=>g.key===key);if(!group){group={key,label:this.monthLabel(key),items:[]};out.push(group);}group.items.push(w);}return out;});
  monthLabel(key:string){const [y,m]=key.split('-').map(Number);try{const text=new Date(y,(m||1)-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'});return text.charAt(0).toUpperCase()+text.slice(1);}catch{return key;}}
  weekday(date:string){try{return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'short'}).replace('.','').toUpperCase();}catch{return '';}}
  longDate(date:string){try{return new Date(date+'T12:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}catch{return date;}}
  repCount(id:string){return this.s.workoutExercises(id).reduce((n,e)=>n+this.s.sets(e.id).filter(set=>set.completed&&set.kind!=='warmup').reduce((sum,set)=>sum+set.reps,0),0);}
  setCount(id: string) {
    return this.s
      .workoutExercises(id)
      .reduce(
        (n, e) => n + this.s.sets(e.id).filter((s) => s.completed).length,
        0,
      );
  }
  edit(id: string, key: "date" | "notes" | "duration", value: string | number) {
    if (key === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return;
    if (
      key === "duration" &&
      (!Number.isFinite(+value) || +value < 1 || +value > 1440)
    )
      return;
    void this.s.change((d) => {
      const w = d.workouts.find((w) => w.id === id)!;
      if (key === "duration") w.duration = +value;
      else w[key] = String(value);
    });
  }
  async reopen(id:string){
    if(this.reopening())return;
    this.reopening.set(true);
    try{if(await this.s.reopenWorkout(id)){this.selectedId.set('');await this.router.navigateByUrl('/sessione');}}finally{this.reopening.set(false);}
  }
  async remove(id: string) {
    if(this.deleting()||this.reopening()||this.s.busy())return;
    const workout=this.s.data().workouts.find(w=>w.id===id);if(!workout)return;
    if(workout.status==='completed'&&!this.s.settings().allowCompletedWorkoutDeletion)return;
    const archive=this.s.archiveKey();this.deleting.set(true);
    try{if(!await this.confirmation.ask({title:'Eliminare questo allenamento?',message:workout.dayName+' · '+workout.date.split('-').reverse().join('/')+'. La sessione, tutte le sue serie e la relativa voce nel calendario saranno eliminate definitivamente. Statistiche e record saranno ricalcolati. Il piano e gli altri allenamenti restano conservati.',confirmLabel:'Elimina allenamento',tone:'danger'}))return;
      if(archive!==this.s.archiveKey())return;
      if(await this.s.deleteWorkout(id,{confirmedCompleted:true}))this.selectedId.set('');
    }finally{this.deleting.set(false);}
  }
}
