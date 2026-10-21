import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/services/auth';
import { ArchiveSyncService } from '../src/app/services/archive-sync';
import { Store } from '../src/app/services/store';
import { ThemeService } from '../src/app/services/theme';
import { TodayService } from '../src/app/services/today';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { exportBackup } from '../src/app/services/backup';
import { seed } from '../src/app/core/seed';
import { DataSet } from '../src/app/models/domain';

const injectors:EnvironmentInjector[]=[];
afterEach(()=>{for(const injector of injectors)injector.destroy();injectors.length=0;vi.unstubAllGlobals();vi.restoreAllMocks();});
function plans(name:string){const data=seed(),at='2026-10-21T12:00:00.000Z';data.plans.push({id:'p',userId:'local',name,description:'',createdAt:at,updatedAt:at,active:true,archived:false});return data;}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function environment(){
 const storage=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible',body:{classList:{toggle:()=>{}},style:{setProperty:()=>{}}},querySelector:()=>null}));
}
function fixture(local:DataSet,fetch:ReturnType<typeof vi.fn>,replace?:(data:DataSet)=>Promise<void>){
 environment();vi.stubGlobal('fetch',fetch);let persisted=structuredClone(local),revision=0;
 const auth={user:signal({id:'device-local',owner:false,role:'User'}),offlineMode:()=>true};
 const repo={storageKey:'gymtrack-user-device-local',revision:()=>revision,read:async()=>structuredClone(persisted),replace:async(data:DataSet)=>{await replace?.(data);persisted=structuredClone(data);revision++;}};
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:GYM_REPOSITORY,useValue:repo},ArchiveSyncService,Store],null as unknown as EnvironmentInjector);injectors.push(injector);
 return {store:injector.get(Store),cloud:injector.get(ArchiveSyncService),saved:()=>persisted};
}

it('shows the populated local archive and accepts writes while a slow server check is pending',async()=>{
 const head=deferred<Response>(),fetch=vi.fn(()=>head.promise),t=fixture(plans('Piano sul telefono'),fetch);
 await vi.waitFor(()=>expect(t.store.ready()).toBe(true));
 expect(t.store.data().plans[0].name).toBe('Piano sul telefono');
 expect(await t.store.savePlan('p','Modifica durante il caricamento','')).toBe(true);
 head.resolve(Response.json({revision:1,backup:await exportBackup(plans('Altro piano sul server'))}));
 await vi.waitFor(()=>expect(t.cloud.status()).toBe('conflict'));
 expect(t.store.data().plans[0].name).toBe('Modifica durante il caricamento');
 expect(t.saved().plans[0].name).toBe('Modifica durante il caricamento');
 expect(await t.cloud.flush()).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
});

it('restores an eligible server archive through the local write queue after the initial empty installation is ready',async()=>{
 const head=deferred<Response>(),t=fixture(seed(),vi.fn(()=>head.promise));
 await vi.waitFor(()=>expect(t.store.ready()).toBe(true));expect(t.store.data().plans).toHaveLength(0);
 head.resolve(Response.json({revision:1,backup:await exportBackup(plans('Piano ritrovato'))}));
 await vi.waitFor(()=>expect(t.store.data().plans[0]?.name).toBe('Piano ritrovato'));
 expect(t.saved().plans[0].name).toBe('Piano ritrovato');expect(await t.cloud.flush()).toBe(true);
});

it('does not replace an in-flight local save with a remote restore queued behind it',async()=>{
 const head=deferred<Response>(),write=deferred<void>(),started=deferred<void>();let first=true;
 const t=fixture(seed(),vi.fn(()=>head.promise),async()=>{if(first){first=false;started.resolve();await write.promise;}});
 await vi.waitFor(()=>expect(t.store.ready()).toBe(true));
 const saving=t.store.savePlan('p','Nuovo piano locale','');await started.promise;
 head.resolve(Response.json({revision:1,backup:await exportBackup(plans('Piano server'))}));
 await new Promise(resolve=>setTimeout(resolve,20));write.resolve();expect(await saving).toBe(true);
 await vi.waitFor(()=>expect(t.cloud.status()).toBe('conflict'));
 expect(t.saved().plans[0].name).toBe('Nuovo piano locale');expect(t.store.data().plans[0].name).toBe('Nuovo piano locale');
 expect(await t.cloud.flush()).toBe(false);
});

it('does not wait for catalog or theme network responses before enabling the local archive',async()=>{
 environment();const local=plans('Locale disponibile'),catalog=deferred<unknown>(),theme=deferred<void>();
 const request=vi.fn(()=>catalog.promise),auth={user:signal({id:'owner',owner:true,role:'SuperAdmin'}),offlineMode:()=>false,request};
 const themeService={load:vi.fn(()=>theme.promise),apply:vi.fn()};
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:ThemeService,useValue:themeService},{provide:GYM_REPOSITORY,useValue:{read:async()=>structuredClone(local),replace:vi.fn()}},Store],null as unknown as EnvironmentInjector);injectors.push(injector);
 const store=injector.get(Store);await vi.waitFor(()=>expect(store.ready()).toBe(true));
 expect(store.data().plans[0].name).toBe('Locale disponibile');expect(request).toHaveBeenCalledWith('catalog');expect(themeService.load).toHaveBeenCalledOnce();
});

it('does not mistake catalog receipt bookkeeping for a personal edit during eligible recovery',async()=>{
 const head=deferred<Response>(),t=fixture(seed(),vi.fn(()=>head.promise));
 await vi.waitFor(()=>expect(t.store.ready()).toBe(true));
 expect(await t.store.change(data=>{data.settings[0].catalogBaseline={exercises:{'exercise-0':'a'.repeat(64)},groups:{}};},'',false)).toBe(true);
 head.resolve(Response.json({revision:1,backup:await exportBackup(plans('Piano recuperato'))}));
 await vi.waitFor(()=>expect(t.store.data().plans[0]?.name).toBe('Piano recuperato'));
 expect(await t.cloud.flush()).toBe(true);expect(t.cloud.status()).toBe('saved');
});

it('refreshes weekly workout counts at midnight without requiring a data write',async()=>{
 environment();const local=seed(),date=signal('2026-10-25');
 local.workouts.push({id:'w',userId:'local',planId:'p',dayId:'d',planName:'Piano',dayName:'Giorno',date:'2026-10-25',startedAt:'2026-10-25T12:00:00.000Z',endedAt:'2026-10-25T12:30:00.000Z',duration:30,notes:'',status:'completed'});
 const injector=createEnvironmentInjector([{provide:TodayService,useValue:{date}},{provide:GYM_REPOSITORY,useValue:{read:async()=>local,replace:vi.fn()}},Store],null as unknown as EnvironmentInjector);injectors.push(injector);
 const store=injector.get(Store);await vi.waitFor(()=>expect(store.ready()).toBe(true));expect(store.week()).toHaveLength(1);
 date.set('2026-10-26');expect(store.week()).toHaveLength(0);expect(store.data()).toBe(local);
});
