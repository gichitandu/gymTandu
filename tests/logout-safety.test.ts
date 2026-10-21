import '@angular/compiler';
import {afterEach,expect,it,vi} from 'vitest';
import {ARCHIVE_CHOICE_KEY,AuthService,OFFLINE_ACCOUNT_KEY,PENDING_LOGOUT_KEY} from '../src/app/services/auth';

afterEach(()=>vi.unstubAllGlobals());
function browser(online=true){
  const storage=new Map([[ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'signed-out'})],['gymtrack-saved-data','keep-me']]);
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,user:{id:'new-user',name:'Atleta',email:'test@example.test',role:'User',active:true,owner:false}})});
  const navigator={onLine:online},reload=vi.fn();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
  vi.stubGlobal('navigator',navigator);vi.stubGlobal('fetch',fetch);vi.stubGlobal('location',{reload});
  return {storage,fetch,navigator,reload};
}
it('logs out once, keeps saved data, and allows the update coordinator to control reloading',async()=>{
  const t=browser();const auth=new AuthService();auth.user.set({id:'u',name:'Atleta',email:'u@test.it',role:'User',active:true,owner:false});
  let finish!:(value:unknown)=>void;t.fetch.mockReturnValueOnce(new Promise(resolve=>finish=resolve));
  const first=auth.logout({reload:false});await auth.logout({reload:false});
  expect(t.fetch).toHaveBeenCalledTimes(1);expect(auth.user()?.id).toBe('u');
  finish({ok:true,json:async()=>({ok:true})});await first;
  expect(auth.user()).toBeNull();expect(auth.archiveChoice()?.mode).toBe('signed-out');
  expect(t.storage.get('gymtrack-saved-data')).toBe('keep-me');expect(t.reload).not.toHaveBeenCalled();
});
it('retains the current session when online revocation fails so retry is possible',async()=>{
  const t=browser();const auth=new AuthService();const user={id:'u',name:'Atleta',email:'u@test.it',role:'User' as const,active:true,owner:false};auth.user.set(user);
  t.fetch.mockRejectedValueOnce(Error('Network failed'));
  await expect(auth.logout({reload:false})).rejects.toThrow('Network failed');
  expect(auth.user()).toEqual(user);expect(auth.loggingOut()).toBe(false);
  await auth.logout({reload:false});expect(auth.user()).toBeNull();
});
it('records an offline exit and revokes its pending cookie before a later login',async()=>{
  const t=browser(false);t.storage.set(OFFLINE_ACCOUNT_KEY,JSON.stringify({id:'old',name:'Old',owner:false}));
  const auth=new AuthService();await auth.logout({reload:false});
  expect(t.fetch).not.toHaveBeenCalled();expect(t.storage.get(PENDING_LOGOUT_KEY)).toBe('1');expect(t.storage.has(OFFLINE_ACCOUNT_KEY)).toBe(false);
  t.navigator.onLine=true;
  const reopened=new AuthService();await reopened.login('new@example.test','a-password');
  expect(t.fetch.mock.calls.map(call=>call[0])).toEqual(['/api/auth/logout','/api/auth/login']);
  expect(t.storage.has(PENDING_LOGOUT_KEY)).toBe(false);expect(reopened.user()?.id).toBe('new-user');
});
it('ignores a refresh started before logout and keeps the transition locked until reload',async()=>{
  const t=browser();t.storage.set(ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'device'}));
  let finish!:(value:unknown)=>void;t.fetch.mockReturnValueOnce(new Promise(resolve=>finish=resolve));
  const auth=new AuthService();await auth.logout({reload:false});
  finish({ok:true,json:async()=>({user:{id:'old',name:'Old',owner:true,role:'SuperAdmin'},platformOwner:true})});
  await Promise.resolve();await Promise.resolve();
  expect(auth.user()).toBeNull();expect(auth.archiveChoice()?.mode).toBe('signed-out');expect(auth.platformOwner()).toBe(false);expect(auth.loggingOut()).toBe(true);
  await expect(auth.login('other@test.it','password')).rejects.toThrow('Uscita in corso');auth.openLocal();expect(auth.user()).toBeNull();
});
