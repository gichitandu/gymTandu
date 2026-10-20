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
import { DataSet } from "../models/domain";
import { StatusComponent } from "../shared/status.component";
import { IconComponent } from "../shared/icon.component";
import { PwaService } from "../services/pwa";
@Component({
  standalone: true,
  imports: [
    A11yModule,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    MatSlideToggleModule,
    StatusComponent,
    IconComponent,
  ],
  template: `<div class="page-heading">
      <div>
        <p class="eyebrow">IL TUO SPAZIO PERSONALE</p>
        <h1>Profilo e impostazioni</h1>
        <p class="subtle">Tutto quello che serve, sotto il tuo controllo.</p>
      </div>
    </div>
    <gt-status />
    <div class="split">
      <section class="card">
        <div class="profile-head">
          <div class="profile-avatar">
            {{ s.profile().name.slice(0, 2).toUpperCase() }}
          </div>
          <div>
            <h2>{{ s.profile().name }}</h2>
            <span class="pill">{{ auth.user()?.role === "User" ? "Cliente" : auth.user()?.role }}</span>
          </div>
        </div>
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
              [disabled]="form.invalid || !s.ready() || s.busy()"
            >
              Salva profilo
            </button>
          </div>
        </form>
      </section>
      <div class="stack">
        <section class="card">
          <h2>La tua esperienza</h2>
          <div class="setting-row" style="margin-top:20px">
            <div>
              <b>Tema scuro</b>
              <p>Il tuo allenamento, senza distrazioni.</p>
            </div>
            <mat-slide-toggle
              aria-label="Tema scuro"
              [checked]="s.settings().theme === 'dark'"
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
              >Gestisci <gt-icon name="arrow"
            /></a>
          </div>
        </section>
        <section class="card">
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
    <section class="card" style="margin-top:20px">
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
        Il backup include profilo, piani, catalogo, immagini, allenamenti, serie
        e impostazioni. L’importazione sostituisce l’intero archivio in un’unica
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
          Importa backup</button
        ><input
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
    <section class="card" style="margin-top:20px">
      <h2>Account e sicurezza</h2><p class="subtle" style="margin-top:12px">{{auth.user()?.email}}</p>
      @if(accountError()) {<p class="notice error" role="alert">{{accountError()}}</p>}
      @if(accountMessage()) {<p class="notice success" role="status">{{accountMessage()}}</p>}
      @if(auth.user()?.role === 'SuperAdmin') {<div class="actions"><a class="button primary" routerLink="/utenti">Gestione utenti</a></div>}
      <form (ngSubmit)="changePassword()" class="form-grid" style="margin-top:24px">
        <input type="text" name="username" [ngModel]="auth.user()?.email" autocomplete="username" hidden />
        <label class="wide">Password attuale<input name="current-password" type="password" autocomplete="current-password" [(ngModel)]="currentPassword" required maxlength="128" /></label>
        <label>Nuova password<input name="new-password" type="password" autocomplete="new-password" [(ngModel)]="newPassword" required minlength="12" maxlength="128" /></label>
        <label>Conferma nuova password<input name="confirm-password" type="password" autocomplete="new-password" [(ngModel)]="confirmPassword" required minlength="12" maxlength="128" /></label>
        <div class="actions wide"><button class="primary" [disabled]="accountBusy()">Aggiorna password</button><button type="button" (click)="logout()">Esci dall’account</button></div>
      </form>
      <p class="subtle" style="margin-top:16px">Puoi salvare e compilare le credenziali con l’app Password di iOS. Gli allenamenti rimangono su questo dispositivo, separati per account.</p>
    </section>
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
            {{ backup.workouts.length }} sessioni.
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
  async logout() { try { await this.auth.logout(); } catch(e) {this.accountError.set((e as Error).message);} }
  pwa = inject(PwaService);
  fb = inject(FormBuilder);
  working = signal(false);
  pending = signal<DataSet | undefined>(undefined);
  today = new Date().toISOString().slice(0, 10);
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
  constructor() {
    effect(() => {
      if (!this.s.ready()) return;
      const p = this.s.profile();
      const unit = this.s.settings().unit;
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
    if (this.form.invalid) return;
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
    await this.s.change((d) => {
      Object.assign(d.profiles[0], {
        name: v.name!.trim(),
        bodyWeight: bw,
        height: v.height ?? undefined,
        birthDate: v.birthDate || undefined,
        goal: v.goal?.trim() || "",
      });
    }, "Profilo salvato.");
  }
  setting(key: "theme" | "unit" | "prefill", value: string | boolean) {
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
      const text = await exportBackup(d);
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
      )
        this.pending.set(undefined);
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
