import { Injectable, inject, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { AuthService } from './auth';
import { feedbackForContext, feedbackSignal } from './feedback';
export const DEFAULT_BACKGROUND='#050E17';
type ThemePreference={id:string;color:string;dirty?:boolean};
@Injectable({providedIn:'root'})
export class ThemeService {
 private feedback=feedbackForContext();
 auth=inject(AuthService); color=signal(DEFAULT_BACKGROUND);busy=signal(false);error=feedbackSignal('error',this.feedback);status=feedbackSignal('success',this.feedback);
 private db=new Dexie('gymtrack-preferences-v1');private preferences:Table<ThemePreference,string>;
 private generation=0;private loadRequest=0;
 private cacheWrites:Promise<unknown>=Promise.resolve();private remoteWrites:Promise<unknown>=Promise.resolve();
 constructor(){this.db.version(1).stores({preferences:'id'});this.preferences=this.db.table('preferences');}
 isLight(){const c=this.color();return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)>150;}
 presets=['#050E17','#10182b','#1c1230','#09251e','#27161b','#edf3fa'];
 private accountId(){return this.auth.user()?.id||'device-local';}
 private writeCache(value:ThemePreference,current:()=>boolean){
  const job=this.cacheWrites.then(async()=>{if(!current())return false;await this.preferences.put(value);return current();});
  this.cacheWrites=job.catch(()=>{});return job;
 }
 private syncColor(color:string,current:()=>boolean){
  // An older dirty-cache upload must finish before a newer user choice reaches
  // the account. Stale queued choices are skipped rather than sent afterwards.
  const job=this.remoteWrites.then(async()=>{if(!current()||this.auth.offlineMode()||!navigator.onLine)return false;await this.auth.request('preferences',{backgroundColor:color});return current();});
  this.remoteWrites=job.catch(()=>{});return job;
 }
 async load(){
  // A save already owns the current color, including its pending local write.
  if(this.busy())return;
  const id=this.accountId(),generation=this.generation,request=++this.loadRequest;
  const current=()=>this.generation===generation&&this.loadRequest===request&&this.accountId()===id;
  let cached:ThemePreference|undefined;
  try {await this.cacheWrites;cached=await this.preferences.get(id);if(!current())return;if(cached&&/^#[0-9a-fA-F]{6}$/.test(cached.color))this.color.set(cached.color);}catch{}
  if(!current())return;
  this.apply();
  if(this.auth.offlineMode() || !navigator.onLine)return;
  if(cached?.dirty){try{if(await this.syncColor(cached.color,current))await this.writeCache({...cached,dirty:false},current);}catch{}return;}
  try{const p=await this.auth.request('preferences');if(!current()||!/^#[0-9a-fA-F]{6}$/.test(p.backgroundColor))return;if(await this.writeCache({id,color:p.backgroundColor},current)){this.color.set(p.backgroundColor);this.apply();}}catch{}
 }
 apply(){
  const color=this.color(),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),light=this.isLight(),style=document.body.style;
  style.setProperty('--bg',color);style.setProperty('--card',color.toLowerCase()===DEFAULT_BACKGROUND.toLowerCase()?'#102230':`color-mix(in srgb, ${color} ${light?'55%':'82%'}, ${light?'white':'#23354c'})`);style.setProperty('--raised',`color-mix(in srgb, ${color} 75%, ${light?'#b7cce4':'#2c4564'})`);style.setProperty('--text',light?'#102135':'#FFFFFF');style.setProperty('--muted',light?'#41556e':'#B5C4D1');style.setProperty('--line',light?'#91a5bc':'#233c52');document.body.classList.toggle('custom-light',light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
 }
 async save(color:string){
  if(this.busy())return;this.busy.set(true);this.error.set('');this.status.set('');
  try{
   if(!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('Inserisci un colore HEX valido.');
   const id=this.accountId(),generation=++this.generation,current=()=>this.generation===generation&&this.accountId()===id;
   if(!await this.writeCache({id,color,dirty:!this.auth.offlineMode()},current))return;
   this.color.set(color);this.apply();this.status.set('Sfondo salvato su questo dispositivo.');
   if(!this.auth.offlineMode() && navigator.onLine){try{if(await this.syncColor(color,current)&&await this.writeCache({id,color,dirty:false},current))this.status.set('Sfondo salvato anche sull’account.');else if(current())this.status.set('Salvato sul dispositivo. Sincronizzazione account ancora da completare.');}catch{if(current())this.status.set('Salvato sul dispositivo. Sincronizzazione account non riuscita.');}}
  }catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}
 }
}
