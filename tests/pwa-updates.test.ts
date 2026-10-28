import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,signal} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {Subject} from 'rxjs';
import {afterEach,expect,it,vi} from 'vitest';
import {AppUpdateEvent,PwaService} from '../src/app/services/pwa';
import {Store} from '../src/app/services/store';
import {AppActivationUncertainError,AppReleaseService} from '../src/app/services/app-release';
import {ArchiveSyncService} from '../src/app/services/archive-sync';
import {FormDraftService} from '../src/app/services/form-drafts';
afterEach(()=>vi.unstubAllGlobals());

function setup(released=false){
 const target=new EventTarget();Object.assign(target,{innerHeight:800});
 vi.stubGlobal('window',target);vi.stubGlobal('matchMedia',()=>({matches:false}));
 vi.stubGlobal('document',Object.assign(new EventTarget(),{documentElement:{style:{setProperty:()=>{}}},body:{classList:{toggle:()=>{}}}}));
 vi.stubGlobal('navigator',{onLine:true,storage:{persisted:async()=>true,estimate:async()=>({usage:1,quota:100})}});
 const reload=vi.fn();vi.stubGlobal('location',{reload});
 let pending:Promise<unknown>=Promise.resolve();
 const store={ready:()=>true,error:signal(''),settled:()=>pending,draft:signal<any>(null),busy:()=>false,conflicted:signal(false)};
 const release={checked:new Subject<void>(),updateReady:()=>released,autoUpdateReady:()=>released,downloadedBuild:()=>released?'b'.repeat(64):null,policy:()=>released?{requestedBuildId:'b'.repeat(64)}:null,check:vi.fn().mockResolvedValue(false),activateReady:vi.fn().mockResolvedValue(released)};
 const cloud={flush:vi.fn().mockResolvedValue(true)},drafts={flushAll:vi.fn().mockResolvedValue(true)};
 const injector=createEnvironmentInjector([{provide:Store,useValue:store},{provide:AppReleaseService,useValue:release},{provide:ArchiveSyncService,useValue:cloud},{provide:FormDraftService,useValue:drafts},{provide:SwUpdate,useValue:{versionUpdates:new Subject()}},PwaService],null as unknown as EnvironmentInjector);
 return{target,reload,store,release,cloud,drafts,injector,pwa:injector.get(PwaService),queue:(p:Promise<unknown>)=>pending=p};
}
it('flushes the active draft and waits for all queued writes before reloading the app',async()=>{
 const t=setup();let finish!:()=>void;
 t.target.addEventListener('gymtrack:before-update',()=>t.queue(new Promise<void>(r=>finish=r)));
 try{const updating=t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.pwa.updating()).toBe(true);await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();finish();await updating;expect(t.reload).toHaveBeenCalledTimes(1);}finally{t.injector.destroy();}
});
it('keeps the app open when a pending save failed',async()=>{
 const t=setup();t.store.error.set('Spazio locale esaurito');
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.store.error()).toBe('Spazio locale esaurito');expect(t.pwa.updateError()).toContain('Aggiornamento sospeso');}finally{t.injector.destroy();}
});
it('keeps the app open when an editor rejects its draft even if a later write clears the global error',async()=>{
 const t=setup();
 t.target.addEventListener('gymtrack:before-update',event=>{(event as AppUpdateEvent).waitUntil(Promise.resolve(false));t.store.error.set('');});
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.pwa.updateError()).toContain('correggi i dati');}finally{t.injector.destroy();}
});

it('updates manually from saved local data without requiring a server copy or a backup export',async()=>{
 const t=setup();t.cloud.flush.mockResolvedValue(false);
 try{await t.pwa.reload();expect(t.reload).toHaveBeenCalledOnce();expect(t.cloud.flush).not.toHaveBeenCalled();expect(t.drafts.flushAll).toHaveBeenCalledTimes(2);expect(t.pwa.updateError()).toBe('');}finally{t.injector.destroy();}
});
it('defers automatic updates with pending server sync without presenting it as a failed distribution',async()=>{
 const t=setup(true);t.cloud.flush.mockResolvedValue(false);
 try{await vi.waitFor(()=>expect(t.cloud.flush).toHaveBeenCalledOnce());expect(t.reload).not.toHaveBeenCalled();expect(t.release.activateReady).not.toHaveBeenCalled();expect(t.pwa.updateError()).toBe('');expect(t.pwa.updateNotice()).toContain('non serve un backup manuale');}finally{t.injector.destroy();}
});
it('does not bypass local conflicts or failed queued writes during a manual update',async()=>{
 const t=setup();t.store.conflicted.set(true);
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();t.store.conflicted.set(false);t.queue(Promise.resolve(false));await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.pwa.updateError()).toContain('salvataggio sul dispositivo');}finally{t.injector.destroy();}
});
it.each([true,false])('finishes logout without backup, sync or draft validation (online=%s)',async online=>{
 const t=setup();vi.stubGlobal('navigator',{onLine:online});t.cloud.flush.mockResolvedValue(false);
 t.store.error.set('Errore precedente');t.store.conflicted.set(true);t.queue(Promise.resolve(false));t.drafts.flushAll.mockResolvedValue(false);
 const validate=vi.fn((event:Event)=>(event as AppUpdateEvent).waitUntil(Promise.resolve(false)));t.target.addEventListener('gymtrack:before-update',validate);
 try{expect(await t.pwa.prepareExit('logout')).toBe(true);expect(t.drafts.flushAll).toHaveBeenCalledOnce();expect(validate).not.toHaveBeenCalled();expect(t.cloud.flush).not.toHaveBeenCalled();expect(t.pwa.updateError()).toBe('');expect(t.store.error()).toBe('Errore precedente');}finally{t.injector.destroy();}
});
it('leaves after one second even when the automatic local draft save never acknowledges',async()=>{
 vi.useFakeTimers();const t=setup();t.drafts.flushAll.mockImplementation(()=>new Promise(()=>{}));
 try{const exit=t.pwa.prepareExit('logout');await vi.advanceTimersByTimeAsync(1000);expect(await exit).toBe(true);expect(t.cloud.flush).not.toHaveBeenCalled();expect(t.pwa.updateError()).toBe('');}finally{t.injector.destroy();vi.useRealTimers();}
});
it('defers a requested automatic update while a workout is open and applies it after the workout ends',async()=>{
 vi.useFakeTimers();const t=setup();t.store.draft.set({id:'active'});t.release.autoUpdateReady=()=>true;t.release.downloadedBuild=()=> 'b'.repeat(64);t.release.policy=()=>({requestedBuildId:'b'.repeat(64)} as any);t.release.activateReady.mockResolvedValue(true);
 try{t.release.checked.next();await Promise.resolve();expect(t.reload).not.toHaveBeenCalled();expect(t.release.activateReady).not.toHaveBeenCalled();t.store.draft.set(null);await vi.advanceTimersByTimeAsync(30000);expect(t.release.activateReady).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));expect(t.reload).toHaveBeenCalledOnce();}finally{t.injector.destroy();vi.useRealTimers();}
});
it('finishes logout without waiting for an update download or activation',async()=>{
 const t=setup();t.release.check.mockImplementation(()=>new Promise(()=>{}));t.release.activateReady.mockImplementation(()=>new Promise(()=>{}));
 try{await t.pwa.finishLogoutUpdate();expect(t.reload).toHaveBeenCalledOnce();expect(t.release.check).not.toHaveBeenCalled();expect(t.release.activateReady).not.toHaveBeenCalled();}finally{t.injector.destroy();}
});
it('freezes input before capturing drafts and restores interaction after a rejected exit',async()=>{
 const t=setup(),root={inert:false};Object.assign(document,{querySelector:()=>root});
 t.drafts.flushAll.mockImplementationOnce(async()=>{expect(root.inert).toBe(true);return false;});
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(root.inert).toBe(false);}finally{t.injector.destroy();}
});
it('adopts an update downloaded on the sign-in screen before the authenticated shell was created',async()=>{
 const t=setup(true);
 try{await vi.waitFor(()=>expect(t.reload).toHaveBeenCalledOnce());expect(t.release.activateReady).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));}finally{t.injector.destroy();}
});
it('reloads coherently after an ambiguous activation instead of resuming an old page under a newer worker',async()=>{
 const t=setup(),root={inert:false};Object.assign(document,{querySelector:()=>root});t.release.activateReady.mockRejectedValue(new AppActivationUncertainError());
 try{await t.pwa.reload();expect(t.reload).toHaveBeenCalledOnce();expect(root.inert).toBe(true);expect(t.store.error()).toBe('');}finally{t.injector.destroy();}
});
it('retains the page if the final draft state cannot be written during manual update',async()=>{
 const t=setup();t.drafts.flushAll.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
 try{await t.pwa.reload();expect(t.cloud.flush).not.toHaveBeenCalled();expect(t.reload).not.toHaveBeenCalled();expect(t.pwa.updateError()).toContain('Bozza non salvata');}finally{t.injector.destroy();}
});
