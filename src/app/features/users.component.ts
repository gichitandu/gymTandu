import { SectionHeadingComponent } from "../shared/section-heading.component";
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, Account } from '../services/auth';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
@Component({standalone:true,imports:[FormsModule,SectionHeadingComponent],styleUrl:"./account-polish.css",template:`
<gt-section-heading index="09" eyebrow="GESTIONE UTENTI / SUPER ADMIN" title="Persone. Potenziale." description="Gestisci gli account e assegna a ciascuno il proprio spazio."/>
@if(auth.user()?.role==='SuperAdmin') {
<div class="account-admin-signal"><span class="eyebrow">GESTIONE ACCESSI</span><strong>{{users().length}} <small>account registrati</small></strong><p>Clienti e amministratori, con privilegi distinti.</p></div><div class="split users-panels"><section class="card"><span class="account-panel-index">01 / ACCOUNT</span><h2>{{editing?'Modifica account':'Nuovo account'}}</h2>
<form (ngSubmit)="save()" class="stack" style="margin-top:20px" autocomplete="off">
<label>Nome<input name="name" [(ngModel)]="name" required maxlength="80" /></label>
<label>Nome utente univoco<input name="username" [(ngModel)]="username" required minlength="3" maxlength="30" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" /></label>
<label>Email<input name="email" type="email" [(ngModel)]="email" required maxlength="254" autocapitalize="none" /></label>
<label>Ruolo<select name="role" [(ngModel)]="role"><option value="User">Cliente</option><option value="Admin">Admin</option></select></label>
<label>{{editing?'Nuova password (facoltativa)':'Password iniziale'}}<input name="new-password" type="password" autocomplete="new-password" [(ngModel)]="password" [required]="!editing" minlength="8" maxlength="128" /></label>
<p class="subtle">Almeno 8 caratteri, senza obbligo di caratteri speciali. Comunica le credenziali alla persona in modo riservato; potrà cambiare la password dal profilo.</p>
@if(editing) {<label class="password-toggle"><input type="checkbox" name="active" [(ngModel)]="active" /> Account attivo</label>}
<div class="actions"><button class="primary" [disabled]="busy()">{{busy()?'Salvataggio…':editing?'Salva modifiche':'Crea account'}}</button>@if(editing) {<button type="button" (click)="reset()">Annulla</button>}</div>
</form></section>
<section class="card"><span class="account-panel-index">02 / PERSONE</span><div class="card-head"><h2>Account registrati</h2><button (click)="load()" [disabled]="busy()">Aggiorna</button></div>
@if(loading()) {<p role="status">Caricamento…</p>}
<div class="list">@for(u of users();track u.id) {<article class="user-row"><div class="user-monogram" aria-hidden="true">{{u.name.slice(0,1).toUpperCase()}}</div><div class="user-identity"><h3>{{u.name}}</h3><p class="subtle">{{u.username?"@"+u.username:"Nome utente non ancora scelto"}}</p><p class="subtle">{{u.email}}</p><span class="pill">{{u.role==='User'?'Cliente':u.role==='SuperAdmin'?'Super Admin':'Admin'}}</span> <span class="pill" [class.green]="u.active">{{u.active?'Attivo':'Disattivato'}}</span></div>
@if(!u.owner) {<button (click)="edit(u)" [disabled]="busy()">Modifica</button>} @else {<small class="muted">Proprietario · protetto</small>}</article>}</div>
<p class="notice" style="margin-top:20px">Il sito mantiene l’accesso privato attuale. Creare un account GymTrack non concede automaticamente l’accesso al sito: gli utenti devono essere autorizzati anche nella condivisione di Sites.</p>
</section></div>
} @else {<p class="notice error" role="alert">Non hai il permesso di accedere a questa sezione.</p>}
`})
export class UsersComponent {
 private feedback=feedbackForContext();
 auth=inject(AuthService);users=signal<Account[]>([]);error=feedbackSignal('error',this.feedback);message=feedbackSignal('success',this.feedback);busy=signal(false);loading=signal(false);
 editing='';name='';username='';email='';role='User';password='';active=true;
 constructor(){if(this.auth.user()?.role==='SuperAdmin') void this.load();}
 async load(){this.loading.set(true);this.error.set('');try{this.users.set((await this.auth.request('users')).users);}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}}
 reset(){this.editing='';this.name='';this.username='';this.email='';this.role='User';this.password='';this.active=true;}
 edit(u:Account){this.editing=u.id;this.name=u.name;this.username=u.username||"";this.email=u.email;this.role=u.role;this.active=u.active;this.password='';this.message.set('');window.scrollTo({top:0,behavior:'smooth'});}
 async save(){if(this.busy())return;this.busy.set(true);this.error.set('');this.message.set('');try{await this.auth.request('users'+(this.editing?'/'+this.editing:''),{name:this.name,username:this.username,email:this.email,role:this.role,password:this.password,active:this.active},this.editing?'PATCH':'POST');this.reset();await this.load();this.message.set('Account salvato.');}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}}
}
