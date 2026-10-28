import '@angular/compiler';
import {afterEach,expect,it,vi} from 'vitest';
import {restoreOfflineLaunchUrl} from '../src/app/services/launch-url';
import {ARCHIVE_CHOICE_KEY,AuthService,OFFLINE_ACCOUNT_KEY} from '../src/app/services/auth';
afterEach(()=>vi.unstubAllGlobals());
function launch(href:string){const state={navigationId:42},replaceState=vi.fn();const target={location:{href},history:{state,replaceState}} as unknown as Pick<Window,'location'|'history'>;return{target,replaceState,state};}
it.each(['?ngsw-bypass=1','?NGSW-BYPASS','?ngsw-bypass=1&ngsw-bypass=2'])('restores cached navigation after one-off recovery %s without reloading or changing the workout route',query=>{
 const t=launch('https://gymtrack.test/'+query+'#/sessione?workout=existing');
 expect(restoreOfflineLaunchUrl(t.target)).toBe(true);expect(t.replaceState).toHaveBeenCalledExactlyOnceWith(t.state,'','/#/sessione?workout=existing');
});
it('retains unrelated parameters, path, route and browser history state',()=>{
 const t=launch('https://gymtrack.test/app/?source=home&ngsw-bypass=1&view=week#/profilo?section=settings');
 restoreOfflineLaunchUrl(t.target);expect(t.replaceState).toHaveBeenCalledExactlyOnceWith(t.state,'','/app/?source=home&view=week#/profilo?section=settings');
});
it('leaves normal launches and hash-route parameters unchanged',()=>{
 const t=launch('https://gymtrack.test/#/profilo?ngsw-bypass=1');expect(restoreOfflineLaunchUrl(t.target)).toBe(false);expect(t.replaceState).not.toHaveBeenCalled();
});
it('does not interrupt startup if the browser cannot replace history',()=>{
 const t=launch('https://gymtrack.test/?ngsw-bypass=1#/');t.replaceState.mockImplementation(()=>{throw Error('Unavailable');});expect(()=>restoreOfflineLaunchUrl(t.target)).not.toThrow();
});
it('reopens the opted-in Tandu account offline without a login request or administrative permissions',()=>{
 const saved={id:'tandu',name:'Tandu',owner:true,role:'User',email:'test@example.test',active:true},choice={mode:'account',accountId:'tandu'};
 const storage=new Map([[OFFLINE_ACCOUNT_KEY,JSON.stringify(saved)],[ARCHIVE_CHOICE_KEY,JSON.stringify(choice)],['gymtrack-saved-data','existing-plan-and-workouts']]);
 vi.stubGlobal('navigator',{onLine:false});vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const auth=new AuthService();expect(auth.loading()).toBe(false);expect(auth.offlineMode()).toBe(true);expect(auth.user()).toMatchObject({id:'tandu',owner:true,role:'User'});expect(fetch).not.toHaveBeenCalled();expect(storage.get('gymtrack-saved-data')).toBe('existing-plan-and-workouts');
});
