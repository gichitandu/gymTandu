import {Injectable,inject,signal} from '@angular/core';
import Dexie,{Table} from 'dexie';
import {AuthService} from './auth';
import {feedbackForContext,feedbackSignal} from './feedback';
import {ThemeConfig,THEME_PALETTES,validThemeConfig,resolveTheme,contrastRatio} from './theme-palettes';
export const DEFAULT_BACKGROUND='#050E17';
export const DEFAULT_THEME:ThemeConfig={palette:'carbonio',mode:'dark'};
type ThemePreference={id:string;color:string;config?:ThemeConfig;dirty?:boolean};
@Injectable({providedIn:'root'})
export class ThemeService{
 private feedback=feedbackForContext();
 auth=inject(AuthService);config=signal<ThemeConfig>({...DEFAULT_THEME});color=signal('#101416');busy=signal(false);error=feedbackSignal('error',this.feedback);status=feedbackSignal('success',this.feedback);
 palettes=THEME_PALETTES;presets=THEME_PALETTES.map(p=>p.background);
 private media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: light)'):undefined;
 systemLight=signal(this.media?.matches??false);
 private onSystemChange=(event:MediaQueryListEvent)=>{this.systemLight.set(event.matches);if(this.config().mode==='system')this.apply();};
 private onOnline=()=>{void this.load();};
 private db=new Dexie('gymtrack-preferences-v1');private preferences:Table<ThemePreference,string>;
 private generation=0;private loadRequest=0;private loadedAccount='';private savingAccount='';
 private cacheWrites:Promise<unknown>=Promise.resolve();private remoteWrites:Promise<unknown>=Promise.resolve();
 constructor(){this.db.version(1).stores({preferences:'id'});this.preferences=this.db.table('preferences');this.media?.addEventListener?.('change',this.onSystemChange);if(typeof window!=='undefined')window.addEventListener?.('online',this.onOnline);}
 private accountId(){return this.auth.user()?.id||'device-local';}
 private legacy(color:string):ThemeConfig{return color.toUpperCase()===DEFAULT_BACKGROUND?{...DEFAULT_THEME}:{palette:'carbonio',mode:contrastRatio(color,'#000000')>=contrastRatio(color,'#FFFFFF')?'light':'dark',background:color};}
 private cacheConfig(value:ThemePreference){return validThemeConfig(value.config)?value.config:this.legacy(value.color);}
 isLight(){return resolveTheme(this.config(),this.systemLight()).light;}
 private writeCache(value:ThemePreference,current:()=>boolean){const job=this.cacheWrites.then(async()=>{if(!current())return false;await this.preferences.put(value);return current();});this.cacheWrites=job.catch(()=>{});return job;}
 private syncPreference(value:ThemePreference,current:()=>boolean){
  const job=this.remoteWrites.then(async()=>{if(!current()||this.auth.offlineMode()||!navigator.onLine)return false;await this.auth.request('preferences',{backgroundColor:value.color,...(value.config?{themeConfig:value.config}:{})});return current();});this.remoteWrites=job.catch(()=>{});return job;
 }
 async load(){
  const id=this.accountId();if(this.busy()&&this.savingAccount===id)return;
  const generation=this.generation,request=++this.loadRequest;
  const current=()=>this.generation===generation&&this.loadRequest===request&&this.accountId()===id;
  if(this.loadedAccount!==id){this.loadedAccount=id;this.config.set({...DEFAULT_THEME});this.apply();}
  let cached:ThemePreference|undefined;
  try{await this.cacheWrites;cached=await this.preferences.get(id);if(!current())return;if(cached&&/^#[0-9a-fA-F]{6}$/.test(cached.color)){this.config.set(this.cacheConfig(cached));this.apply();}}catch{}
  if(!current()||this.auth.offlineMode()||!navigator.onLine)return;
  if(cached?.dirty){try{if(await this.syncPreference(cached,current))await this.writeCache({...cached,dirty:false},current);}catch{}return;}
  try{
   const remote=await this.auth.request('preferences');if(!current()||!/^#[0-9a-fA-F]{6}$/.test(remote.backgroundColor))return;
   const value:ThemePreference={id,color:remote.backgroundColor,...(validThemeConfig(remote.themeConfig)?{config:remote.themeConfig}:{})};
   if(await this.writeCache(value,current)){this.config.set(this.cacheConfig(value));this.apply();}
  }catch{}
 }
 apply(){
  const tokens=resolveTheme(this.config(),this.systemLight()),style=document.body.style;this.color.set(tokens.background);
  const values:Record<string,string>={'--bg':tokens.background,'--card':tokens.card,'--raised':tokens.raised,'--line':tokens.line,'--text':tokens.text,'--muted':tokens.muted,'--accent':tokens.accent,'--accent-ink':tokens.buttonText,'--accent-text':tokens.accentText,'--blue':tokens.accentText,'--accent-soft':tokens.accentSoft,'--nav-bg':tokens.card,'--green':tokens.light?'#156B4D':'#70D4AD','--danger':tokens.light?'#AA223C':'#FFADB9','--danger-soft':tokens.light?'#FDEDF1':'#3A2029','color-scheme':tokens.light?'light':'dark'};
  for(const [key,value] of Object.entries(values))style.setProperty(key,value);
  document.body.classList.toggle('theme-ready',true);document.body.classList.toggle('custom-light',tokens.light);document.body.classList.toggle('light',tokens.light);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',tokens.background);
 }
 async saveConfig(config:ThemeConfig):Promise<boolean>{if(!validThemeConfig(config)){this.error.set('Scegli una palette e colori validi.');return false;}return this.persist(structuredClone(config),false);}
 async save(color:string){if(!/^#[0-9a-fA-F]{6}$/.test(color)){this.error.set('Inserisci un colore HEX valido.');return false;}return this.persist(this.legacy(color),true,color);}
 private async persist(config:ThemeConfig,legacy:boolean,legacyColor?:string):Promise<boolean>{
  if(this.busy())return false;this.busy.set(true);this.error.set('');this.status.set('');
  const id=this.accountId(),generation=++this.generation,current=()=>this.generation===generation&&this.accountId()===id;
  this.savingAccount=id;
  const color=legacyColor||resolveTheme(config,this.systemLight()).background;
  const value:ThemePreference={id,color,...(!legacy?{config}:{}),dirty:id!=='device-local'};
  try{
   if(!await this.writeCache(value,current))return false;
   this.loadedAccount=id;this.config.set(config);this.apply();this.status.set('Tema salvato sul dispositivo.');
   if(!this.auth.offlineMode()&&navigator.onLine){try{if(await this.syncPreference(value,current)&&await this.writeCache({...value,dirty:false},current))this.status.set('Tema salvato anche sull’account.');else if(current())this.status.set('Salvato sul dispositivo. La sincronizzazione riprenderà con la rete.');}catch{if(current())this.status.set('Salvato sul dispositivo. La sincronizzazione riprenderà con la rete.');}}
   return current();
  }catch(error){if(current())this.error.set(error instanceof Error?error.message:'Tema non salvato. Riprova.');return false;}
  finally{this.busy.set(false);this.savingAccount='';}
 }
 ngOnDestroy(){this.media?.removeEventListener?.('change',this.onSystemChange);if(typeof window!=='undefined')window.removeEventListener?.('online',this.onOnline);this.db.close();}
}
