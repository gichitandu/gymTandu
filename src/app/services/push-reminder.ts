import {inject,Injectable} from '@angular/core';
import {AuthService} from './auth';
import {Store} from './store';
import {ArchiveSyncService} from './archive-sync';
import {pushDeviceGrant,clearPushBadge} from './push-device';
export interface PushReminderState {available:boolean;configured:boolean;publicKey?:string;deviceEnabled:boolean;time:string;timezone:string;everyDay:boolean;needsUpdate?:boolean}
export function pushKeyBytes(key:string){return Uint8Array.from(atob(key.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
@Injectable({providedIn:'root'})
export class PushReminderService{
 private auth=inject(AuthService);private store=inject(Store);private cloud=inject(ArchiveSyncService);
 supported(){return typeof window!=='undefined'&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;}
 homeRequired(){const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;return apple&&!matchMedia('(display-mode: standalone)').matches&&!(navigator as Navigator&{standalone?:boolean}).standalone;}
 async load():Promise<PushReminderState>{
  const grant=await pushDeviceGrant();const id=grant&&grant.accountId===this.auth.user()?.id?grant.id:'';
  const state=await this.auth.request('push-reminder'+(id?'?device='+id:'')) as PushReminderState;
  const native=this.supported()?await navigator.serviceWorker.getRegistration().then(r=>r?.pushManager?.getSubscription()).catch(()=>null):null;
  const nativeId=native?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(native.endpoint)))].map(n=>n.toString(16).padStart(2,'0')).join(''):null;
  state.deviceEnabled=state.deviceEnabled&&nativeId===id&&!!grant?.enabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&!!native;return state;
 }
 async enable(state:PushReminderState,preferences:{time:string;timezone:string;everyDay:boolean}){
  if(!this.supported())throw Error('Questo browser non supporta le notifiche push.');if(this.homeRequired())throw Error('Su iPhone apri GymTrack dall’icona nella Home per consentire le notifiche.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferences.time))throw Error('Scegli un orario valido.');
  if(!state.available||!state.publicKey)throw Error('Il servizio notifiche non è ancora attivo.');
  const account=this.auth.user()?.id;if(!account||this.auth.offlineMode())throw Error('Accedi online al tuo account.');
  // Keep this call directly in the click gesture: iOS rejects delayed prompts.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notifiche non consentite. Puoi abilitarle dalle Impostazioni dell’iPhone.');
  const registration=await navigator.serviceWorker.ready;
  if(!registration.active?.scriptURL.endsWith('/gymtrack-sw.js'))throw Error('Aggiorna GymTrack e riaprila prima di attivare le notifiche.');
  let sub=await registration.pushManager.getSubscription();const old=await pushDeviceGrant();
  if(sub&&old?.accountId!==account){if(!await sub.unsubscribe())throw Error('Impossibile disattivare le notifiche del precedente account. Riprova.');sub=null;}
  if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKeyBytes(state.publicKey)});
  try{
   await this.store.settled();if(!await this.cloud.flush())throw Error('La programmazione non è ancora sincronizzata online. Riprova dopo il salvataggio.');
   if(this.auth.user()?.id!==account||this.auth.offlineMode())throw Error('Accesso cambiato. Riapri le impostazioni notifiche.');
   const saved=await this.auth.request('push-reminder',{operation:'subscribe',endpoint:sub.endpoint,...preferences},'POST');
   if(typeof saved.id!=='string'||!/^[a-f0-9]{64}$/.test(saved.id))throw Error('Il servizio notifiche non ha confermato l’attivazione.');
   await pushDeviceGrant({accountId:account,id:saved.id,enabled:true});return await this.load();
  }catch(error){try{await sub.unsubscribe();}catch{}throw error;}
 }
 async save(preferences:{time:string;timezone:string;everyDay:boolean}){
  await this.store.settled();if(!await this.cloud.flush())throw Error('Programmazione online in attesa. Riprova dopo il salvataggio.');
  await this.auth.request('push-reminder',{operation:'preferences',...preferences},'POST');return this.load();
 }
 async disable(){
  const grant=await pushDeviceGrant();if(grant)await pushDeviceGrant({...grant,enabled:false});await clearPushBadge();
  const registration=await navigator.serviceWorker.getRegistration();const sub=await registration?.pushManager.getSubscription();if(sub)await sub.unsubscribe();
  if(grant&&grant.accountId===this.auth.user()?.id)await this.auth.request('push-reminder',{id:grant.id},'DELETE');return this.load();
 }
 async test(){const grant=await pushDeviceGrant();if(!grant?.enabled||grant.accountId!==this.auth.user()?.id)throw Error('Attiva prima le notifiche su questo dispositivo.');await this.auth.request('push-reminder',{operation:'test',id:grant.id},'POST');}
}
