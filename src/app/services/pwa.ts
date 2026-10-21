import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Store } from './store';
import { ArchiveSyncService } from './archive-sync';
interface InstallEvent extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:string}>}
export interface AppUpdateEvent extends Event {waitUntil(save:Promise<boolean|void>):void}
@Injectable({providedIn:'root'})
export class PwaService {
 event=signal<InstallEvent|undefined>(undefined);
 installed=signal(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator&{standalone?:boolean}).standalone);
 online=signal(navigator.onLine);offlineReady=signal(false);updateReady=signal(false);updating=signal(false);storage=signal('Non ancora misurato');persisted=signal<boolean|null>(null);
 private updates=inject(SwUpdate);
 private store=inject(Store);
 private cloud=inject(ArchiveSyncService,{optional:true});
 constructor(){
  window.addEventListener('online',()=>this.online.set(true));window.addEventListener('offline',()=>this.online.set(false));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();this.event.set(e as InstallEvent);});window.addEventListener('appinstalled',()=>{this.installed.set(true);this.event.set(undefined);});
  this.updates.versionUpdates.subscribe(event=>{if(event.type==='VERSION_READY')this.updateReady.set(true);});
  if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(()=>{this.offlineReady.set(true);}).catch(()=>{});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){this.online.set(navigator.onLine);void this.measureStorage();}});
  void this.measureStorage();
  void this.requestPersistence();
 }
 async measureStorage(){try{const e=await navigator.storage?.estimate?.();this.storage.set(e?.usage!==undefined&&e.quota?`${(e.usage/1048576).toFixed(1)} MB usati su ${(e.quota/1048576).toFixed(0)} MB disponibili al sito`:'Misura dello spazio non disponibile in questo Safari');this.persisted.set(await navigator.storage?.persisted?.()??null);}catch{this.storage.set('Misura dello spazio non disponibile');}}
 async install(){const e=this.event();if(e){await e.prompt();await e.userChoice;this.event.set(undefined);}}
 async requestPersistence(){try{if(navigator.storage?.persist&&!(await navigator.storage.persisted()))this.persisted.set(await navigator.storage.persist());}catch{/* The archive remains available even when this browser cannot grant persistence. */}}
 async reload(){
  if(this.updating())return;
  this.updating.set(true);
  try{
   if(!this.store.ready())throw Error('Attendi l’apertura dell’archivio prima di aggiornare.');
   // Editors register their save result so validation errors cannot be hidden
   // by a later successful background write before the app reloads.
   const saves:Promise<boolean|void>[]=[];
   const event=Object.assign(new Event('gymtrack:before-update'),{waitUntil:(save:Promise<boolean|void>)=>{saves.push(save);}});
   window.dispatchEvent(event);
   if((await Promise.all(saves)).some(result=>result===false))throw Error('Salva o correggi i dati della serie prima di aggiornare.');
   let pending;
   do{pending=this.store.settled();await pending;}while(pending!==this.store.settled());
   if(this.store.error())throw Error('Aggiornamento sospeso: '+this.store.error());
   if(this.cloud&&!await this.cloud.flush())throw Error('Aggiornamento sospeso: la copia server è ancora da completare o verificare. I dati locali sono conservati. Apri Profilo → Backup e ripristino.');
   location.reload();
  }catch(error){this.store.error.set(error instanceof Error?error.message:'Aggiornamento sospeso: salvataggio non riuscito. I dati presenti sono conservati.');}
  finally{this.updating.set(false);}
 }
}
