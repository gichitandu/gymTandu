import { SectionHeadingComponent } from "../shared/section-heading.component";
import { Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon.component';
import { FormsModule } from '@angular/forms';
import { AuthService, Account } from '../services/auth';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
@Component({standalone:true,imports:[FormsModule,SectionHeadingComponent,IconComponent],styleUrls:["./account-polish.css","./users-v3.css"],template:`
<gt-section-heading index="09" eyebrow="GESTIONE UTENTI / SUPER ADMIN" title="Persone. Potenziale." description="Gestisci gli account e assegna a ciascuno il proprio spazio."/>
@if(canManage()) {
<section class="us3-summary"><span class="us3-ic" aria-hidden="true"><gt-icon name="user"/></span><div><strong>{{users().length}} <small>account</small></strong><p>{{roleCount('SuperAdmin')}} Super Admin · {{roleCount('Admin')}} Admin · {{roleCount('User')}} clienti</p></div><button type="button" class="primary us3-new" (click)="openNew()"><gt-icon name="plus"/>Nuovo</button></section>
<label class="us3-search"><gt-icon name="search"/><input type="search" name="user-search" aria-label="Cerca un account" placeholder="Cerca per nome, utente o email" [ngModel]="query()" (ngModelChange)="query.set($event)" autocomplete="off"/></label>
<div class="us3-filters" role="group" aria-label="Filtra gli account">@for(option of filters;track option.value){<button type="button" [class.active]="roleFilter()===option.value" [attr.aria-pressed]="roleFilter()===option.value" (click)="roleFilter.set(option.value)">{{option.label}}</button>}<button type="button" class="us3-refresh" (click)="load()" [disabled]="busy()" aria-label="Aggiorna l’elenco"><gt-icon name="repeat"/></button></div>
@if(loading()) {<p role="status" class="subtle">Caricamento…</p>}
<div class="us3-list">@for(u of visibleUsers();track u.id) {<article class="us3-row"><div class="us3-monogram" [attr.data-tone]="$index%4" aria-hidden="true">{{u.name.slice(0,1).toUpperCase()}}</div><div class="us3-identity"><h3>{{u.name}}</h3><p>{{u.username?"@"+u.username:"Nome utente non ancora scelto"}} · {{u.email}}</p><div class="us3-pills"><span class="us3-pill" [attr.data-role]="u.role">{{u.role==='User'?'Cliente':u.role==='SuperAdmin'?'Super Admin':'Admin'}}</span><span class="us3-pill" [class.on]="u.active" [class.off]="!u.active">{{u.active?'Attivo':'Disattivato'}}</span></div></div>
@if(!u.owner) {<button type="button" class="us3-edit" (click)="edit(u)" [disabled]="busy()" [attr.aria-label]="'Modifica '+u.name"><gt-icon name="edit"/></button>} @else {<span class="us3-lock" title="Proprietario · protetto" aria-label="Proprietario, account protetto"><gt-icon name="lock"/></span>}</article>}@empty{@if(!loading()){<p class="subtle us3-empty">Nessun account con questi filtri.</p>}}</div>
<p class="us3-note">Il sito mantiene l’accesso privato attuale. Creare un account GymTrack non concede automaticamente l’accesso al sito: gli utenti devono essere autorizzati anche nella condivisione di Sites.</p>
@if(formOpen()){<div class="us3-scrim" (click)="closeForm()" aria-hidden="true"></div><section class="us3-sheet" role="dialog" aria-modal="true" aria-labelledby="us3-title"><div class="us3-handle" aria-hidden="true"></div><div class="us3-sheet-head"><h2 id="us3-title">{{editing?'Modifica account':'Nuovo account'}}</h2><button type="button" class="us3-close" (click)="closeForm()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
<form (ngSubmit)="save()" class="stack us3-form" autocomplete="off">
<label>Nome<input name="name" [(ngModel)]="name" required maxlength="80" /></label>
<label>Nome utente univoco<input name="username" [(ngModel)]="username" required minlength="3" maxlength="30" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" /></label>
<label>Email<input name="email" type="email" [(ngModel)]="email" required maxlength="254" autocapitalize="none" /></label>
<label>Ruolo<select name="role" [(ngModel)]="role"><option value="User">Cliente</option><option value="Admin">Admin</option></select></label>
<label>{{editing?'Nuova password (facoltativa)':'Password iniziale'}}<input name="new-password" type="password" autocomplete="new-password" [(ngModel)]="password" [required]="!editing" minlength="8" maxlength="128" /></label>
<p class="subtle">Almeno 8 caratteri, senza obbligo di caratteri speciali. Comunica le credenziali alla persona in modo riservato; potrà cambiare la password dal profilo.</p>
@if(editing) {<label class="password-toggle"><input type="checkbox" name="active" [(ngModel)]="active" /> Account attivo</label>}
<div class="actions"><button class="primary" [disabled]="busy()">{{busy()?'Salvataggio…':editing?'Salva modifiche':'Crea account'}}</button><button type="button" (click)="closeForm()">Annulla</button></div>
</form>
</section>}
} @else {<p class="notice error" role="alert">Non hai il permesso di accedere a questa sezione.</p>}
`})
export class UsersComponent {
 private feedback=feedbackForContext();
 auth=inject(AuthService);users=signal<Account[]>([]);error=feedbackSignal('error',this.feedback);message=feedbackSignal('success',this.feedback);busy=signal(false);loading=signal(false);
 editing='';name='';username='';email='';role='User';password='';active=true;
 /* Utenti v3: stato solo di interfaccia (pannello, ricerca, filtro). */
 formOpen=signal(false);query=signal('');roleFilter=signal<'all'|'User'|'Admin'|'inactive'>('all');
 filters:{value:'all'|'User'|'Admin'|'inactive';label:string}[]=[{value:'all',label:'Tutti'},{value:'User',label:'Clienti'},{value:'Admin',label:'Admin'},{value:'inactive',label:'Disattivati'}];
 visibleUsers=computed(()=>{const q=this.query().trim().toLowerCase(),f=this.roleFilter();return this.users().filter(u=>(f==='all'||(f==='inactive'?!u.active:f==='Admin'?u.role!=='User':u.role===f))&&(!q||[u.name,u.username||'',u.email].some(v=>v.toLowerCase().includes(q))));});
 roleCount(role:string){return this.users().filter(u=>u.role===role).length;}
 openNew(){this.reset();this.formOpen.set(true);}
 closeForm(){this.reset();this.formOpen.set(false);}
 canManage(){return this.auth.user()?.role==='SuperAdmin'&&!this.auth.viewAsClient?.()&&!this.auth.offlineMode();}
 constructor(){if(this.canManage()) void this.load();}
 async load(){if(!this.canManage())return;this.loading.set(true);this.error.set('');try{this.users.set((await this.auth.request('users')).users);}catch(e){this.error.set((e as Error).message);}finally{this.loading.set(false);}}
 reset(){this.editing='';this.name='';this.username='';this.email='';this.role='User';this.password='';this.active=true;}
 edit(u:Account){if(!this.canManage())return;this.editing=u.id;this.name=u.name;this.username=u.username||"";this.email=u.email;this.role=u.role;this.active=u.active;this.password='';this.message.set('');this.formOpen.set(true);}
 async save(){if(this.busy()||!this.canManage())return;this.busy.set(true);this.error.set('');this.message.set('');try{await this.auth.request('users'+(this.editing?'/'+this.editing:''),{name:this.name,username:this.username,email:this.email,role:this.role,password:this.password,active:this.active},this.editing?'PATCH':'POST');this.reset();this.formOpen.set(false);await this.load();this.message.set('Account salvato.');}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}}
}
