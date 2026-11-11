import '@angular/compiler';
import {createEnvironmentInjector,EnvironmentInjector,ɵChangeDetectionScheduler as ChangeDetectionScheduler,ɵINJECTOR_SCOPE as INJECTOR_SCOPE} from '@angular/core';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthService,ARCHIVE_CHOICE_KEY,Account} from '../src/app/services/auth';
import {HubLaunchService} from '../src/app/hub/hub-access';
const superAdmin:Account={id:'super',name:'Tandu',email:'super@example.test',role:'SuperAdmin',active:true,owner:true};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function launch(){
 const storage=new Map([[ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'signed-out'})]]);
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('window',{addEventListener:vi.fn()});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({user:superAdmin,setup:false,ownerEmail:superAdmin.email})}));
 const auth=new AuthService();auth.user.set(superAdmin);
 const injector=createEnvironmentInjector([{provide:INJECTOR_SCOPE,useValue:'root'},{provide:AuthService,useValue:auth},{provide:ChangeDetectionScheduler,useValue:{notify:()=>{},runningTick:false}},HubLaunchService],null as unknown as EnvironmentInjector);
 return injector.get(HubLaunchService);
}
it('asks which app to open on the first GymTrack start',()=>{
 expect(launch().startTarget()).toBe('/scegli-app');
});
it('does not send GymTrack back to the chooser once the app was picked after a reload on the chooser or the Hub',()=>{
 const service=launch();
 // Reopened directly on /scegli-app: the GymTrack card remembers the choice, then the GymTrack frame starts for the first time.
 service.remember('gymtrack');
 expect(service.claimFirstOpen('archive')).toBe(true);
 expect(service.startTarget()).toBeNull();
});
it('does not bounce to the chooser when switching from the Hub to GymTrack',()=>{
 const service=launch();
 service.remember('hub');
 expect(service.startTarget()).toBeNull();
 expect(service.read().last).toBe('hub');
});
