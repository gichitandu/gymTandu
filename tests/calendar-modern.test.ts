import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {ActivatedRoute,Router} from '@angular/router';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CalendarComponent} from '../src/app/features/calendar.component';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {ConfirmationService} from '../src/app/services/confirmation';
import {ThemeService} from '../src/app/services/theme';
import {localDate} from '../src/app/models/domain';
import {moveDate} from '../src/app/services/calendar';

let db:GymDatabase,injector:EnvironmentInjector,s:Store,c:CalendarComponent;
const style=signal<'classic'|'elegant'|'modern'>('modern');
const touch=(clientX:number,clientY=0,pointerType='touch')=>({pointerType,clientX,clientY}) as PointerEvent;
beforeEach(async()=>{
 vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
 style.set('modern');
 db=new GymDatabase('calendar-modern-'+crypto.randomUUID());
 injector=createEnvironmentInjector([
  {provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},
  {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}},
  {provide:Router,useValue:{navigateByUrl:vi.fn().mockResolvedValue(true)}},{provide:ConfirmationService,useValue:{ask:vi.fn().mockResolvedValue(true)}},
  {provide:ThemeService,useValue:{config:()=>({palette:'cobalto',mode:'light',style:style()}),load:()=>Promise.resolve(),apply:()=>{}}},Store,
 ],null as unknown as EnvironmentInjector);
 s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
 c=runInInjectionContext(injector,()=>new CalendarComponent());
});
afterEach(async()=>{await s.settled();c.ngOnDestroy();injector.destroy();await db.delete();vi.clearAllMocks();vi.unstubAllGlobals();});

it('is modern only with the «Rimodernizzato» style',()=>{
 expect(c.modern()).toBe(true);
 style.set('elegant');expect(c.modern()).toBe(false);
 style.set('classic');expect(c.modern()).toBe(false);
});

it('moves the week with a horizontal swipe on the day strip and ignores short, vertical and mouse gestures',()=>{
 c.view.set('week');c.choose('2026-10-22');
 c.swipeStart(touch(300));c.swipeEnd(touch(150),'week');expect(c.selected()).toBe('2026-10-29');
 c.swipeStart(touch(100));c.swipeEnd(touch(250),'week');expect(c.selected()).toBe('2026-10-22');
 // Too short, too vertical, or a mouse drag: nothing changes.
 c.swipeStart(touch(300));c.swipeEnd(touch(260),'week');expect(c.selected()).toBe('2026-10-22');
 c.swipeStart(touch(300,0));c.swipeEnd(touch(200,160),'week');expect(c.selected()).toBe('2026-10-22');
 c.swipeStart(touch(300,0,'mouse'));c.swipeEnd(touch(100,0,'mouse'),'week');expect(c.selected()).toBe('2026-10-22');
 // A pointer-up without a matching pointer-down does nothing.
 c.swipeEnd(touch(0),'week');expect(c.selected()).toBe('2026-10-22');
});

it('changes day, across weeks too, with a horizontal swipe on the list',()=>{
 c.choose('2026-10-25');
 c.swipeStart(touch(300));c.swipeEnd(touch(120),'day');expect(c.selected()).toBe('2026-10-26');
 c.swipeStart(touch(100));c.swipeEnd(touch(260),'day');expect(c.selected()).toBe('2026-10-25');
 c.swipeStart(touch(100));c.swipeEnd(touch(260),'day');expect(c.selected()).toBe('2026-10-24');
});

it('does not react to swipes with the other styles',()=>{
 style.set('elegant');c.choose('2026-10-22');
 c.swipeStart(touch(300));c.swipeEnd(touch(100),'week');expect(c.selected()).toBe('2026-10-22');
 c.swipeStart(touch(300));c.swipeEnd(touch(100),'day');expect(c.selected()).toBe('2026-10-22');
});

it('summarises the cover for a past, a future and an empty day from the agenda',async()=>{
 const today=localDate(),future=moveDate(today,3),past=moveDate(today,-2);
 await s.scheduleCalendarActivity({id:'run',date:future,kind:'cardio',title:'Corsa 5 km',time:'07:00',durationMinutes:30,done:false});
 await s.scheduleCalendarActivity({id:'walk',date:past,kind:'cardio',title:'Camminata',time:'08:00',durationMinutes:40,estimatedCalories:150,done:true});
 c.choose(future);
 expect(c.cover()).toMatchObject({label:'In programma',title:'Corsa 5 km',count:'tra 3 g'});
 c.choose(past);
 expect(c.cover()).toMatchObject({label:'Bilancio',count:'',dayPct:100});
 expect(c.cover().title).toContain('1 di 1 completate');
 c.choose(moveDate(today,10));
 expect(c.cover()).toMatchObject({label:'Giornata libera',title:'Niente in programma'});
 expect(c.cover().day).toBe(Number(moveDate(today,10).slice(8)));
});

it('counts the weekly goal from completed workouts only and keeps every day ring between 0 and 100',async()=>{
 const today=localDate();
 await s.scheduleCalendarActivity({id:'a',date:today,kind:'cardio',title:'Mobilità',done:true});
 await s.scheduleCalendarActivity({id:'b',date:today,kind:'cardio',title:'Camminata',done:false});
 c.choose(today);
 // Cardio non fa avanzare l'obiettivo «allenamenti a settimana».
 expect(c.coverGoal().done).toBe(0);
 expect(c.dayPercent(today)).toBe(50);
 for(const date of c.weekStrip()){expect(c.dayPercent(date)).toBeGreaterThanOrEqual(0);expect(c.dayPercent(date)).toBeLessThanOrEqual(100);}
 expect(c.coverGoal().pct).toBeGreaterThanOrEqual(0);expect(c.coverGoal().pct).toBeLessThanOrEqual(100);
});
