import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {Router} from '@angular/router';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthService} from '../src/app/services/auth';
import {AppFeaturesService} from '../src/app/services/app-features';
import {nutritionEnabledGuard} from '../src/app/services/nutrition-guard';
const effects=vi.hoisted(()=>[] as (()=>void)[]);
vi.mock('@angular/core',async original=>({...await original<typeof import('@angular/core')>(),effect:(callback:()=>void)=>{effects.push(callback);return{destroy:()=>{}};}}));
const injectors:EnvironmentInjector[]=[];
afterEach(()=>{for(const injector of injectors.splice(0))injector.destroy();effects.length=0;vi.useRealTimers();vi.unstubAllGlobals();});
function setup(role='SuperAdmin',result=false){
 const storage=new Map<string,string>(),window=new EventTarget(),document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('navigator',{onLine:true});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)});
 const request=vi.fn().mockResolvedValue({nutritionEnabled:result,revision:1,updatedAt:1}),auth={user:signal<any>({id:'a',role}),uiRole:signal(role),offlineMode:signal(false),loading:signal(false),request};
 const router={createUrlTree:vi.fn(()=>({home:true}))};
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:Router,useValue:router},AppFeaturesService],null as unknown as EnvironmentInjector);injectors.push(injector);
 const features=injector.get(AppFeaturesService);return{features,auth,request,storage,window,document,injector,router,sync:()=>effects.forEach(callback=>callback())};
}
it('starts hidden and applies only a validated server response',async()=>{
 const t=setup('User',true);expect(t.features.nutritionEnabled()).toBe(false);expect(t.features.ready()).toBe(false);
 expect(await t.features.ensureLoaded()).toBe(true);expect(t.request).toHaveBeenCalledWith('app-features');expect(t.storage.get('gymtrack-app-features-v1:a')).toContain('"nutritionEnabled":true');
});
it.each(['User','Admin'])('prevents %s from changing global section visibility',async role=>{
 const t=setup(role);await t.features.ensureLoaded();t.request.mockClear();expect(await t.features.setNutritionEnabled(true)).toBe(false);expect(t.request).not.toHaveBeenCalled();expect(t.features.nutritionEnabled()).toBe(false);
});
it('hides the administration action in client preview and rejects forged frontend calls there',async()=>{
 const t=setup();await t.features.ensureLoaded();t.auth.uiRole.set('User');t.request.mockClear();expect(await t.features.setNutritionEnabled(true)).toBe(false);expect(t.request).not.toHaveBeenCalled();
});
it('rolls back a failed save and leaves the persisted flag unchanged',async()=>{
 const t=setup('SuperAdmin',true);await t.features.ensureLoaded();t.request.mockRejectedValueOnce(Error('Server rejected'));
 expect(await t.features.setNutritionEnabled(false)).toBe(false);expect(t.features.nutritionEnabled()).toBe(true);expect(t.features.error()).toContain('Server rejected');expect(t.storage.get('gymtrack-app-features-v1:a')).toContain('"nutritionEnabled":true');
});
it('stores the confirmed global flag and supports restoring it for the same offline account',async()=>{
 const t=setup();await t.features.ensureLoaded();t.request.mockResolvedValue({nutritionEnabled:true,revision:2});expect(await t.features.setNutritionEnabled(true)).toBe(true);
 t.auth.offlineMode.set(true);t.features.nutritionEnabled.set(false);t.sync();expect(t.features.nutritionEnabled()).toBe(true);
 t.auth.user.set({id:'b',role:'User'});t.sync();expect(t.features.nutritionEnabled()).toBe(false);expect(t.features.ready()).toBe(true);
});
it('ignores the previous account response after changing accounts',async()=>{
 const t=setup();let resolve!:(value:unknown)=>void;t.request.mockReturnValueOnce(new Promise(done=>resolve=done));t.sync();
 t.auth.user.set({id:'b',role:'User'});t.sync();await vi.waitFor(()=>expect(t.features.ready()).toBe(true));expect(t.features.nutritionEnabled()).toBe(false);
 resolve({nutritionEnabled:true});await Promise.resolve();await Promise.resolve();expect(t.features.nutritionEnabled()).toBe(false);expect(t.storage.has('gymtrack-app-features-v1:a')).toBe(false);
});
it('does not let a stale GET undo a later explicit setting change',async()=>{
 const t=setup();let resolve!:(value:unknown)=>void;t.request.mockReturnValueOnce(new Promise(done=>resolve=done));t.sync();
 t.request.mockResolvedValueOnce({nutritionEnabled:true,revision:2});expect(await t.features.setNutritionEnabled(true)).toBe(true);resolve({nutritionEnabled:false,revision:1});await Promise.resolve();await Promise.resolve();expect(t.features.nutritionEnabled()).toBe(true);
});
it('waits for account loading before allowing a direct nutrition link',async()=>{
 const t=setup('User',true);t.auth.user.set(null);t.auth.loading.set(true);const result=runInInjectionContext(t.injector,()=>nutritionEnabledGuard({} as any,{} as any));
 t.auth.user.set({id:'a',role:'User'});t.auth.loading.set(false);t.sync();expect(await result).toBe(true);
});
it('redirects direct links home when the section is disabled',async()=>{
 const t=setup('User',false);const result=await runInInjectionContext(t.injector,()=>nutritionEnabledGuard({} as any,{} as any));expect(result).toEqual({home:true});expect(t.router.createUrlTree).toHaveBeenCalledWith(['/']);
});
it('bounds the direct-route wait when a feature request never resolves',async()=>{
 vi.useFakeTimers();const t=setup();t.request.mockReturnValue(new Promise(()=>{}));const result=t.features.ensureLoaded();await vi.advanceTimersByTimeAsync(7000);expect(await result).toBe(false);
});
it('applies the GT Hub and GT Garage flags, caches them for offline and lets only a Super Admin change them',async()=>{
 const t=setup('User');t.request.mockResolvedValue({nutritionEnabled:false,hubEnabled:true,garageEnabled:false,revision:3});
 await t.features.ensureLoaded();expect(t.features.hubEnabled()).toBe(true);expect(t.features.garageEnabled()).toBe(false);
 t.request.mockClear();expect(await t.features.setFeature('garageEnabled',true)).toBe(false);expect(t.request).not.toHaveBeenCalled();
 t.auth.offlineMode.set(true);t.features.hubEnabled.set(false);t.sync();expect(t.features.hubEnabled()).toBe(true);
});
it('sends only the changed Hub flag and rolls it back when the server refuses',async()=>{
 const t=setup();await t.features.ensureLoaded();t.request.mockResolvedValueOnce({nutritionEnabled:false,hubEnabled:true,garageEnabled:false,revision:2});
 expect(await t.features.setFeature('hubEnabled',true)).toBe(true);expect(t.request).toHaveBeenLastCalledWith('app-features',{hubEnabled:true},'POST');expect(t.features.hubEnabled()).toBe(true);
 t.request.mockRejectedValueOnce(Error('Database da aggiornare'));expect(await t.features.setFeature('garageEnabled',true)).toBe(false);expect(t.features.garageEnabled()).toBe(false);expect(t.features.hubEnabled()).toBe(true);
});
it('rejects malformed Hub flags from the server',async()=>{
 const t=setup('User');t.request.mockResolvedValue({nutritionEnabled:false,hubEnabled:'yes'});await t.features.ensureLoaded();expect(t.features.hubEnabled()).toBe(false);
});
