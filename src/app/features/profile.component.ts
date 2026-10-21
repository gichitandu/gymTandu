import { ActivatedRoute } from "@angular/router";
import { AvatarComponent } from "../shared/avatar.component";
import { compressPhoto } from "../services/images";
import { IosStatusComponent } from "../shared/ios-status.component";
import { ThemeService, DEFAULT_BACKGROUND } from "../services/theme";
import { AuthService } from "../services/auth";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, effect, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { Store } from "../services/store";
import { exportBackup, importBackup } from "../services/backup";
import { DataSet, localDate, uid } from "../models/domain";
import { StatusComponent } from "../shared/status.component";
import { IconComponent } from "../shared/icon.component";
import { PwaService } from "../services/pwa";
@Component({
  standalone: true,
  imports: [
    A11yModule,
    AvatarComponent,
    IosStatusComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    MatSlideToggleModule,
    StatusComponent,
    IconComponent,
  ],
  template: `<div class="page-heading compact-heading">@if(panel()!=='overview'){<button class="icon-btn ghost" aria-label="Torna al profilo" (click)="panel.set('overview')">‹</button>}<div><h1>{{panelLabel()}}</h1></div>@if(panel()==='overview'){<button class="ghost" (click)="panel.set('settings')">Modifica</button>}</div><gt-status/>
@if(panel()==='overview'){
<section class="card profile-dashboard"><div class="profile-head"><div class="profile-avatar"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name"/></div><div><h2>{{s.profile().name}}</h2><span class="pill">{{auth.user()?.role==='SuperAdmin'?'Super Admin':auth.user()?.role==='Admin'?'Admin':'Personale'}}</span>@if(auth.user()?.username){<p class="subtle">@{{auth.user()?.username}}</p>}</div></div><div class="profile-key-stats"><div><strong>{{s.profile().bodyWeight!==undefined?s.formatWeight(s.profile().bodyWeight!):'—'}} <small>{{s.settings().unit}}</small></strong><span>Peso</span></div><div><strong>{{s.profile().height??'—'}} <small>cm</small></strong><span>Altezza</span></div><div><strong>{{age()??'—'}}</strong><span>Età</span></div></div></section>
<nav class="profile-menu" aria-label="Sezioni del profilo"><button (click)="panel.set('goals')"><gt-icon name="trophy"/><span>Obiettivi</span>›</button><button (click)="panel.set('measurements')"><gt-icon name="activity"/><span>Misurazioni corporee</span>›</button><button (click)="panel.set('settings')"><gt-icon name="settings"/><span>Impostazioni</span>›</button><button (click)="panel.set('backup')"><gt-icon name="download"/><span>Backup e ripristino</span>›</button><a routerLink="/catalogo"><gt-icon name="weight"/><span>{{s.canEditCatalog()?'Gestione esercizi':'Catalogo esercizi'}}</span>›</a><button (click)="panel.set('theme')"><gt-icon name="palette"/><span>Tema e personalizzazione</span>›</button><a routerLink="/calendario"><gt-icon name="calendar"/><span>Calendario allenamenti</span>›</a><button (click)="panel.set('security')"><gt-icon name="shield"/><span>Account e sicurezza</span>›</button>@if(auth.user()?.role==='SuperAdmin'){<a routerLink="/utenti"><gt-icon name="user"/><span>Gestione utenti</span>›</a>}<button (click)="panel.set('info')"><gt-icon name="info"/><span>Informazioni app e iPhone</span>›</button></nav>
}
@if(panel()==='goals'){<section class="card"><h2>I tuoi obiettivi</h2><p class="subtle" style="margin:12px 0 20px">Inserisci i tuoi riferimenti personali. Non vengono calcolati da una fotografia e non sono prescrizioni automatiche.</p><form [formGroup]="goalsForm" (ngSubmit)="saveGoals()" class="form-grid"><label>Calorie giornaliere (kcal)<input type="number" inputmode="numeric" formControlName="calories" min="1" max="20000"/></label><label>Proteine giornaliere (g)<input type="number" inputmode="decimal" formControlName="protein" min="1" max="2000"/></label><label>Carboidrati giornalieri (g)<input type="number" inputmode="decimal" formControlName="carbs" min="1" max="3000"/></label><label>Grassi giornalieri (g)<input type="number" inputmode="decimal" formControlName="fat" min="1" max="2000"/></label><label class="wide">Allenamenti per settimana<input type="number" inputmode="numeric" formControlName="workoutsPerWeek" min="1" max="14"/></label><button class="primary wide" [disabled]="goalsForm.invalid||s.busy()||!s.ready()">Salva obiettivi</button></form><p class="subtle" style="margin-top:14px">Lascia vuoto un campo per rimuovere quel riferimento.</p></section>}
@if(panel()==='measurements'){<section class="card"><h2>Registra misurazione</h2><form #measurementForm="ngForm" (ngSubmit)="saveMeasurement()" class="form-grid" style="margin-top:18px"><label>Data<input name="date" type="date" [(ngModel)]="measurementDate" required [max]="today"/></label><label>Peso ({{s.settings().unit}})<input name="weight" type="number" inputmode="decimal" [(ngModel)]="measurementWeight" min="1" max="1500" step="0.1" required/></label><label>Girovita (cm, facoltativo)<input name="waist" type="number" inputmode="decimal" [(ngModel)]="measurementWaist" min="1" max="300" step="0.1"/></label><label>Massa grassa (%, facoltativa)<input name="bodyfat" type="number" inputmode="decimal" [(ngModel)]="measurementBodyFat" min="1" max="80" step="0.1"/></label><button class="primary wide" [disabled]="measurementForm.invalid||s.busy()">Salva misurazione</button></form></section><section class="card" style="margin-top:18px"><h2>Storico misurazioni</h2><div class="list" style="margin-top:18px">@for(m of measurementHistory();track m.id){<div class="measurement-row"><div><strong>{{s.formatWeight(m.weight)}} {{s.settings().unit}}</strong><p class="subtle">{{m.date}}{{m.waist?' · Vita '+m.waist+' cm':''}}{{m.bodyFat?' · Massa grassa '+m.bodyFat+'%':''}}</p></div><button class="ghost danger" (click)="removeMeasurement(m.id)" aria-label="Rimuovi misurazione">×</button></div>}@empty{<p class="subtle">Nessuna misurazione registrata.</p>}</div></section>}
@if(panel()==='settings'||panel()==='theme'||panel()==='info'){
    <div class="profile-settings-panels">
      <section class="card" [hidden]="panel()!=='settings'">
        <div class="profile-head">
          <div class="profile-avatar">
            <gt-avatar [photo]="photoDraft()===undefined?s.profile().photo:(photoDraft()||undefined)" [name]="s.profile().name" />
          </div>
          <div>
            <h2>{{ s.profile().name }}</h2>
            <span class="pill">{{ auth.user()?.role === "User" ? "Cliente" : auth.user()?.role }}</span>
          </div>
        </div>
        <div class="actions profile-photo-actions"><button type="button" (click)="profileCamera.click()" [disabled]="photoBusy()">Scatta foto profilo</button><button type="button" (click)="profileGallery.click()" [disabled]="photoBusy()">Scegli da Foto</button><button type="button" class="ghost" (click)="photoDraft.set(null)" [disabled]="photoBusy()">Rimuovi foto</button></div>
        <input #profileCamera type="file" accept="image/*" capture="environment" hidden (change)="selectPhoto($event)"/><input #profileGallery type="file" accept="image/*" hidden (change)="selectPhoto($event)"/>
        <p class="subtle" style="margin:12px 0 22px" role="status">{{photoBusy()?'Compressione della foto…':'La foto resta nel tuo archivio locale e nel backup JSON. Premi Salva profilo per confermare.'}}</p>
        <form [formGroup]="form" (ngSubmit)="save()">
          <div class="form-grid">
            <label class="wide"
              >Nome<input formControlName="name" maxlength="80" /></label
            ><label
              >Peso corporeo ({{ s.settings().unit }}, opzionale)<input
                type="number"
                min="1"
                max="1500"
                step="0.1"
                formControlName="bodyWeight" /></label
            ><label
              >Altezza (cm, opzionale)<input
                type="number"
                min="1"
                max="300"
                formControlName="height" /></label
            ><label class="wide"
              >Data di nascita (opzionale)<input
                type="date"
                formControlName="birthDate"
                [max]="today" /></label
            ><label class="wide"
              >Il tuo obiettivo<textarea
                formControlName="goal"
                maxlength="1000"
                placeholder="Es. diventare più forte, un allenamento alla volta"
              ></textarea>
            </label>
          </div>
          <div class="actions">
            <button
              class="primary"
              [disabled]="form.invalid || !s.ready() || s.busy() || photoBusy()"
            >
              Salva profilo
            </button>
          </div>
        </form>
      </section>
      <div class="stack">
        <section class="card" [hidden]="panel()==='info'">
          <h2>Aspetto e preferenze</h2>
          <div class="theme-picker"><h3>Colore dello sfondo</h3><p class="subtle">Scegli qualsiasi colore: viene salvato solo sul tuo account.</p>
          <div class="theme-swatches">@for(color of theme.presets;track color){<button type="button" class="swatch" [style.background]="color" [class.chosen]="theme.color()===color" [attr.aria-label]="'Sfondo '+color" [attr.aria-pressed]="theme.color()===color" [disabled]="theme.busy()" (click)="theme.save(color)">@if(theme.color()===color){<span>✓</span>}</button>}</div>
          <div class="color-custom"><label>Colore personalizzato<input type="color" [value]="theme.color()" (change)="theme.save($any($event.target).value)" [disabled]="theme.busy()" /></label><label>Codice HEX<input #backgroundHex type="text" [value]="theme.color()" maxlength="7" pattern="#[0-9a-fA-F]{6}" aria-label="Codice colore esadecimale" /></label><button [disabled]="theme.busy()" (click)="theme.save(backgroundHex.value)">Applica</button></div>
          <div class="actions"><button class="ghost" [disabled]="theme.busy()" (click)="theme.save(defaultBackground)">Ripristina sfondo originale</button><span class="subtle" role="status">{{theme.busy()?'Salvataggio…':theme.status()}}</span></div>
          @if(theme.error()){<p class="notice error" role="alert">{{theme.error()}}</p>}
          </div>
          <div class="setting-row" style="margin-top:20px">
            <div>
              <b>Tema scuro</b>
              <p>Il tuo allenamento, senza distrazioni.</p>
            </div>
            <mat-slide-toggle
              aria-label="Tema scuro"
              [checked]="!theme.isLight()"
              (change)="setting('theme', $event.checked ? 'dark' : 'light')"
            />
          </div>
          <div class="setting-row">
            <div>
              <b>Unità di peso</b>
              <p>I dati restano in kg; la vista viene convertita.</p>
            </div>
            <select
              aria-label="Unità di peso"
              [ngModel]="s.settings().unit"
              (ngModelChange)="setting('unit', $event)"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </div>
          <div class="setting-row">
            <div>
              <b>Precompila dall’ultima sessione</b>
              <p>Serie da confermare, mai completate in automatico.</p>
            </div>
            <mat-slide-toggle
              aria-label="Precompila valori precedenti"
              [checked]="s.settings().prefill"
              (change)="setting('prefill', $event.checked)"
            />
          </div>
          <div class="setting-row">
            <div>
              <b>Catalogo esercizi</b>
              <p>Esercizi, immagini e gruppi muscolari.</p>
            </div>
            <a class="button ghost" routerLink="/catalogo"
              >{{s.canEditCatalog()?"Gestisci":"Esplora"}} <gt-icon name="arrow"
            /></a>
          </div>
        </section>
        <section class="card" [hidden]="panel()!=='info'">
          <h2>Porta GymTrack con te</h2>
          <p class="subtle" style="margin:13px 0">
            Dopo il primo caricamento completo via HTTPS, l’app conserva le
            risorse dell’interfaccia. La verifica dell’account al caricamento richiede una connessione.
          </p>
          @if (pwa.installed()) {
            <span class="pill green">App installata</span>
          } @else if (pwa.event()) {
            <button class="primary" (click)="pwa.install()">
              Installa GymTrack
            </button>
          } @else {
            <p class="subtle">
              Dal menu del browser scegli “Installa app” o “Aggiungi a schermata
              Home”. Su iPhone usa Safari → Condividi → Aggiungi alla schermata
              Home.
            </p>
          }
          <div class="actions">
            <button class="ghost" (click)="persist()">
              Richiedi archiviazione persistente
            </button>
          </div>
        </section>
      </div>
    </div>
    }
    @if(panel()==='backup'){<section class="card" style="margin-top:20px">
      <div class="card-head">
        <div>
          <h2>Backup e ripristino</h2>
          <p>Non lasciare al caso i tuoi progressi.</p>
        </div>
        <gt-icon name="download" />
      </div>
      <div class="notice">
        I dati esistono solo in questo browser e su questo dispositivo.
        Cancellare i dati del sito o usare la navigazione privata può
        eliminarli. Esporta periodicamente un backup e conservalo in un luogo
        sicuro.
      </div>
      <p class="subtle">
        Il backup include profilo, piani, catalogo, immagini, allenamenti, serie,
        impostazioni e alimentazione con foto. L’importazione sostituisce l’intero archivio in un’unica
        transazione.
      </p>
      <div class="actions">
        <button
          class="primary"
          (click)="export()"
          [disabled]="working() || !s.ready()"
        >
          <gt-icon name="download" /> Esporta backup</button
        ><button
          (click)="backupInput.click()"
          [disabled]="working() || !s.ready()"
        >
          Importa backup</button>@if(backupFile()){<button (click)="shareBackup()">Condividi JSON → Salva su File</button>}<input
          #backupInput
          type="file"
          accept="application/json,.json"
          hidden
          (change)="prepareImport($event)"
        />
      </div>
      <p class="subtle" style="margin-top:12px">
        {{
          working()
            ? "Elaborazione…"
            : s.settings().lastBackup
              ? "Ultimo backup: " + backupDate()
              : "Non hai ancora esportato un backup."
        }}
      </p>
    </section>
    }
    @if(panel()==='security'){<section class="card" style="margin-top:20px">
      <h2>Account e sicurezza</h2>
      @if(!auth.offlineMode()){<form (ngSubmit)="saveUsername()" class="stack" style="margin-top:20px"><label>Nome utente per il login<input name="account-username" autocomplete="username" autocapitalize="none" spellcheck="false" [ngModel]="usernameDraft()===null?(auth.user()?.username||''):usernameDraft()" (ngModelChange)="usernameDraft.set($event)" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" /></label><p class="subtle">3–30 caratteri: lettere, numeri, punto, trattino o underscore. Deve essere univoco: maiuscole e minuscole sono equivalenti. Il nome visualizzato nel profilo può essere diverso.</p><button class="primary" [disabled]="usernameBusy()">{{usernameBusy()?'Salvataggio…':'Salva nome utente'}}</button></form>}<p class="subtle" style="margin-top:12px">{{auth.user()?.email}}</p>
      @if(accountError()) {<p class="notice error" role="alert">{{accountError()}}</p>}
      @if(accountMessage()) {<p class="notice success" role="status">{{accountMessage()}}</p>}
      @if(auth.user()?.role === 'SuperAdmin') {<div class="actions"><a class="button primary" routerLink="/utenti">Gestione utenti</a></div>}
      @if(!auth.offlineMode()){<div class="actions"><button (click)="rememberOffline()">Consenti accesso offline su questo iPhone</button></div><p class="subtle">L’archivio sarà accessibile a chi usa questo dispositivo; le funzioni amministrative restano online.</p>
      <form (ngSubmit)="changePassword()" class="form-grid" style="margin-top:24px">
        <input type="text" name="username" [ngModel]="auth.user()?.email" autocomplete="username" hidden />
        <label class="wide">Password attuale<input name="current-password" type="password" autocomplete="current-password" [(ngModel)]="currentPassword" required maxlength="128" /></label>
        <label>Nuova password<input name="new-password" type="password" autocomplete="new-password" [(ngModel)]="newPassword" required minlength="8" maxlength="128" /></label>
        <label>Conferma nuova password<input name="confirm-password" type="password" autocomplete="new-password" [(ngModel)]="confirmPassword" required minlength="8" maxlength="128" /></label>
        <div class="actions wide"><button class="primary" [disabled]="accountBusy()">Aggiorna password</button><button type="button" (click)="logout()">Esci dall’account</button></div>
      </form>} @else {<div class="actions"><button (click)="logout()">Esci dall’archivio locale</button></div>}
      <p class="subtle" style="margin-top:16px">Puoi salvare e compilare le credenziali con l’app Password di iOS. Gli allenamenti rimangono su questo dispositivo, separati per account.</p>
    </section>
    }
    @if(panel()==='info'){<gt-ios-status />}
    @if (pending(); as backup) {
      <div class="modal-backdrop">
        <section
          class="modal"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="!working() && pending.set(undefined)"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-title"
        >
          <h2 id="restore-title">Ripristinare questo backup?</h2>
          <p class="subtle">
            Formato e riferimenti verificati. Contiene
            {{ backup.plans.length }} piani,
            {{ backup.exercises.length }} esercizi e
            {{ backup.workouts.length }} sessioni e {{backup.meals.length}} pasti.
          </p>
          <div class="notice error" style="margin-top:20px">
            Tutti i dati attuali saranno sostituiti. Esporta prima un backup se
            desideri conservarli.
          </div>
          <div class="actions">
            <button class="primary" (click)="restore()" [disabled]="working()">
              Conferma ripristino</button
            ><button (click)="pending.set(undefined)" [disabled]="working()">
              Annulla
            </button>
          </div>
        </section>
      </div>
    }`,
})
export class ProfileComponent {
  photoDraft = signal<Blob|null|undefined>(undefined);
  photoBusy = signal(false);
  usernameDraft = signal<string|null>(null);
  usernameBusy = signal(false);
  async selectPhoto(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;this.photoBusy.set(true);try{this.photoDraft.set(await compressPhoto(file));this.s.error.set('');}catch(e){this.s.error.set((e as Error).message);}finally{this.photoBusy.set(false);}}
  async saveUsername(){if(this.usernameBusy())return;this.accountError.set('');this.accountMessage.set('');this.usernameBusy.set(true);try{await this.auth.setUsername(this.usernameDraft()??this.auth.user()?.username??'');this.usernameDraft.set(null);this.accountMessage.set('Nome utente salvato. Puoi accedere con questo nome oppure con l’email.');}catch(e){this.accountError.set((e as Error).message);}finally{this.usernameBusy.set(false);}}
  theme = inject(ThemeService);
  defaultBackground = DEFAULT_BACKGROUND;
  auth = inject(AuthService);
  s = inject(Store);
  accountError = signal("");
  accountMessage = signal("");
  currentPassword = "";
  newPassword = "";
  confirmPassword = "";
  accountBusy = signal(false);
  async changePassword() {
    this.accountError.set(""); this.accountMessage.set("");
    if (this.newPassword !== this.confirmPassword) { this.accountError.set("Le password non coincidono."); return; }
    this.accountBusy.set(true);
    try { await this.auth.request("auth/password", {currentPassword:this.currentPassword,password:this.newPassword}); this.currentPassword="";this.newPassword="";this.confirmPassword="";this.accountMessage.set("Password aggiornata. Le altre sessioni sono state chiuse."); } catch(e) { this.accountError.set((e as Error).message); } finally {this.accountBusy.set(false);}
  }
  rememberOffline() {try{this.auth.enableOffline();this.accountMessage.set("Archivio abilitato per l’accesso offline su questo dispositivo.");}catch(e){this.accountError.set((e as Error).message);}}
  async logout() { try { await this.auth.logout(); } catch(e) {this.accountError.set((e as Error).message);} }
  pwa = inject(PwaService);
  fb = inject(FormBuilder);
  working = signal(false);
  pending = signal<DataSet | undefined>(undefined);
  backupFile = signal<File | null>(null);
  async shareBackup(){const file=this.backupFile();if(!file)return;try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"Backup GymTrack"});}else{this.s.message.set("Usa il download del backup e spostalo in File dal menu Condividi di Safari.");}}catch(e){if((e as Error).name!=="AbortError")this.s.error.set("Condivisione non disponibile. Usa il download JSON.");}}
  today = localDate();
  form = this.fb.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    bodyWeight: [
      null as number | null,
      [Validators.min(1), Validators.max(1500)],
    ],
    height: [null as number | null, [Validators.min(1), Validators.max(300)]],
    birthDate: [""],
    goal: [""],
  });
  panel=signal('overview');
  panelLabel(){return ({overview:'Profilo',goals:'Obiettivi',measurements:'Misurazioni corporee',settings:'Impostazioni',theme:'Tema e personalizzazione',backup:'Backup e ripristino',security:'Account e sicurezza',info:'Informazioni app'} as Record<string,string>)[this.panel()]||'Profilo';}
  age(){const birth=this.s.profile().birthDate;if(!birth)return null;const d=new Date(birth+'T12:00:00'),now=new Date();return now.getFullYear()-d.getFullYear()-((now.getMonth()<d.getMonth()||now.getMonth()===d.getMonth()&&now.getDate()<d.getDate())?1:0);}
  measurementDate=localDate();measurementWeight:number|null=null;measurementWaist:number|null=null;measurementBodyFat:number|null=null;
  measurementHistory(){return [...this.s.data().measurements].sort((a,b)=>b.date.localeCompare(a.date));}
  goalsForm=this.fb.group({calories:[null as number|null,[Validators.min(1),Validators.max(20000)]],protein:[null as number|null,[Validators.min(1),Validators.max(2000)]],carbs:[null as number|null,[Validators.min(1),Validators.max(3000)]],fat:[null as number|null,[Validators.min(1),Validators.max(2000)]],workoutsPerWeek:[null as number|null,[Validators.min(1),Validators.max(14)]]});
  async saveGoals(){if(this.goalsForm.invalid)return;const value=this.goalsForm.getRawValue();if(value.workoutsPerWeek!==null&&!Number.isInteger(value.workoutsPerWeek)){this.s.error.set('Inserisci un numero intero di allenamenti.');return;}await this.s.change(d=>{d.settings[0].goals=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null));},'Obiettivi salvati.',false);}
  async saveMeasurement(){const weight=this.measurementWeight===null?0:this.s.kg(this.measurementWeight);if(!Number.isFinite(weight)||weight<=0||weight>700||this.measurementDate>this.today){this.s.error.set('Controlla la data e il peso.');return;}await this.s.change(d=>{const old=d.measurements.find(m=>m.date===this.measurementDate);const measurement={id:old?.id||uid(),date:this.measurementDate,weight,waist:this.measurementWaist??undefined,bodyFat:this.measurementBodyFat??undefined};if(old)Object.assign(old,measurement);else d.measurements.push(measurement);const latest=[...d.measurements].sort((a,b)=>b.date.localeCompare(a.date))[0];if(latest)d.profiles[0].bodyWeight=latest.weight;},'Misurazione salvata.',false);}
  async removeMeasurement(id:string){if(confirm('Rimuovere questa misurazione?'))await this.s.change(d=>{d.measurements=d.measurements.filter(m=>m.id!==id);},'Misurazione rimossa.',false);}
  constructor() {
    const section=inject(ActivatedRoute).snapshot.queryParamMap.get('section');if(section&&['backup','goals','settings','measurements','theme','security','info'].includes(section))this.panel.set(section);
    effect(() => {
      if (!this.s.ready()) return;
      const p = this.s.profile();
      const unit = this.s.settings().unit;
      this.goalsForm.reset({calories:this.s.settings().goals?.calories??null,protein:this.s.settings().goals?.protein??null,carbs:this.s.settings().goals?.carbs??null,fat:this.s.settings().goals?.fat??null,workoutsPerWeek:this.s.settings().goals?.workoutsPerWeek??null});
      this.form.reset({
        name: p.name,
        bodyWeight:
          p.bodyWeight === undefined ? null : this.s.weight(p.bodyWeight),
        height: p.height ?? null,
        birthDate: p.birthDate || "",
        goal: p.goal || "",
      });
    });
  }
  async save() {
    if (this.form.invalid || this.photoBusy()) return;
    const v = this.form.getRawValue();
    if (v.birthDate && v.birthDate > this.today) {
      this.s.error.set("La data di nascita non può essere futura.");
      return;
    }
    const bw = v.bodyWeight === null ? undefined : this.s.kg(v.bodyWeight!);
    if (bw !== undefined && bw > 700) {
      this.s.error.set("Peso corporeo fuori intervallo.");
      return;
    }
    const saved = await this.s.change((d) => {
      if(bw!==undefined&&bw!==d.profiles[0].bodyWeight){const old=d.measurements.find(m=>m.date===this.today);if(old)old.weight=bw;else d.measurements.push({id:uid(),date:this.today,weight:bw});}
      Object.assign(d.profiles[0], {
        name: v.name!.trim(),
        photo: this.photoDraft()===undefined?d.profiles[0].photo:(this.photoDraft()||undefined),
        bodyWeight: bw,
        height: v.height ?? undefined,
        birthDate: v.birthDate || undefined,
        goal: v.goal?.trim() || "",
      });
    }, "Profilo salvato.");
    if(saved)this.photoDraft.set(undefined);
  }
  setting(key: "theme" | "unit" | "prefill", value: string | boolean) {
    if(key === "theme") void this.theme.save(value === "light" ? "#edf3fa" : this.defaultBackground);
    void this.s.change((d) => {
      if (key === "theme") d.settings[0].theme = value as "dark" | "light";
      if (key === "unit") d.settings[0].unit = value as "kg" | "lb";
      if (key === "prefill") d.settings[0].prefill = !!value;
    });
  }
  backupDate() {
    return new Date(this.s.settings().lastBackup!).toLocaleString("it-IT");
  }
  async export() {
    this.working.set(true);
    try {
      const d = structuredClone(this.s.data());
      d.settings[0].lastBackup = new Date().toISOString();
      d.settings[0].backgroundColor=this.theme.color();
      const text = await exportBackup(d);
      this.backupFile.set(new File([text],"gymtrack-backup-"+this.today+".json",{type:"application/json"}));
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "gymtrack-backup-" + this.today + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      await this.s.change((current) => {
        current.settings[0].lastBackup = d.settings[0].lastBackup;
      }, "Backup generato: verifica che il download sia stato salvato.");
    } catch (e) {
      this.s.error.set(
        e instanceof Error ? e.message : "Esportazione non riuscita.",
      );
    } finally {
      this.working.set(false);
    }
  }
  async prepareImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.s.error.set("Il backup supera il limite di 50 MB.");
      return;
    }
    this.working.set(true);
    try {
      this.pending.set(await importBackup(await file.text()));
    } catch (e) {
      this.s.error.set(
        e instanceof Error ? e.message : "Importazione non riuscita.",
      );
    } finally {
      this.working.set(false);
    }
  }
  async restore() {
    const d = this.pending();
    if (!d) return;
    this.working.set(true);
    try {
      if (
        await this.s.change(
          (current) => {
            Object.assign(current, d);
          },
          "Backup ripristinato.",
          false,
        )
      ) {
        if(d.settings[0].backgroundColor)await this.theme.save(d.settings[0].backgroundColor);
        this.pending.set(undefined);
      }
    } finally {
      this.working.set(false);
    }
  }
  async persist() {
    try {
      const ok = await navigator.storage?.persist?.();
      this.s.message.set(
        ok
          ? "Archiviazione persistente concessa. Continua comunque a esportare backup."
          : "Il browser non ha concesso l’archiviazione persistente. Il backup resta indispensabile.",
      );
    } catch {
      this.s.error.set(
        "Archiviazione persistente non disponibile in questo browser.",
      );
    }
  }
}
