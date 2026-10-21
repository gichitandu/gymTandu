import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { Store } from '../services/store';
import { localDate, ScheduledWorkout } from '../models/domain';
import { CalendarView, calendarDays, calendarActivity, DayActivity, moveDate, movePeriod, parseLocalDate, weeklyDates } from '../services/calendar';
import { IconComponent } from '../shared/icon.component';
import { StatusComponent } from '../shared/status.component';
@Component({standalone:true,imports:[FormsModule,RouterLink,A11yModule,IconComponent,StatusComponent],templateUrl:'./calendar.component.html',styleUrl:'./calendar.component.css'})
export class CalendarComponent {
 s=inject(Store);router=inject(Router);
 private host=inject<ElementRef<HTMLElement>>(ElementRef,{optional:true});private scrollKey='';private frame:number|undefined;
 ngAfterViewChecked(){const key=this.view()+this.selected();if(!this.host||key===this.scrollKey)return;this.scrollKey=key;if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{const rail=this.host?.nativeElement.querySelector<HTMLElement>('[data-week-rail]'),active=rail?.querySelector<HTMLElement>('[aria-pressed="true"]');if(rail&&active)rail.scrollTo({left:Math.max(0,active.offsetLeft-(rail.clientWidth-active.offsetWidth)/2),behavior:'auto'});});}
 ngOnDestroy(){if(this.frame!==undefined)cancelAnimationFrame(this.frame);}
 view=signal<CalendarView>('week');today=localDate();selected=signal(this.today);
 weekdays=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
 dates=computed(()=>calendarDays(this.selected(),this.view()));
 periodDates=computed(()=>this.view()==='month'?this.dates().filter(date=>date.slice(0,7)===this.selected().slice(0,7)):this.dates());
 activity=computed(()=>calendarActivity(this.s.data()));
 emptyActivity:DayActivity={planned:0,completed:0,meals:0,calories:0};
 modal=signal(false);filter=signal<'all'|'planned'|'completed'>('all');editing='';eventDate=this.today;dayId='';notes='';repeatCount=1;
 events=computed(()=>this.s.data().scheduledWorkouts.filter(e=>e.date===this.selected()));
 completed=computed(()=>this.s.completed().filter(w=>w.date===this.selected()&&!this.events().some(e=>e.workoutId===w.id)));
 visibleEvents=computed(()=>this.events().filter(e=>this.filter()==='all'||(this.filter()==='completed')===(this.linked(e)?.status==='completed')));
 visibleCompleted=computed(()=>this.filter()==='planned'?[]:this.completed());
 completedCount=computed(()=>this.completed().length+this.events().filter(e=>this.linked(e)?.status==='completed').length);
 availableDays=computed(()=>this.s.data().days.filter(d=>this.s.data().plans.some(p=>p.id===d.planId&&!p.archived)));
 availablePlans=computed(()=>this.s.data().plans.filter(p=>!p.archived&&this.availableDays().some(d=>d.planId===p.id)));
 periodStats=computed(()=>this.periodDates().reduce((total,date)=>{const a=this.day(date);return{planned:total.planned+a.planned,completed:total.completed+a.completed,active:total.active+(a.planned+a.completed>0?1:0)};},{planned:0,completed:0,active:0}));
 target=computed(()=>this.view()==='week'?this.s.settings().goals?.workoutsPerWeek:undefined);
 scoreProgress=computed(()=>{const goal=this.target()||(this.periodStats().planned+this.periodStats().completed);return goal?Math.min(100,this.periodStats().completed/goal*100):0;});
 upcoming=computed(()=>this.view()==='day'?[]:this.s.data().scheduledWorkouts.filter(e=>this.periodDates().includes(e.date)&&e.date!==this.selected()&&this.linked(e)?.status!=='completed').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4));
 constructor(){const date=inject(ActivatedRoute).snapshot.queryParamMap.get('date');if(date)this.choose(date);}
 day(date:string){return this.activity().get(date)||this.emptyActivity;}
 label(date:string){return parseLocalDate(date).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});}
 shortLabel(date:string){return parseLocalDate(date).toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});}
 weekday(date:string){return parseLocalDate(date).toLocaleDateString('it-IT',{weekday:'short'}).replace('.','');}
 monthLabel(){return parseLocalDate(this.selected()).toLocaleDateString('it-IT',{month:'long',year:'numeric'});}
 periodLabel(){const dates=this.dates();if(this.view()==='day')return this.shortLabel(this.selected());if(this.view()==='month')return this.monthLabel();const first=parseLocalDate(dates[0]),last=parseLocalDate(dates[6]);return first.getMonth()===last.getMonth()?`${first.getDate()}–${last.getDate()} ${last.toLocaleDateString('it-IT',{month:'long',year:'numeric'})}`:`${first.toLocaleDateString('it-IT',{day:'numeric',month:'short',...(first.getFullYear()!==last.getFullYear()?{year:'numeric' as const}:{})})} – ${last.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})}`;}
 periodTitle(){return this.view()==='week'?'La tua settimana':this.view()==='month'?'Il tuo mese':'Il tuo giorno';}
 dayHint(date:string){const a=this.day(date);return a.completed?`${a.completed} ${a.completed===1?'svolto':'svolti'}`:a.planned?`${a.planned} in programma`:a.meals?`${a.meals} pasti`:'Libero';}
 dayAria(date:string){const a=this.day(date);return `${this.label(date)}, ${a.planned} programmati, ${a.completed} svolti, ${a.meals} pasti`+(date===this.today?', oggi':'');}
 move(direction:number){this.selected.set(movePeriod(this.selected(),this.view(),direction));}
 choose(date:string){try{parseLocalDate(date);this.selected.set(date);}catch{}}
 tomorrow(){this.choose(moveDate(this.today,1));}
 linked(e:ScheduledWorkout){return this.s.data().workouts.find(w=>w.id===e.workoutId);}
 available(e:ScheduledWorkout){return this.availableDays().some(d=>d.id===e.dayId);}
 planName(id:string){return this.s.data().plans.find(p=>p.id===id)?.name||'';}
 daySummary(id:string){const exercises=this.s.planExercises(id);return exercises.length?`${exercises.length} esercizi · ${exercises.reduce((n,e)=>n+e.sets,0)} serie`:'Programmazione salvata';}
 muscles(id:string){return [...new Set(this.s.planExercises(id).map(e=>this.s.muscle(this.s.exercise(e.exerciseId)?.muscleGroupId||'')).filter(Boolean))].join(' · ');}
 repeatPreview(){try{return weeklyDates(this.eventDate,Number(this.repeatCount)).map(date=>this.shortLabel(date)).join(' · ');}catch{return '';}}
 open(e?:ScheduledWorkout){this.s.error.set('');this.editing=e?.id||'';this.eventDate=e?.date||this.selected();this.dayId=e?.dayId||this.s.nextDay()?.id||this.availableDays()[0]?.id||'';this.notes=e?.notes||'';this.repeatCount=1;this.modal.set(true);}
 close(){this.modal.set(false);}
 backdrop(event:MouseEvent){if(event.target===event.currentTarget)this.close();}
 async save(){if(await this.s.scheduleWorkout(this.eventDate,this.dayId,this.notes,this.editing||undefined,Number(this.repeatCount))){this.choose(this.eventDate);this.filter.set('all');this.close();}}
 async duplicate(e:ScheduledWorkout){const date=moveDate(e.date,7);if(await this.s.scheduleWorkout(date,e.dayId,e.notes)){this.choose(date);this.filter.set('all');}else{this.editing='';this.eventDate=date;this.dayId=e.dayId;this.notes=e.notes;this.repeatCount=1;this.modal.set(true);}}
 async start(e:ScheduledWorkout){if(e.date!==this.today&&!confirm('Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.'))return;if(await this.s.startScheduled(e.id))await this.router.navigateByUrl('/sessione');}
 async remove(e:ScheduledWorkout){if(confirm('Rimuovere la programmazione? Gli allenamenti già registrati resteranno nello storico.'))await this.s.change(d=>{d.scheduledWorkouts=d.scheduledWorkouts.filter(x=>x.id!==e.id);},'Programmazione rimossa.',false);}
}
