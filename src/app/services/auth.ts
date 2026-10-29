import {stopDevicePushForLogout} from './push-device';
import { computed, Injectable, signal } from '@angular/core';
import { RoleName } from '../models/domain';
import { feedbackForContext, feedbackSignal } from './feedback';
export interface Account {id:string;name:string;email:string;username?:string|null;role:RoleName;active:boolean;owner:boolean}
export const OFFLINE_ACCOUNT_KEY='gymtrack-offline-account-v1';
export const OFFLINE_OPT_OUT_KEY='gymtrack-offline-opt-out-v1';
export const ARCHIVE_CHOICE_KEY='gymtrack-last-archive-choice-v1';
export const PENDING_LOGOUT_KEY='gymtrack-pending-logout-v1';
export interface ArchiveChoice {mode:'device'|'account'|'account-offline'|'signed-out';accountId?:string}
@Injectable({providedIn:'root'})
export class AuthService {
  private feedback=feedbackForContext();
  user=signal<Account|null>(null); loading=signal(true); setup=signal(false); error=feedbackSignal('error',this.feedback); ownerEmail=signal('');
  offlineMode=signal(false); offlineAccount=signal<Account|null>(null);
  readonly platformOwner=signal(false);
  readonly archiveChoice=signal<ArchiveChoice|null>(null);
  readonly loggingOut=signal(false);
  // Presentation only: never serialize this flag into account or archive data.
  private clientViewRequested=signal(false);
  readonly viewAsClient=computed(()=>this.clientViewRequested()&&this.user()?.role==='SuperAdmin'&&!this.offlineMode());
  readonly uiRole=computed(()=>this.viewAsClient()?'User':this.user()?.role||'User');
  readonly canManageBackups=computed(()=>this.user()?.role==='SuperAdmin'&&!this.viewAsClient());
  setClientView(enabled:boolean){this.clientViewRequested.set(enabled&&this.user()?.role==='SuperAdmin'&&!this.offlineMode());}
  private pendingLogoutRequest?:Promise<void>;
  private lifecycle=0;
  constructor() {
    if(typeof window!=='undefined')window.addEventListener?.('online',()=>{void this.flushPendingLogout().catch(()=>{});});
    let recovered=false;
    try{recovered=typeof document!=='undefined'&&(document.cookie||'').split(';').some(value=>value.trim()==='__Host-gymtrack-recovered=1');}catch{}
    if(recovered){
      // Server-confirmed recovery closes only identity metadata. Named IndexedDB
      // archives, local draft databases and cloud copies remain untouched.
      try{localStorage.removeItem(OFFLINE_ACCOUNT_KEY);localStorage.removeItem(PENDING_LOGOUT_KEY);}catch{}
      this.rememberChoice({mode:'signed-out'});this.loading.set(false);
      try{document.cookie='__Host-gymtrack-recovered=; Path=/; Secure; SameSite=Strict; Max-Age=0';}catch{}
      void stopDevicePushForLogout();return;
    }
    try{const raw=JSON.parse(localStorage.getItem(OFFLINE_ACCOUNT_KEY)||'null');if(raw&&typeof raw.id==='string'&&typeof raw.owner==='boolean'&&typeof raw.name==='string')this.offlineAccount.set(raw);}catch{}
    try{const raw=JSON.parse(localStorage.getItem(ARCHIVE_CHOICE_KEY)||'null');if(raw&&['device','account','account-offline','signed-out'].includes(raw.mode)&&(raw.accountId===undefined||typeof raw.accountId==='string'))this.archiveChoice.set(raw);}catch{}
    const choice=this.archiveChoice(),saved=this.offlineAccount();
    if(choice?.mode==='device'){this.openLocal(false,false);void this.refresh();return;}
    if(choice?.mode==='signed-out'){if(navigator.onLine&&this.hasPendingLogout())void this.flushPendingLogout().catch(()=>{}).finally(()=>this.loading.set(false));else this.loading.set(false);return;}
    if(saved&&saved.id===choice?.accountId&&(choice.mode==='account-offline'||choice.mode==='account'&&!navigator.onLine)){this.openLocal(true,false);void this.refresh();return;}
    void this.refresh();
  }
  private rememberChoice(choice:ArchiveChoice){this.archiveChoice.set(choice);try{localStorage.setItem(ARCHIVE_CHOICE_KEY,JSON.stringify(choice));}catch{}}
  previousAccountArchive(){return ['account','account-offline'].includes(this.archiveChoice()?.mode||'');}
  async request(path:string, body?:unknown, method?:string) {
    if(this.offlineMode()&&path!=='auth/logout'&&(path!=='auth/me'||body!==undefined||method&&method!=='GET'))throw new Error('Questa funzione condivisa richiede l’accesso online. Le funzioni personali restano disponibili.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try {
      const res=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
      let data; try {data=await res.json();} catch {throw new Error('Servizio account non disponibile. Puoi usare la modalità locale.');}
      if(!res.ok) throw new Error(data.error||'Operazione non riuscita.');return data;
    } finally {clearTimeout(timer);}
  }
  async refresh() {
    const generation=this.lifecycle;
    try {if(!navigator.onLine)throw Error('Offline');if(this.hasPendingLogout())await this.flushPendingLogout();if(generation!==this.lifecycle||this.loggingOut())return;const r=await this.request('auth/me');if(generation!==this.lifecycle||this.loggingOut()||this.archiveChoice()?.mode==='signed-out')return;this.platformOwner.set(r.platformOwner===true);if(this.offlineMode())return;const choice=this.archiveChoice();if(r.user&&choice?.accountId&&choice.accountId!==r.user.id){this.user.set(null);this.setup.set(false);this.ownerEmail.set(r.ownerEmail);this.error.set('L’ultimo archivio appartiene a un altro account. Accedi allo stesso account per ritrovare i tuoi dati.');return;}if(!r.user||r.user.id!==this.user()?.id||r.user.role!=='SuperAdmin')this.clientViewRequested.set(false);this.user.set(r.user);this.setup.set(r.setup);this.ownerEmail.set(r.ownerEmail);this.error.set('');if(r.user){this.rememberChoice({mode:'account',accountId:r.user.id});this.rememberCurrentSessionOffline();}}
    catch(e) {if(generation!==this.lifecycle||this.loggingOut())return;if(!this.offlineMode()){const choice=this.archiveChoice(),saved=this.offlineAccount();if(choice?.mode==='account'&&saved?.id===choice.accountId)this.openLocal(true,false);else this.error.set('Accesso online non disponibile. Puoi aprire l’archivio locale.');}}
    finally {if(generation===this.lifecycle)this.loading.set(false);}
  }
  async login(email:string,password:string,setup=false,remember=true,username?:string) {
    if(this.loggingOut())throw Error('Uscita in corso. Attendi la riapertura dell’app.');
    this.clientViewRequested.set(false);
    const generation=++this.lifecycle;
    if(this.hasPendingLogout())await this.flushPendingLogout();
    const r=await this.request(setup?'auth/setup':'auth/login',{email,password,...(setup&&username?{username}:{})});
    if(generation!==this.lifecycle||this.loggingOut())throw Error('Accesso interrotto da un cambio di sessione. Riapri l’app.');
    this.rememberChoice({mode:'account',accountId:r.user.id});this.user.set(r.user);this.setup.set(false);
    this.setOfflineOptOut(r.user.id,!remember);
    if(remember)this.rememberCurrentSessionOffline();
    else if(this.offlineAccount()?.id===r.user.id){try{localStorage.removeItem(OFFLINE_ACCOUNT_KEY);}catch{}this.offlineAccount.set(null);}
  }
  async setUsername(username:string) {
    const generation=this.lifecycle;const result=await this.request('auth/username',{username});if(generation!==this.lifecycle||this.loggingOut())return;this.user.set(result.user);
    if(this.offlineAccount()?.id===result.user.id)this.enableOffline();
  }
  private offlineOptOuts():string[]{try{const value=JSON.parse(localStorage.getItem(OFFLINE_OPT_OUT_KEY)||'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[];}catch{return[];}}
  private setOfflineOptOut(accountId:string,optOut:boolean){try{const ids=this.offlineOptOuts().filter(id=>id!==accountId);if(optOut)ids.push(accountId);localStorage.setItem(OFFLINE_OPT_OUT_KEY,JSON.stringify(ids));}catch{}}
  private rememberCurrentSessionOffline(){
    const u=this.user();if(!u||this.offlineMode()||this.offlineOptOuts().includes(u.id))return;
    // Identity metadata opens the existing device archive. No server backup,
    // password or administrator permission is stored for offline use.
    try{localStorage.setItem(OFFLINE_ACCOUNT_KEY,JSON.stringify({...u,role:'User'}));this.offlineAccount.set({...u,role:'User'});}catch{/* Offline identity storage must never block online access. */}
  }
  enableOffline() {
    const u=this.user();if(!u||this.offlineMode())return;
    this.setOfflineOptOut(u.id,false);this.rememberCurrentSessionOffline();
    if(this.offlineAccount()?.id!==u.id)throw Error('Il browser non consente di ricordare questo archivio.');
  }
  openLocal(saved=false,rememberChoice=true) {
    this.clientViewRequested.set(false);
    if(this.loggingOut())return;
    const u=saved?this.offlineAccount():{id:'device-local',name:'Atleta',email:'Solo su questo dispositivo',role:'User' as const,active:true,owner:false};
    if(!u)return;this.lifecycle++;if(rememberChoice)this.rememberChoice(saved?{mode:'account-offline',accountId:u.id}:{mode:'device'});this.offlineMode.set(true);this.user.set({...u,role:'User'});this.loading.set(false);if(rememberChoice)void this.refresh();
  }
  private hasPendingLogout(){try{return localStorage.getItem(PENDING_LOGOUT_KEY)==='1';}catch{return false;}}
  private flushPendingLogout():Promise<void>{
    if(!this.hasPendingLogout())return Promise.resolve();
    if(!navigator.onLine)return Promise.reject(Error('Riconnettiti per completare l’uscita precedente prima di accedere.'));
    if(this.pendingLogoutRequest)return this.pendingLogoutRequest;
    const job=this.request('auth/logout',{}).then(()=>{localStorage.removeItem(PENDING_LOGOUT_KEY);}).finally(()=>{if(this.pendingLogoutRequest===job)this.pendingLogoutRequest=undefined;});
    this.pendingLogoutRequest=job;return job;
  }
  async logout(options:{reload?:boolean}={}) {
    if(this.loggingOut())return;
    this.clientViewRequested.set(false);
    this.loggingOut.set(true);this.lifecycle++;let completed=false;
    // Persist the intent before any asynchronous cleanup. A suspended or slow
    // iPhone request must not reopen its still-valid cookie on the next launch.
    let durable=false;
    try{
      localStorage.setItem(PENDING_LOGOUT_KEY,'1');
      localStorage.setItem(ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'signed-out'}));
      durable=localStorage.getItem(PENDING_LOGOUT_KEY)==='1'&&JSON.parse(localStorage.getItem(ARCHIVE_CHOICE_KEY)||'null')?.mode==='signed-out';
    }catch{}
    const closeLocalIdentity=()=>{
      try{localStorage.removeItem(OFFLINE_ACCOUNT_KEY);}catch{}
      this.offlineAccount.set(null);this.rememberChoice({mode:'signed-out'});this.user.set(null);this.platformOwner.set(false);this.offlineMode.set(false);this.setup.set(false);this.loading.set(false);
    };
    if(durable)closeLocalIdentity();
    // Push-provider and badge cleanup runs separately from exiting the account.
    void stopDevicePushForLogout();
    try{
      let revoked=false,timer:ReturnType<typeof setTimeout>|undefined;
      if(navigator.onLine){
        try{
          const revocation=durable?this.flushPendingLogout():this.request('auth/logout',{}).then(()=>{try{localStorage.removeItem(PENDING_LOGOUT_KEY);}catch{}});
          await Promise.race([revocation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Revoca in attesa della rete')),1500);})]);
          revoked=true;
        }catch{/* A durable local exit remains valid until revocation is retried. */}
        finally{clearTimeout(timer);}
      }
      if(!durable&&!revoked)throw Error('Uscita non completata: il dispositivo non consente di ricordarla. Riprova con una connessione.');
      if(!durable)closeLocalIdentity();
      completed=true;
      if(options.reload!==false)location.reload();
    }finally{if(!completed)this.loggingOut.set(false);}
  }
}
