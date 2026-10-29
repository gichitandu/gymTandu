const WORKER_PATH='/gymtrack-app-worker-v3.js';
const OPEN_PATH='/?ngsw-bypass=1&gymtrack-open=current#/';

function deadline(work,milliseconds,message){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(message)),milliseconds);
  Promise.resolve(work).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
}
async function readFresh(fetcher,path,origin){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher(path,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
  if(!response.ok||response.redirected||response.url&&new URL(response.url,origin).origin!==origin)throw Error('Connessione al servizio non riuscita. Riprova tra poco.');
  return response;
 }finally{clearTimeout(timer);}
}
export async function checkFreshApplication(fetcher,origin){
 return deadline((async()=>{
 const [page,version]=await Promise.all([
  readFresh(fetcher,'/?ngsw-bypass=1&gymtrack-check=current',origin),
  readFresh(fetcher,'/app-build.json?ngsw-bypass=1',origin)
 ]);
 const html=await page.text();
 const workerMarker=/<meta\b(?=[^>]*\bname=["']gymtrack-worker["'])(?=[^>]*\bcontent=["']\/gymtrack-app-worker-v3\.js["'])[^>]*>/i;
 if(!page.headers.get('content-type')?.includes('text/html')||!html.includes('<app-root')||!workerMarker.test(html))throw Error('La versione aggiornata non è ancora raggiungibile. Riprova.');
 const value=await version.json();
 if(typeof value.buildId!=='string'||!/^[a-f0-9]{64}$/.test(value.buildId))throw Error('Verifica della versione non riuscita. Riprova.');
 return value.buildId;
 })(),12000,'La verifica richiede più tempo. Controlla la connessione e riprova.');
}
export function waitForUpdatedWorker(registration,serviceWorker,origin,timeout=30000){
 return new Promise((resolve,reject)=>{
  const observed=new Set();let settled=false,timer;
  const clean=()=>{
   clearTimeout(timer);registration.removeEventListener?.('updatefound',check);serviceWorker.removeEventListener?.('controllerchange',check);
   for(const worker of observed)worker.removeEventListener?.('statechange',check);
  };
  const finish=error=>{if(settled)return;settled=true;clean();if(error)reject(error);else resolve();};
  const check=()=>{
   for(const worker of [registration.installing,registration.waiting,registration.active]){
    if(!worker)continue;
    if(!observed.has(worker)){observed.add(worker);worker.addEventListener?.('statechange',check);}
   }
   const target=registration.installing||registration.waiting||registration.active;
   if(target&&new URL(target.scriptURL,origin).href===new URL(WORKER_PATH,origin).href&&target.state==='activated')finish();
  };
  timer=setTimeout(()=>finish(Error('Il download richiede più tempo. Controlla la connessione e riprova.')),timeout);
  registration.addEventListener?.('updatefound',check);serviceWorker.addEventListener?.('controllerchange',check);check();
 });
}
export function completeWorkerOperation(registration,serviceWorker,origin,action,timeout=30000){
 return new Promise((resolve,reject)=>{
  const worker=registration.active;
  if(!worker||worker.state!=='activated'||new URL(worker.scriptURL,origin).href!==new URL(WORKER_PATH,origin).href){reject(Error('La nuova versione non è ancora pronta. Riprova.'));return;}
  const nonce=Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
  let settled=false,timer;
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);serviceWorker.removeEventListener('message',receive);
   if(error)reject(error);else resolve(value);
  };
  const receive=event=>{
   const data=event.data;
   if(event.source!==worker||data?.type!=='OPERATION_COMPLETED'||data.nonce!==nonce)return;
   if(data.error||typeof data.result!=='boolean'){finish(Error('Non è stato possibile preparare la nuova versione. Riprova.'));return;}
   finish(undefined,data.result);
  };
  timer=setTimeout(()=>finish(Error('L’aggiornamento richiede più tempo. Controlla la connessione e riprova.')),timeout);
  serviceWorker.addEventListener('message',receive);
  try{worker.postMessage({action,nonce});}catch{finish(Error('Collegamento alla nuova versione non riuscito. Riprova.'));}
 });
}
export async function updateAndOpen({fetch:fetcher,navigator:browser,location,onStatus=()=>{},timeout=30000}){
 onStatus('Verifica della versione disponibile…');
 const build=await checkFreshApplication(fetcher,location.origin);
 if(!browser.serviceWorker?.register)throw Error('L’aggiornamento automatico non è disponibile qui. Usa “Apri versione online”.');
 onStatus('Caricamento della nuova versione…');
 const registration=await deadline(browser.serviceWorker.register(WORKER_PATH,{scope:'/',updateViaCache:'none'}),timeout,'Il collegamento richiede più tempo. Controlla la connessione e riprova.');
 // Registration already starts installation. A separate update request is only
 // required when an older worker is active under this canonical registration.
 if(registration.active&&registration.active.state==='activated'&&!registration.installing&&!registration.waiting)await deadline(registration.update(),timeout,'Il controllo richiede più tempo. Riprova.');
 await waitForUpdatedWorker(registration,browser.serviceWorker,location.origin,timeout);
 // Worker activation alone can retain a previous Angular application version.
 // Complete its version download and reassign this client before navigation.
 onStatus('Verifica degli aggiornamenti…');
 await completeWorkerOperation(registration,browser.serviceWorker,location.origin,'CHECK_FOR_UPDATES',timeout);
 onStatus('Attivazione della versione aggiornata…');
 await completeWorkerOperation(registration,browser.serviceWorker,location.origin,'ACTIVATE_UPDATE',timeout);
 onStatus('Aggiornamento pronto. Apertura di GymTrack…');
 location.replace(OPEN_PATH);
 return build;
}
export function bindUpdatePage(target=document,browser=navigator,loc=location,fetcher=fetch){
 const button=target.getElementById('update-now'),status=target.getElementById('update-status'),version=target.getElementById('update-version');
 if(!button||!status)return;
 let busy=false;
 const start=async()=>{
  if(busy)return;busy=true;button.disabled=true;status.classList.remove('error');
  try{
   const build=await updateAndOpen({fetch:fetcher,navigator:browser,location:loc,onStatus:message=>{status.textContent=message;}});
   if(version)version.textContent='Versione '+build.slice(0,12);
  }catch(error){status.classList.add('error');status.textContent=error instanceof Error?error.message:'Aggiornamento non completato. Riprova.';}
  finally{busy=false;button.disabled=false;}
 };
 button.addEventListener('click',start);
 // Migration visits may start one bounded attempt without another tap. Failure
 // leaves this page visible; only the retry button starts a later attempt.
 try{if(new URL(loc.href,loc.origin).searchParams.get('auto')==='1')queueMicrotask(()=>void start());}catch{}
}
if(typeof document!=='undefined')bindUpdatePage();
