import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { ShellComponent } from './shell.component';
@Component({selector:'app-root',standalone:true,imports:[FormsModule,ShellComponent],template:`
@if(auth.user()) { <gt-shell /> } @else {
<main class="auth-page"><section class="card auth-card">
<a class="brand" href="/">Gym<span>Track</span></a>
@if(auth.loading()) { <p role="status">Verifica accesso…</p> } @else {
<p class="eyebrow" style="margin-top:28px">IL TUO SPAZIO DI ALLENAMENTO</p>
<h1>{{auth.setup() ? 'Attiva il tuo account' : 'Bentornato'}}</h1>
<p class="subtle">{{auth.setup() ? 'Giacomo, imposta la password del tuo account Super Admin.' : 'Accedi con le credenziali del tuo account GymTrack.'}}</p>
@if(auth.error() || error()) {<p class="notice error" role="alert" style="margin-top:20px">{{error() || auth.error()}}</p>}
<form (ngSubmit)="submit()" class="stack" style="margin-top:24px" autocomplete="on">
<label for="login-email">Email<input id="login-email" name="username" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" required maxlength="254" [readOnly]="auth.setup()" [ngModel]="auth.setup()?auth.ownerEmail():email" (ngModelChange)="email=$event" /></label>
<label for="login-password">{{auth.setup()?'Scegli una password':'Password'}}<input id="login-password" name="password" [type]="show()?'text':'password'" [attr.autocomplete]="auth.setup()?'new-password':'current-password'" [(ngModel)]="password" required [minlength]="auth.setup()?8:1" maxlength="128" /></label>
<label class="password-toggle"><input type="checkbox" name="show" [ngModel]="show()" (ngModelChange)="show.set($event)" /> Mostra password</label>
@if(auth.setup()) {<label>Conferma password<input name="confirm-password" type="password" autocomplete="new-password" [(ngModel)]="confirm" required minlength="8" maxlength="128" /></label>}
<button class="primary" [disabled]="busy()">{{busy()?'Attendi…':auth.setup()?'Attiva Super Admin':'Accedi'}}</button>
</form>
<p class="subtle" style="margin-top:22px">Su iPhone puoi salvare la password nell’app Password e compilarla con Face ID. Accetta la proposta di Safari dopo l’accesso.</p>
@if(!auth.setup()) {<p class="subtle" style="margin-top:12px">Per un nuovo account o una password dimenticata contatta il Super Admin.</p>}
<p class="subtle" style="margin-top:12px">L’accesso al sito resta protetto anche da ChatGPT.</p>
}
</section></main>}
`})
export class AppComponent {
 auth=inject(AuthService);email='';password='';confirm='';busy=signal(false);error=signal('');show=signal(false);
 async submit() {
  if(this.busy()) return;this.error.set('');
  if(this.auth.setup()&&this.password!==this.confirm) {this.error.set('Le password non coincidono.');return;}
  this.busy.set(true);
  try {await this.auth.login(this.auth.setup()?this.auth.ownerEmail():this.email,this.password,this.auth.setup());this.password='';this.confirm='';}
  catch(e) {this.error.set(e instanceof Error?e.message:'Accesso non riuscito.');}
  finally {this.busy.set(false);}
 }
}
