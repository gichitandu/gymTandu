import {inject,Injectable,signal} from '@angular/core';
import {AuthService} from './auth';
import {photoDataUrl} from './images';

export interface GeminiInfo {configured:boolean;source:''|'app'|'server';model:string;dailyLimit:number;used:number;storage:boolean}
export interface MealScanStatus {gemini?:GeminiInfo;available:boolean;blocked:boolean;usedPercent:number;thresholdPercent:number;resetAt:number;remainingScans:number;used?:number;cap?:number;limit?:number;requests?:number;setup?:string}
export interface MealScanItem {name:string;grams:number;calories:number;protein:number;carbs:number;fat:number}
export interface MealScanResult {kind:'plate'|'label'|'none';dish:string;items:MealScanItem[];/** Chi ha letto la foto; "fallback" indica che Gemini era attivo ma ha risposto Cloudflare. */provider?:'gemini'|'cloudflare';fallback?:boolean;/** Motivo per cui Gemini non ha risposto (solo admin). */geminiError?:string}
/** Il limite gratuito giornaliero è quasi esaurito: nessuna richiesta fino al ripristino. */
export class MealScanLimitError extends Error {
 readonly code='AI_LIMIT';
 constructor(readonly resetAt:number){super('Limite giornaliero dell’AI quasi raggiunto: attendere ripristino.');this.name='MealScanLimitError';}
}
const BLOCK_KEY='gymtrack-meal-scan-block-v1';
const DAY=86400000;
const nextUtcMidnight=(now:number)=>{const date=new Date(now);return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1);};
function readBlock():number {
 try{const value=JSON.parse(localStorage.getItem(BLOCK_KEY)||'null');const until=Number(value?.until);return Number.isFinite(until)&&until>Date.now()&&until<=Date.now()+DAY?until:0;}catch{return 0;}
}
function validStatus(value:unknown):MealScanStatus|null {
 const status=value as MealScanStatus;
 if(!status||typeof status!=='object'||typeof status.available!=='boolean'||typeof status.blocked!=='boolean'||!Number.isFinite(status.resetAt))return null;
 return {...status,usedPercent:Number.isFinite(status.usedPercent)?Math.min(100,Math.max(0,status.usedPercent)):0,thresholdPercent:Number.isFinite(status.thresholdPercent)?status.thresholdPercent:95,remainingScans:Number.isFinite(status.remainingScans)?Math.max(0,status.remainingScans):0};
}
function validResult(value:unknown):MealScanResult {
 const data=value as MealScanResult,limits={grams:10000,calories:20000,protein:2000,carbs:3000,fat:2000};
 const items=(Array.isArray(data?.items)?data.items:[]).filter(item=>item&&typeof item.name==='string'&&item.name.trim()&&item.name.length<=100&&item.grams>0
  &&(Object.keys(limits) as (keyof typeof limits)[]).every(key=>typeof item[key]==='number'&&Number.isFinite(item[key])&&item[key]>=0&&item[key]<=limits[key]))
  .slice(0,8).map(item=>({name:item.name.trim(),grams:item.grams,calories:item.calories,protein:item.protein,carbs:item.carbs,fat:item.fat}));
 return {kind:items.length?(data.kind==='label'?'label':'plate'):'none',dish:items.length&&typeof data.dish==='string'?data.dish.trim().slice(0,100):'',items,provider:data?.provider==='gemini'?'gemini':data?.provider==='cloudflare'?'cloudflare':undefined,geminiError:typeof data?.geminiError==='string'&&data.geminiError?data.geminiError.slice(0,200):undefined};
}

/**
 * Lettura delle foto dei pasti con Workers AI attraverso il Worker dell'app.
 * Il Worker conta i consumi e si ferma prima del limite gratuito; quando comunica il blocco,
 * questo servizio lo ricorda sul dispositivo e non invia più alcuna richiesta fino al ripristino.
 */
@Injectable({providedIn:'root'})
export class MealScanService {
 private auth=inject(AuthService);
 readonly status=signal<MealScanStatus|null>(null);
 readonly busy=signal(false);
 /** Fine del blocco in millisecondi; 0 quando la lettura con AI non è in pausa. */
 readonly blockedUntil=signal(readBlock());
 private statusAt=0;
 private statusJob?:Promise<MealScanStatus|null>;
 private controller?:AbortController;
 private timer?:ReturnType<typeof setTimeout>;
 constructor(){this.arm();}

 /** Non modifica alcuno stato: può essere usato nei template. */
 blocked(now=Date.now()){const until=this.blockedUntil();return until>0&&now<until;}
 resetTime(){const until=this.blockedUntil()||this.status()?.resetAt||0;return until?new Date(until).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'';}
 waitMessage(){const time=this.resetTime();return 'Attendere ripristino: il limite gratuito giornaliero dell’AI è quasi raggiunto'+(time?' e si azzera alle '+time:'')+'. Nel frattempo puoi scrivere il pasto a mano.';}
 online(){return !!this.auth.user()&&!this.auth.offlineMode()&&(typeof navigator==='undefined'||navigator.onLine!==false);}

 private arm(){
  clearTimeout(this.timer);const until=this.blockedUntil();if(!until)return;
  this.timer=setTimeout(()=>{this.expire();void this.ensureStatus(true);},Math.min(2147483647,Math.max(0,until-Date.now())+1000));
 }
 private block(until:number){
  const now=Date.now(),value=Math.min(Number.isFinite(until)&&until>now?until:nextUtcMidnight(now),now+DAY);
  this.blockedUntil.set(value);try{localStorage.setItem(BLOCK_KEY,JSON.stringify({until:value}));}catch{}this.arm();
 }
 private unblock(){if(this.blockedUntil())this.blockedUntil.set(0);clearTimeout(this.timer);try{localStorage.removeItem(BLOCK_KEY);}catch{}}
 /** Toglie il blocco solo dopo l'orario di ripristino. */
 private expire(){if(this.blockedUntil()&&!this.blocked()){this.unblock();this.status.set(null);this.statusAt=0;}}
 private apply(status:MealScanStatus){
  // Le risposte alle scansioni non contengono i dati Gemini: restano quelli dell'ultimo stato completo.
  this.status.set({...status,gemini:status.gemini??this.status()?.gemini});this.statusAt=Date.now();
  if(status.available&&status.blocked)this.block(status.resetAt);else this.unblock();
 }

 private async call(body?:unknown,signal?:AbortSignal,timeout=8000):Promise<any>{
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort(),timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
  if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
   const response=await fetch('/api/meal-scan',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
   let data:any;try{data=await response.json();}catch{throw Error('Lettura foto con AI non disponibile. Riprova più tardi.');}
   const status=validStatus(body?data?.status:data);if(status)this.apply(status);
   if(!response.ok){
    if(data?.code==='AI_LIMIT'){if(!this.blocked())this.block(Number(data?.status?.resetAt));throw new MealScanLimitError(this.blockedUntil());}
    throw Object.assign(Error(data?.error||'Analisi della foto non riuscita. Riprova.'),{code:data?.code||'',status:response.status});
   }
   return data;
  }catch(error){
   if(timedOut)throw Error('L’analisi sta impiegando troppo tempo. Riprova tra poco oppure scrivi il pasto a mano.');
   throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }

 /** Stato del limite. Con il blocco attivo, offline o senza account non contatta il server. */
 async ensureStatus(force=false):Promise<MealScanStatus|null>{
  if(this.blocked())return this.status();
  this.expire();
  if(!this.online())return null;
  if(!force&&this.status()&&Date.now()-this.statusAt<60000)return this.status();
  if(this.statusJob)return this.statusJob;
  const job:Promise<MealScanStatus|null>=this.call().then(validStatus,()=>null).finally(()=>{if(this.statusJob===job)this.statusJob=undefined;});
  this.statusJob=job;return job;
 }

 async scan(photo:Blob):Promise<MealScanResult>{
  if(this.busy())throw Error('È già in corso un’analisi.');
  if(this.blocked())throw new MealScanLimitError(this.blockedUntil());
  this.expire();
  if(!this.online())throw Object.assign(Error('La lettura con AI richiede la connessione e l’accesso all’account.'),{code:'AI_UNAVAILABLE'});
  const controller=new AbortController();this.controller=controller;this.busy.set(true);
  try{
   const image=await photoDataUrl(photo,controller.signal);
   // Il blocco può essere arrivato da un'altra scheda mentre la foto veniva preparata.
   const stored=readBlock();if(stored&&!this.blocked())this.block(stored);
   if(this.blocked())throw new MealScanLimitError(this.blockedUntil());
   const gemini=!!this.status()?.gemini?.configured,result=validResult(await this.call({image},controller.signal,100000));
   return gemini&&result.provider==='cloudflare'?{...result,fallback:true}:result;
  }finally{this.busy.set(false);if(this.controller===controller)this.controller=undefined;}
 }
 /** Salva la chiave Gemini personale dell'admin: il server la verifica con Google e non la restituisce mai. */
 async saveGeminiKey(apiKey:string,model:string):Promise<void>{await this.geminiRequest('PUT',{apiKey:apiKey.trim(),model:model.trim()});}
 async removeGeminiKey():Promise<void>{await this.geminiRequest('DELETE');}
 private async geminiRequest(method:'PUT'|'DELETE',body?:unknown){
  if(!this.online())throw Error('Serve la connessione e l’accesso all’account.');
  const response=await fetch('/api/meal-scan',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  let data:any;try{data=await response.json();}catch{throw Error('Risposta del server non valida. Riprova.');}
  if(!response.ok)throw Error(data?.error||'Operazione non riuscita. Riprova.');
  const current=this.status();if(current&&data?.gemini)this.status.set({...current,gemini:data.gemini});
  else await this.ensureStatus(true);
 }
 cancel(){this.controller?.abort();}
 ngOnDestroy(){clearTimeout(this.timer);this.controller?.abort();}
}
