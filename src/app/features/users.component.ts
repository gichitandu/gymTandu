import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, Account } from '../services/auth';
@Component({standalone:true,imports:[FormsModule],template:`
<div class="page-heading"><div><p class="eyebrow">AMMINISTRAZIONE</p><h1>Gestione utenti</h1><p class="subtle">Accesso riservato al Super Admin.</p></div></div>
@if(auth.user()?.role==='SuperAdmin') {
@if(error()) {<p class="notice error" role="alert">{{error()}}</p>}
@if(message()) {<p class="notice success" role="status">{{message()}}</p>}
<div class="split"><section class="card"><h2>{{editing?'Modifica account':'Nuovo account'}}</h2>
<form (ngSubmit)="save()" class="stack" style="margin-top:20px" autocomplete="off">
<label>Nome<input name="name" [(ngModel)]="name" required maxlength="80" /></label>
<label>Email<input name="email" type="email" [(ngModel)]="email" required maxlength="254" autocapitalize="none" /></label>
<label>Ruolo<select name="role" [(ngModel)]="role"><option value="User">Cliente</option><option value="Admin">Admin</option></select></label>
<label>{{editing?'Nuova password (facoltativa)':'Password iniziale'}}<input name="new-password" type="password" autocomplete="new-password" [(ngModel)]="password" [required]="!editing" minlength="8" maxlength="128" /></label>
<p class="subtle">Almeno 8 caratteri, senza obbligo di caratteri speciali. Comunica le credenziali alla persona in modo riservato; potrà cambiare la password dal profilo.</p>
@if(editing) {<label class="password-toggle"><input type="checkbox" name="active" [(ngModel)]="active" /> Account attivo</label>}
<div class="actions"><button class="primary" [disabled]="busy()">{{busy()?'Salvataggio…':editing?'Salva modifiche':'Crea account'}}</button>@if(editing) {<button type="button" (click)="reset()">Annulla</button>}</div>
</form></section>
<section class="card"><div class="card-head"><h2>Account registrati</h2><button (click)="load()" [disabled]="busy()">Aggiorna</button></div>
@if(loading()) {<p role="status">Caricamento…</p>}
<div class="list">@for(u of users();track u.id) {<article class="user-row"><div><h3>{{u.name}}</h3><p class="subtle">{{u.email}}</p><span class="pill">{{u.role==='User'?'Cliente':u.role==='SuperAdmin'?'Super Admin':'Admin'}}</span> <span class="pill" [class.green]="u.active">{{u.active?'Attivo':'Disattivato'}}</span></div>
@if(!u.owner) {<button (click)="edit(u)" [disabled]="busy()">Modifica</button>} @else {<small class="muted">Proprietario · protetto</small>}</article>}</div>
<p class="notice" style="margin-top:20px">Il sito mantiene l’accesso privato attuale. Creare un account GymTrack non concede automaticamente l’accesso al sito: gli utenti devono essere autorizzati anche nella condivisione di Sites.</p>
</section></div>
} @else {<p class="notice error" role="alert">Non hai il permesso di accedere a questa sezione.</p>}
`})
export class UsersComponent {
 auth=inject(AuthService);users=signal<Account[]>([]);error=signal('');message=signal('');busy=signal(false);loading=signal(false);
 editing='';name='';email='';role='User';password='';active=true;
 constructor(){if(this.auth.user()?.role==='SuperAdmin') void this.load();}
 async load(){this.loading.set(true);this.error.set('');try{this.users.set((await this.auth.request('users')).users);}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}}
 reset(){this.editing='';this.name='';this.email='';this.role='User';this.password='';this.active=true;}
 edit(u:Account){this.editing=u.id;this.name=u.name;this.email=u.email;this.role=u.role;this.active=u.active;this.password='';this.message.set('');window.scrollTo({top:0,behavior:'smooth'});}
 async save(){if(this.busy())return;this.busy.set(true);this.error.set('');this.message.set('');try{await this.auth.request('users'+(this.editing?'/'+this.editing:''),{name:this.name,email:this.email,role:this.role,password:this.password,active:this.active},this.editing?'PATCH':'POST');this.reset();await this.load();this.message.set('Account salvato.');}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}}
}
