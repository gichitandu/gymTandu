import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthService} from '../src/app/services/auth';
import {Store} from '../src/app/services/store';
import {ArchiveSyncService} from '../src/app/services/archive-sync';
import {ConfirmationService} from '../src/app/services/confirmation';
import {CalendarSubscriptionComponent} from '../src/app/shared/calendar-subscription.component';
const effects=vi.hoisted(()=>[] as (()=>void)[]);
vi.mock('@angular/core',async original=>({...await original<typeof import('@angular/core')>(),effect:(callback:()=>void)=>{effects.push(callback);return{destroy:()=>{}};}}));
afterEach(()=>{effects.length=0;vi.unstubAllGlobals();});
const url='https://calendar.example.test/calendar/'+'a'.repeat(64)+'.ics';
function setup(role='User',uiRole=role){
 const state={configured:true,enabled:true,url,updatedAt:1},request=vi.fn().mockResolvedValue(state),auth={user:signal({id:'u',role}),offlineMode:signal(false),uiRole:()=>uiRole,request};
 const snapshot={plans:['existing-plan'],history:['existing-workout']},store={settled:vi.fn().mockResolvedValue(true),data:()=>snapshot},cloud={flush:vi.fn().mockResolvedValue(false),status:signal('conflict')};
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:Store,useValue:store},{provide:ArchiveSyncService,useValue:cloud},{provide:DomSanitizer,useValue:{bypassSecurityTrustUrl:(value:string)=>value}},{provide:ConfirmationService,useValue:{ask:vi.fn().mockResolvedValue(false)}}],null as unknown as EnvironmentInjector);
 const component=runInInjectionContext(injector,()=>new CalendarSubscriptionComponent());effects.forEach(f=>f());return{component,auth,store,cloud,snapshot,state,injector};
}
it.each([['SuperAdmin','SuperAdmin'],['Admin','Admin'],['User','User'],['SuperAdmin','User']])('opens and loads the dedicated calendar panel for %s with %s view without waiting for a browser toggle',async(role,uiRole)=>{
 const t=setup(role,uiRole);t.component.expanded=true;effects.forEach(f=>f());
 try{await vi.waitFor(()=>expect(t.component.state()?.enabled).toBe(true));expect(t.component.panelOpen()).toBe(true);expect(t.auth.request).toHaveBeenCalledExactlyOnceWith('calendar-subscription');expect(t.cloud.flush).not.toHaveBeenCalled();}finally{t.injector.destroy();}
});
it('refreshes an existing account calendar without forcing a conflicting phone archive upload',async()=>{
 const t=setup();t.component.state.set(t.state);const before=JSON.stringify(t.snapshot);
 try{await t.component.connect();expect(t.cloud.flush).not.toHaveBeenCalled();expect(t.auth.request).toHaveBeenCalledWith('calendar-subscription',{},'POST');expect(t.component.failed()).toBe(false);expect(t.component.notice()).toContain('dati già sincronizzati');expect(JSON.stringify(t.snapshot)).toBe(before);}finally{t.injector.destroy();}
});
it('still requires a successful first online save for a new calendar connection',async()=>{
 const t=setup();t.component.state.set({...t.state,enabled:false});
 try{await t.component.connect();expect(t.cloud.flush).toHaveBeenCalledOnce();expect(t.auth.request).not.toHaveBeenCalled();expect(t.component.failed()).toBe(true);}finally{t.injector.destroy();}
});
it('reloads connection state when an open panel returns from offline to online',async()=>{
 const t=setup();t.auth.offlineMode.set(true);t.component.opened({target:{open:true}} as unknown as Event);effects.forEach(f=>f());expect(t.auth.request).not.toHaveBeenCalled();
 try{t.auth.offlineMode.set(false);effects.forEach(f=>f());await vi.waitFor(()=>expect(t.component.state()?.enabled).toBe(true));expect(t.auth.request).toHaveBeenCalledWith('calendar-subscription');}finally{t.injector.destroy();}
});
it('provides a selectable HTTPS fallback when iPhone clipboard access is denied',async()=>{
 const t=setup();t.component.state.set(t.state);vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(Error('NotAllowed'))}});
 try{await t.component.copy();expect(t.component.manual()).toBe(true);expect(t.component.httpsUrl()).toBe(url);expect(t.component.notice()).toContain('scegli Copia');expect(t.component.subscriptionUrl()).toBe('webcal:'+url.slice(6));t.component.state.set({...t.state,url:'javascript:alert(1)'});expect(t.component.subscriptionUrl()).toBeNull();}finally{t.injector.destroy();}
});
it('never refreshes a different account when access changes during the local save wait',async()=>{
 const t=setup();t.component.state.set(t.state);let release!:()=>void;t.store.settled.mockReturnValue(new Promise<void>(resolve=>release=resolve) as any);
 try{const job=t.component.connect();t.auth.user.set({id:'other',role:'User'});release();await job;expect(t.auth.request).not.toHaveBeenCalled();}finally{t.injector.destroy();}
});
