import {afterEach,expect,it,vi} from 'vitest';
import {bindUpdatePage,checkFreshApplication,completeWorkerOperation,updateAndOpen,waitForUpdatedWorker} from '../public/gymtrack-update-now.js';
const origin='https://gymtrack.test',build='a'.repeat(64);
afterEach(()=>vi.useRealTimers());
function pageFetch(){return vi.fn(async(path:string)=>new Response(path.startsWith('/app-build.json')?JSON.stringify({buildId:build}):'<!doctype html><meta name="gymtrack-worker" content="/gymtrack-app-worker-v3.js"><app-root></app-root>',{status:200,headers:{'Content-Type':path.startsWith('/app-build.json')?'application/json':'text/html'}}));}
function browser(){
 const worker=Object.assign(new EventTarget(),{scriptURL:origin+'/gymtrack-app-worker-v3.js',state:'activated'});
 const registration=Object.assign(new EventTarget(),{active:worker,installing:null,waiting:null,update:vi.fn().mockResolvedValue(undefined)});
 const serviceWorker=Object.assign(new EventTarget(),{register:vi.fn().mockResolvedValue(registration)});
 Object.assign(worker,{postMessage:vi.fn((message:any)=>{queueMicrotask(()=>serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:worker,data:{type:'OPERATION_COMPLETED',nonce:message.nonce,result:false}})));})});
 const location={origin,replace:vi.fn()};return{worker,registration,serviceWorker,location};
}
it('loads fresh HTML and version then updates the canonical registration without accessing backup or storage',async()=>{
 const t=browser(),fetcher=pageFetch(),status=vi.fn();
 expect(await updateAndOpen({fetch:fetcher,navigator:{serviceWorker:t.serviceWorker},location:t.location,onStatus:status})).toBe(build);
 expect(t.serviceWorker.register).toHaveBeenCalledExactlyOnceWith('/gymtrack-app-worker-v3.js',{scope:'/',updateViaCache:'none'});
 expect(t.registration.update).toHaveBeenCalledOnce();expect(t.location.replace).toHaveBeenCalledExactlyOnceWith('/?ngsw-bypass=1&gymtrack-open=current#/');
 expect((t.worker as any).postMessage.mock.calls.map(([message]:any[])=>message.action)).toEqual(['CHECK_FOR_UPDATES','ACTIVATE_UPDATE']);
 expect(fetcher.mock.calls.every(([path,options]:any[])=>!path.startsWith('/api/')&&options.cache==='no-store'&&options.redirect==='error')).toBe(true);
});
it('rejects a login page masquerading as fresh application HTML before replacing the current worker',async()=>{
 const t=browser(),fetcher=pageFetch();fetcher.mockImplementationOnce(async()=>new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}}));
 await expect(updateAndOpen({fetch:fetcher,navigator:{serviceWorker:t.serviceWorker},location:t.location})).rejects.toThrow('non è ancora raggiungibile');
 expect(t.serviceWorker.register).not.toHaveBeenCalled();expect(t.location.replace).not.toHaveBeenCalled();
});
it('does not mistake an activated legacy worker for the newly registered worker',async()=>{
 vi.useFakeTimers();const t=browser();t.worker.scriptURL=origin+'/gymtrack-sw.js';
 let complete=false;const waiting=waitForUpdatedWorker(t.registration,t.serviceWorker,origin).then(()=>{complete=true;});
 await vi.advanceTimersByTimeAsync(100);expect(complete).toBe(false);
 t.worker.scriptURL=origin+'/gymtrack-app-worker-v3.js';t.worker.dispatchEvent(new Event('statechange'));await waiting;expect(complete).toBe(true);
});
it('keeps the recovery page open when activation stalls and permits a later retry',async()=>{
 vi.useFakeTimers();const t=browser();t.worker.scriptURL=origin+'/gymtrack-sw.js';
 const pending=waitForUpdatedWorker(t.registration,t.serviceWorker,origin,1000);const rejection=expect(pending).rejects.toThrow('download richiede più tempo');
 await vi.advanceTimersByTimeAsync(1000);await rejection;expect(t.location.replace).not.toHaveBeenCalled();
 t.worker.scriptURL=origin+'/gymtrack-app-worker-v3.js';await expect(waitForUpdatedWorker(t.registration,t.serviceWorker,origin,1000)).resolves.toBeUndefined();
});
it('leaves the current installation alone when the server copy of HTML is not reachable',async()=>{
 const t=browser(),fetcher=vi.fn().mockRejectedValue(Error('Offline'));
 await expect(updateAndOpen({fetch:fetcher,navigator:{serviceWorker:t.serviceWorker},location:t.location})).rejects.toThrow('Offline');
 expect(t.serviceWorker.register).not.toHaveBeenCalled();expect(t.location.replace).not.toHaveBeenCalled();
});
it('rejects redirected responses instead of treating authentication as an app update',async()=>{
 const fetcher=pageFetch();const response=new Response('<app-root></app-root>',{headers:{'Content-Type':'text/html'}});Object.defineProperty(response,'redirected',{value:true});fetcher.mockResolvedValueOnce(response);
 await expect(checkFreshApplication(fetcher,origin)).rejects.toThrow('Connessione al servizio');
});
it('waits for a new installing worker even when an older canonical worker is active',async()=>{
 vi.useFakeTimers();const t=browser();const installing=Object.assign(new EventTarget(),{scriptURL:t.worker.scriptURL,state:'installing'});
 (t.registration as any).installing=installing;
 let done=false;const pending=waitForUpdatedWorker(t.registration,t.serviceWorker,origin).then(()=>{done=true;});
 await vi.advanceTimersByTimeAsync(100);expect(done).toBe(false);
 installing.state='activated';installing.dispatchEvent(new Event('statechange'));await pending;expect(done).toBe(true);
});
it('times out an incomplete HTML response without touching the current registration',async()=>{
 vi.useFakeTimers();const t=browser(),fetcher=pageFetch(),response=new Response('',{headers:{'Content-Type':'text/html'}});
 response.text=()=>new Promise(()=>{});fetcher.mockResolvedValueOnce(response);
 const pending=updateAndOpen({fetch:fetcher,navigator:{serviceWorker:t.serviceWorker},location:t.location});
 const rejection=expect(pending).rejects.toThrow('La verifica richiede più tempo');
 await vi.advanceTimersByTimeAsync(12000);await rejection;expect(t.serviceWorker.register).not.toHaveBeenCalled();
});
it('does not open the app until both download and activation acknowledgements complete',async()=>{
 const t=browser(),fetcher=pageFetch();(t.worker as any).postMessage.mockImplementation(()=>{});
 const pending=updateAndOpen({fetch:fetcher,navigator:{serviceWorker:t.serviceWorker},location:t.location});
 await vi.waitFor(()=>expect((t.worker as any).postMessage).toHaveBeenCalledOnce());expect(t.location.replace).not.toHaveBeenCalled();
 const check=(t.worker as any).postMessage.mock.calls[0][0];
 t.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:t.worker,data:{type:'OPERATION_COMPLETED',nonce:check.nonce,result:true}}));
 await vi.waitFor(()=>expect((t.worker as any).postMessage).toHaveBeenCalledTimes(2));expect(t.location.replace).not.toHaveBeenCalled();
 const activate=(t.worker as any).postMessage.mock.calls[1][0];
 t.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:t.worker,data:{type:'OPERATION_COMPLETED',nonce:activate.nonce,result:true}}));
 await pending;expect(t.location.replace).toHaveBeenCalledOnce();
});
it('keeps the recovery page open if Angular rejects the download operation',async()=>{
 const t=browser();(t.worker as any).postMessage.mockImplementation((message:any)=>{queueMicrotask(()=>t.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:t.worker,data:{type:'OPERATION_COMPLETED',nonce:message.nonce,error:'Installation failed'}})));});
 await expect(updateAndOpen({fetch:pageFetch(),navigator:{serviceWorker:t.serviceWorker},location:t.location})).rejects.toThrow('preparare la nuova versione');
 expect(t.location.replace).not.toHaveBeenCalled();expect((t.worker as any).postMessage).toHaveBeenCalledTimes(1);
});
it('ignores another worker or nonce and times out without claiming a completed update',async()=>{
 vi.useFakeTimers();const t=browser();(t.worker as any).postMessage.mockImplementation(()=>{});
 const pending=completeWorkerOperation(t.registration,t.serviceWorker,origin,'CHECK_FOR_UPDATES',1000),rejection=expect(pending).rejects.toThrow('richiede più tempo');
 const message=(t.worker as any).postMessage.mock.calls[0][0];
 t.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:t.worker,data:{type:'OPERATION_COMPLETED',nonce:message.nonce+1,result:true}}));
 t.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{source:{scriptURL:origin+'/gymtrack-app-worker-v3.js'},data:{type:'OPERATION_COMPLETED',nonce:message.nonce,result:true}}));
 await vi.advanceTimersByTimeAsync(1000);await rejection;
 expect(t.location.replace).not.toHaveBeenCalled();
});
function pageElements(){
 const button=Object.assign(new EventTarget(),{disabled:false}),status={textContent:'',classList:{add:vi.fn(),remove:vi.fn()}},version={textContent:''};
 const nodes:any={'update-now':button,'update-status':status,'update-version':version};return{button,status,version,document:{getElementById:(id:string)=>nodes[id]}};
}
it('starts one automatic recovery attempt and leaves a failed attempt available for manual retry',async()=>{
 const t=browser(),page=pageElements(),fetcher=pageFetch(),location={...t.location,href:origin+'/aggiorna.html?ngsw-bypass=1&auto=1'};
 fetcher.mockRejectedValueOnce(Error('Offline'));
 bindUpdatePage(page.document,{serviceWorker:t.serviceWorker},location,fetcher);
 await vi.waitFor(()=>expect(page.status.textContent).toBe('Offline'));expect(t.serviceWorker.register).not.toHaveBeenCalled();expect(page.button.disabled).toBe(false);
 await Promise.resolve();expect(fetcher).toHaveBeenCalledTimes(2);
 page.button.dispatchEvent(new Event('click'));await vi.waitFor(()=>expect(location.replace).toHaveBeenCalledOnce());expect(t.serviceWorker.register).toHaveBeenCalledOnce();
});
it('keeps a normal recovery-page visit manual when auto is absent',async()=>{
 const t=browser(),page=pageElements(),fetcher=pageFetch();bindUpdatePage(page.document,{serviceWorker:t.serviceWorker},{...t.location,href:origin+'/aggiorna.html?ngsw-bypass=1'},fetcher);
 await Promise.resolve();expect(fetcher).not.toHaveBeenCalled();expect(t.serviceWorker.register).not.toHaveBeenCalled();
});
