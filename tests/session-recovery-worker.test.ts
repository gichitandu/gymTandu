import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expect,it,vi} from 'vitest';
function worker(){
 const handlers:any={},local={url:'https://gymtrack.test/#/profilo',navigate:vi.fn().mockResolvedValue(undefined)},other={url:'https://other.test/',navigate:vi.fn()};
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({signedOut:false})});
 const self={location:{origin:'https://gymtrack.test'},clients:{matchAll:vi.fn().mockResolvedValue([local,other])},addEventListener:(name:string,callback:any)=>handlers[name]=callback};
 vm.runInNewContext(readFileSync('public/gymtrack-session-recovery.js','utf8'),{self,fetch,URL,AbortController,setTimeout,clearTimeout});
 const dispatch=async(name:string,request?:Request)=>{let job=Promise.resolve();handlers[name]({request,waitUntil:(work:Promise<void>)=>job=work});await job;};
 return{fetch,local,other,dispatch};
}
it('refreshes only same-origin windows after the server confirms targeted sign-out, without using any archive storage',async()=>{
 const w=worker();w.fetch.mockResolvedValue({ok:true,json:async()=>({signedOut:true})});await w.dispatch('activate');
 expect(w.fetch).toHaveBeenCalledWith('/api/auth/device-recovery',expect.objectContaining({method:'POST',credentials:'same-origin',cache:'no-store',body:'{}'}));
 expect(w.local.navigate).toHaveBeenCalledExactlyOnceWith('https://gymtrack.test/?ngsw-bypass=1#/');expect(w.other.navigate).not.toHaveBeenCalled();
});
it('leaves a PC, another account or a new iPhone login alone when the server declines recovery',async()=>{
 const w=worker();await w.dispatch('activate');await w.dispatch('fetch',new Request('https://gymtrack.test/api/app-release'));
 expect(w.fetch).toHaveBeenCalledOnce();expect(w.local.navigate).not.toHaveBeenCalled();
});
it('retries a failed recovery on the next online release check while ignoring unrelated requests',async()=>{
 const w=worker();w.fetch.mockRejectedValueOnce(Error('Offline'));await w.dispatch('activate');
 await w.dispatch('fetch',new Request('https://other.test/api/app-release'));await w.dispatch('fetch',new Request('https://gymtrack.test/api/archive'));expect(w.fetch).toHaveBeenCalledOnce();
 w.fetch.mockResolvedValue({ok:true,json:async()=>({signedOut:true})});await w.dispatch('fetch',new Request('https://gymtrack.test/api/app-release'));expect(w.fetch).toHaveBeenCalledTimes(2);expect(w.local.navigate).toHaveBeenCalledOnce();
});
it('retries document refresh after a transient navigation failure without revoking a new login',async()=>{
 const w=worker();w.fetch.mockResolvedValue({ok:true,json:async()=>({signedOut:true})});w.local.navigate.mockRejectedValueOnce(Error('Window busy'));await w.dispatch('activate');
 await w.dispatch('fetch',new Request('https://gymtrack.test/api/app-release'));expect(w.local.navigate).toHaveBeenCalledTimes(2);expect(w.fetch).toHaveBeenCalledOnce();
});
