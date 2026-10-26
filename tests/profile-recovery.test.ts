import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {FormBuilder} from '@angular/forms';
import {ActivatedRoute,convertToParamMap} from '@angular/router';
import {of} from 'rxjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Dexie from 'dexie';
import {GymDatabase} from '../src/app/core/database';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {Store} from '../src/app/services/store';
import {AuthService} from '../src/app/services/auth';
import {ThemeService} from '../src/app/services/theme';
import {PwaService} from '../src/app/services/pwa';
import {WorkoutResumeService} from '../src/app/services/workout-resume';
import {FormDraftService,FORM_DRAFT_DATABASE_NAME} from '../src/app/services/form-drafts';
import {TodayService} from '../src/app/services/today';
import {ProfileComponent} from '../src/app/features/profile.component';
const effects=vi.hoisted(()=>[] as (()=>void)[]);
vi.mock('@angular/core',async original=>({...await original<typeof import('@angular/core')>(),effect:(callback:()=>void)=>{effects.push(callback);return{destroy:()=>{}};}}));
let injector:EnvironmentInjector,db:GymDatabase,s:Store,c:ProfileComponent,drafts:FormDraftService,draftName:string;
let clock:ReturnType<typeof signal<string>>;
const sync=()=>effects.forEach(callback=>callback());
async function reopen(){c.ngOnDestroy();await drafts.flushAll();effects.length=0;c=runInInjectionContext(injector,()=>new ProfileComponent());sync();await drafts.flushAll();}
beforeEach(async()=>{
  effects.length=0;
  vi.stubGlobal('window',Object.assign(new EventTarget(),{scrollTo:vi.fn()}));
  vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible',body:{classList:{toggle:()=>{}}}}));
  db=new GymDatabase('profile-recovery-'+crypto.randomUUID());draftName='profile-form-'+crypto.randomUUID();clock=signal('2026-10-21');
  injector=createEnvironmentInjector([
    {provide:GYM_REPOSITORY,useValue:{storageKey:db.name,read:()=>db.snapshot(),replace:(data:any)=>db.replace(data)}},
    {provide:ActivatedRoute,useValue:{queryParamMap:of(convertToParamMap({}))}},
    {provide:AuthService,useValue:{user:()=>null,offlineMode:()=>true,canManageBackups:()=>false}},
    {provide:ThemeService,useValue:{load:async()=>{},apply:()=>{},color:signal('#050E17')}},
    {provide:PwaService,useValue:{updating:signal(false)}},{provide:TodayService,useValue:{date:clock}},
    {provide:FORM_DRAFT_DATABASE_NAME,useValue:draftName},FormDraftService,FormBuilder,Store,WorkoutResumeService,
  ],null as unknown as EnvironmentInjector);
  s=injector.get(Store);drafts=injector.get(FormDraftService);await vi.waitFor(()=>expect(s.ready()).toBe(true));
  c=runInInjectionContext(injector,()=>new ProfileComponent());sync();await drafts.flushAll();
});
afterEach(async()=>{c?.ngOnDestroy();await drafts?.flushAll();await s?.settled();injector?.destroy();await db?.delete();await Dexie.delete(draftName);vi.restoreAllMocks();vi.unstubAllGlobals();effects.length=0;});
it('recovers unfinished profile/goals/photo after leaving, while excluding all password fields',async()=>{
  c.form.controls.name.setValue('Nome in bozza');c.form.controls.name.markAsDirty();
  c.goalsForm.controls.calories.setValue(2400);c.goalsForm.controls.calories.markAsDirty();
  c.photoDraft.set(new Blob(['photo'],{type:'image/jpeg'}));c.currentPassword='never-store-current';c.newPassword='never-store-new';c.panel.set('settings');c.draftChanged();
  await drafts.flushAll();const saved=await drafts.read<any>(s.archiveKey(),'profile');
  expect(JSON.stringify(saved)).not.toContain('never-store');
  await reopen();
  expect(c.form.controls.name.value).toBe('Nome in bozza');expect(c.form.controls.name.dirty).toBe(true);
  expect(c.goalsForm.controls.calories.value).toBe(2400);expect(await c.photoDraft()!.text()).toBe('photo');
  expect(c.currentPassword).toBe('');expect(s.profile().name).not.toBe('Nome in bozza');
});
it('removes only accepted drafts and retains goals still awaiting confirmation',async()=>{
  c.form.controls.name.setValue('Nome confermato');c.form.controls.name.markAsDirty();
  c.goalsForm.controls.calories.setValue(2400);c.goalsForm.controls.calories.markAsDirty();c.draftChanged();await drafts.flushAll();
  await c.save();sync();let saved=await drafts.read<any>(s.archiveKey(),'profile');
  expect(saved.profile).toEqual({});expect(saved.goals.calories).toBe(2400);
  await c.saveGoals();sync();saved=await drafts.read(s.archiveKey(),'profile');expect(saved).toBeNull();
});
it('converts a measurement draft across unit changes and keeps a date selected by the user after midnight',async()=>{
  c.measurementWeight=80;c.chooseMeasurementDate('2026-10-20');c.draftChanged();await drafts.flushAll();c.ngOnDestroy();await drafts.flushAll();
  await s.change(data=>{data.settings[0].unit='lb';},'',false);
  effects.length=0;c=runInInjectionContext(injector,()=>new ProfileComponent());sync();await drafts.flushAll();
  expect(c.measurementWeight).toBeCloseTo(176.369809744);
  clock.set('2026-10-22');sync();expect(c.today).toBe('2026-10-22');expect(c.measurementDate).toBe('2026-10-20');
});
it('rolls an untouched default measurement date forward on resume',()=>{
  expect(c.measurementDate).toBe('2026-10-21');clock.set('2026-10-22');sync();expect(c.measurementDate).toBe('2026-10-22');
});
it('freezes editing before the logout snapshot and restores it when saving cannot finish',async()=>{
  const root={inert:false};(document as any).querySelector=()=>root;
  const pwa=injector.get(PwaService) as any,auth=injector.get(AuthService) as any;
  pwa.prepareExit=vi.fn(async()=>{expect(root.inert).toBe(true);return false;});
  auth.logout=vi.fn();pwa.finishLogoutUpdate=vi.fn();
  await c.logout();
  expect(root.inert).toBe(false);expect(c.loggingOut()).toBe(false);expect(pwa.updating()).toBe(false);expect(auth.logout).not.toHaveBeenCalled();
});
it('keeps the interface frozen between cookie revocation and the final reload',async()=>{
  const root={inert:false};(document as any).querySelector=()=>root;
  const pwa=injector.get(PwaService) as any,auth=injector.get(AuthService) as any;
  let finish!:()=>void;
  pwa.prepareExit=vi.fn().mockResolvedValue(true);auth.logout=vi.fn().mockResolvedValue(undefined);
  pwa.finishLogoutUpdate=vi.fn(()=>new Promise<void>(resolve=>finish=resolve));
  const first=c.logout();await Promise.resolve();await Promise.resolve();await c.logout();
  expect(auth.logout).toHaveBeenCalledExactlyOnceWith({reload:false});expect(root.inert).toBe(true);expect(c.loggingOut()).toBe(true);expect(pwa.updating()).toBe(true);
  finish();await first;expect(root.inert).toBe(true);
});
