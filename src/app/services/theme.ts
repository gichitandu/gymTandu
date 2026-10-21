import { Injectable, inject, signal } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { AuthService } from './auth';
export const DEFAULT_BACKGROUND='#050b12';
@Injectable({providedIn:'root'})
export class ThemeService {
 auth=inject(AuthService); color=signal(DEFAULT_BACKGROUND);busy=signal(false);error=signal('');status=signal('');
 private db=new Dexie('gymtrack-preferences-v1');private preferences:Table<{id:string;color:string;dirty?:boolean},string>;
 constructor(){this.db.version(1).stores({preferences:'id'});this.preferences=this.db.table('preferences');}
 isLight(){const c=this.color();return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)>150;}
 presets=['#050b12','#10182b','#1c1230','#09251e','#27161b','#edf3fa'];
 async load(){
  const id=this.auth.user()?.id||'device-local';
  let cached:{id:string;color:string;dirty?:boolean}|undefined;
  try {cached=await this.preferences.get(id);if(cached)this.color.set(cached.color);}catch{}
  this.apply();
  if(this.auth.offlineMode() || !navigator.onLine)return;
  if(cached?.dirty){try{await this.auth.request('preferences',{backgroundColor:cached.color});await this.preferences.put({...cached,dirty:false});}catch{}return;}
  try{const p=await this.auth.request('preferences');this.color.set(p.backgroundColor);await this.preferences.put({id,color:p.backgroundColor});this.apply();}catch{}
 }
 apply(){
  const color=this.color(),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)),light=this.isLight(),style=document.body.style;
  style.setProperty('--bg',color);style.setProperty('--card',`color-mix(in srgb, ${color} ${light?'55%':'82%'}, ${light?'white':'#23354c'})`);style.setProperty('--raised',`color-mix(in srgb, ${color} 75%, ${light?'#b7cce4':'#2c4564'})`);style.setProperty('--text',light?'#102135':'#f0f6ff');style.setProperty('--muted',light?'#41556e':'#99adc4');style.setProperty('--line',light?'#91a5bc':'#233c52');document.body.classList.toggle('custom-light',light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
 }
 async save(color:string){
  if(this.busy())return;this.busy.set(true);this.error.set('');this.status.set('');
  try{
   if(!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('Inserisci un colore HEX valido.');
   await this.preferences.put({id:this.auth.user()?.id||'device-local',color,dirty:!this.auth.offlineMode()});this.color.set(color);this.apply();this.status.set('Sfondo salvato su questo dispositivo.');
   if(!this.auth.offlineMode() && navigator.onLine){try{await this.auth.request('preferences',{backgroundColor:color});await this.preferences.put({id:this.auth.user()?.id||'device-local',color,dirty:false});this.status.set('Sfondo salvato anche sull’account.');}catch{this.status.set('Salvato sul dispositivo. Sincronizzazione account non riuscita.');}}
  }catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}
 }
}
