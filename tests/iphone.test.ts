import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {seed} from '../src/app/core/seed';
import {GymDatabase} from '../src/app/core/database';
import {exportBackup,importBackup} from '../src/app/services/backup';
import {encodedDimensions,imageSize} from '../src/app/services/images';
import {foodSuggestions,FOODS,portion} from '../src/app/services/nutrition';
import {AuthService,OFFLINE_ACCOUNT_KEY} from '../src/app/services/auth';
import {Store} from '../src/app/services/store';
import {ThemeService} from '../src/app/services/theme';
import {GYM_REPOSITORY} from '../src/app/repositories/repository';
import {createEnvironmentInjector,EnvironmentInjector,signal} from '@angular/core';
afterEach(()=>vi.unstubAllGlobals());
it('upgrades the existing Dexie v1 archive without losing plans, history or profile',async()=>{
 const name='ios-upgrade-'+crypto.randomUUID(),old=new Dexie(name);
 old.version(1).stores({profiles:'id,role',roles:'id,&name',plans:'id,userId,active,archived',days:'id,planId,order',planExercises:'id,dayId,exerciseId',exercises:'id,name,muscleGroupId,equipment,active',muscleGroups:'id,&name',workouts:'id,userId,planId,dayId,date,status',workoutExercises:'id,workoutId,exerciseId',sets:'id,workoutExerciseId',settings:'id'});
 const d=seed();d.plans.push({id:'old-plan',userId:'local',name:'Piano precedente',description:'Da conservare',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),active:true,archived:false});d.days.push({id:'old-day',planId:'old-plan',name:'Giorno precedente',order:0});d.workouts.push({id:'old-workout',userId:'local',planId:'old-plan',dayId:'old-day',planName:'Piano precedente',dayName:'Giorno precedente',date:'2026-10-20',startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),duration:100,notes:'Storico da conservare',status:'completed'});for(const [name,rows] of Object.entries(d))if(old.tables.some(t=>t.name===name))await old.table(name).bulkPut(rows);
 old.close();const db=new GymDatabase(name);try{const snapshot=await db.snapshot();expect(snapshot.profiles).toEqual(d.profiles);expect(snapshot.exercises.sort((a,b)=>a.id.localeCompare(b.id))).toEqual(d.exercises.sort((a,b)=>a.id.localeCompare(b.id)));expect(snapshot.plans).toEqual(d.plans);expect(snapshot.workouts).toEqual(d.workouts);expect(snapshot.meals).toEqual([]);expect(db.verno).toBe(7);}finally{await db.delete();}
});
it('roundtrips nutrition photos and migrates existing v1 JSON backups',async()=>{
 const d=seed(),bytes=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,0]);
 d.meals.push({id:'meal',date:'2026-10-21',name:'Pasto corretto',grams:125,calories:150,protein:10,carbs:15,fat:5,notes:'Dati modificati manualmente',source:'photo-suggestion',photo:new Blob([bytes],{type:'image/jpeg'}),createdAt:new Date().toISOString()});
 const decoded=await importBackup(await exportBackup(d));expect(decoded.meals[0].name).toBe('Pasto corretto');expect(await decoded.meals[0].photo!.arrayBuffer()).toEqual(bytes.buffer);
 const legacy=JSON.parse(await exportBackup(seed()));legacy.schemaVersion=1;delete legacy.data.meals;expect((await importBackup(JSON.stringify(legacy))).meals).toEqual([]);
 const invalid=JSON.parse(await exportBackup(d));invalid.data.meals[0].grams=-1;await expect(importBackup(JSON.stringify(invalid))).rejects.toThrow('non validi');
});
it('downscales with aspect ratio and rejects oversized photos before decode',()=>{
 expect(imageSize(4032,3024)).toEqual({width:1280,height:960});expect(imageSize(100,200)).toEqual({width:100,height:200});expect(()=>imageSize(10000,10000)).toThrow();
 const png=new Uint8Array(24);png.set([137,80,78,71]);const view=new DataView(png.buffer);view.setUint32(16,12000);view.setUint32(20,12000);const size=encodedDimensions(png)!;expect(size).toEqual({width:12000,height:12000});expect(()=>imageSize(size.width,size.height)).toThrow();
});
it('uses explicit grams for estimates and never turns unknown/weak AI labels into nutrition values',()=>{
 expect(portion(FOODS[0],200).calories).toBe(178);expect(()=>portion(FOODS[0],NaN)).toThrow();
 expect(foodSuggestions([{label:'banana',probability:.8}])[0].id).toBe('banana');expect(foodSuggestions([{label:'banana',probability:.01}])).toEqual([]);expect(foodSuggestions([{label:'plate',probability:.95}])).toEqual([]);
});
it('allows a server-free local archive and never grants offline admin privileges',async()=>{
 const saved={id:'owner-id',name:'Owner',email:'owner@test.com',role:'SuperAdmin',active:true,owner:true};const storage=new Map([[OFFLINE_ACCOUNT_KEY,JSON.stringify(saved)]]);
 vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});vi.stubGlobal('navigator',{onLine:false});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const auth=new AuthService();await Promise.resolve();auth.openLocal(true);expect(auth.user()?.id).toBe('owner-id');expect(auth.user()?.role).toBe('User');await expect(auth.request('users')).rejects.toThrow('online');expect(fetch).not.toHaveBeenCalled();
 auth.openLocal();expect(auth.user()?.id).toBe('device-local');
});
it('can create a workout plan and meal offline without calling a server',async()=>{
 vi.stubGlobal('document',{body:{classList:{toggle:()=>{}}}});
 const db=new GymDatabase('offline-store-'+crypto.randomUUID());
 const auth={user:signal({id:'device-local',name:'Atleta',role:'User',active:true,owner:false}),offlineMode:()=>true,request:vi.fn()};
 const injector=createEnvironmentInjector([{provide:GYM_REPOSITORY,useValue:{read:()=>db.snapshot(),replace:(d:any)=>db.replace(d)}},{provide:AuthService,useValue:auth},Store],null as unknown as EnvironmentInjector);
 try{const s=injector.get(Store);await vi.waitFor(()=>expect(s.ready()).toBe(true));expect(s.canEditCatalog()).toBe(true);expect(s.sharedCatalog()).toBe(false);expect(await s.savePlan('offline-plan','Piano offline','')).toBe(true);await s.saveDay('offline-day','offline-plan','Giorno 1');
 expect(await s.savePlanExercise({id:'pe',dayId:'offline-day',exerciseId:'exercise-0',sets:3,repsMin:8,repsMax:12,rest:90,notes:'',order:0})).toBe(true);
 expect(await s.start('offline-day')).toBe(true);expect(s.draft()).toBeTruthy();
 expect(await s.change(d=>{d.meals.push({id:'m',date:'2026-10-21',name:'Pasto offline',grams:100,calories:100,protein:5,carbs:10,fat:4,notes:'',source:'manual',createdAt:new Date().toISOString()});})).toBe(true);
 const read=await db.snapshot();expect(read.workouts).toHaveLength(1);expect(read.meals).toHaveLength(1);expect(auth.request).not.toHaveBeenCalled();
 }finally{injector.destroy();await db.delete();}
});

it('keeps a changed theme on the device when remote sync fails and retries it before reading old remote values',async()=>{
 const id='theme-offline-'+crypto.randomUUID(),request=vi.fn().mockRejectedValue(Error('offline'));
 vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('document',{body:{style:{setProperty:()=>{}},classList:{toggle:()=>{}}},querySelector:()=>null});
 const auth={user:()=>({id}),offlineMode:()=>false,request};
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},ThemeService],null as unknown as EnvironmentInjector);
 try{const theme=injector.get(ThemeService);await theme.save('#123456');expect(theme.color()).toBe('#123456');request.mockResolvedValue({backgroundColor:'#050b12'});await theme.load();expect(request).toHaveBeenLastCalledWith('preferences',{backgroundColor:'#123456'});expect(theme.color()).toBe('#123456');}
 finally{const db=new Dexie('gymtrack-preferences-v1');db.version(1).stores({preferences:'id'});await db.table('preferences').delete(id);db.close();injector.destroy();}
});

it('preserves a compressed profile photo through backup and accepts older v2 backups without it',async()=>{
 const data=seed(),bytes=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,0]);data.profiles[0].photo=new Blob([bytes],{type:'image/jpeg'});
 const restored=await importBackup(await exportBackup(data));expect(await restored.profiles[0].photo!.arrayBuffer()).toEqual(bytes.buffer);
 const old=JSON.parse(await exportBackup(seed()));old.schemaVersion=2;const result=await importBackup(JSON.stringify(old));expect(result.profiles[0].photo).toBeUndefined();expect(result.exercises).toHaveLength(253);
});
