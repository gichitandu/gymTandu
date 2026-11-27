import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../services/auth';
import { confirmationForContext } from '../services/confirmation';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { AppInvite, appInviteLink } from '../services/app-invite';
import { IconComponent } from './icon.component';

/** Impostazioni · Invita qualcuno: il link con cui un'altra persona entra dal browser e crea il suo account.
 *  Lo vede solo il Super Admin; il Worker verifica di nuovo il ruolo a ogni richiesta. */
@Component({
  selector: 'gt-app-invite',
  standalone: true,
  imports: [IconComponent],
  template: `<section class="card ai-card" aria-labelledby="ai-title">
  <div class="ai-head">
    <span class="ai-icon" aria-hidden="true"><gt-icon name="share" /></span>
    <div>
      <h2 id="ai-title">Il tuo link di invito</h2>
      <p>Chi apre il link entra in GymTrack dal browser, sceglie nome utente e password e trova il suo spazio vuoto, separato dal tuo. Può poi aggiungere l’app alla schermata Home.</p>
    </div>
  </div>
  @if (!available()) {
    <p class="ai-note">Serve la connessione e l’accesso come Super Admin.</p>
  } @else if (loading()) {
    <p class="ai-note" role="status">Caricamento del link…</p>
  } @else if (current(); as invite) {
    <div class="ai-link">
      <code>{{ link(invite) }}</code>
    </div>
    <ul class="ai-facts">
      <li><gt-icon name="clock" />Valido fino al {{ expiry(invite) }}</li>
      <li><gt-icon name="users" />{{ invite.registrations }} di {{ invite.maxRegistrations }} account creati</li>
    </ul>
    <div class="ai-actions">
      <button type="button" class="primary" (click)="share(invite)" [disabled]="busy()"><gt-icon name="share" />Condividi</button>
      <button type="button" class="ghost" (click)="copy(invite)" [disabled]="busy()"><gt-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copiato' : 'Copia link' }}</button>
    </div>
    <div class="ai-secondary">
      <button type="button" class="ai-text" (click)="create()" [disabled]="busy()">Nuovo link</button>
      <button type="button" class="ai-text danger" (click)="revoke()" [disabled]="busy()">Disattiva link</button>
    </div>
  } @else {
    <p class="ai-note">Ogni link vale 7 giorni e per {{ maxAccounts }} nuovi account, sempre come Cliente. Crearne uno nuovo disattiva il precedente.</p>
    <button type="button" class="primary ai-create" (click)="create()" [disabled]="busy()"><gt-icon name="plus" />{{ busy() ? 'Creazione…' : 'Crea link di invito' }}</button>
  }
  @if (error()) {
    <p class="ai-error" role="alert">{{ error() }}</p>
  }
</section>`,
  styles: [`
:host{display:block}
.ai-card{display:grid;gap:14px;padding:18px}
.ai-head{display:flex;gap:14px;align-items:flex-start}
.ai-head h2{margin:0 0 4px;font-size:18px}
.ai-head p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
.ai-icon{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:14px;color:var(--accent-ink);background:linear-gradient(135deg,var(--accent),var(--theme-secondary,var(--accent)))}
.ai-icon gt-icon{width:21px;height:21px}
.ai-note{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
.ai-link{padding:12px 14px;border-radius:14px;border:1px dashed color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent) 7%,transparent)}
.ai-link code{display:block;font:600 12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text);overflow-wrap:anywhere;user-select:all}
.ai-facts{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:0;list-style:none;color:var(--muted);font-size:12.5px}
.ai-facts li{display:flex;align-items:center;gap:6px}
.ai-facts gt-icon{width:15px;height:15px}
.ai-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.ai-actions button,.ai-create{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;min-width:0}
.ai-actions gt-icon,.ai-create gt-icon{width:18px;height:18px}
.ai-secondary{display:flex;justify-content:space-between;gap:12px}
.ai-text{min-height:36px;padding:0;border:0;background:none;color:var(--accent-text,var(--accent));font:inherit;font-size:13px;font-weight:650;cursor:pointer}
.ai-text.danger{color:var(--danger)}
.ai-error{margin:0;color:var(--danger);font-size:13px}
`],
})
export class AppInviteComponent {
  private auth = inject(AuthService);
  private confirmation = confirmationForContext();
  private feedback = feedbackForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly maxAccounts = 5;
  readonly invites = signal<AppInvite[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly current = computed(() => this.invites()[0]);
  readonly available = computed(() => this.auth.user()?.role === 'SuperAdmin' && !this.auth.viewAsClient() && !this.auth.offlineMode());
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (this.available()) void this.load();
  }

  link(invite: AppInvite) {
    return appInviteLink(location.origin, invite.token);
  }
  expiry(invite: AppInvite) {
    return new Date(invite.expiresAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  }

  private message(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await this.auth.request('app-invites');
      this.invites.set(Array.isArray(r?.invites) ? r.invites : []);
    } catch (e) {
      this.error.set(this.message(e, 'Non è stato possibile caricare il link. Riprova.'));
    } finally {
      this.loading.set(false);
    }
  }

  async create() {
    if (this.busy()) return;
    if (this.current() && !(await this.confirmation.ask({ title: 'Creare un nuovo link?', message: 'Il link attuale smetterà di funzionare. Gli account già creati restano attivi.', confirmLabel: 'Crea nuovo link', tone: 'info' }))) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.auth.request('app-invites', {});
      this.invites.set(r?.invite ? [r.invite] : []);
      this.copied.set(false);
    } catch (e) {
      this.error.set(this.message(e, 'Link non creato. Riprova.'));
    } finally {
      this.busy.set(false);
    }
  }

  async revoke() {
    if (this.busy()) return;
    if (!(await this.confirmation.ask({ title: 'Disattivare il link?', message: 'Chi non si è ancora registrato non potrà più usarlo. Gli account già creati restano attivi.', confirmLabel: 'Disattiva', tone: 'danger' }))) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.request('app-invites/revoke', {});
      this.invites.set([]);
    } catch (e) {
      this.error.set(this.message(e, 'Link non disattivato. Riprova.'));
    } finally {
      this.busy.set(false);
    }
  }

  async share(invite: AppInvite) {
    const url = this.link(invite);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'GymTrack', text: 'Ti invito su GymTrack: apri il link e crea il tuo account.', url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await this.copy(invite);
  }

  async copy(invite: AppInvite) {
    try {
      await navigator.clipboard.writeText(this.link(invite));
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.error.set('Copia non riuscita: tieni premuto sul link per selezionarlo.');
    }
  }
}
