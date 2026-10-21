import { Injectable, signal } from '@angular/core';
import { RoleName } from '../models/domain';
import { feedbackForContext, feedbackSignal } from './feedback';
export interface Account {id:string;name:string;email:string;username?:string|null;role:RoleName;active:boolean;owner:boolean}
export const OFFLINE_ACCOUNT_KEY='gymtrack-offline-account-v1';
@Injectable({providedIn:'root'})
export class AuthService {
  private feedback=feedbackForContext();
  user=signal<Account|null>(null); loading=signal(true); setup=signal(false); error=feedbackSignal('error',this.feedback); ownerEmail=signal('');
  offlineMode=signal(false); offlineAccount=signal<Account|null>(null);
  constructor() {
    try{const raw=JSON.parse(localStorage.getItem(OFFLINE_ACCOUNT_KEY)||'null');if(raw&&typeof raw.id==='string'&&typeof raw.owner==='boolean'&&typeof raw.name==='string')this.offlineAccount.set(raw);}catch{}
    void this.refresh();
  }
  async request(path:string, body?:unknown, method?:string) {
    if(this.offlineMode())throw new Error('Questa funzione condivisa richiede l’accesso online. Le funzioni personali restano disponibili.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try {
      const res=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
      let data; try {data=await res.json();} catch {throw new Error('Servizio account non disponibile. Puoi usare la modalità locale.');}
      if(!res.ok) throw new Error(data.error||'Operazione non riuscita.');return data;
    } finally {clearTimeout(timer);}
  }
  async refresh() {
    try {if(!navigator.onLine)throw Error('Offline');const r=await this.request('auth/me');if(this.offlineMode())return;this.user.set(r.user);this.setup.set(r.setup);this.ownerEmail.set(r.ownerEmail);this.error.set('');}
    catch(e) {if(!this.offlineMode())this.error.set('Accesso online non disponibile. Puoi aprire l’archivio locale.');}
    finally {this.loading.set(false);}
  }
  async login(email:string,password:string,setup=false,remember=false,username?:string) {
    const r=await this.request(setup?'auth/setup':'auth/login',{email,password,...(setup&&username?{username}:{})});
    this.user.set(r.user);this.setup.set(false);if(remember)this.enableOffline();
  }
  async setUsername(username:string) {
    const result=await this.request('auth/username',{username});this.user.set(result.user);
    if(this.offlineAccount()?.id===result.user.id)this.enableOffline();
  }
  enableOffline() {
    const u=this.user();if(!u||this.offlineMode())return;
    try {localStorage.setItem(OFFLINE_ACCOUNT_KEY,JSON.stringify({...u,role:'User'}));this.offlineAccount.set({...u,role:'User'});}catch{throw Error('Il browser non consente di ricordare questo archivio.');}
  }
  openLocal(saved=false) {
    const u=saved?this.offlineAccount():{id:'device-local',name:'Atleta',email:'Solo su questo dispositivo',role:'User' as const,active:true,owner:false};
    if(!u)return;this.offlineMode.set(true);this.user.set({...u,role:'User'});this.loading.set(false);
  }
  async logout() {
    if(!this.offlineMode()) await this.request('auth/logout',{});
    localStorage.removeItem(OFFLINE_ACCOUNT_KEY); location.reload();
  }
}
