import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
interface InstallEvent extends Event {prompt():Promise<void>;userChoice:Promise<{outcome:string}>}
@Injectable({providedIn:'root'})
export class PwaService {
 event=signal<InstallEvent|undefined>(undefined);
 installed=signal(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator&{standalone?:boolean}).standalone);
 online=signal(navigator.onLine);offlineReady=signal(false);updateReady=signal(false);storage=signal('Non ancora misurato');persisted=signal<boolean|null>(null);
 private updates=inject(SwUpdate);
 constructor(){
  window.addEventListener('online',()=>this.online.set(true));window.addEventListener('offline',()=>this.online.set(false));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();this.event.set(e as InstallEvent);});window.addEventListener('appinstalled',()=>{this.installed.set(true);this.event.set(undefined);});
  this.updates.versionUpdates.subscribe(event=>{if(event.type==='VERSION_READY')this.updateReady.set(true);});
  if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(()=>{this.offlineReady.set(true);}).catch(()=>{});
  this.viewport();window.visualViewport?.addEventListener('resize',()=>this.viewport());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){this.online.set(navigator.onLine);void this.measureStorage();}});
  void this.measureStorage();
 }
 private viewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--visible-height',(v?.height||window.innerHeight)+'px');document.body.classList.toggle('keyboard-open',!!v && window.innerHeight-v.height>150);}
 async measureStorage(){try{const e=await navigator.storage?.estimate?.();this.storage.set(e?.usage!==undefined&&e.quota?`${(e.usage/1048576).toFixed(1)} MB usati su ${(e.quota/1048576).toFixed(0)} MB disponibili al sito`:'Misura dello spazio non disponibile in questo Safari');this.persisted.set(await navigator.storage?.persisted?.()??null);}catch{this.storage.set('Misura dello spazio non disponibile');}}
 async install(){const e=this.event();if(e){await e.prompt();await e.userChoice;this.event.set(undefined);}}
 reload(){if(confirm('Hai salvato la sessione e gli eventuali dati nel modulo? Riaprire GymTrack con la versione aggiornata?'))location.reload();}
}
