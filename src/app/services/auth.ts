import { computed, Injectable, signal } from '@angular/core';
import { RoleName } from '../models/domain';
import { feedbackForContext, feedbackSignal } from './feedback';
export interface Account {id:string;name:string;email:string;username?:string|null;role:RoleName;active:boolean;owner:boolean}
export const OFFLINE_ACCOUNT_KEY='gymtrack-offline-account-v1';
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
  setClientView(enabled:boolean){this.clientViewRequested.set(enabled&&this.user()?.role==='SuperAdmin'&&!this.offlineMode());}
  private pendingLogoutRequest?:Promise<void>;
  private lifecycle=0;
  constructor() {
    try{const raw=JSON.parse(localStorage.getItem(OFFLINE_ACCOUNT_KEY)||'null');if(raw&&typeof raw.id==='string'&&typeof raw.owner==='boolean'&&typeof raw.name==='string')this.offlineAccount.set(raw);}catch{}
    try{const raw=JSON.parse(localStorage.getItem(ARCHIVE_CHOICE_KEY)||'null');if(raw&&['device','account','account-offline','signed-out'].includes(raw.mode)&&(raw.accountId===undefined||typeof raw.accountId==='string'))this.archiveChoice.set(raw);}catch{}
    if(typeof window!=='undefined')window.addEventListener?.('online',()=>{void this.flushPendingLogout().catch(()=>{});});
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
    try {if(!navigator.onLine)throw Error('Offline');if(this.hasPendingLogout())await this.flushPendingLogout();if(generation!==this.lifecycle||this.loggingOut())return;const r=await this.request('auth/me');if(generation!==this.lifecycle||this.loggingOut()||this.archiveChoice()?.mode==='signed-out')return;this.platformOwner.set(r.platformOwner===true);if(this.offlineMode())return;const choice=this.archiveChoice();if(r.user&&choice?.accountId&&choice.accountId!==r.user.id){this.user.set(null);this.setup.set(false);this.ownerEmail.set(r.ownerEmail);this.error.set('L’ultimo archivio appartiene a un altro account. Accedi allo stesso account per ritrovare i tuoi dati.');return;}if(!r.user||r.user.id!==this.user()?.id||r.user.role!=='SuperAdmin')this.clientViewRequested.set(false);this.user.set(r.user);this.setup.set(r.setup);this.ownerEmail.set(r.ownerEmail);this.error.set('');if(r.user)this.rememberChoice({mode:'account',accountId:r.user.id});}
    catch(e) {if(generation!==this.lifecycle||this.loggingOut())return;if(!this.offlineMode()){const choice=this.archiveChoice(),saved=this.offlineAccount();if(choice?.mode==='account'&&saved?.id===choice.accountId)this.openLocal(true,false);else this.error.set('Accesso online non disponibile. Puoi aprire l’archivio locale.');}}
    finally {if(generation===this.lifecycle)this.loading.set(false);}
  }
  async login(email:string,password:string,setup=false,remember=false,username?:string) {
    if(this.loggingOut())throw Error('Uscita in corso. Attendi la riapertura dell’app.');
    this.clientViewRequested.set(false);
    const generation=++this.lifecycle;
    if(this.hasPendingLogout())await this.flushPendingLogout();
    const r=await this.request(setup?'auth/setup':'auth/login',{email,password,...(setup&&username?{username}:{})});
    if(generation!==this.lifecycle||this.loggingOut())throw Error('Accesso interrotto da un cambio di sessione. Riapri l’app.');
    this.rememberChoice({mode:'account',accountId:r.user.id});this.user.set(r.user);this.setup.set(false);if(remember)this.enableOffline();
  }
  async setUsername(username:string) {
    const generation=this.lifecycle;const result=await this.request('auth/username',{username});if(generation!==this.lifecycle||this.loggingOut())return;this.user.set(result.user);
    if(this.offlineAccount()?.id===result.user.id)this.enableOffline();
  }
  enableOffline() {
    const u=this.user();if(!u||this.offlineMode())return;
    try {localStorage.setItem(OFFLINE_ACCOUNT_KEY,JSON.stringify({...u,role:'User'}));this.offlineAccount.set({...u,role:'User'});}catch{throw Error('Il browser non consente di ricordare questo archivio.');}
  }
  openLocal(saved=false,rememberChoice=true) {
    this.clientViewRequested.set(false);
    if(this.loggingOut())return;
    const u=saved?this.offlineAccount():{id:'device-local',name:'Atleta',email:'Solo su questo dispositivo',role:'User' as const,active:true,owner:false};
    if(!u)return;this.lifecycle++;if(rememberChoice)this.rememberChoice(saved?{mode:'account-offline',accountId:u.id}:{mode:'device'});this.offlineMode.set(true);this.user.set({...u,role:'User'});this.loading.set(false);if(rememberChoice)void this.refresh();
  }
  private hasPendingLogout(){try{return localStorage.getItem(PENDING_LOGOUT_KEY)==='1';}catch{return false;}}
  private flushPendingLogout():Promise<void>{
    if(!this.hasPendingLogout()||!navigator.onLine)return Promise.resolve();
    if(this.pendingLogoutRequest)return this.pendingLogoutRequest;
    const job=this.request('auth/logout',{}).then(()=>{localStorage.removeItem(PENDING_LOGOUT_KEY);}).finally(()=>{if(this.pendingLogoutRequest===job)this.pendingLogoutRequest=undefined;});
    this.pendingLogoutRequest=job;return job;
  }
  async logout(options:{reload?:boolean}={}) {
    if(this.loggingOut())return;
    this.clientViewRequested.set(false);
    this.loggingOut.set(true);this.lifecycle++;let completed=false;
    try{
      if(navigator.onLine){await this.request('auth/logout',{});try{localStorage.removeItem(PENDING_LOGOUT_KEY);}catch{}}
      else {
        // iOS cannot revoke an HttpOnly cookie offline. Remember the exit and
        // revoke that same session before any later login or online re-entry.
        try{localStorage.setItem(PENDING_LOGOUT_KEY,'1');localStorage.setItem(ARCHIVE_CHOICE_KEY,JSON.stringify({mode:'signed-out'}));}
        catch{throw Error('Uscita non completata: il dispositivo non consente di ricordarla. Riprova con una connessione.');}
      }
      try{localStorage.removeItem(OFFLINE_ACCOUNT_KEY);}catch{}
      this.offlineAccount.set(null);this.rememberChoice({mode:'signed-out'});this.user.set(null);this.platformOwner.set(false);this.offlineMode.set(false);this.setup.set(false);
      this.loading.set(false);completed=true;
      if(options.reload!==false)location.reload();
    }finally{if(!completed)this.loggingOut.set(false);}
  }
}
