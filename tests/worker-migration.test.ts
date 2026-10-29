import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
const origin='https://gymtrack.test';
const shell=()=>new Response('<!doctype html><meta name="gymtrack-worker" content="/gymtrack-app-worker-v3.js"><app-root></app-root>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
function worker(){
 const handlers:Record<string,any>={},local={id:'local',url:origin+'/?source=home#/sessione?workout=existing',navigate:vi.fn()},other={id:'other',url:'https://other.test/',navigate:vi.fn()};local.navigate.mockResolvedValue(local);
 const files=new Map<string,Response>(),cache={match:vi.fn(async(key:string)=>files.get(key)?.clone())};
 const caches={keys:vi.fn(async()=>['unrelated-private-cache','ngsw:/:old:assets:app:cache']),open:vi.fn(async()=>cache),delete:vi.fn(()=>{throw Error('Never delete cached data');})};
 const registration:any={active:{scriptURL:origin+'/gymtrack-sw.js',state:'activated'},unregister:vi.fn(()=>{throw Error('Never unregister');})};
 const self={location:{origin},registration,caches,skipWaiting:vi.fn(async()=>{}),clients:{claim:vi.fn(async()=>{}),matchAll:vi.fn(async()=>[local,other])},addEventListener:(type:string,handler:any)=>handlers[type]=handler};
 const fetch=vi.fn(async()=>shell());
 vm.runInNewContext(readFileSync('public/gymtrack-worker-migration.js','utf8'),{self,fetch,URL,Response,Request,AbortController,setTimeout,clearTimeout,indexedDB:new Proxy({},{get:()=>{throw Error('Never open account storage');}})});
 const dispatch=async(type:string,request?:Request)=>{const work:Promise<any>[]=[];let result:Promise<Response>|undefined;handlers[type]({request,waitUntil:(job:Promise<any>)=>work.push(job),respondWith:(job:Promise<Response>)=>result=job});const response=result?await result:undefined;await Promise.all(work);return response;};
 return{self,registration,fetch,files,caches,cache,local,other,dispatch};
}
it('validates fresh canonical HTML before replacing a legacy registration',async()=>{
 const w=worker();await w.dispatch('install');expect(w.self.skipWaiting).toHaveBeenCalledOnce();expect(w.self.clients.claim).not.toHaveBeenCalled();
 expect(w.fetch).toHaveBeenCalledWith(origin+'/index.html?ngsw-bypass=1',expect.objectContaining({cache:'no-store',redirect:'error',credentials:'same-origin'}));
});
it('preserves the existing offline worker when the new HTML cannot be reached',async()=>{
 const w=worker();w.fetch.mockRejectedValue(Error('Offline'));await expect(w.dispatch('install')).rejects.toThrow('preserve the existing offline worker');
 expect(w.self.skipWaiting).not.toHaveBeenCalled();expect(w.self.clients.claim).not.toHaveBeenCalled();expect(w.caches.delete).not.toHaveBeenCalled();expect(w.registration.unregister).not.toHaveBeenCalled();
});
it.each(['<html>Accedi con ChatGPT</html>','<app-root></app-root>'])('does not mistake unrelated or stale HTML for the fresh application',async html=>{
 const w=worker();w.fetch.mockImplementation(async()=>new Response(html,{headers:{'Content-Type':'text/html'}}));
 await expect(w.dispatch('install')).rejects.toThrow();await w.dispatch('activate');expect(w.local.navigate).not.toHaveBeenCalled();
});
it('claims only after activation, navigates same-origin windows with route and parameters intact, and never needs an account API',async()=>{
 const w=worker();await w.dispatch('activate');expect(w.self.clients.claim).toHaveBeenCalledOnce();
 expect(w.local.navigate).toHaveBeenCalledExactlyOnceWith(origin+'/aggiorna.html?source=home&ngsw-bypass=1&auto=1#/sessione?workout=existing');expect(w.other.navigate).not.toHaveBeenCalled();
 expect(w.fetch.mock.calls.every(call=>typeof call[0]==='string'&&!call[0].includes('/api/'))).toBe(true);
 expect(w.caches.delete).not.toHaveBeenCalled();expect(w.registration.unregister).not.toHaveBeenCalled();
});
it('keeps cached index and hashed assets readable if the network drops during the handoff',async()=>{
 const w=worker();w.fetch.mockRejectedValue(Error('Offline'));w.files.set(origin+'/index.html',new Response('existing offline shell'));w.files.set(origin+'/chunk-old.js',new Response('existing old code'));
 expect(await (await w.dispatch('fetch',new Request(origin+'/?ngsw-bypass=1')))?.text()).toBe('existing offline shell');
 expect(await (await w.dispatch('fetch',new Request(origin+'/chunk-old.js')))?.text()).toBe('existing old code');
 expect(w.local.navigate).not.toHaveBeenCalled();expect(w.caches.open.mock.calls.every(call=>call[0].startsWith('ngsw:'))).toBe(true);expect(w.caches.delete).not.toHaveBeenCalled();
});
it('leaves account APIs, mutations, unrelated paths and external resources untouched',async()=>{
 const w=worker();for(const request of [new Request(origin+'/api/archive'),new Request(origin+'/api/auth/logout',{method:'POST'}),new Request('https://other.test/file.js'),new Request(origin+'/private-calendar/token.ics')])expect(await w.dispatch('fetch',request)).toBeUndefined();
 expect(w.fetch).not.toHaveBeenCalled();expect(w.caches.open).not.toHaveBeenCalled();
});
it.each([401,403])('does not replace an authentication response (%s) with cached app HTML',async status=>{
 const w=worker();w.fetch.mockImplementation(async()=>new Response('authenticate',{status}));w.files.set(origin+'/index.html',new Response('cached old shell'));
 const response=await w.dispatch('fetch',new Request(origin+'/'));expect(response?.status).toBe(status);expect(await response?.text()).toBe('authenticate');expect(w.cache.match).not.toHaveBeenCalled();
});
it('retries migration after an offline activation when the next release check arrives',async()=>{
 const w=worker();w.fetch.mockRejectedValueOnce(Error('Offline'));await w.dispatch('activate');expect(w.local.navigate).not.toHaveBeenCalled();
 expect(await w.dispatch('fetch',new Request(origin+'/api/app-release'))).toBeUndefined();expect(w.local.navigate).toHaveBeenCalledOnce();
});
it('does not interrupt a canonical worker that is already installing or downgrade one that is active',async()=>{
 const w=worker();w.registration.installing={scriptURL:origin+'/gymtrack-app-worker-v3.js',state:'installing'};await w.dispatch('activate');expect(w.local.navigate).not.toHaveBeenCalled();expect(w.fetch).not.toHaveBeenCalled();
 w.registration.active=w.registration.installing;delete w.registration.installing;await expect(w.dispatch('install')).rejects.toThrow('already owns');expect(w.self.skipWaiting).not.toHaveBeenCalled();
});
