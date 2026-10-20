import { Injectable, signal } from '@angular/core';
import { RoleName } from '../models/domain';
export interface Account {id:string;name:string;email:string;role:RoleName;active:boolean;owner:boolean}
@Injectable({providedIn:'root'})
export class AuthService {
  user=signal<Account|null>(null); loading=signal(true); setup=signal(false); error=signal(''); ownerEmail=signal('');
  constructor() { void this.refresh(); }
  async request(path:string, body?:unknown, method?:string) {
    const res=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    let data; try {data=await res.json();} catch {throw new Error('Servizio account non disponibile. Riprova più tardi.');}
    if(!res.ok) throw new Error(data.error||'Operazione non riuscita.');
    return data;
  }
  async refresh() {
    try {const r=await this.request('auth/me');this.user.set(r.user);this.setup.set(r.setup);this.ownerEmail.set(r.ownerEmail);this.error.set('');}
    catch(e) {this.error.set(e instanceof Error?e.message:'Connessione non riuscita.');}
    finally {this.loading.set(false);}
  }
  async login(email:string,password:string,setup=false) {
    const r=await this.request(setup?'auth/setup':'auth/login',{email,password});
    this.user.set(r.user);this.setup.set(false);
  }
  async logout() { await this.request('auth/logout',{}); location.reload(); }
}
