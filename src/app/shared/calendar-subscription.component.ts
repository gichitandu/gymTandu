import {Component,effect,inject,signal} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {AuthService} from '../services/auth';
import {Store} from '../services/store';
import {ArchiveSyncService} from '../services/archive-sync';
import {confirmationForContext} from '../services/confirmation';
interface CalendarSubscription {configured:boolean;enabled:boolean;url?:string;updatedAt?:number}
@Component({selector:'gt-calendar-subscription',standalone:true,template:`
<details class="card calendar-link" (toggle)="opened($event)">
 <summary>Calendario iPhone</summary>
 <p>Visualizza gli allenamenti programmati in Calendario. Le modifiche si fanno in GymTrack; iOS aggiorna con i propri tempi.</p>
 @if(!auth.user()||auth.offlineMode()){<p>Accedi online al tuo account per collegarlo.</p>}
 @else{
  @if(state();as status){
   @if(!status.configured){<p role="status">Collegamento non ancora disponibile. Sarà utilizzabile dopo l’attivazione da parte dell’amministratore.</p>}
   @else if(status.enabled){
    <p role="status">Collegamento attivo. {{lastUpdate()}}</p>
    @if(subscriptionUrl()){<a class="button primary" [href]="subscriptionUrl()" rel="noreferrer">Apri in Calendario iPhone</a><button type="button" (click)="copy()" [disabled]="busy()">Copia link</button>}
    <button type="button" (click)="connect()" [disabled]="busy()">Aggiorna collegamento</button>
    <button type="button" (click)="disconnect()" [disabled]="busy()">Disattiva collegamento</button>
    <p class="subtle">Il link è personale: chi lo possiede può leggere il calendario. Per rimuoverlo dall’iPhone, elimina anche l’abbonamento in Calendario.</p>
   }@else{<p>Condividerai con Calendario solo titolo e data degli allenamenti programmati.</p><button class="primary" type="button" (click)="connect()" [disabled]="busy()">Collega il mio calendario</button>}
  }
  @if(busy()){<p role="status">Attendi…</p>}
  @if(notice()){<p role="status">{{notice()}}</p>}
  @if(failed()){<button type="button" (click)="load()" [disabled]="busy()">Riprova</button>}
 }
</details>`,styles:[`.calendar-link{margin-top:16px;padding:16px}.calendar-link summary{min-height:32px;align-content:center;cursor:pointer;font-weight:650}.calendar-link p{font-size:13px;color:var(--muted);line-height:1.6;margin:12px 0}.calendar-link button,.calendar-link a{margin:4px 6px 4px 0;min-height:44px;white-space:normal}.calendar-link .subtle{font-size:12px}`]})
export class CalendarSubscriptionComponent{
 auth=inject(AuthService);private store=inject(Store);private cloud=inject(ArchiveSyncService);private sanitizer=inject(DomSanitizer);private confirmation=confirmationForContext();
 state=signal<CalendarSubscription|null>(null);busy=signal(false);notice=signal('');failed=signal(false);private generation=0;
 constructor(){effect(()=>{this.auth.user()?.id;this.auth.offlineMode();this.generation++;this.state.set(null);this.busy.set(false);this.notice.set('');this.failed.set(false);});}
 private async run(operation:()=>Promise<CalendarSubscription>){
  if(this.busy()||!this.auth.user()||this.auth.offlineMode())return;
  const generation=++this.generation,account=this.auth.user()!.id;this.busy.set(true);this.failed.set(false);this.notice.set('');
  try{const state=await operation();if(generation===this.generation&&this.auth.user()?.id===account)this.state.set(state);}
  catch(error){if(generation===this.generation){this.failed.set(true);this.notice.set(error instanceof Error?error.message:'Collegamento non disponibile.');}}
  finally{if(generation===this.generation)this.busy.set(false);}
 }
 opened(event:Event){if((event.target as HTMLDetailsElement).open&&!this.state())void this.load();}
 load(){return this.run(()=>this.auth.request('calendar-subscription'));}
 connect(){const account=this.auth.user()?.id;return this.run(async()=>{
  await this.store.settled();if(!await this.cloud.flush())throw Error('Attendi il salvataggio online dei dati e risolvi eventuali conflitti prima di collegare il calendario.');
  if(this.auth.user()?.id!==account||this.auth.offlineMode())throw Error('Accedi nuovamente al tuo account.');
  return this.auth.request('calendar-subscription',{},'POST');
 });}
 async disconnect(){if(this.busy()||!await this.confirmation.ask('Disattivare il collegamento? Il link attuale smetterà di funzionare. Gli allenamenti in GymTrack restano salvati.'))return;await this.run(()=>this.auth.request('calendar-subscription',{},'DELETE'));}
 private httpsUrl(){try{const u=new URL(this.state()?.url||'');return u.protocol==='https:'&&!u.username&&!u.password&&/^\/calendar\/[a-f0-9]{64}\.ics$/.test(u.pathname)&&!u.search&&!u.hash?u.href:null;}catch{return null;}}
 subscriptionUrl(){const url=this.httpsUrl();return url?this.sanitizer.bypassSecurityTrustUrl('webcal:'+url.slice(6)):null;}
 lastUpdate(){const at=this.state()?.updatedAt;return at?'Ultima pubblicazione: '+new Date(at).toLocaleString('it-IT'):'';}
 async copy(){const url=this.httpsUrl();if(!url)return;try{await navigator.clipboard.writeText(url);this.notice.set('Link copiato. Puoi aggiungerlo come calendario in abbonamento.');}catch{this.notice.set('Copia non disponibile. Usa “Apri in Calendario iPhone”.');}}
}
