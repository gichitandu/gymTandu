import '@angular/compiler';
import 'fake-indexeddb/auto';
import {createEnvironmentInjector,EnvironmentInjector,signal} from '@angular/core';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {AuthService} from '../src/app/services/auth';
import {ThemeService} from '../src/app/services/theme';
import {ThemeConfig} from '../src/app/services/theme-palettes';

const cleanups:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();vi.unstubAllGlobals();});
async function setup(){
 const id='theme-config-'+crypto.randomUUID(),account=signal({id}),offline=signal(false),styles=new Map<string,string>(),classes=new Map<string,boolean>();
 let mediaListener:((event:{matches:boolean})=>void)|undefined,onlineListener:(()=>void)|undefined;
 const media={matches:false,addEventListener:vi.fn((_type:string,listener:(event:{matches:boolean})=>void)=>mediaListener=listener),removeEventListener:vi.fn()};
 vi.stubGlobal('matchMedia',()=>media);vi.stubGlobal('navigator',{onLine:true});
 vi.stubGlobal('window',{addEventListener:(_type:string,listener:()=>void)=>onlineListener=listener,removeEventListener:vi.fn()});
 vi.stubGlobal('document',{body:{dataset:{},style:{setProperty:(key:string,value:string)=>styles.set(key,value)},classList:{toggle:(key:string,value:boolean)=>classes.set(key,value)}},querySelector:()=>null});
 const request=vi.fn().mockResolvedValue({ok:true});
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:{user:account,offlineMode:offline,request}},ThemeService],null as unknown as EnvironmentInjector);
 const theme=injector.get(ThemeService),db=new Dexie('gymtrack-preferences-v1');db.version(1).stores({preferences:'id'});
 const ids=[id];cleanups.push(async()=>{injector.destroy();await db.table('preferences').bulkDelete(ids);db.close();});
 return {id,ids,account,offline,theme,styles,classes,request,media,emitSystem:(matches:boolean)=>mediaListener?.({matches}),emitOnline:()=>onlineListener?.(),preference:()=>db.table('preferences').get(account().id)};
}

it('retains the complete theme offline and synchronizes it before reading an older account preference',async()=>{
 const t=await setup(),config:ThemeConfig={palette:'prugna',mode:'dark',accent:'#F0A6A0',background:'#1D1424'};
 vi.stubGlobal('navigator',{onLine:false});
 expect(await t.theme.saveConfig(config)).toBe(true);config.accent='#FFFFFF';
 expect(t.request).not.toHaveBeenCalled();
 expect(t.theme.config().accent).toBe('#F0A6A0');expect((await t.preference()).dirty).toBe(true);
 vi.stubGlobal('navigator',{onLine:true});await t.theme.load();
 expect(t.request).toHaveBeenCalledExactlyOnceWith('preferences',{backgroundColor:'#1D1424',themeConfig:{palette:'prugna',mode:'dark',accent:'#F0A6A0',background:'#1D1424'}});
 expect((await t.preference()).dirty).toBe(false);expect(t.styles.get('--accent')).toBe('#F0A6A0');
});

it('queues a theme chosen in an account archive opened offline for the next online login',async()=>{
 const t=await setup();t.offline.set(true);
 await t.theme.saveConfig({palette:'ghiaccio',mode:'light'});
 expect((await t.preference()).dirty).toBe(true);expect(t.request).not.toHaveBeenCalled();
 t.offline.set(false);await t.theme.load();
 expect(t.request).toHaveBeenCalledExactlyOnceWith('preferences',{backgroundColor:'#F2F6FA',themeConfig:{palette:'ghiaccio',mode:'light'}});
 expect((await t.preference()).dirty).toBe(false);
});

it('restores full account preferences and follows system appearance without rewriting preferences',async()=>{
 const t=await setup();t.request.mockResolvedValue({backgroundColor:'#101416',themeConfig:{palette:'carbonio',mode:'system'}});
 await t.theme.load();expect(t.theme.config()).toEqual({palette:'carbonio',mode:'system'});
 expect(t.classes.get('light')).toBe(false);t.request.mockClear();
 t.emitSystem(true);expect(t.classes.get('light')).toBe(true);expect(t.theme.isLight()).toBe(true);expect(t.request).not.toHaveBeenCalled();
 t.emitSystem(false);expect(t.classes.get('light')).toBe(false);
});

it('does not apply or cache a malformed theme and blocks a duplicate pending save',async()=>{
 const t=await setup(),before=t.theme.config();
 expect(await t.theme.saveConfig({palette:'unknown',mode:'dark'})).toBe(false);expect(t.theme.config()).toEqual(before);expect(await t.preference()).toBeUndefined();
 let finish!:(value:unknown)=>void;t.request.mockImplementation(()=>new Promise(resolve=>finish=resolve));
 const saving=t.theme.saveConfig({palette:'petrolio',mode:'dark'});await vi.waitFor(()=>expect(t.request).toHaveBeenCalledTimes(1));
 expect(await t.theme.saveConfig({palette:'sabbia',mode:'light'})).toBe(false);finish({ok:true});await saving;
 expect(t.theme.config()).toEqual({palette:'petrolio',mode:'dark'});expect((await t.preference()).config).toEqual(t.theme.config());
});

it('loads a different account without exposing the previous account palette',async()=>{
 const t=await setup();await t.theme.saveConfig({palette:'prugna',mode:'dark'});
 const next='theme-config-'+crypto.randomUUID();t.ids.push(next);t.account.set({id:next});
 t.request.mockResolvedValue({backgroundColor:'#050E17',themeConfig:null});await t.theme.load();
 expect(t.theme.config()).toEqual({palette:'multicolore',mode:'dark'});expect((await t.preference()).id).toBe(next);
});

it('loads the new account while an old account save is still waiting for the network',async()=>{
 const t=await setup();let finish!:(value:unknown)=>void;
 t.request.mockImplementation((_path:string,body?:unknown)=>body?new Promise(resolve=>finish=resolve):Promise.resolve({backgroundColor:'#F2F6FA',themeConfig:{palette:'ghiaccio',mode:'light'}}));
 const saving=t.theme.saveConfig({palette:'prugna',mode:'dark'});await vi.waitFor(()=>expect(t.request).toHaveBeenCalledTimes(1));
 const next='theme-config-'+crypto.randomUUID();t.ids.push(next);t.account.set({id:next});
 await t.theme.load();expect(t.theme.config()).toEqual({palette:'ghiaccio',mode:'light'});
 finish({ok:true});expect(await saving).toBe(false);
 expect(t.theme.config()).toEqual({palette:'ghiaccio',mode:'light'});expect((await t.preference()).config).toEqual(t.theme.config());
});

it('retries a queued preference automatically when the browser comes online',async()=>{
 const t=await setup();vi.stubGlobal('navigator',{onLine:false});
 await t.theme.saveConfig({palette:'artico',mode:'dark'});expect(t.request).not.toHaveBeenCalled();
 vi.stubGlobal('navigator',{onLine:true});t.emitOnline();
 await vi.waitFor(async()=>expect((await t.preference()).dirty).toBe(false));
 expect(t.request).toHaveBeenCalledExactlyOnceWith('preferences',{backgroundColor:'#0D1725',themeConfig:{palette:'artico',mode:'dark'}});
});

it('keeps device-local preferences separate from any cookie still present before login',async()=>{
 const t=await setup();t.ids.push('device-local');t.account.set({id:'device-local'});
 await t.theme.saveConfig({palette:'sabbia',mode:'light'});await t.theme.load();t.emitOnline();
 await vi.waitFor(async()=>expect((await t.preference()).config).toEqual({palette:'sabbia',mode:'light'}));
 expect(t.request).not.toHaveBeenCalled();expect((await t.preference()).dirty).toBe(false);
});
