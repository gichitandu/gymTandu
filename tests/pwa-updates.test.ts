import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,signal} from '@angular/core';
import {SwUpdate} from '@angular/service-worker';
import {Subject} from 'rxjs';
import {afterEach,expect,it,vi} from 'vitest';
import {AppUpdateEvent,PwaService} from '../src/app/services/pwa';
import {Store} from '../src/app/services/store';
afterEach(()=>vi.unstubAllGlobals());

function setup(){
 const target=new EventTarget();Object.assign(target,{innerHeight:800});
 vi.stubGlobal('window',target);vi.stubGlobal('matchMedia',()=>({matches:false}));
 vi.stubGlobal('document',Object.assign(new EventTarget(),{documentElement:{style:{setProperty:()=>{}}},body:{classList:{toggle:()=>{}}}}));
 vi.stubGlobal('navigator',{onLine:true,storage:{persisted:async()=>true,estimate:async()=>({usage:1,quota:100})}});
 const reload=vi.fn();vi.stubGlobal('location',{reload});
 let pending:Promise<unknown>=Promise.resolve();
 const store={ready:()=>true,error:signal(''),settled:()=>pending};
 const injector=createEnvironmentInjector([{provide:Store,useValue:store},{provide:SwUpdate,useValue:{versionUpdates:new Subject()}},PwaService],null as unknown as EnvironmentInjector);
 return{target,reload,store,injector,pwa:injector.get(PwaService),queue:(p:Promise<unknown>)=>pending=p};
}
it('flushes the active draft and waits for all queued writes before reloading the app',async()=>{
 const t=setup();let finish!:()=>void;
 t.target.addEventListener('gymtrack:before-update',()=>t.queue(new Promise<void>(r=>finish=r)));
 try{const updating=t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.pwa.updating()).toBe(true);await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();finish();await updating;expect(t.reload).toHaveBeenCalledTimes(1);}finally{t.injector.destroy();}
});
it('keeps the app open when a pending save failed',async()=>{
 const t=setup();t.store.error.set('Spazio locale esaurito');
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.store.error()).toContain('Aggiornamento sospeso');}finally{t.injector.destroy();}
});
it('keeps the app open when an editor rejects its draft even if a later write clears the global error',async()=>{
 const t=setup();
 t.target.addEventListener('gymtrack:before-update',event=>{(event as AppUpdateEvent).waitUntil(Promise.resolve(false));t.store.error.set('');});
 try{await t.pwa.reload();expect(t.reload).not.toHaveBeenCalled();expect(t.store.error()).toContain('correggi i dati');}finally{t.injector.destroy();}
});
