import { Component, inject } from '@angular/core';
import { AuthService } from '../services/auth';
import { PwaService } from '../services/pwa';
import { AppReleaseService } from '../services/app-release';

@Component({selector:'gt-app-updates',standalone:true,template:`
<section class="card app-updates">
 <h3>Aggiornamenti dell’app</h3>
 <p role="status">{{release.message()}}</p>
 @if(release.currentBuild()){<small>Versione in uso: {{release.currentBuild()!.slice(0,12)}}</small>}
 @if(release.policy();as published){<small>Versione pubblicata: {{published.buildId.slice(0,12)}}</small>}
 @if(release.lastChecked();as checked){<small>Ultimo controllo: {{date(checked)}}</small>}
 @if(release.lastApplied();as applied){<small>Aggiornamento rilevato su questo dispositivo: {{date(applied)}}</small>}
 <div class="actions">
  <button type="button" (click)="release.check(true)" [disabled]="release.checking()||pwa.updating()">{{release.checking()?'Controllo…':'Controlla aggiornamenti'}}</button>
  @if(release.updateReady()||pwa.updateReady()){<button type="button" class="primary" (click)="pwa.reload()" [disabled]="pwa.updating()">{{pwa.updating()?'Salvataggio e aggiornamento…':'Aggiorna questo dispositivo'}}</button>}
 </div>
 @if(auth.uiRole()==='SuperAdmin'&&!auth.offlineMode()){
  <div class="release-distribution"><h4>Distribuzione agli utenti</h4>
   <p>Richiedi l’ultima versione già pubblicata. Gli utenti autorizzati la applicheranno alla riapertura o al logout; un allenamento in corso rimane aperto. Non serve un backup manuale.</p>
   <button type="button" class="primary" (click)="release.distribute()" [disabled]="release.distributing()||release.checking()||pwa.updating()">{{release.distributing()?'Distribuzione…':'Distribuisci ultima versione'}}</button>
   @if(release.policy()?.requestedAt){<small>Ultima richiesta: {{date(release.policy()!.requestedAt!)}}</small>}
  </div>
 }
 @if(pwa.updateNotice()){<p role="status">{{pwa.updateNotice()}}</p>}
 @if(pwa.updateError()){<p class="update-problem" role="status">{{pwa.updateError()}}</p>}
 @if(release.error()){<p class="update-problem" role="status">{{release.error()}}</p>}
 @if(pwa.updateError()||release.error()){<a class="button ghost" href="/aggiorna.html?ngsw-bypass=1&v=3">Apri aggiornamento diretto</a>}
 <p>Il controllo riparte quando torna la connessione. L’aggiornamento conserva l’archivio e le bozze salvate sul dispositivo.</p>
</section>`,styles:[`.app-updates{margin-top:20px}.app-updates h3{font-size:17px}.app-updates h4{font-size:14px;margin:0 0 8px}.app-updates p{font-size:13px;line-height:1.6;margin:10px 0;color:var(--muted);overflow-wrap:anywhere}.app-updates small{display:block;font-size:12px;line-height:1.6;color:var(--muted);margin:8px 0}.app-updates .actions{margin:12px 0;flex-wrap:wrap}.app-updates button{min-height:44px}.release-distribution{border-top:1px solid var(--line);margin-top:18px;padding-top:16px}.app-updates .update-problem{color:var(--danger,#ff7e95)}`]})
export class AppUpdatesComponent {
 auth=inject(AuthService);pwa=inject(PwaService);release=inject(AppReleaseService);
 date(value:number){return new Date(value).toLocaleString('it-IT');}
}
