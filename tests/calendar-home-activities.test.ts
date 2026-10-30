import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {expect,it,vi} from 'vitest';
import {Router} from '@angular/router';
import {HomeComponent} from '../src/app/features/home.component';
import {Store} from '../src/app/services/store';
import {TodayService} from '../src/app/services/today';
import {seed} from '../src/app/core/seed';

it('keeps calendar-only activities out of Home workout recommendations and workout day markers',()=>{
 const data=seed(),today='2026-10-30';
 for(const [index,kind] of ['cardio','mobility','rest','other'].entries())data.scheduledWorkouts.push({id:'activity-'+index,kind:kind as 'cardio'|'mobility'|'rest'|'other',date:today,planId:'',dayId:'',planName:'',dayName:kind,notes:''});
 data.scheduledWorkouts.push({id:'workout-next',date:'2026-11-02',planId:'p',dayId:'d',planName:'Piano',dayName:'Seduta',notes:''});
 const state=signal(data),store={data:state,settings:()=>state().settings[0],profile:()=>state().profiles[0],nextDay:()=>undefined,completed:()=>[]};
 const injector=createEnvironmentInjector([{provide:Store,useValue:store},{provide:TodayService,useValue:{date:()=>today}},{provide:Router,useValue:{navigateByUrl:vi.fn(),navigate:vi.fn()}}],null as unknown as EnvironmentInjector);
 try{
  const home=runInInjectionContext(injector,()=>new HomeComponent());
  expect(home.nextScheduled()?.id).toBe('workout-next');expect(home.planned(today)).toBe(false);expect(home.planned('2026-11-02')).toBe(true);expect(home.dayAria(today)).toContain('nessun allenamento');
  state.set({...data,scheduledWorkouts:[...data.scheduledWorkouts,{id:'workout-today',kind:'workout',date:today,planId:'p',dayId:'d',planName:'Piano',dayName:'Seduta',notes:''}]});
  expect(home.nextScheduled()?.id).toBe('workout-today');expect(home.planned(today)).toBe(true);
 }finally{injector.destroy();}
});
