import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext} from '@angular/core';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthService,ARCHIVE_CHOICE_KEY,Account} from '../src/app/services/auth';
import {Store} from '../src/app/services/store';
import {UsersComponent} from '../src/app/features/users.component';
const superAdmin:Account={id:'super',name:'Tandu',email:'super@example.test',role:'SuperAdmin',active:true,owner:true};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function context(account:Account=superAdmin){
 const storage=new Map([[ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'signed-out'})],['archive-preservation','unchanged']]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('window',{addEventListener:vi.fn()});
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({user:account,setup:false,ownerEmail:superAdmin.email})});vi.stubGlobal('fetch',fetch);
 const auth=new AuthService();auth.user.set(account);return{auth,fetch,storage};
}
it('defaults to the real role and changes presentation without changing account, archive choice or issuing requests',()=>{
 const {auth,fetch,storage}=context();const before=[...storage];
 expect(auth.viewAsClient()).toBe(false);expect(auth.uiRole()).toBe('SuperAdmin');
 auth.setClientView(true);expect(auth.viewAsClient()).toBe(true);expect(auth.uiRole()).toBe('User');expect(auth.user()).toBe(superAdmin);expect(auth.user()?.role).toBe('SuperAdmin');expect([...storage]).toEqual(before);expect(fetch).not.toHaveBeenCalled();
 auth.setClientView(false);expect(auth.uiRole()).toBe('SuperAdmin');
});
it.each(['User','Admin'] as const)('does not enable client preview for %s accounts',role=>{
 const {auth}=context({...superAdmin,role,owner:false});auth.setClientView(true);expect(auth.viewAsClient()).toBe(false);expect(auth.uiRole()).toBe(role);
});
it('hides catalog editing while leaving the real super admin account intact',()=>{
 const {auth}=context();const store={auth,sharedCatalog:()=>true};
 expect(Store.prototype.canEditCatalog.call(store)).toBe(true);auth.setClientView(true);expect(Store.prototype.canEditCatalog.call(store)).toBe(false);auth.setClientView(false);expect(Store.prototype.canEditCatalog.call(store)).toBe(true);expect(auth.user()?.role).toBe('SuperAdmin');
});
it('prevents direct administration loads and saves in preview mode',async()=>{
 const {auth,fetch}=context();auth.setClientView(true);
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth}],null as unknown as EnvironmentInjector);
 const component=runInInjectionContext(injector,()=>new UsersComponent());expect(component.canManage()).toBe(false);await component.load();await component.save();expect(fetch).not.toHaveBeenCalled();
 auth.setClientView(false);expect(component.canManage()).toBe(true);injector.destroy();
});
it('starts new access in super admin view and clears preview on logout without touching stored archives',async()=>{
 const {auth,storage}=context();auth.setClientView(true);await auth.login('super@example.test','password');expect(auth.viewAsClient()).toBe(false);expect(auth.uiRole()).toBe('SuperAdmin');auth.setClientView(true);await auth.logout({reload:false});expect(auth.viewAsClient()).toBe(false);expect(storage.get('archive-preservation')).toBe('unchanged');
});
