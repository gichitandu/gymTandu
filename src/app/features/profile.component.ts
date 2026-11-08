import { DESIGN_DIRECTIVES } from '../design/design-directives';
import {DesignRuntime} from '../design/design-runtime';
import {ThemePickerComponent} from '../shared/theme-picker.component';
import {InstallHelpComponent} from '../shared/install-help.component';
import {AppFeaturesService} from '../services/app-features';
import {AppFeaturesComponent} from '../shared/app-features.component';
import {StorageStatusComponent} from '../shared/storage-status.component';
import {PushReminderComponent} from '../shared/push-reminder.component';
import {CalendarSubscriptionComponent} from '../shared/calendar-subscription.component';
import { DateFieldComponent } from '../shared/date-field.component';
import { confirmationForContext } from '../services/confirmation';
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {BackupReminderComponent} from "../shared/backup-reminder.component";
import {WorkoutResumeService} from "../services/workout-resume";
import { ActivatedRoute } from "@angular/router";
import { AvatarComponent } from "../shared/avatar.component";
import { compressPhoto } from "../services/images";
import { IosStatusComponent } from "../shared/ios-status.component";
import { ThemeService, DEFAULT_BACKGROUND } from "../services/theme";
import { feedbackForContext, feedbackSignal } from "../services/feedback";
import { AuthService } from "../services/auth";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, effect, HostListener, inject, signal } from "@angular/core";
import { FormDraftService, DraftSession } from '../services/form-drafts';
import { TodayService } from '../services/today';
import { AppUpdatesComponent } from '../shared/app-updates.component';
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
import { ArchiveSyncService } from "../services/archive-sync";
import { ArchiveSyncComponent } from "../shared/archive-sync.component";
import { mergeRecoveredArchive } from "../services/archive-recovery";
interface ProfileFormDraft {
  version:1;panel:string;unit:'kg'|'lb';
  profile:Record<string,string|number|null>;goals:Record<string,number|null>;
  photo?:Blob|null;username?:string|null;
  measurement?:{date:string;weight:number|null;waist:number|null;bodyFat:number|null};
}
@Component({
  standalone: true,
  styleUrls: ["./account-polish.css", "./profile-redesign.css"],
  imports: [InstallHelpComponent,...DESIGN_DIRECTIVES,ThemePickerComponent,AppFeaturesComponent,StorageStatusComponent,PushReminderComponent,CalendarSubscriptionComponent,DateFieldComponent,BackupReminderComponent,ArchiveSyncComponent,AppUpdatesComponent,
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
  template: `<header class="profile-page-heading">
 @if(panel()!=='overview'){<button class="icon-btn ghost" aria-label="Torna al profilo" (click)="panel.set('overview')"><gt-icon name="back"/></button>}
 <h1 gtDesign="profile.title">@if(panel()==='overview'){<span gtDesignLabel="profile.title">Profilo</span>}@else{ {{panelLabel()}} }</h1>
 @if(panel()==='overview'){<button type="button" class="icon-btn profile-settings-button" aria-label="Apri impostazioni" (click)="panel.set('settings')"><gt-icon name="settings"/></button>}
</header><gt-status/>
@if(draftRestored()){<div class="notice" role="status">Bozza recuperata: controlla i valori e salva per confermarli.<button type="button" class="ghost" (click)="discardDraft()">Elimina bozza</button></div>}
@if((panel()==='overview'||panel()==='theme')&&design?.canManage()){
<a class="button studio-profile-entry" routerLink="/design-studio"><gt-icon name="palette"/><span><strong>GT Design Studio</strong><small>Super Admin · pagine, controlli, palette e preset</small></span><gt-icon name="arrow"/></a>
}
@if(panel()==='overview'){
<section gtDesign="profile.identity" class="profile-dashboard identity-card" aria-label="Il tuo profilo">
 <div class="profile-head"><div class="avatar-orbit"><div class="profile-avatar"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name"/></div></div><div class="identity-name"><h2>{{s.profile().name}}</h2><div class="identity-meta"><span class="pill">{{auth.uiRole()==='SuperAdmin'?'Super Admin':auth.uiRole()==='Admin'?'Admin':'Personale'}}</span>@if(auth.user()?.username){<span class="subtle">@{{auth.user()?.username}}</span>}</div></div></div>
 <div class="profile-key-stats"><div><strong>{{s.profile().bodyWeight!==undefined?s.formatWeight(s.profile().bodyWeight!):'—'}} <small>{{s.settings().unit}}</small></strong><span>Peso</span></div><div><strong>{{s.profile().height??'—'}} <small>cm</small></strong><span>Altezza</span></div><div><strong>{{age()??'—'}}</strong><span>Età</span></div></div>
 @if(s.profile().goal){<p class="profile-goal-note">{{s.profile().goal}}</p>}
</section>
<div class="profile-quick-actions" role="group" aria-label="Azioni rapide"><button type="button" (click)="panel.set('settings')"><span class="qa-ico"><gt-icon name="edit"/></span>Modifica</button><button type="button" (click)="panel.set('measurements')"><span class="qa-ico"><gt-icon name="activity"/></span>Misura</button><button type="button" (click)="panel.set('theme')"><span class="qa-ico"><gt-icon name="palette"/></span>Tema</button></div>
<div class="profile-menu-group"><div class="account-section-label"><span gtDesign="profile.sections.journey" gtDesignLabel="profile.sections.journey">IL TUO PERCORSO</span></div><nav class="profile-menu" aria-label="Percorso personale"><button gtDesign="profile.goals" (click)="panel.set('goals')"><gt-icon name="trophy" gtDesignIcon="profile.goals"/><span><strong gtDesignLabel="profile.goals">Obiettivi</strong><small>Allenamenti e riferimenti personali</small></span>›</button><button gtDesign="profile.measurements" (click)="panel.set('measurements')"><gt-icon name="activity" gtDesignIcon="profile.measurements"/><span><strong gtDesignLabel="profile.measurements">Misurazioni corporee</strong><small>{{measurementHistory()[0]?('Ultima: '+s.formatWeight(measurementHistory()[0].weight)+' '+s.settings().unit+' · '+measurementHistory()[0].date):'Peso, girovita e storico'}}</small></span>›</button><a class="profile-recovery-link" routerLink="/recupero"><gt-icon name="moon"/><span><strong>Recovery e riposo</strong><small>Sonno, energia e focus muscolare</small></span>›</a></nav></div>
<div class="profile-menu-group"><div class="account-section-label"><span gtDesign="profile.sections.space" gtDesignLabel="profile.sections.space">IL TUO SPAZIO</span></div><nav class="profile-menu" aria-label="Preferenze e dati"><button gtDesign="profile.settings" (click)="panel.set('settings')"><gt-icon name="settings" gtDesignIcon="profile.settings"/><span><strong gtDesignLabel="profile.settings">Impostazioni</strong><small>Aspetto, allenamento e dispositivo</small></span>›</button>@if(auth.canManageBackups()){<button (click)="panel.set('backup')"><gt-icon name="download"/><span><strong>Dati e backup</strong><small>Sincronizzazione, esportazione e ripristino</small></span>@if(s.settings().lastBackup){<em class="menu-badge">Backup fatto</em>}›</button>}<button gtDesign="profile.security" (click)="panel.set('security')"><gt-icon name="shield" gtDesignIcon="profile.security"/><span><strong gtDesignLabel="profile.security">Account e accessi</strong><small>Credenziali e gestione utenti</small></span>›</button></nav></div>
}
@if(panel()==='goals'){<section class="card"><h2>I tuoi obiettivi</h2><p class="subtle" style="margin:12px 0 20px">Inserisci i tuoi riferimenti personali. Non vengono calcolati da una fotografia e non sono prescrizioni automatiche.</p><form [formGroup]="goalsForm" (ngSubmit)="saveGoals()" class="form-grid">@if(appFeatures?.nutritionEnabled()){<label>Calorie giornaliere (kcal)<input type="number" inputmode="numeric" formControlName="calories" min="1" max="20000"/></label><label>Proteine giornaliere (g)<input type="number" inputmode="decimal" formControlName="protein" min="1" max="2000"/></label><label>Carboidrati giornalieri (g)<input type="number" inputmode="decimal" formControlName="carbs" min="1" max="3000"/></label><label>Grassi giornalieri (g)<input type="number" inputmode="decimal" formControlName="fat" min="1" max="2000"/></label>}<label class="wide">Allenamenti per settimana<input type="number" inputmode="numeric" formControlName="workoutsPerWeek" min="1" max="14"/></label><button class="primary wide" [disabled]="goalsForm.invalid||goalsSaving()||s.busy()||!s.ready()">Salva obiettivi</button></form><p class="subtle" style="margin-top:14px">Lascia vuoto un campo per rimuovere quel riferimento.</p></section>}
@if(panel()==='measurements'){<section class="card"><h2>Registra misurazione</h2><form #measurementForm="ngForm" (ngSubmit)="saveMeasurement()" class="form-grid" style="margin-top:18px"><label>Data<gt-date-field name="date" [ngModel]="measurementDate" (ngModelChange)="chooseMeasurementDate($event)" required [max]="today"></gt-date-field></label><label>Peso ({{s.settings().unit}})<input name="weight" type="number" inputmode="decimal" [(ngModel)]="measurementWeight" min="1" max="1500" step="0.1" required/></label><label>Girovita (cm, facoltativo)<input name="waist" type="number" inputmode="decimal" [(ngModel)]="measurementWaist" min="1" max="300" step="0.1"/></label><label>Massa grassa (%, facoltativa)<input name="bodyfat" type="number" inputmode="decimal" [(ngModel)]="measurementBodyFat" min="1" max="80" step="0.1"/></label><button class="primary wide" [disabled]="measurementForm.invalid||s.busy()">Salva misurazione</button></form></section><section class="card" style="margin-top:18px"><h2>Storico misurazioni</h2><div class="list" style="margin-top:18px">@for(m of measurementHistory();track m.id){<div class="measurement-row"><div><strong>{{s.formatWeight(m.weight)}} {{s.settings().unit}}</strong><p class="subtle">{{m.date}}{{m.waist?' · Vita '+m.waist+' cm':''}}{{m.bodyFat?' · Massa grassa '+m.bodyFat+'%':''}}</p></div><button class="ghost danger" (click)="removeMeasurement(m.id)" aria-label="Rimuovi misurazione">×</button></div>}@empty{<p class="subtle">Nessuna misurazione registrata.</p>}</div></section>}
@if(panel()==='theme'){<section class="card appearance-card"><h2>Atmosfera</h2><label>Intensità glow · {{s.settings().neonGlow??55}}%<input gtDesign="profile.glowSlider" type="range" min="0" max="100" step="1" [value]="s.settings().neonGlow??55" (change)="saveAppearance('neonGlow',+$any($event.target).value)" [disabled]="s.busy()"/></label><label class="active-check"><input type="checkbox" [checked]="s.settings().dynamicBackground??true" (change)="saveAppearance('dynamicBackground',$any($event.target).checked)" [disabled]="s.busy()"/>Sfondo dinamico</label></section>}
@if(panel()==='calendar'){<gt-calendar-subscription [expanded]="true"/>}
@if(panel()==='settings'){
 <div class="profile-menu-group settings-shortcuts"><div class="account-section-label"><span>PROFILO E ASPETTO</span></div><nav class="profile-menu" aria-label="Aspetto"><button gtDesign="profile.theme" (click)="panel.set('theme')"><gt-icon name="palette" gtDesignIcon="profile.theme"/><span><strong gtDesignLabel="profile.theme">Tema e personalizzazione</strong><small>Palette, colori e intensità glow</small></span>›</button></nav></div>
}
@if(panel()==='settings'||panel()==='theme'||panel()==='info'){
    <div class="profile-settings-panels">
      <details class="card settings-disclosure" [hidden]="panel()!=='settings'"><summary><gt-icon name="user"/><span><strong>Dati personali</strong><small>Nome, foto, peso e altezza</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body">
        <div class="profile-head">
          <div class="profile-avatar">
            <gt-avatar [photo]="photoDraft()===undefined?s.profile().photo:(photoDraft()||undefined)" [name]="s.profile().name" />
          </div>
          <div>
            <h2>{{ s.profile().name }}</h2>
            <span class="pill">{{ auth.uiRole() === "User" ? "Cliente" : auth.uiRole() }}</span>
          </div>
        </div>
        <div class="actions profile-photo-actions"><button type="button" (click)="profileCamera.click()" [disabled]="photoBusy()">Scatta foto profilo</button><button type="button" (click)="profileGallery.click()" [disabled]="photoBusy()">Scegli da Foto</button><button type="button" class="ghost" (click)="removeProfilePhoto()" [disabled]="photoBusy()">Rimuovi foto</button></div>
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
              >Data di nascita (opzionale)<gt-date-field
                formControlName="birthDate"
                [max]="today" ></gt-date-field></label
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
              [disabled]="form.invalid || !s.ready() || s.busy() || photoBusy() || profileSaving()"
            >
              Salva profilo
            </button>
          </div>
        </form>
      </div></details>
      <div class="stack">
        <details class="card settings-disclosure" [class.theme-settings-card]="panel()==='theme'" [open]="panel()==='theme'||panel()==='settings'" [hidden]="panel()==='info'"><summary><gt-icon name="weight"/><span><strong>{{panel()==='theme'?'Tema e personalizzazione':'Unità e allenamento'}}</strong><small>{{panel()==='theme'?'Il tuo stile, in ogni dettaglio':'kg / lb e preferenze di registrazione'}}</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body">
          @if(panel()==='theme'){<gt-theme-picker/>}
          @if(panel()!=='theme'){
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
              <b>Carichi e riscaldamento della settimana precedente</b>
              <p>Scelta attiva quando inizi una seduta con un riferimento della settimana prima. Puoi cambiarla ogni volta, prima di iniziare.</p>
            </div>
            <mat-slide-toggle aria-label="Riusa settimana precedente per impostazione predefinita" [checked]="s.settings().reusePreviousWeek!==false" [disabled]="s.busy()" (change)="setting('reusePreviousWeek',$event.checked)"/>
          </div>
          <div class="setting-row">
            <div>
              <b>Precompila altre sedute dall’ultima sessione</b>
              <p>Per le sedute senza un riferimento settimanale. Serie da confermare, mai completate in automatico.</p>
            </div>
            <mat-slide-toggle
              aria-label="Precompila valori precedenti"
              [checked]="s.settings().prefill"
              (change)="setting('prefill', $event.checked)"
            />
          </div>
          <div class="setting-row" id="completed-workout-deletion"><div><b>Eliminazione allenamenti terminati</b><p>Consenti “Elimina” nello Storico e nel Calendario, sempre con conferma. Puoi disattivarlo quando vuoi. Disattivarlo non recupera le sessioni già eliminate.</p></div><mat-slide-toggle aria-label="Consenti eliminazione allenamenti terminati" [checked]="s.settings().allowCompletedWorkoutDeletion===true" [disabled]="s.busy()" (change)="setting('allowCompletedWorkoutDeletion',$event.checked)"/></div>
          <div class="setting-row">
            <div>
              <b>Catalogo esercizi</b>
              <p>Esercizi, immagini e gruppi muscolari.</p>
            </div>
            <a class="button ghost" routerLink="/catalogo"
              >{{s.canEditCatalog()?"Gestisci":"Esplora"}} <gt-icon name="arrow"
            /></a>
          </div>
          }
        </div></details>
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
    @if(panel()==='settings'){
 <div class="profile-menu-group settings-shortcuts"><div class="account-section-label"><span>DISPOSITIVO</span></div><nav class="profile-menu" aria-label="Dispositivo"><button (click)="panel.set('calendar')"><gt-icon name="calendar"/><span><strong>Calendario iPhone</strong><small>Collega le sedute programmate</small></span>›</button><button (click)="panel.set('info')"><gt-icon name="info"/><span><strong>App e iPhone</strong><small>Installazione, offline e verifiche</small></span>›</button></nav></div>
 <details class="settings-disclosure settings-component"><summary><gt-icon name="clock"/><span><strong>Notifiche e promemoria</strong><small>Avvisi e suoni del recupero</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body"><gt-push-reminder/></div></details>
 <details class="settings-disclosure settings-component"><summary><gt-icon name="download"/><span><strong>Aggiornamenti dell’app</strong><small>Versione installata e disponibilità</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body"><gt-app-updates/></div></details>
 <details class="settings-disclosure settings-component"><summary><gt-icon name="home"/><span><strong>Icona e collegamento Home</strong><small>Logo GT e link diretto dell’app</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body"><gt-install-help/></div></details>
 <div class="profile-menu-group settings-shortcuts"><div class="account-section-label"><span>GESTIONE</span></div><nav class="profile-menu" aria-label="Gestione">@if(auth.canManageBackups()){<button (click)="panel.set('backup')"><gt-icon name="download"/><span><strong>Dati e backup</strong><small>Copia, esporta o ripristina</small></span>›</button>}<button (click)="panel.set('security')"><gt-icon name="shield"/><span><strong>Account e sicurezza</strong><small>Accesso e credenziali</small></span>›</button><a routerLink="/catalogo"><gt-icon name="weight"/><span><strong>{{s.canEditCatalog()?'Gestione esercizi':'Catalogo esercizi'}}</strong><small>Varianti, preferiti e configurazioni</small></span>›</a><a routerLink="/calendario"><gt-icon name="calendar"/><span><strong>Calendario allenamenti</strong><small>Il tuo ritmo, giorno per giorno</small></span>›</a></nav></div>
 @if(auth.uiRole()==='SuperAdmin'){<details class="settings-disclosure settings-component"><summary><gt-icon name="shield"/><span><strong>Amministrazione</strong><small>Utenti e sezioni dell’app</small></span><span class="disclosure-chevron">›</span></summary><div class="settings-disclosure-body"><gt-app-features/><gt-storage-status/><a class="button full-width" routerLink="/utenti">Gestione utenti <gt-icon name="arrow"/></a></div></details>}
 <section class="card profile-logout-card" style="margin-top:20px"><h2>Accesso all’app</h2><p class="subtle" style="margin:12px 0">Puoi uscire senza fare un backup. Piani, esercizi e allenamenti salvati restano nel tuo archivio.</p><button type="button" class="full-width" gtDesign="profile.logout" [disabled]="loggingOut()" (click)="logout()">{{loggingOut()?'Uscita…':'Esci dall’app'}}</button></section>}
    @if(panel()==='backup'&&auth.canManageBackups()){<a class="button primary full-width" routerLink="/recupera-allenamenti">Recupera una singola seduta · progressi e serie</a><gt-archive-sync (recover)="recoverCloud($event)"/><gt-backup-reminder mode="settings"/><section class="card" style="margin-top:20px">
      <div class="card-head">
        <div>
          <h2>Backup e ripristino</h2>
          <p>Non lasciare al caso i tuoi progressi.</p>
        </div>
        <gt-icon name="download" />
      </div>
      <div class="notice">
        La copia locale e la copia server sono distinte: controlla qui sopra
        che il salvataggio sul server sia confermato. Conserva anche un file
        JSON per recuperare dati non ancora caricati o aprirli in un altro spazio.
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
              ? "Ultimo file generato: " + backupDate()
              : "Non hai ancora esportato un backup."
        }}
      </p>
      @if(s.settings().lastBackup){<button class="primary full-width" style="margin-top:14px" (click)="confirmBackup()">Ho verificato la copia salvata in File</button><p class="subtle" style="margin-top:12px">Conferma dopo aver trovato il JSON nell’app File. La data del file generato non dimostra che il download sia stato conservato.</p>}
    </section>
    }
    @if(panel()==='security'){<section class="card" style="margin-top:20px">
      <h2>Account e sicurezza</h2>
      @if(!auth.offlineMode()){<form (ngSubmit)="saveUsername()" class="stack" style="margin-top:20px"><label>Nome utente per il login<input name="account-username" autocomplete="username" autocapitalize="none" spellcheck="false" [ngModel]="usernameDraft()===null?(auth.user()?.username||''):usernameDraft()" (ngModelChange)="usernameDraft.set($event)" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" /></label><p class="subtle">3–30 caratteri: lettere, numeri, punto, trattino o underscore. Deve essere univoco: maiuscole e minuscole sono equivalenti. Il nome visualizzato nel profilo può essere diverso.</p><button class="primary" [disabled]="usernameBusy()">{{usernameBusy()?'Salvataggio…':'Salva nome utente'}}</button></form>}<p class="subtle" style="margin-top:12px">{{auth.user()?.email}}</p>
      @if(auth.uiRole() === 'SuperAdmin') {<div class="actions"><a class="button primary" routerLink="/utenti">Gestione utenti</a></div>}
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
    @if (auth.canManageBackups() && pending(); as backup) {
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
  design=inject(DesignRuntime,{optional:true});
  saveAppearance(key:'neonGlow'|'dynamicBackground',value:number|boolean){void this.s.change(d=>{Object.assign(d.settings[0],{[key]:value});},'',false);}

 private confirmation=confirmationForContext();
  private archiveSync=inject(ArchiveSyncService,{optional:true});
  async recoverCloud(request:{data:DataSet;scope:'device'|'account'}){
    if(!this.auth.canManageBackups()||!this.archiveSync)return;
    try{
      if(await this.s.change(async current=>{Object.assign(current,await mergeRecoveredArchive(current,request.data,'server:'+request.scope));},'Piani ed esercizi recuperati. Le copie precedenti sono conservate.',false)){
        await this.archiveSync.acceptRemote(request.data,request.scope);
        this.archiveSync.changed(this.s.data());
        await this.archiveSync.flush();
      }
    }catch(error){this.s.error.set(error instanceof Error?error.message:'Recupero non riuscito. Le copie sono conservate.');}
  }
  resume=inject(WorkoutResumeService);
  confirmBackup(){if(!this.auth.canManageBackups())return;void this.s.change(d=>{d.settings[0].backupConfirmedAt=new Date().toISOString();delete d.settings[0].backupSnoozedUntil;},"Copia in File confermata da te.",false);}
  photoDraft = signal<Blob|null|undefined>(undefined);
  private formDrafts=inject(FormDraftService,{optional:true});
  private draftSession?:DraftSession<ProfileFormDraft>;
  private draftSubscriptions:{unsubscribe():void}[]=[];
  draftRestored=signal(false);
  loggingOut=signal(false);
  photoBusy = signal(false);
  profileSaving = signal(false);
  goalsSaving = signal(false);
  measurementSaving=signal(false);
  private photoRequest = 0;
  private profileSignature = '';
  private goalsSignature = '';
  private profileUnit?: 'kg'|'lb';
  usernameDraft = signal<string|null>(null);
  usernameBusy = signal(false);
  async selectPhoto(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;const request=++this.photoRequest;this.photoBusy.set(true);try{const photo=await compressPhoto(file);if(request===this.photoRequest){this.photoDraft.set(photo);this.s.error.set('');this.draftSession?.changed();}}catch(e){if(request===this.photoRequest)this.s.error.set((e as Error).message);}finally{if(request===this.photoRequest)this.photoBusy.set(false);}}
  removeProfilePhoto(){this.photoRequest++;this.photoBusy.set(false);this.photoDraft.set(null);this.draftSession?.changed();}
  async saveUsername(){if(this.usernameBusy())return;this.accountError.set('');this.accountMessage.set('');this.usernameBusy.set(true);try{await this.auth.setUsername(this.usernameDraft()??this.auth.user()?.username??'');this.usernameDraft.set(null);this.accountMessage.set('Nome utente salvato. Puoi accedere con questo nome oppure con l’email.');await this.persistDraftState();}catch(e){this.accountError.set((e as Error).message);}finally{this.usernameBusy.set(false);}}
  theme = inject(ThemeService);
  defaultBackground = DEFAULT_BACKGROUND;
  auth = inject(AuthService);
  appFeatures=inject(AppFeaturesService,{optional:true});
  s = inject(Store);
  private feedback = feedbackForContext();
  accountError = feedbackSignal('error', this.feedback);
  accountMessage = feedbackSignal('success', this.feedback);
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
  async logout() {
    if(this.loggingOut())return;
    this.loggingOut.set(true);this.pwa.updating.set(true);
    const root=typeof document==='undefined'?null:document.querySelector?.('app-root') as HTMLElement|null,priorInert=root?.inert;
    let exited=false;
    try {
      // Automatic local saves continue independently: they can never veto or
      // indefinitely postpone sign-out, including an unresolved restore prompt.
      if(root)root.inert=true;
      let saving:Promise<unknown>;try{saving=Promise.resolve(this.pwa.prepareExit('logout')).catch(()=>{});}catch{saving=Promise.resolve();}
      await this.auth.logout({reload:false});exited=true;
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{await Promise.race([saving,new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);})]);}finally{clearTimeout(timer);}
      await this.pwa.finishLogoutUpdate();
    }catch(e){this.accountError.set((e as Error).message);}
    finally{if(!exited){if(root)root.inert=priorInert||false;this.pwa.updating.set(false);}this.loggingOut.set(false);}
  }
  pwa = inject(PwaService);
  fb = inject(FormBuilder);
  working = signal(false);
  pending = signal<DataSet | undefined>(undefined);
  backupFile = signal<File | null>(null);
  async shareBackup(){if(!this.auth.canManageBackups())return;const file=this.backupFile();if(!file)return;try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"Backup GymTrack"});}else{this.s.message.set("Usa il download del backup e spostalo in File dal menu Condividi di Safari.");}}catch(e){if((e as Error).name!=="AbortError")this.s.error.set("Condivisione non disponibile. Usa il download JSON.");}}
  private todayClock=inject(TodayService,{optional:true});
  get today(){return this.todayClock?.date()||localDate();}
  private lastToday=this.today;
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
  panelLabel(){return ({overview:'Profilo',goals:'Obiettivi',measurements:'Misurazioni corporee',settings:'Impostazioni',calendar:'Calendario iPhone',theme:'Tema e personalizzazione',backup:'Backup e ripristino',security:'Account e sicurezza',info:'Informazioni app'} as Record<string,string>)[this.panel()]||'Profilo';}
  age(){const birth=this.s.profile().birthDate;if(!birth)return null;const d=new Date(birth+'T12:00:00'),now=new Date();return now.getFullYear()-d.getFullYear()-((now.getMonth()<d.getMonth()||now.getMonth()===d.getMonth()&&now.getDate()<d.getDate())?1:0);}
  measurementDate=this.today;measurementWeight:number|null=null;measurementWaist:number|null=null;measurementBodyFat:number|null=null;private measurementDateChosen=false;
  chooseMeasurementDate(date:string){this.measurementDate=date;this.measurementDateChosen=true;this.draftSession?.changed();}
  measurementHistory(){return [...this.s.data().measurements].sort((a,b)=>b.date.localeCompare(a.date));}
  goalsForm=this.fb.group({calories:[null as number|null,[Validators.min(1),Validators.max(20000)]],protein:[null as number|null,[Validators.min(1),Validators.max(2000)]],carbs:[null as number|null,[Validators.min(1),Validators.max(3000)]],fat:[null as number|null,[Validators.min(1),Validators.max(2000)]],workoutsPerWeek:[null as number|null,[Validators.min(1),Validators.max(14)]]});
  async saveGoals(){if(this.goalsForm.invalid||this.goalsSaving())return;const value=this.goalsForm.getRawValue();if(value.workoutsPerWeek!==null&&!Number.isInteger(value.workoutsPerWeek)){this.s.error.set('Inserisci un numero intero di allenamenti.');return;}this.goalsSaving.set(true);try{if(await this.s.change(d=>{d.settings[0].goals=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null));},'Obiettivi salvati.',false)){for(const key of Object.keys(value) as (keyof typeof value)[]){const control=this.goalsForm.controls[key];if(control.value===value[key])control.markAsPristine();}this.syncForms();await this.persistDraftState();}}finally{this.goalsSaving.set(false);}}
  async saveMeasurement(){
    if(this.measurementSaving())return;
    const snapshot={date:this.measurementDate,weight:this.measurementWeight,waist:this.measurementWaist,bodyFat:this.measurementBodyFat};
    const weight=snapshot.weight===null?0:this.s.kg(snapshot.weight),date=snapshot.date,waist=snapshot.waist??undefined,bodyFat=snapshot.bodyFat??undefined;
    if(!Number.isFinite(weight)||weight<=0||weight>700||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>this.today){this.s.error.set('Controlla la data e il peso.');return;}
    this.measurementSaving.set(true);
    try{if(await this.s.change(d=>{const old=d.measurements.find(m=>m.date===date);const measurement={id:old?.id||uid(),date,weight,waist,bodyFat};if(old)Object.assign(old,measurement);else d.measurements.push(measurement);const latest=[...d.measurements].sort((a,b)=>b.date.localeCompare(a.date))[0];if(latest)d.profiles[0].bodyWeight=latest.weight;},'Misurazione salvata.',false)){
      if(this.measurementDate===snapshot.date&&this.measurementWeight===snapshot.weight&&this.measurementWaist===snapshot.waist&&this.measurementBodyFat===snapshot.bodyFat){this.measurementDate=this.today;this.measurementDateChosen=false;this.measurementWeight=null;this.measurementWaist=null;this.measurementBodyFat=null;}
      await this.persistDraftState();
    }}finally{this.measurementSaving.set(false);}
  }
  async removeMeasurement(id:string){if(await this.confirmation.ask('Rimuovere questa misurazione?'))await this.s.change(d=>{d.measurements=d.measurements.filter(m=>m.id!==id);},'Misurazione rimossa.',false);}
  constructor() {
    effect(()=>{if(!this.auth.canManageBackups()){if(this.panel()==='backup')this.panel.set('overview');this.pending.set(undefined);this.backupFile.set(null);}});
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe(params=>{const section=params.get('section');if(section&&(section!=='backup'||this.auth.canManageBackups())&&['backup','goals','settings','calendar','measurements','theme','security','info'].includes(section))this.panel.set(section);});
    effect(() => {this.syncForms();if(this.s.ready()&&this.formDrafts&&!this.draftSession){this.draftSession=this.formDrafts.bind(this.s.archiveKey(),'profile',()=>this.captureDraft(),value=>this.restoreDraft(value));this.draftSubscriptions.push(this.form.valueChanges.subscribe(()=>this.draftSession?.changed()),this.goalsForm.valueChanges.subscribe(()=>this.draftSession?.changed()));}});
    if(this.todayClock)effect(()=>{const today=this.today,previous=this.lastToday;this.lastToday=today;if(today!==previous&&!this.measurementDateChosen&&this.measurementDate===previous&&this.measurementWeight===null&&this.measurementWaist===null&&this.measurementBodyFat===null)this.measurementDate=today;});
  }
  @HostListener('input') @HostListener('change') draftChanged(){this.draftSession?.changed();}
  canLeave(){if(this.photoBusy()){this.s.error.set('Attendi la preparazione della foto prima di cambiare sezione.');return false;}if(this.profileSaving()||this.goalsSaving()||this.measurementSaving()||this.usernameBusy()||this.accountBusy()){this.s.error.set('Attendi il completamento del salvataggio prima di uscire.');return false;}return true;}
  @HostListener('window:gymtrack:before-update',['$event']) beforeUpdate(event:Event){(event as Event&{waitUntil(save:Promise<boolean>):void}).waitUntil(Promise.resolve(this.canLeave()));}
  private captureDraft():ProfileFormDraft|null{
    const profile:ProfileFormDraft['profile']={},goals:ProfileFormDraft['goals']={};
    for(const [key,control] of Object.entries(this.form.controls))if(control.dirty)profile[key]=control.value;
    for(const [key,control] of Object.entries(this.goalsForm.controls))if(control.dirty)goals[key]=control.value;
    const measurement=this.measurementWeight!==null||this.measurementWaist!==null||this.measurementBodyFat!==null||this.measurementDateChosen?{date:this.measurementDate,weight:this.measurementWeight,waist:this.measurementWaist,bodyFat:this.measurementBodyFat}:undefined;
    if(!Object.keys(profile).length&&!Object.keys(goals).length&&this.photoDraft()===undefined&&this.usernameDraft()===null&&!measurement)return null;
    return {version:1,panel:this.panel(),unit:this.profileUnit||this.s.settings().unit,profile,goals,photo:this.photoDraft(),username:this.usernameDraft(),measurement};
  }
  private restoreDraft(value:ProfileFormDraft){
    if(value?.version!==1||!value.profile||!value.goals)return;
    for(const [key,entry] of Object.entries(value.profile)){const control=this.form.controls[key as keyof typeof this.form.controls];if(!control||control.dirty)continue;const numeric=key==='bodyWeight'||key==='height';if(numeric?(entry!==null&&(typeof entry!=='number'||!Number.isFinite(entry))):(typeof entry!=='string'||entry.length>1000))continue;control.setValue(entry as never,{emitEvent:false});control.markAsDirty();}
    for(const [key,entry] of Object.entries(value.goals)){const control=this.goalsForm.controls[key as keyof typeof this.goalsForm.controls];if(control&&!control.dirty&&(entry===null||typeof entry==='number'&&Number.isFinite(entry))){control.setValue(entry,{emitEvent:false});control.markAsDirty();}}
    if(value.photo===null||value.photo instanceof Blob)this.photoDraft.set(value.photo);
    if(typeof value.username==='string'&&value.username.length<=30)this.usernameDraft.set(value.username);
    if(value.unit==='kg'||value.unit==='lb')this.profileUnit=value.unit;
    const m=value.measurement;if(m&&typeof m.date==='string'&&m.date.length<=10&&[m.weight,m.waist,m.bodyFat].every(n=>n===null||typeof n==='number'&&Number.isFinite(n))){this.measurementDate=m.date;this.measurementDateChosen=true;this.measurementWeight=m.weight;this.measurementWaist=m.waist;this.measurementBodyFat=m.bodyFat;}
    if(this.panel()==='overview'&&['settings','goals','measurements','security'].includes(value.panel))this.panel.set(value.panel);
    this.syncForms();this.draftRestored.set(true);
  }
  private async persistDraftState(){if(!this.draftSession)return;try{if(this.captureDraft())await this.draftSession.flush();else{await this.draftSession.clear();this.draftRestored.set(false);}}catch(error){this.s.error.set(error instanceof Error?error.message:'Bozza non aggiornata. Riprova.');}}
  async discardDraft(){if(this.profileSaving()||this.goalsSaving()||this.photoBusy()||!await this.confirmation.ask('Eliminare la bozza e rileggere i dati già salvati?'))return;this.form.markAsPristine();this.goalsForm.markAsPristine();this.photoDraft.set(undefined);this.usernameDraft.set(null);this.measurementWeight=null;this.measurementWaist=null;this.measurementBodyFat=null;this.measurementDate=this.today;this.measurementDateChosen=false;this.profileSignature='';this.goalsSignature='';this.syncForms();await this.persistDraftState();}
  syncForms(){
    if(!this.s.ready())return;
    const p=this.s.profile(),settings=this.s.settings(),unit=settings.unit;
    const profile={name:p.name,bodyWeight:p.bodyWeight===undefined?null:this.s.weight(p.bodyWeight),height:p.height??null,birthDate:p.birthDate||'',goal:p.goal||''};
    // Store writes clone the whole archive. Only persisted values may refresh
    // untouched controls; a meal, theme or autosave must not reset a draft.
    if(this.profileUnit&&this.profileUnit!==unit){const control=this.form.controls.bodyWeight;if(control.dirty&&control.value!==null&&Number.isFinite(control.value)){const kg=this.profileUnit==='lb'?control.value/2.2046226218:control.value;control.setValue(unit==='lb'?kg*2.2046226218:kg,{emitEvent:false});}if(this.measurementWeight!==null&&Number.isFinite(this.measurementWeight)){const kg=this.profileUnit==='lb'?this.measurementWeight/2.2046226218:this.measurementWeight;this.measurementWeight=unit==='lb'?kg*2.2046226218:kg;}}
    const profileSignature=JSON.stringify(profile);
    if(profileSignature!==this.profileSignature){for(const key of Object.keys(profile) as (keyof typeof profile)[]){const control=this.form.controls[key];if(!control.dirty)control.setValue(profile[key] as never,{emitEvent:false});}this.profileSignature=profileSignature;}
    this.profileUnit=unit;
    const goals={calories:settings.goals?.calories??null,protein:settings.goals?.protein??null,carbs:settings.goals?.carbs??null,fat:settings.goals?.fat??null,workoutsPerWeek:settings.goals?.workoutsPerWeek??null};
    const goalsSignature=JSON.stringify(goals);
    if(goalsSignature!==this.goalsSignature){for(const key of Object.keys(goals) as (keyof typeof goals)[]){const control=this.goalsForm.controls[key];if(!control.dirty)control.setValue(goals[key],{emitEvent:false});}this.goalsSignature=goalsSignature;}
  }
  async save() {
    if (this.form.invalid || this.photoBusy() || this.profileSaving()) return;
    const v = this.form.getRawValue();
    if (v.birthDate && v.birthDate > this.today) {
      this.s.error.set("La data di nascita non può essere futura.");
      return;
    }
    const bw = v.bodyWeight === null ? undefined : (this.profileUnit??this.s.settings().unit)==='lb'?v.bodyWeight!/2.2046226218:v.bodyWeight!;
    if (bw !== undefined && bw > 700) {
      this.s.error.set("Peso corporeo fuori intervallo.");
      return;
    }
    const photo=this.photoDraft();this.profileSaving.set(true);
    try {
    const saved = await this.s.change((d) => {
      if(bw!==undefined&&bw!==d.profiles[0].bodyWeight){const old=d.measurements.find(m=>m.date===this.today);if(old)old.weight=bw;else d.measurements.push({id:uid(),date:this.today,weight:bw});}
      Object.assign(d.profiles[0], {
        name: v.name!.trim(),
        photo: photo===undefined?d.profiles[0].photo:(photo||undefined),
        bodyWeight: bw,
        height: v.height ?? undefined,
        birthDate: v.birthDate || undefined,
        goal: v.goal?.trim() || "",
      });
    }, "Profilo salvato.");
    if(saved){if(this.photoDraft()===photo)this.photoDraft.set(undefined);for(const key of Object.keys(v) as (keyof typeof v)[]){const control=this.form.controls[key];if(control.value===v[key])control.markAsPristine();}this.profileSignature='';this.syncForms();await this.persistDraftState();}
    }finally{this.profileSaving.set(false);}
  }
  setting(key: "theme" | "unit" | "prefill" | "reusePreviousWeek" | "allowCompletedWorkoutDeletion", value: string | boolean) {
    if(key === "theme") void this.theme.save(value === "light" ? "#edf3fa" : this.defaultBackground);
    void this.s.change((d) => {
      if (key === "theme") d.settings[0].theme = value as "dark" | "light";
      if (key === "unit") d.settings[0].unit = value as "kg" | "lb";
      if (key === "prefill") d.settings[0].prefill = !!value;
      if (key === "reusePreviousWeek") d.settings[0].reusePreviousWeek = !!value;
      if (key === "allowCompletedWorkoutDeletion") d.settings[0].allowCompletedWorkoutDeletion = !!value;
    });
  }
  backupDate() {
    return new Date(this.s.settings().lastBackup!).toLocaleString("it-IT");
  }
  async export() {
    if(!this.auth.canManageBackups())return;
    this.working.set(true);
    try {
      await this.s.settled();
      const d = structuredClone(this.s.data());
      d.settings[0].lastBackup = new Date().toISOString();
      d.settings[0].backgroundColor=this.theme.color();
      d.settings[0].themeConfig=structuredClone(this.theme.config());
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
    if(!this.auth.canManageBackups())return;
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
    if(!this.auth.canManageBackups())return;
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
        this.resume.clear(this.s.archiveKey());
        if(d.settings[0].themeConfig)await this.theme.saveConfig(d.settings[0].themeConfig);
        else if(d.settings[0].backgroundColor)await this.theme.save(d.settings[0].backgroundColor);
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
          ? "Archiviazione persistente concessa. I dati continuano a essere salvati sul dispositivo."
          : "Il browser non ha concesso l’archiviazione persistente. Puoi usare l’app e salvare sul dispositivo; il backup esportabile resta facoltativo.",
      );
    } catch {
      this.s.error.set(
        "Archiviazione persistente non disponibile in questo browser.",
      );
    }
  }
  ngOnDestroy(){void this.draftSession?.destroy();this.draftSubscriptions.forEach(s=>s.unsubscribe());this.photoRequest++;}
}
