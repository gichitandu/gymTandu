import { computed, inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject, Subscription } from 'rxjs';
import { feedbackForContext, feedbackSignal } from './feedback';

export interface AppReleasePolicy {
 buildId:string;requestedBuildId:string|null;generation:number;requestedAt:number|null;
}
// Activating a service worker is not cancelable: a lost acknowledgement can
// arrive after the client was reassigned. Resume only through a full reload.
export class AppActivationUncertainError extends Error {
 constructor(){super('Attivazione dell’aggiornamento da completare con un ricaricamento.');this.name='AppActivationUncertainError';}
}
const buildId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const metadataBuild=(value:unknown)=>value&&typeof value==='object'&&buildId((value as {buildId?:unknown}).buildId)?(value as {buildId:string}).buildId:null;
function deadline<T>(work:Promise<T>,milliseconds=20000):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Controllo aggiornamento troppo lento. Riprova quando la connessione è stabile.')),milliseconds);work.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}

// This service can also run on the signed-out screen: no account archive or
// Store is opened merely to discover and download a published app version.
@Injectable({providedIn:'root'})
export class AppReleaseService {
 private updates=inject(SwUpdate,{optional:true});
 private feedback=feedbackForContext();
 readonly enabled=!!this.updates&&this.updates.isEnabled!==false&&typeof this.updates.checkForUpdate==='function';
 readonly lastChecked=signal<number|null>(null);
 readonly lastApplied=signal<number|null>(null);
 private recordRunning(id:string){this.currentBuild.set(id);try{const previous=JSON.parse(localStorage.getItem('gymtrack-version-receipt')||'null');const at=previous?.buildId===id?(typeof previous.appliedAt==='number'&&Number.isFinite(previous.appliedAt)?previous.appliedAt:null):previous&&buildId(previous.buildId)?Date.now():null;this.lastApplied.set(at);localStorage.setItem('gymtrack-version-receipt',JSON.stringify({buildId:id,appliedAt:at}));}catch{}}
 readonly currentBuild=signal<string|null>(null);
 readonly policy=signal<AppReleasePolicy|null>(null);
 readonly downloadedBuild=signal<string|null>(null);
 readonly updateReady=signal(false);
 readonly checking=signal(false);
 readonly distributing=signal(false);
 readonly message=signal('Gli aggiornamenti vengono controllati all’apertura e al rientro nell’app.');
 readonly error=feedbackSignal('error',this.feedback);
 readonly success=feedbackSignal('success',this.feedback);
 readonly checked=new Subject<void>();
 readonly autoUpdateReady=computed(()=>!!this.currentBuild()&&this.updateReady()&&this.downloadedBuild()!==this.currentBuild()&&this.policy()?.requestedBuildId===this.downloadedBuild()&&this.policy()?.buildId===this.downloadedBuild());
 private checkJob?:Promise<boolean>;
 private subscription?:Subscription;
 private disposed=false;
 private visibility=()=>{if(document.visibilityState==='visible')void this.check();};
 private resume=()=>{void this.check();};
 constructor(){
  if(this.enabled){
   this.subscription=this.updates!.versionUpdates.subscribe(event=>this.version(event));
   window.addEventListener('online',this.resume);window.addEventListener('pageshow',this.resume);
   document.addEventListener('visibilitychange',this.visibility);
   void this.check();
  }
 }
 private version(event:VersionEvent){
  if(event.type==='VERSION_READY'||event.type==='NO_NEW_VERSION_DETECTED'){
   const version=event.type==='VERSION_READY'?event.latestVersion:event.version;
   const id=metadataBuild(version.appData);
   if(event.type==='VERSION_READY'){
    const running=metadataBuild(event.currentVersion.appData);
    if(running)this.recordRunning(running);
   }
   if(event.type==='NO_NEW_VERSION_DETECTED'&&id&&id===this.currentBuild())this.recordRunning(id);
   if(id){this.downloadedBuild.set(id);this.updateReady.set(id!==this.currentBuild());}
   if(this.updateReady())this.message.set('Nuova versione pronta. Verrà applicata quando i salvataggi sono al sicuro.');
  }else if(event.type==='VERSION_INSTALLATION_FAILED'){
   this.message.set('Download dell’aggiornamento non completato. La versione attuale resta utilizzabile; il controllo verrà ripetuto.');
  }
 }
 private async request(path:string,body?:unknown){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body===undefined?{}:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
   let value;try{value=await response.json();}catch{throw Error('Servizio aggiornamenti non disponibile. Riprova.');}
   if(!response.ok)throw Error(value.error||'Controllo aggiornamenti non riuscito.');
   return value;
  }finally{clearTimeout(timer);}
 }
 private policyValue(value:unknown):AppReleasePolicy{
  const p=value as Partial<AppReleasePolicy>|null;
  if(!p||!buildId(p.buildId)||(p.requestedBuildId!==null&&!buildId(p.requestedBuildId))||!Number.isSafeInteger(p.generation)||(p.generation as number)<0||(p.requestedAt!==null&&(!Number.isFinite(p.requestedAt)||(p.requestedAt as number)<0)))throw Error('Informazioni sull’aggiornamento non valide. Riprova.');
  return p as AppReleasePolicy;
 }
 check(manual=false):Promise<boolean>{
  if(this.checkJob)return this.checkJob;
  if(navigator.onLine===false){this.message.set('Aggiornamento in attesa della connessione. L’app e i dati locali restano disponibili.');return Promise.resolve(false);}
  this.checking.set(true);if(manual)this.error.set('');
  let job!:Promise<boolean>;
  job=(async()=>{
   try{
    const results=await Promise.allSettled([this.currentBuild()?Promise.resolve({buildId:this.currentBuild()}):this.request('/app-build.json'),this.request('/api/app-release')]);
    if(this.disposed)return false;
    const descriptor=results[0];if(descriptor.status==='fulfilled'){const id=metadataBuild(descriptor.value);if(id)this.currentBuild.set(id);}
    const release=results[1];if(release.status==='rejected')throw release.reason;
    this.policy.set(this.policyValue(release.value));
    if(!this.enabled){this.message.set('Versione pubblicata disponibile. Gli aggiornamenti automatici richiedono il service worker attivo.');return false;}
    const changed=await deadline(this.updates!.checkForUpdate());
    if(this.currentBuild()&&this.downloadedBuild()===this.currentBuild())this.updateReady.set(false);
    if(this.updateReady())this.message.set('Nuova versione pronta. Verrà applicata quando i salvataggi sono al sicuro.');
    else if(this.policy()?.buildId===this.currentBuild())this.message.set('Stai usando l’ultima versione pubblicata.');
    else this.message.set('Controllo completato. La nuova versione verrà scaricata appena disponibile.');
    return changed;
   }catch(error){const message=error instanceof Error?error.message:'Controllo aggiornamenti non riuscito.';this.message.set(message);if(manual)this.error.set(message);return false;}
   finally{this.lastChecked.set(Date.now());this.checking.set(false);if(this.checkJob===job)this.checkJob=undefined;this.checked.next();}
  })();
  this.checkJob=job;return job;
 }
 async distribute():Promise<boolean>{
  if(this.distributing())return false;
  this.distributing.set(true);this.error.set('');
  try{
   const value=this.policyValue(await this.request('/api/app-release',{}));this.policy.set(value);
   this.success.set('Aggiornamento richiesto per gli utenti. Verrà applicato alla riapertura o al logout, dopo i salvataggi.');
   await this.check();return true;
  }catch(error){this.error.set(error instanceof Error?error.message:'Distribuzione non riuscita.');return false;}
  finally{this.distributing.set(false);}
 }
 async activateReady(expectedBuild?:string):Promise<boolean>{
  const target=this.downloadedBuild();
  if(!this.enabled||!this.updateReady()||!target||target===this.currentBuild())return false;
  if(expectedBuild&&target!==expectedBuild)throw Error('La versione scaricata non corrisponde all’aggiornamento richiesto. Riprova il controllo.');
  try{await deadline(this.updates!.activateUpdate(),10000);}
  catch{throw new AppActivationUncertainError();}
  // false means the worker already assigned this client to its latest version.
  // The current JavaScript can still be old, so both outcomes require reload.
  return true;
 }
 ngOnDestroy(){this.disposed=true;this.subscription?.unsubscribe();if(this.enabled){window.removeEventListener('online',this.resume);window.removeEventListener('pageshow',this.resume);document.removeEventListener('visibilitychange',this.visibility);}this.checked.complete();}
}
