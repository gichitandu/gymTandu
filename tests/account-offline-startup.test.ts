import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector} from '@angular/core';
import {afterEach,expect,it,vi} from 'vitest';
import {seed} from '../src/app/core/seed';
import {GYM_REPOSITORY,IndexedDbRepository} from '../src/app/repositories/repository';
import {ARCHIVE_CHOICE_KEY,AuthService,OFFLINE_ACCOUNT_KEY} from '../src/app/services/auth';
import {ArchiveSyncService} from '../src/app/services/archive-sync';
import {Store} from '../src/app/services/store';

const instances:{injector:EnvironmentInjector;repository:IndexedDbRepository}[]=[];
afterEach(async()=>{
 for(const {injector,repository} of instances){await injector.get(Store).settled();injector.destroy();repository.db.close();}
 const databases=[...new Set(instances.map(item=>item.repository.storageKey))];instances.length=0;
 for(const name of databases)await new IndexedDbRepository(name).db.delete();
 vi.unstubAllGlobals();vi.restoreAllMocks();
});
function browser(){
 const user={id:'offline-'+crypto.randomUUID(),name:'Tandu',email:'test@example.test',owner:false,role:'User',active:true};
 const storage=new Map([[OFFLINE_ACCOUNT_KEY,JSON.stringify(user)],[ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'account',accountId:user.id})]]);
 const network={onLine:false};
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubGlobal('navigator',network);vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('document',Object.assign(new EventTarget(),{cookie:'',visibilityState:'visible',body:{classList:{toggle:()=>{}},style:{setProperty:()=>{}}},querySelector:()=>null}));
 return {user,storage,network};
}
function open(auth:AuthService,repository:IndexedDbRepository){
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:GYM_REPOSITORY,useValue:repository},ArchiveSyncService,Store],null as unknown as EnvironmentInjector);
 instances.push({injector,repository});return {store:injector.get(Store),cloud:injector.get(ArchiveSyncService)};
}
async function localPlan(name:string){
 const repository=new IndexedDbRepository(name),data=seed(),at='2026-10-29T08:00:00.000Z';
 data.plans.push({id:'p',userId:'local',name:'Piano già sul telefono',description:'',active:true,archived:false,createdAt:at,updatedAt:at});
 await repository.replace(data);repository.db.close();return repository.storageKey;
}
it('opens, edits and reopens the account IndexedDB entirely offline without a server backup or sync receipt',async()=>{
 const t=browser(),key=await localPlan('gymtrack-user-'+t.user.id),fetch=vi.fn().mockRejectedValue(Error('No network'));vi.stubGlobal('fetch',fetch);
 const first=open(new AuthService(),new IndexedDbRepository(key));
 await vi.waitFor(()=>expect(first.store.ready()).toBe(true));
 expect(first.store.data().plans[0].name).toBe('Piano già sul telefono');expect(first.store.archiveKey()).toBe(key);
 expect(t.storage.has('gymtrack-server-copy-v1:'+key)).toBe(false);
 expect(await first.store.savePlan('p','Modificato senza backup','')).toBe(true);
 const again=open(new AuthService(),new IndexedDbRepository(key));await vi.waitFor(()=>expect(again.store.ready()).toBe(true));
 expect(again.store.data().plans[0].name).toBe('Modificato senza backup');expect(fetch).not.toHaveBeenCalled();
});
it('keeps the local account usable when iPhone reports online but the first server-head request cannot finish',async()=>{
 const t=browser(),key=await localPlan('gymtrack-user-'+t.user.id),auth=new AuthService();
 let respond!:(response:Response)=>void;const fetch=vi.fn(()=>new Promise<Response>(resolve=>respond=resolve));vi.stubGlobal('fetch',fetch);t.network.onLine=true;
 const {store,cloud}=open(auth,new IndexedDbRepository(key));await vi.waitFor(()=>expect(store.ready()).toBe(true));
 expect(fetch).toHaveBeenCalledOnce();expect(store.data().plans[0].name).toBe('Piano già sul telefono');
 expect(await store.savePlan('p','Salvato durante la rete bloccata','')).toBe(true);
 respond(Response.json({error:'Servizio non disponibile'},{status:503}));
 await new Promise(resolve=>setImmediate(resolve));expect(cloud.revision()).toBe(0);expect(cloud.remoteSummary()).toBeNull();
 expect(store.data().plans[0].name).toBe('Salvato durante la rete bloccata');expect(store.ready()).toBe(true);
});
