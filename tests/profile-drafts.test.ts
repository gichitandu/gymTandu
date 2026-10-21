import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {FormBuilder} from '@angular/forms';
import {ActivatedRoute,convertToParamMap} from '@angular/router';
import {of} from 'rxjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {AuthService} from '../src/app/services/auth';
import {ThemeService} from '../src/app/services/theme';
import {PwaService} from '../src/app/services/pwa';
import {WorkoutResumeService} from '../src/app/services/workout-resume';
import {ProfileComponent} from '../src/app/features/profile.component';

// Drive the component's effect callback explicitly, without a browser renderer.
const effects=vi.hoisted(()=>[] as (()=>void)[]);
vi.mock('@angular/core',async importOriginal=>{
  const core=await importOriginal<typeof import('@angular/core')>();
  return {...core,effect:(callback:()=>void)=>{effects.push(callback);return {destroy:()=>{}};}};
});
let db:GymDatabase,injector:EnvironmentInjector,s:Store,c:ProfileComponent;
const sync=()=>effects.forEach(callback=>callback());

beforeEach(async()=>{
  effects.length=0;
  vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
  db=new GymDatabase('profile-drafts-'+crypto.randomUUID());
  injector=createEnvironmentInjector([
    {provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},
    {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap({}))}},
    {provide:AuthService,useValue:{user:()=>null,offlineMode:()=>true}},
    {provide:ThemeService,useValue:{load:async()=>{},apply:()=>{},color:signal('#050E17')}},
    {provide:PwaService,useValue:{}},FormBuilder,Store,WorkoutResumeService,
  ],null as unknown as EnvironmentInjector);
  s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));
  c=runInInjectionContext(injector,()=>new ProfileComponent());sync();
});
afterEach(async()=>{c?.ngOnDestroy();await s.settled();injector.destroy();await db.delete();vi.restoreAllMocks();vi.unstubAllGlobals();effects.length=0;});

it('keeps profile and goals drafts when unrelated autosaves clone the archive',async()=>{
  c.form.controls.name.setValue('Nome ancora da salvare');c.form.controls.name.markAsDirty();
  c.goalsForm.controls.calories.setValue(2300);c.goalsForm.controls.calories.markAsDirty();
  await s.change(data=>{data.settings[0].prefill=!data.settings[0].prefill;},'',false);sync();
  expect(c.form.controls.name.value).toBe('Nome ancora da salvare');
  expect(c.goalsForm.controls.calories.value).toBe(2300);
  expect(c.form.controls.name.dirty).toBe(true);
  expect(c.goalsForm.controls.calories.dirty).toBe(true);
});

it('refreshes untouched persisted fields without replacing edited fields and converts an entered weight when units change',async()=>{
  c.form.controls.name.setValue('Il mio nome');c.form.controls.name.markAsDirty();
  c.form.controls.bodyWeight.setValue(80);c.form.controls.bodyWeight.markAsDirty();
  await s.change(data=>{data.profiles[0].height=182;data.settings[0].unit='lb';},'',false);sync();
  expect(c.form.controls.name.value).toBe('Il mio nome');
  expect(c.form.controls.height.value).toBe(182);
  expect(c.form.controls.bodyWeight.value).toBeCloseTo(176.369809744);
  await c.save();sync();
  expect(s.profile().bodyWeight).toBeCloseTo(80);
  expect(s.profile().height).toBe(182);
});

it('preserves edits and a new photo made while an older profile save is waiting',async()=>{
  let release!:()=>void;
  const blocked=new Promise<void>(resolve=>release=resolve);
  const queued=s.change(async()=>{await blocked;},'',false);
  const firstPhoto=new Blob(['photo-one'],{type:'image/jpeg'}),secondPhoto=new Blob(['photo-two'],{type:'image/jpeg'});
  c.form.controls.name.setValue('Primo nome');c.form.controls.name.markAsDirty();c.photoDraft.set(firstPhoto);
  const saving=c.save();
  c.form.controls.name.setValue('Nome più recente');c.form.controls.name.markAsDirty();c.photoDraft.set(secondPhoto);
  release();await Promise.all([queued,saving]);sync();
  expect(s.profile().name).toBe('Primo nome');
  expect(await s.profile().photo!.text()).toBe('photo-one');
  expect(c.form.controls.name.value).toBe('Nome più recente');
  expect(c.photoDraft()).toBe(secondPhoto);
  expect(c.form.controls.name.dirty).toBe(true);
  await c.save();sync();
  expect(s.profile().name).toBe('Nome più recente');
  expect(await s.profile().photo!.text()).toBe('photo-two');
  expect(c.photoDraft()).toBeUndefined();
  expect(c.form.pristine).toBe(true);
});

it('keeps newer goals edits during save, then marks only the saved values pristine',async()=>{
  let release!:()=>void;const blocked=new Promise<void>(resolve=>release=resolve);
  const queued=s.change(async()=>{await blocked;},'',false);
  c.goalsForm.controls.calories.setValue(2200);c.goalsForm.controls.calories.markAsDirty();
  const saving=c.saveGoals();
  c.goalsForm.controls.calories.setValue(2500);c.goalsForm.controls.calories.markAsDirty();
  release();await Promise.all([queued,saving]);sync();
  expect(s.settings().goals?.calories).toBe(2200);
  expect(c.goalsForm.controls.calories.value).toBe(2500);
  expect(c.goalsForm.controls.calories.dirty).toBe(true);
  await c.saveGoals();sync();
  expect(s.settings().goals?.calories).toBe(2500);
  expect(c.goalsForm.pristine).toBe(true);
});
