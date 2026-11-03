import {AppFeaturesService} from '../services/app-features';
import { ConfirmationDialogComponent } from '../shared/confirmation-dialog.component';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { ViewportService } from '../services/viewport';
import { ShellComponent } from './shell.component';
import { IconComponent } from '../shared/icon.component';
import { FeedbackPopupsComponent } from '../shared/feedback-popups.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { AppActivationUncertainError, AppReleaseService } from '../services/app-release';
@Component({selector:'app-root',standalone:true,imports:[ConfirmationDialogComponent,FormsModule,ShellComponent,IconComponent,FeedbackPopupsComponent],styleUrl:'./entry.css',template:`
<gt-feedback-popups/><gt-confirmation-dialog/>
@if(auth.user()) { <gt-shell /> } @else {
@if(auth.loggingOut()){<p class="entry-status" role="status">Uscita e aggiornamento…</p>}
<main class="entry-page" [class.welcome-state]="welcome() && !auth.setup()" [attr.inert]="entryUpdating()||auth.loggingOut()?'':null">
<div class="entry-layout">
<aside class="entry-hero" [attr.aria-label]="features?.nutritionEnabled()?'GymTrack, allenamento e nutrizione':'GymTrack, allenamento e progressi'">
<div class="hero-emblem"><div class="emblem-orbit" aria-hidden="true"></div><img src="/brand/gt-modern-mark.png" alt="Logo GT GymTrack"/><div class="entry-wordmark">Gym<span>Track</span></div><p class="brand-tagline">{{features?.nutritionEnabled()?'ALLENAMENTO · NUTRIZIONE · PROGRESSI':'ALLENAMENTO · PROGRESSI'}}</p></div>
<div class="hero-introduction"><p class="entry-eyebrow">DISCIPLINA OGGI</p><h1>Una versione<br/><span>migliore</span> di te domani.</h1></div>
<div class="entry-features" [style.grid-template-columns]="features?.nutritionEnabled()?'repeat(3,minmax(0,1fr))':'repeat(2,minmax(0,1fr))'"><div><gt-icon name="weight"/><b>Allenamento</b><span>Piani, esercizi,<br/>progressi</span></div>@if(features?.nutritionEnabled()){<div><gt-icon name="nutrition"/><b>Nutrizione</b><span>Diario alimentare<br/>e foto dei pasti</span></div>}<div><gt-icon name="chart"/><b>Risultati</b><span>Statistiche chiare<br/>e personali</span></div></div>
<div class="hero-entry-actions"><button class="entry-primary" (click)="welcome.set(false);tab.set('local')">Inizia ora <gt-icon name="arrow"/></button><p>Hai già un account? <button class="entry-text-button" (click)="welcome.set(false);tab.set('account')">Accedi</button></p></div>
</aside>
<section class="entry-panel" aria-labelledby="entry-title">
<div class="entry-topline"><button class="entry-back" aria-label="Torna alla presentazione" (click)="welcome.set(true)" [disabled]="auth.setup()"><gt-icon name="back"/></button><span class="entry-language" lang="it">IT</span></div>
<div class="entry-brand"><img src="/brand/gt-modern-mark.png" alt="Logo GT GymTrack"/><div class="entry-wordmark">Gym<span>Track</span></div><p class="brand-tagline">{{features?.nutritionEnabled()?'ALLENAMENTO · NUTRIZIONE · PROGRESSI':'ALLENAMENTO · PROGRESSI'}}</p></div>
<header class="entry-heading"><h1 id="entry-title">{{auth.setup()?'Attiva il tuo account':'Bentornato'}}</h1><p>{{auth.setup()?'Giacomo, prepara il tuo spazio Super Admin.':'Accedi e continua il tuo percorso.'}}</p></header>
@if(auth.previousAccountArchive()){<p class="entry-help">Per ritrovare piani ed esercizi, accedi allo stesso account usato nell’ultima apertura. Lo spazio senza account è un archivio separato.</p>}
@if(!auth.setup()){<div class="entry-tabs" role="tablist" aria-label="Modalità di accesso"><button id="account-tab" role="tab" [attr.aria-selected]="tab()==='account'" aria-controls="account-panel" [class.active]="tab()==='account'" (click)="tab.set('account')">Account</button><button id="local-tab" role="tab" [attr.aria-selected]="tab()==='local'" aria-controls="local-panel" [class.active]="tab()==='local'" (click)="tab.set('local')">Sul dispositivo</button></div>}
@if(tab()==='account' || auth.setup()) {
<div id="account-panel" role="tabpanel" [attr.aria-labelledby]="auth.setup()?null:'account-tab'" [attr.aria-label]="auth.setup()?'Attivazione account':null">
@if(auth.loading()){<p class="entry-status" role="status">Verifica dell’accesso online…</p>}
<form #loginForm="ngForm" (ngSubmit)="submit()" autocomplete="on" class="entry-form">
@if(auth.setup()){
<div class="entry-field"><gt-icon name="mail"/><div><label for="setup-email">Email dell’account</label><input id="setup-email" name="email" type="email" autocomplete="email" [ngModel]="auth.ownerEmail()" readonly /></div></div>
<div class="entry-field"><gt-icon name="user"/><div><label for="setup-username">Scegli un nome utente</label><input id="setup-username" name="username" autocomplete="username" [(ngModel)]="username" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" placeholder="Il tuo nome univoco" /></div></div>
}@else{
<div class="entry-field"><gt-icon name="user"/><div><label for="login-identifier">Nome utente o email</label><input id="login-identifier" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required maxlength="254" [(ngModel)]="email" placeholder="Il tuo username o la tua email" /></div></div>
}
<div class="entry-field"><gt-icon name="lock"/><div><label for="login-password">{{auth.setup()?'Scegli una password':'Password'}}</label><input id="login-password" name="password" [type]="show()?'text':'password'" [attr.autocomplete]="auth.setup()?'new-password':'current-password'" [(ngModel)]="password" required [minlength]="auth.setup()?8:1" maxlength="128" placeholder="••••••••" /></div><button class="entry-eye" type="button" [attr.aria-label]="show()?'Nascondi password':'Mostra password'" [attr.aria-pressed]="show()" (click)="show.set(!show())"><gt-icon [name]="show()?'eye-off':'eye'"/></button></div>
@if(auth.setup()) {<div class="entry-field"><gt-icon name="lock"/><div><label for="confirm-password">Conferma password</label><input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" [(ngModel)]="confirm" required minlength="8" maxlength="128" placeholder="Ripeti la password" /></div></div><p class="entry-helper">Almeno 8 caratteri, senza obbligo di caratteri speciali.</p>}
<div class="entry-options"><label class="remember-option"><input type="checkbox" name="offline-access" [(ngModel)]="remember"/><span>Ricordami su questo iPhone</span></label>@if(!auth.setup()){<button type="button" class="entry-text-button" (click)="help.set(!help())" [attr.aria-expanded]="help()">Password dimenticata?</button>}</div>
@if(remember){<p class="entry-helper">Puoi riaprire i dati salvati su questo dispositivo anche senza Internet: non serve un backup sul server. L’archivio sarà accessibile a chi usa questo iPhone; la password non viene salvata.</p>}
@if(help()&&!auth.setup()){<p class="entry-help" role="status">Per recuperare l’accesso o richiedere un account, contatta il Super Admin della palestra.</p>}
<button class="entry-primary" [disabled]="busy()||auth.loading()||loginForm.invalid">{{busy()?'Accesso in corso…':auth.setup()?'Attiva account':'Accedi'}} <gt-icon name="arrow"/></button>
</form>
<p class="entry-device-hint">Su iPhone puoi salvare le credenziali nell’app Password e compilarle con Face ID.</p>
</div>
} @else {
<div id="local-panel" role="tabpanel" aria-labelledby="local-tab" class="entry-local"><h2>Il tuo spazio personale</h2><p>Allenamenti e progressi sono salvati su questo dispositivo. Dopo il primo caricamento puoi usarli offline, senza caricare o ripristinare backup.</p>
@if(auth.offlineAccount();as u){<button class="entry-primary" (click)="auth.openLocal(true)"><gt-icon name="user"/><span>Continua come {{u.name}}</span><gt-icon name="arrow"/></button>}
<button [class.entry-primary]="!auth.offlineAccount()" [class.entry-secondary]="!!auth.offlineAccount()" (click)="auth.openLocal()">{{auth.offlineAccount()?'Apri lo spazio senza account':'Inizia senza account'}} <gt-icon name="arrow"/></button><p class="entry-helper">Lo spazio senza account è separato dagli archivi degli account condivisi. Le funzioni amministrative richiedono l’accesso online.</p>
</div>
}
<div class="entry-divider"><span>Il tuo percorso, al tuo ritmo</span></div>
<div class="entry-trust"><gt-icon name="shield"/><div><b>I tuoi dati, sempre con te</b><p>Salvataggio automatico sul dispositivo.<br/>Copia server quando disponibile.</p></div></div>
@if(auth.setup()){<p class="entry-switch"><button class="entry-text-button" (click)="auth.openLocal()">Inizia senza account nello spazio locale</button></p>}
@if(tab()==='account'&&!auth.setup()){<p class="entry-switch">Preferisci iniziare senza account? <button class="entry-text-button" (click)="tab.set('local')">Usa lo spazio locale</button></p>}
</section>
</div>
</main>}
`})
export class AppComponent {
 features=inject(AppFeaturesService,{optional:true});
 private viewport=inject(ViewportService);
 private feedback=feedbackForContext();
 auth=inject(AuthService);welcome=signal(false);tab=signal<'account'|'local'>('account');help=signal(false);remember=true;username='';email='';password='';confirm='';busy=signal(false);error=feedbackSignal('error',this.feedback);show=signal(false);
 private releases=inject(AppReleaseService);entryUpdating=signal(false);private attemptedEntryBuild='';
 constructor(){effect(()=>{if(!this.auth.loading()&&!this.auth.loggingOut()&&!this.auth.user()&&!this.busy()&&this.releases.autoUpdateReady())queueMicrotask(()=>void this.updateSignedOut());});}
 private async updateSignedOut(){
  const target=this.releases.downloadedBuild();
  if(!target||this.attemptedEntryBuild===target||this.auth.user()||this.auth.loading()||this.auth.loggingOut()||this.busy()||this.email||this.username||this.password||this.confirm||!this.releases.autoUpdateReady())return;
  this.attemptedEntryBuild=target;this.entryUpdating.set(true);
  let reloading=false;
  try{if(await this.releases.activateReady(this.releases.policy()?.requestedBuildId||undefined)){reloading=true;location.reload();}}
  catch(error){if(error instanceof AppActivationUncertainError){reloading=true;location.reload();}else this.error.set('Aggiornamento rimandato. Puoi accedere e riprovare dalle impostazioni.');}
  finally{if(!reloading)this.entryUpdating.set(false);}
 }
 async submit() {
  if(this.busy()) return;this.error.set('');
  if(this.auth.setup()&&this.password!==this.confirm) {this.error.set('Le password non coincidono.');return;}
  if(this.auth.setup() && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(this.username.trim())) {this.error.set('Scegli un nome utente valido di 3–30 caratteri.');return;}
  this.busy.set(true);
  try {await this.auth.login(this.auth.setup()?this.auth.ownerEmail():this.email,this.password,this.auth.setup(),this.remember,this.username);this.password='';this.confirm='';}
  catch(e) {this.error.set(e instanceof Error?e.message:'Accesso non riuscito.');}
  finally {this.busy.set(false);}
 }
}
