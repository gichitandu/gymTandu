import {computed,effect,inject,Injectable,signal,untracked} from '@angular/core';
import {AuthService} from './auth';
import {feedbackForContext,feedbackSignal} from './feedback';

export interface AppFeatureState {nutritionEnabled:boolean;hubEnabled?:boolean;garageEnabled?:boolean;revision?:number;updatedAt?:number|null}
export type AppFeatureKey='nutritionEnabled'|'hubEnabled'|'garageEnabled';
const FEATURE_TEXT:Record<AppFeatureKey,[string,string]>={nutritionEnabled:['Sezione Pasti visibile.','Sezione Pasti nascosta.'],hubEnabled:['GT Hub abilitato per tutti gli utenti.','GT Hub riservato al Super Admin.'],garageEnabled:['GT Garage abilitato per tutti gli utenti.','GT Garage riservato al Super Admin.']};
const CACHE_PREFIX='gymtrack-app-features-v1:';

@Injectable({providedIn:'root'})
export class AppFeaturesService {
 private auth=inject(AuthService);
 private feedback=feedbackForContext();
 readonly nutritionEnabled=signal(false);
 /** GT Hub e GT Garage aperti anche agli utenti normali (il Super Admin li vede sempre). */
 readonly hubEnabled=signal(false);
 readonly garageEnabled=signal(false);
 readonly ready=signal(false);
 readonly loading=signal(false);
 readonly saving=signal(false);
 readonly error=feedbackSignal('error',this.feedback);
 readonly message=feedbackSignal('success',this.feedback);
 readonly status=computed(()=>this.loading()?'Controllo visibilità…':this.nutritionEnabled()?'La sezione Pasti è visibile agli utenti.':'La sezione Pasti è nascosta agli utenti.');
 private accountId:string|null=null;
 private epoch=0;
 private requestJob?:{epoch:number;promise:Promise<boolean>};
 private disposed=false;
 private waiters=new Set<()=>void>();
 private online=()=>this.syncContext(true);
 private visibility=()=>{if(document.visibilityState==='visible')this.syncContext(true);};
 constructor(){
  effect(()=>{this.auth.user()?.id;this.auth.offlineMode();this.auth.loading?.();untracked(()=>this.syncContext(true));});
  if(typeof window!=='undefined'){window.addEventListener('online',this.online);window.addEventListener('offline',this.online);}
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);
 }
 private offline(){return this.auth.offlineMode()||(typeof navigator!=='undefined'&&navigator.onLine===false);}
 private notify(){for(const ready of [...this.waiters])ready();}
 private cacheRead(id:string):AppFeatureState{
  try{const value=JSON.parse(localStorage.getItem(CACHE_PREFIX+id)||'null');if(value?.version===1&&value.accountId===id&&typeof value.nutritionEnabled==='boolean')return{nutritionEnabled:value.nutritionEnabled,hubEnabled:value.hubEnabled===true,garageEnabled:value.garageEnabled===true};}catch{}
  return{nutritionEnabled:false,hubEnabled:false,garageEnabled:false};
 }
 private cacheWrite(id:string,state:AppFeatureState){try{localStorage.setItem(CACHE_PREFIX+id,JSON.stringify({version:1,accountId:id,nutritionEnabled:state.nutritionEnabled,hubEnabled:state.hubEnabled===true,garageEnabled:state.garageEnabled===true,revision:state.revision??0}));}catch{}}
 private apply(state:AppFeatureState){this.nutritionEnabled.set(state.nutritionEnabled);this.hubEnabled.set(state.hubEnabled===true);this.garageEnabled.set(state.garageEnabled===true);}
 private snapshot():AppFeatureState{return{nutritionEnabled:this.nutritionEnabled(),hubEnabled:this.hubEnabled(),garageEnabled:this.garageEnabled()};}
 private value(state:unknown):AppFeatureState{
  if(!state||typeof state!=='object'||typeof (state as AppFeatureState).nutritionEnabled!=='boolean')throw Error('Impostazioni delle sezioni non disponibili.');
  for(const key of ['hubEnabled','garageEnabled'] as const)if((state as AppFeatureState)[key]!==undefined&&typeof (state as AppFeatureState)[key]!=='boolean')throw Error('Impostazioni delle sezioni non disponibili.');
  return state as AppFeatureState;
 }
 private syncContext(fetch:boolean){
  if(this.disposed)return;
  const id=this.auth.user()?.id||null;
  if(id!==this.accountId){this.accountId=id;this.epoch++;this.requestJob=undefined;this.apply({nutritionEnabled:false});this.ready.set(false);this.loading.set(false);this.saving.set(false);this.error.set('');}
  if(!id){if(!this.auth.loading?.()){this.ready.set(true);this.notify();}return;}
  if(this.offline()){this.apply(this.cacheRead(id));this.ready.set(true);this.loading.set(false);this.notify();return;}
  if(fetch)void this.refresh();
 }
 async refresh():Promise<boolean>{
  this.syncContext(false);
  const id=this.accountId,epoch=this.epoch;
  if(!id||this.offline()||this.saving())return this.nutritionEnabled();
  if(this.requestJob?.epoch===epoch)return this.requestJob.promise;
  this.loading.set(true);
  const promise=(async()=>{
   try{
    const state=this.value(await this.auth.request('app-features'));
    if(this.disposed||epoch!==this.epoch||this.auth.user()?.id!==id)return false;
    this.apply(state);this.cacheWrite(id,state);return state.nutritionEnabled;
   }catch{return this.nutritionEnabled();}
   finally{if(epoch===this.epoch&&!this.disposed){this.loading.set(false);this.ready.set(true);this.notify();if(this.requestJob?.epoch===epoch)this.requestJob=undefined;}}
  })();
  this.requestJob={epoch,promise};return promise;
 }
 /** Route navigation waits at most seven seconds, including initial account loading. */
 ensureLoaded():Promise<boolean>{
  this.syncContext(true);
  if(this.ready())return Promise.resolve(this.nutritionEnabled());
  return new Promise(resolve=>{
   let timer:ReturnType<typeof setTimeout>;
   const finish=()=>{if(!this.ready()&&!this.disposed)return;clearTimeout(timer);this.waiters.delete(finish);resolve(!this.disposed&&this.nutritionEnabled());};
   this.waiters.add(finish);timer=setTimeout(()=>{this.waiters.delete(finish);resolve(false);},7000);finish();
  });
 }
 setNutritionEnabled(enabled:boolean):Promise<boolean>{return this.setFeature('nutritionEnabled',enabled);}
 /** Solo un Super Admin online cambia gli interruttori globali; il Worker lo verifica di nuovo. */
 async setFeature(key:AppFeatureKey,enabled:boolean):Promise<boolean>{
  this.syncContext(false);
  if(this.saving())return false;
  if(this.auth.user()?.role!=='SuperAdmin'||this.auth.uiRole()!=='SuperAdmin'||this.offline()){
   this.error.set('Questa impostazione richiede un Super Admin online.');return false;
  }
  const id=this.auth.user()!.id,epoch=++this.epoch,before=this.snapshot();this.requestJob=undefined;this.loading.set(false);
  this.saving.set(true);this.error.set('');this[key].set(enabled);
  try{
   const state=this.value(await this.auth.request('app-features',{[key]:enabled},'POST'));
   if(this.disposed||epoch!==this.epoch||this.auth.user()?.id!==id)return false;
   this.apply(state);this.ready.set(true);this.cacheWrite(id,state);this.notify();
   this.message.set(FEATURE_TEXT[key][this[key]()?0:1]);return true;
  }catch(error){if(!this.disposed&&epoch===this.epoch){this.apply(before);this.error.set(error instanceof Error?error.message:'Modifica della visibilità non riuscita.');}return false;}
  finally{if(!this.disposed&&epoch===this.epoch)this.saving.set(false);}
 }
 ngOnDestroy(){this.disposed=true;this.notify();this.waiters.clear();if(typeof window!=='undefined'){window.removeEventListener('online',this.online);window.removeEventListener('offline',this.online);}if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);}
}
