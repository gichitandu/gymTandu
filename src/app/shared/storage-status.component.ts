import {Component,computed,inject,signal} from '@angular/core';
import {AuthService} from '../services/auth';
import {IconComponent} from './icon.component';

export interface StorageStatus {
 available:boolean;bytes:number;limitBytes:number;thresholds:number[];level:number;
 lastAlertLevel?:number;lastAlertAt?:string|null;categories:{id:string;label:string;bytes:number}[];partial?:boolean;
 ai?:AiQuota|null;
}
/** Quota giornaliera di Cloudflare Workers AI (neuroni stimati dal Worker). */
export interface AiQuota {
 available:boolean;model:string;allowance:number;used:number;percent:number;state:'ok'|'warning'|'stopped';
 warnAt:number;stopAt:number;remainingScans:number;perAccountLimit:number;resetsAt:string;
}
const GB=1_000_000_000;
export const formatStorage=(bytes:number)=>bytes>=GB?(bytes/GB).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:2})+' GB':(bytes/1_000_000).toLocaleString('it-IT',{maximumFractionDigits:1})+' MB';
const COLORS=['#4da3ff','#7a6bff','#2fd1a0','#f0d26b'];

/** Spazio R2 per i Super Admin: totale, soglie degli avvisi e ripartizione per tipo. Sola lettura. */
@Component({selector:'gt-storage-status',standalone:true,imports:[IconComponent],template:`
@if(auth.uiRole()==='SuperAdmin'&&!auth.offlineMode()){
 <section class="card storage-status" aria-labelledby="storage-title">
  <header><span class="storage-icon"><gt-icon name="shield"/></span><div><h2 id="storage-title">Spazio archivio</h2><small>Cloudflare R2 · solo Super Admin</small></div></header>
  @if(error()){<p class="storage-error" role="alert">{{error()}}</p>}
  @if(status();as s){
   @if(!s.available){<p>Il bucket R2 non è collegato a questa installazione.</p>}
   @else{
    <div class="storage-main">
     <svg viewBox="0 0 140 140" width="124" height="124" role="img" [attr.aria-label]="percent()+'% dello spazio usato'"><title>{{percent()}}% dello spazio usato</title>
      <circle cx="70" cy="70" r="56" fill="none" stroke="rgba(127,127,127,.22)" stroke-width="12"/>
      <circle cx="70" cy="70" r="56" fill="none" [attr.stroke]="ringColor()" stroke-width="12" stroke-linecap="round" [attr.stroke-dasharray]="dash()+' 352'" transform="rotate(-90 70 70)"/>
      <text x="70" y="70" text-anchor="middle" font-size="28" font-weight="600" fill="currentColor">{{percent()}}%</text>
      <text x="70" y="90" text-anchor="middle" font-size="12" fill="currentColor" opacity=".7">usato</text>
     </svg>
     <div><strong class="storage-total">{{format(s.bytes)}}</strong><span>su {{format(s.limitBytes)}} gratuiti</span><p class="storage-next">{{next()}}</p></div>
    </div>
    <div class="storage-thresholds" role="list" aria-label="Soglie degli avvisi email">
     @for(t of s.thresholds;track t;let i=$index){<div role="listitem" [class.reached]="s.bytes>=t"><strong>{{format(t)}}</strong><small>{{['attenzione','alto','critico'][i]||'avviso'}}</small></div>}
    </div>
    @if(s.categories.length){
     <div class="storage-bar" aria-hidden="true">@for(c of s.categories;track c.id;let i=$index){<span [style.flex]="c.bytes" [style.background]="color(i)"></span>}</div>
     <ul class="storage-list">@for(c of s.categories;track c.id;let i=$index){<li><i [style.background]="color(i)"></i><span>{{c.label}}</span><b>{{format(c.bytes)}}</b></li>}</ul>
    }
    @if(s.partial){<p class="storage-note">Conteggio parziale: i file sono molti, il totale reale è almeno quello mostrato.</p>}
    @if(s.lastAlertAt){<p class="storage-note">Ultimo cambio di livello avvisi: {{date(s.lastAlertAt)}}.</p>}
   }
   @if(s.ai;as ai){
    <div class="ai-quota" role="group" aria-labelledby="ai-quota-title">
     <h3 id="ai-quota-title">Quota AI giornaliera</h3><small>Cloudflare Workers AI · {{ai.model}}</small>
     @if(!ai.available){<p class="storage-note">L’analisi foto non è attiva: manca il collegamento AI sul Worker.</p>}
     @else{
      <div class="ai-main"><strong class="storage-total">{{num(ai.used)}}</strong><span>su {{num(ai.allowance)}} neuroni · {{ai.percent}}%</span></div>
      <div class="ai-bar" role="progressbar" aria-label="Quota AI usata oggi" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="ai.percent"><span [style.width.%]="ai.percent" [style.background]="aiColor(ai.state)"></span><i style="left:90%"></i><i style="left:95%"></i></div>
      <div class="storage-thresholds" role="list" aria-label="Soglie della quota AI">
       <div role="listitem" [class.reached]="ai.used>=ai.warnAt"><strong>{{num(ai.warnAt)}}</strong><small>avviso (90%)</small></div>
       <div role="listitem" [class.reached]="ai.state==='stopped'"><strong>{{num(ai.stopAt)}}</strong><small>stop (95%)</small></div>
       <div role="listitem"><strong>{{ai.perAccountLimit}}</strong><small>al giorno per utente</small></div>
      </div>
      <p class="storage-next">{{aiMessage(ai)}}</p>
      <p class="storage-note">I neuroni sono l’unità di calcolo gratuita di Cloudflare, simile ai token ma pesata per modello. È una stima prudente del Worker: la misura ufficiale è nel pannello Workers AI. La quota si azzera dopo mezzanotte UTC.</p>
     }
    </div>
   }
  }
  <button type="button" class="button" [disabled]="loading()" (click)="load()">{{loading()?'Controllo in corso…':'Aggiorna'}}</button>
 </section>
}`,styles:[`
.storage-status{margin-top:20px}.storage-status header{display:flex;align-items:center;gap:12px;margin-bottom:14px}.storage-status h2{font-size:18px;margin:0}.storage-status small{opacity:.7}
.storage-icon{display:inline-flex;width:36px;height:36px;border-radius:11px;align-items:center;justify-content:center;background:rgba(77,163,255,.16)}
.storage-main{display:flex;align-items:center;gap:16px;margin-bottom:14px}.storage-total{display:block;font-size:26px}.storage-main span{opacity:.7}.storage-next{margin:8px 0 0;font-size:13px;opacity:.85}
.storage-thresholds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px}.storage-thresholds>div{border:1px solid rgba(127,127,127,.28);border-radius:12px;padding:9px;text-align:center}.storage-thresholds strong{display:block}.storage-thresholds .reached{border-color:#f05a5a;background:rgba(240,90,90,.12)}
.storage-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;gap:2px;margin-bottom:10px}.storage-bar span{min-width:3px}
.storage-list{list-style:none;margin:0 0 12px;padding:0}.storage-list li{display:flex;align-items:center;gap:8px;padding:5px 0}.storage-list li span{flex:1}.storage-list i{width:9px;height:9px;border-radius:3px}
.storage-note{font-size:12px;opacity:.7;margin:0 0 12px}.storage-error{color:#f05a5a}.storage-status button{width:100%;min-height:44px}
.ai-quota{margin-top:18px;padding-top:14px;border-top:1px solid rgba(127,127,127,.28)}.ai-quota h3{font-size:16px;margin:0}
.ai-main{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin:10px 0}.ai-main span{opacity:.7}
.ai-bar{position:relative;height:10px;border-radius:999px;background:rgba(127,127,127,.22);margin:0 0 12px;overflow:hidden}.ai-bar span{display:block;height:100%;border-radius:999px}.ai-bar i{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.7)}
`]})
export class StorageStatusComponent {
 auth=inject(AuthService);
 status=signal<StorageStatus|null>(null);loading=signal(false);error=signal('');
 percent=computed(()=>{const s=this.status();return s&&s.limitBytes>0?Math.min(100,Math.round(s.bytes/s.limitBytes*100)):0;});
 dash=computed(()=>Math.round(this.percent()/100*352));
 ringColor=computed(()=>{const level=this.status()?.level||0;return level>=3?'#f05a5a':level===2?'#f29a5a':level===1?'#f0d26b':'#4da3ff';});
 next=computed(()=>{const s=this.status();if(!s)return '';const t=s.thresholds.find(v=>s.bytes<v);return t===undefined?'Tutte le soglie degli avvisi sono state superate.':`Prossimo avviso a ${this.format(t)}: mancano ${this.format(t-s.bytes)}.`;});
 format=formatStorage;color=(i:number)=>COLORS[i%COLORS.length];
 num=(value:number)=>value.toLocaleString('it-IT',{maximumFractionDigits:0});
 aiColor=(state:AiQuota['state'])=>state==='stopped'?'#f05a5a':state==='warning'?'#f0d26b':'#4da3ff';
 aiMessage(ai:AiQuota){
  if(ai.state==='stopped')return 'Analisi foto in pausa per tutti fino a dopo mezzanotte UTC (l’1:00 o le 2:00 in Italia).';
  if(ai.state==='warning')return `Quota quasi esaurita: restano almeno ${ai.remainingScans} analisi foto prima dello stop.`;
  return `Restano almeno ${ai.remainingScans} analisi foto oggi (stima prudente).`;
 }
 date(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('it-IT',{dateStyle:'medium',timeStyle:'short'});}
 constructor(){void this.load();}
 async load(){
  if(this.loading()||this.auth.uiRole()!=='SuperAdmin'||this.auth.offlineMode())return;
  this.loading.set(true);this.error.set('');
  try{this.status.set(await this.auth.request('storage-status') as StorageStatus);}
  catch(e){this.error.set(e instanceof Error&&e.message?e.message:'Non riesco a leggere lo spazio R2.');}
  finally{this.loading.set(false);}
 }
}
