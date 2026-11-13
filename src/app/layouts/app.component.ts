import {AppFeaturesService} from '../services/app-features';
import {WorkoutStartOptionsComponent} from '../shared/workout-start-options.component';
import { ConfirmationDialogComponent } from '../shared/confirmation-dialog.component';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { ThemeService } from '../services/theme';
import { ViewportService } from '../services/viewport';
import { ShellComponent } from './shell.component';
import { IconComponent } from '../shared/icon.component';
import { FeedbackPopupsComponent } from '../shared/feedback-popups.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { AppActivationUncertainError, AppReleaseService } from '../services/app-release';
import { MobileNavigationService } from '../services/mobile-navigation';
import { HubHostComponent } from '../hub/hub-host.component';
import { isHubUrl } from '../hub/hub-access';
import { HubInviteComponent } from '../hub/hub-invite.component';
import { inviteTokenFromUrl as hubInviteTokenFromUrl } from '../hub/hub-invite-links';
import { inviteTokenFromUrl } from '../services/group-workout';
@Component({selector:'app-root',standalone:true,imports:[WorkoutStartOptionsComponent,ConfirmationDialogComponent,FormsModule,ShellComponent,IconComponent,FeedbackPopupsComponent,HubHostComponent,HubInviteComponent],styleUrls:['./entry.css','./entry-redesign.css'],template:`
<gt-feedback-popups/><gt-confirmation-dialog/>
@if(inviteToken(); as invite){@defer(on immediate){<gt-hub-invite [token]="invite"/>}@placeholder{<p class="entry-status" role="status">Apertura dell’invito…</p>}} @else if(auth.user()) { @if(hubMode()){@defer(on immediate){<gt-hub-host/>}@placeholder{<p class="entry-status" role="status">Apertura…</p>}}@else{<gt-shell /><gt-workout-start-options/>} } @else {
@if(auth.loggingOut()){<p class="entry-status" role="status">Uscita e aggiornamento…</p>}
<main class="entry-page" [class.welcome-state]="welcome() && !auth.setup()" [attr.inert]="entryUpdating()||auth.loggingOut()?'':null">
<div class="entry-layout">
<aside class="entry-hero" [attr.aria-label]="features?.nutritionEnabled()?'GymTrack, allenamento e nutrizione':'GymTrack, allenamento e progressi'">
<div class="xl-top"><img src="/brand/gt-modern-mark.png" alt="Logo GT GymTrack"/><div class="entry-wordmark">Gym<span>Track</span></div></div>
<div class="hero-introduction"><h1><span class="xl-w">Allenati.</span><span class="xl-w">Registra.</span><span class="xl-w xl-g">Migliora.</span></h1><p class="xl-lead">{{features?.nutritionEnabled()?'Schede, carichi, pasti e progressi in un unico posto, sempre con te.':'Schede, carichi e progressi in un unico posto, sempre con te.'}}</p></div>
<div class="entry-features"><div><gt-icon name="weight"/><b>Allenamenti</b><span>serie, carichi, recupero</span></div><div><gt-icon name="chart"/><b>Progressi</b><span>volume e record</span></div>@if(features?.nutritionEnabled()){<div><gt-icon name="nutrition"/><b>Nutrizione</b><span>pasti e calorie</span></div>}</div>
<div class="xl-chart" aria-hidden="true"><div class="xl-chart-head"><div><small>Esempio · volume, 8 settimane</small><div class="xl-big"></div></div><span class="xl-chip">+18%</span></div>
<svg viewBox="0 0 342 110" role="presentation" focusable="false"><defs><linearGradient id="xl-stroke" x1="0" x2="1"><stop offset="0" style="stop-color:var(--accent-text)"/><stop offset="1" style="stop-color:var(--theme-secondary,var(--accent))"/></linearGradient><linearGradient id="xl-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent-text)" stop-opacity=".34"/><stop offset="1" style="stop-color:var(--accent-text)" stop-opacity="0"/></linearGradient></defs>
<g class="xl-grid"><line x1="0" x2="342" y1="20" y2="20"/><line x1="0" x2="342" y1="55" y2="55"/><line x1="0" x2="342" y1="90" y2="90"/></g>
<path class="xl-area" d="M0 88 C30 84 40 70 68 72 S110 80 136 62 S186 56 212 44 S262 38 286 22 S322 14 342 10 L342 110 L0 110Z" fill="url(#xl-fill)"/>
<path class="xl-glow" pathLength="1" d="M0 88 C30 84 40 70 68 72 S110 80 136 62 S186 56 212 44 S262 38 286 22 S322 14 342 10" fill="none" stroke="url(#xl-stroke)" stroke-width="8"/>
<path class="xl-line" pathLength="1" d="M0 88 C30 84 40 70 68 72 S110 80 136 62 S186 56 212 44 S262 38 286 22 S322 14 342 10" fill="none" stroke="url(#xl-stroke)" stroke-width="3" stroke-linecap="round"/>
<circle class="xl-ring" cx="286" cy="22" r="11"/><circle class="xl-dot" cx="286" cy="22" r="5.5"/></svg>
<span class="xl-pr"><gt-icon name="trophy"/>Record · 100 kg</span></div>
<div class="hero-entry-actions"><button class="entry-primary" (click)="welcome.set(false);tab.set('local')">Inizia ora <gt-icon name="arrow"/></button><p>Hai già un account? <button class="entry-text-button" (click)="welcome.set(false);tab.set('account')">Accedi</button></p></div>
</aside>
<section class="entry-panel" aria-labelledby="entry-title">
<div class="entry-topline"><button class="entry-back" aria-label="Torna alla presentazione" (click)="welcome.set(true)" [disabled]="auth.setup()"><gt-icon name="back"/></button><span class="entry-language" lang="it">IT</span></div>
<div class="entry-brand"><img src="/brand/gt-modern-mark.png" alt="Logo GT GymTrack"/><div class="entry-wordmark">Gym<span>Track</span></div><p class="brand-tagline">{{features?.nutritionEnabled()?'ALLENAMENTO · NUTRIZIONE · PROGRESSI':'ALLENAMENTO · PROGRESSI'}}</p></div>
<header class="entry-heading"><p class="entry-kicker">IL TUO SPAZIO DI ALLENAMENTO</p><h1 id="entry-title">{{auth.setup()?'Attiva il tuo account':reset()?'Nuova password':registering()?'Crea il tuo account':'Bentornato'}}</h1><p>{{auth.setup()?'Giacomo, prepara il tuo spazio Super Admin.':reset()?'Reimposta l’accesso del proprietario.':registering()?'Bastano pochi dati per allenarti in gruppo.':'Gestisci i tuoi allenamenti ovunque.'}}</p></header>
@if(invite()&&!auth.setup()&&!reset()){<p class="entry-help" role="status">@if(inviteHost()){<strong>{{inviteHost()}}</strong> ti ha invitato ad allenarti in gruppo@if(inviteDay()){ ({{inviteDay()}})}. }@else if(inviteChecked()){Questo invito non è più valido: chiedi un nuovo link o un codice. }@if(registering()){Hai già un account? <button type="button" class="entry-text-button" (click)="registering.set(false)">Accedi</button>}@else if(inviteOpen()){Non hai un account? <button type="button" class="entry-text-button" (click)="registering.set(true);tab.set('account')">Registrati</button>}</p>}
@if(auth.previousAccountArchive()){<p class="entry-help">Per ritrovare piani ed esercizi, accedi allo stesso account usato nell’ultima apertura. Lo spazio senza account è un archivio separato.</p>}
@if(!auth.setup()){<div class="entry-tabs" role="tablist" aria-label="Modalità di accesso"><button id="account-tab" role="tab" [attr.aria-selected]="tab()==='account'" aria-controls="account-panel" [class.active]="tab()==='account'" (click)="tab.set('account')">Account</button><button id="local-tab" role="tab" [attr.aria-selected]="tab()==='local'" aria-controls="local-panel" [class.active]="tab()==='local'" (click)="tab.set('local')">Sul dispositivo</button></div>}
@if(tab()==='account' || auth.setup()) {
<div id="account-panel" role="tabpanel" [attr.aria-labelledby]="auth.setup()?null:'account-tab'" [attr.aria-label]="auth.setup()?'Attivazione account':null">
@if(auth.loading()){<p class="entry-status" role="status">Verifica dell’accesso online…</p>}
<form #loginForm="ngForm" (ngSubmit)="submit()" autocomplete="on" class="entry-form">
@if(auth.setup()){
<div class="entry-field"><gt-icon name="mail"/><div><label for="setup-email">Email dell’account</label><input id="setup-email" name="email" type="email" autocomplete="email" [ngModel]="auth.ownerEmail()" readonly /></div></div>
@if(auth.setupCodeRequired()){<div class="entry-field"><gt-icon name="lock"/><div><label for="setup-code">Codice di setup</label><input id="setup-code" name="setup-code" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" [(ngModel)]="setupCode" required maxlength="128" placeholder="Il codice scelto durante il deploy" /></div></div>}
<div class="entry-field"><gt-icon name="user"/><div><label for="setup-username">Scegli un nome utente</label><input id="setup-username" name="username" autocomplete="username" [(ngModel)]="username" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" placeholder="Il tuo nome univoco" /></div></div>
}@else if(registering()){
<div class="entry-field"><gt-icon name="user"/><div><label for="register-name">Il tuo nome</label><input id="register-name" name="name" type="text" autocomplete="name" [(ngModel)]="name" required maxlength="80" placeholder="Come ti vedranno gli amici" /></div></div>
<div class="entry-field"><gt-icon name="mail"/><div><label for="register-email">Email</label><input id="register-email" name="email" type="email" autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" [(ngModel)]="email" required maxlength="254" placeholder="nome@esempio.it" /></div></div>
<div class="entry-field"><gt-icon name="user"/><div><label for="register-username">Scegli un nome utente</label><input id="register-username" name="username" autocomplete="username" [(ngModel)]="username" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" placeholder="Il tuo nome univoco" /></div></div>
}@else if(reset()){
@if(auth.ownerReset()==='code'){<div class="entry-field"><gt-icon name="lock"/><div><label for="reset-code">Codice di setup</label><input id="reset-code" name="reset-code" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" [(ngModel)]="setupCode" required maxlength="128" placeholder="Il codice scelto durante il deploy" /></div></div>}
}@else{
<div class="entry-field"><gt-icon name="user"/><div><label for="login-identifier">Nome utente o email</label><input id="login-identifier" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required maxlength="254" [(ngModel)]="email" placeholder="Il tuo username o la tua email" /></div></div>
}
<div class="entry-field"><gt-icon name="lock"/><div><label for="login-password">{{auth.setup()||registering()?'Scegli una password':reset()?'Nuova password':'Password'}}</label><input id="login-password" name="password" [type]="show()?'text':'password'" [attr.autocomplete]="creating()?'new-password':'current-password'" [(ngModel)]="password" required [minlength]="creating()?8:1" maxlength="128" placeholder="••••••••" /></div><button class="entry-eye" type="button" [attr.aria-label]="show()?'Nascondi password':'Mostra password'" [attr.aria-pressed]="show()" (click)="show.set(!show())"><gt-icon [name]="show()?'eye-off':'eye'"/></button></div>
@if(creating()) {<div class="entry-field"><gt-icon name="lock"/><div><label for="confirm-password">Conferma password</label><input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" [(ngModel)]="confirm" required minlength="8" maxlength="128" placeholder="Ripeti la password" /></div></div><p class="entry-helper">Almeno 8 caratteri, senza obbligo di caratteri speciali.</p>}
<div class="entry-options"><label class="remember-option"><input type="checkbox" name="offline-access" [(ngModel)]="remember"/><span>Ricordami su questo iPhone</span></label>@if(!creating()){<button type="button" class="entry-text-button" (click)="help.set(!help())" [attr.aria-expanded]="help()">Password dimenticata?</button>}@if(reset()){<button type="button" class="entry-text-button" (click)="toggleReset(false)">Torna all’accesso</button>}</div>
@if(remember){<p class="entry-helper">Puoi riaprire i dati salvati su questo dispositivo anche senza Internet: non serve un backup sul server. L’archivio sarà accessibile a chi usa questo iPhone; la password non viene salvata.</p>}
@if(help()&&!creating()){<p class="entry-help" role="status">Per recuperare l’accesso o richiedere un account, contatta il Super Admin della palestra.@if(auth.ownerReset()){ <button type="button" class="entry-text-button" (click)="toggleReset(true)">Sei il proprietario? Reimposta la password</button>}</p>}
@if(reset()){<p class="entry-help" role="status">{{auth.ownerReset()==='code'?'Inserisci il codice di setup del deploy (segreto SETUP_CODE) e scegli la nuova password.':'Scegli la nuova password dell’account proprietario.'}} Gli altri dispositivi dovranno accedere di nuovo; i dati non vengono toccati.</p>}
<button class="entry-primary" [disabled]="busy()||auth.loading()||loginForm.invalid">{{busy()?'Accesso in corso…':auth.setup()?'Attiva account':reset()?'Reimposta password':registering()?'Crea account ed entra':'Accedi'}} <gt-icon name="arrow"/></button>
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
 private navigation=inject(MobileNavigationService);
 /** GT Hub (solo Super Admin) usa una cornice propria al posto di quella di GymTrack. */
 readonly hubMode=computed(()=>isHubUrl(this.navigation.url()));
 /** Link d'invito di Dividi: pagina pubblica, si apre anche senza aver effettuato l'accesso. */
 readonly inviteToken=computed(()=>hubInviteTokenFromUrl(this.navigation.url()));
 private feedback=feedbackForContext();
 auth=inject(AuthService);private theme=inject(ThemeService);welcome=signal(false);tab=signal<'account'|'local'>('account');help=signal(false);reset=signal(false);remember=true;username='';setupCode='';email='';name='';password='';confirm='';busy=signal(false);error=feedbackSignal('error',this.feedback);show=signal(false);
 private releases=inject(AppReleaseService);entryUpdating=signal(false);private attemptedEntryBuild='';
 /** Link di invito a un allenamento in gruppo: l'unico modo per creare da soli un account Cliente. */
 readonly invite=signal(typeof location==='undefined'?'':inviteTokenFromUrl(location.href));
 readonly inviteHost=signal('');readonly inviteDay=signal('');readonly inviteOpen=signal(false);readonly inviteChecked=signal(false);
 readonly registering=signal(false);
 readonly creating=computed(()=>this.auth.setup()||this.registering()||this.reset());
 private async checkInvite(){
  try{const r=await this.auth.request('group/invite?token='+this.invite());this.inviteChecked.set(true);if(r.valid){this.inviteHost.set(r.hostName);this.inviteDay.set(r.dayName);this.inviteOpen.set(r.registrationOpen===true);if(r.registrationOpen===true&&!this.auth.user()&&!this.email&&!this.password)this.registering.set(true);}}
  catch{/* senza rete resta disponibile il normale accesso */}
 }
 constructor(){if(this.invite())void this.checkInvite();this.theme.restoreEntryTheme();effect(()=>{if(!this.auth.user())untracked(()=>this.theme.restoreEntryTheme());});effect(()=>{if(!this.auth.loading()&&!this.auth.loggingOut()&&!this.auth.user()&&!this.busy()&&this.releases.autoUpdateReady())queueMicrotask(()=>void this.updateSignedOut());});}
 private async updateSignedOut(){
  const target=this.releases.downloadedBuild();
  if(!target||this.attemptedEntryBuild===target||this.auth.user()||this.auth.loading()||this.auth.loggingOut()||this.busy()||this.email||this.name||this.username||this.password||this.confirm||!this.releases.autoUpdateReady())return;
  this.attemptedEntryBuild=target;this.entryUpdating.set(true);
  let reloading=false;
  try{if(await this.releases.activateReady(this.releases.policy()?.requestedBuildId||undefined)){reloading=true;location.reload();}}
  catch(error){if(error instanceof AppActivationUncertainError){reloading=true;location.reload();}else this.error.set('Aggiornamento rimandato. Puoi accedere e riprovare dalle impostazioni.');}
  finally{if(!reloading)this.entryUpdating.set(false);}
 }
 toggleReset(on:boolean){this.reset.set(on&&!!this.auth.ownerReset());if(on)this.registering.set(false);this.help.set(false);this.password='';this.confirm='';this.setupCode='';this.error.set('');}
 async submit() {
  if(this.busy()) return;this.error.set('');
  const reset=this.reset()&&!this.auth.setup(),registering=this.registering()&&!this.auth.setup()&&!reset;
  if((this.auth.setup()||reset||registering)&&this.password!==this.confirm) {this.error.set('Le password non coincidono.');return;}
  if((this.auth.setup()||registering) && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}$/.test(this.username.trim())) {this.error.set('Scegli un nome utente valido di 3–30 caratteri.');return;}
  this.busy.set(true);
  try {if(registering){await this.auth.register(this.invite(),{name:this.name.trim(),email:this.email.trim(),username:this.username.trim(),password:this.password},this.remember);this.password='';this.confirm='';this.registering.set(false);return;}
   if(reset)await this.auth.resetOwnerPassword(this.password,this.remember,this.setupCode.trim());else await this.auth.login(this.auth.setup()?this.auth.ownerEmail():this.email,this.password,this.auth.setup(),this.remember,this.username,this.setupCode.trim());this.password='';this.confirm='';this.setupCode='';this.reset.set(false);}
  catch(e) {this.error.set(e instanceof Error?e.message:'Accesso non riuscito.');}
  finally {this.busy.set(false);}
 }
}
