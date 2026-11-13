import { Component, computed, inject, input, signal } from '@angular/core';
import { PwaService } from '../services/pwa';
import { detectInstallPlatform, detectIosBrowser } from '../services/install-platform';
import { IconComponent } from './icon.component';

/**
 * Pulsante per scaricare/installare GymTrack.
 * - Windows, Android, ChromeOS, macOS con Chrome/Edge: usa il prompt nativo del browser (beforeinstallprompt).
 * - iOS/iPadOS: Apple non permette l’installazione programmata; il pulsante apre la guida
 *   per creare il collegamento («segnalibro») nella schermata Home da Safari.
 */
const DISMISS_KEY = 'gt.install-banner.dismissed';
/** Dopo «Non ora» il banner ricompare dopo 30 giorni; resta sempre disponibile dal Profilo. */
function readDismissed(): boolean {
  try { const at = Number(localStorage.getItem(DISMISS_KEY)); return !!at && Date.now() - at < 30 * 86_400_000; } catch { return false; }
}

@Component({
  selector: 'gt-install-app',
  standalone: true,
  imports: [IconComponent],
  template: `
@if (pwa.installed()) {
  @if (variant() === 'full') { <span class="pill green">App installata</span> }
} @else if (variant() === 'banner') {
  @if (mode() !== 'none' && !dismissed()) {
    <aside class="gt-install-banner" aria-label="Installa GymTrack">
      <img src="/icons/gt-modern-180.png" width="44" height="44" alt="">
      <span class="gt-install-text"><strong>{{ mode() === 'ios' ? 'GymTrack sulla tua Home' : 'Scarica GymTrack' }}</strong><small>{{ mode() === 'ios' ? 'Aprila a schermo intero, come un’app.' : 'Installala sul dispositivo e aprila in un tocco.' }}</small></span>
      <button type="button" class="su-btn su-primary sm" (click)="mode() === 'ios' ? open.set(true) : install()" [disabled]="busy()" [attr.aria-haspopup]="mode() === 'ios' ? 'dialog' : null"><gt-icon [name]="mode() === 'ios' ? 'plus' : 'download'"/>{{ mode() === 'ios' ? 'Aggiungi' : 'Installa' }}</button>
      <button type="button" class="su-iconbtn gt-install-dismiss" (click)="dismiss()" aria-label="Non ora"><gt-icon name="close"/></button>
    </aside>
  }
} @else if (mode() === 'prompt') {
  <button type="button" [class]="variant() === 'compact' ? 'su-iconbtn gt-install-compact' : 'primary gt-install-full'" (click)="install()" [disabled]="busy()" [attr.aria-label]="variant() === 'compact' ? label() : null" [attr.title]="label()">
    <gt-icon name="download"/>@if (variant() === 'full') {<span>{{ label() }}</span>}
  </button>
} @else if (mode() === 'ios') {
  <button type="button" [class]="variant() === 'compact' ? 'su-iconbtn gt-install-compact' : 'primary gt-install-full'" (click)="open.set(true)" aria-haspopup="dialog" [attr.aria-label]="variant() === 'compact' ? 'Aggiungi GymTrack alla schermata Home' : null" title="Aggiungi alla schermata Home">
    <gt-icon name="plus"/>@if (variant() === 'full') {<span>Aggiungi alla schermata Home</span>}
  </button>
} @else if (variant() === 'full') {
  <p class="subtle">Dal menu del browser scegli “Installa app” o “Aggiungi a schermata Home”. Con Chrome o Edge su Windows, Android e Mac comparirà anche il pulsante “Scarica l’app”.</p>
}
@if (message() && !open()) { <p class="subtle gt-install-msg" role="status">{{ message() }}</p> }
@if (open()) {
  <div class="su-sheet-backdrop" (click)="open.set(false)"></div>
  <section class="su-sheet gt-install-sheet" role="dialog" aria-modal="true" aria-labelledby="gt-install-title">
    <div class="su-grab"></div>
    <header class="su-sheet-head"><div><h2 id="gt-install-title">GymTrack sulla Home</h2><p>Crea il collegamento all’app su iPhone o iPad</p></div><button type="button" class="su-iconbtn" (click)="open.set(false)" aria-label="Chiudi"><gt-icon name="close"/></button></header>
    @if (iosBrowser() !== 'safari') {
      <p class="gt-install-warn">Stai usando {{ browserName() }}: per il risultato migliore apri questo link in <strong>Safari</strong>. Su iOS 16.4 o successivo puoi farlo anche da qui, con il pulsante Condividi.</p>
    }
    <ol class="gt-install-steps">
      <li><span class="gt-step-icon"><gt-icon name="share"/></span><span>Tocca <strong>Condividi</strong> nella barra di Safari (il quadrato con la freccia verso l’alto).</span></li>
      <li><span class="gt-step-icon"><gt-icon name="plus"/></span><span>Scorri e scegli <strong>Aggiungi alla schermata Home</strong>.</span></li>
      <li><span class="gt-step-icon"><gt-icon name="home"/></span><span>Lascia attivo <strong>Apri come app web</strong> e tocca <strong>Aggiungi</strong>: l’icona GT apparirà sulla Home.</span></li>
    </ol>
    <p class="gt-install-note">Apple non consente ai siti di creare il collegamento in automatico: servono questi tre tocchi, una sola volta. Le diverse installazioni possono usare archivi locali separati: prima verifica che <strong>Protezione dati</strong> indichi la copia server aggiornata.</p>
    @if (message()) { <p class="gt-install-note" role="status">{{ message() }}</p> }
    <div class="gt-install-actions"><button type="button" class="ghost" (click)="copy()">Copia link dell’app</button><button type="button" class="primary" (click)="open.set(false)">Ho capito</button></div>
  </section>
}`,
  styles: [`
:host{display:contents}
.gt-install-full{display:inline-flex;align-items:center;gap:8px;min-height:44px}
.gt-install-compact{width:44px;height:44px;border-radius:14px}
.gt-install-banner{display:flex;box-sizing:border-box;width:100%;max-width:100%;overflow:hidden;align-items:center;gap:12px;margin:0 0 16px;padding:12px 10px 12px 12px;border-radius:22px;background:var(--card);border:1px solid color-mix(in srgb,var(--text) 12%,transparent)}
.gt-install-banner img{flex:none;border-radius:11px}
.gt-install-text{flex:1 1 auto;min-width:0;display:grid;gap:2px}.gt-install-text strong{font-size:14px}.gt-install-text small{font-size:12px;line-height:1.4;color:var(--muted)}
.gt-install-banner .su-btn{flex:0 0 auto;width:auto;max-width:none;margin:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;white-space:nowrap}
.gt-install-dismiss{flex:0 0 36px;width:36px;height:36px;margin:0}
.gt-install-msg{margin:8px 0 0}
.gt-install-warn{font-size:13px;line-height:1.5;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,var(--text) 7%,transparent);margin:12px 0 4px}
.gt-install-steps{list-style:none;padding:0;margin:14px 0;display:grid;gap:12px;counter-reset:s}
.gt-install-steps li{display:flex;align-items:center;gap:12px;font-size:14px;line-height:1.45}
.gt-step-icon{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--text) 9%,transparent)}
.gt-install-note{font-size:12px;line-height:1.6;color:var(--muted);margin:6px 0 14px}
.gt-install-actions{display:flex;flex-wrap:wrap;gap:10px}.gt-install-actions>*{flex:1 1 140px;min-height:44px}
`],
})
export class InstallAppComponent {
  readonly pwa = inject(PwaService);
  /** compact: icona nella barra in alto; banner: invito chiudibile nella pagina Oggi; full: pulsante con testo e indicazioni. */
  readonly variant = input<'compact' | 'banner' | 'full'>('full');
  readonly dismissed = signal(readDismissed());
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  private readonly nav = typeof navigator !== 'undefined' ? navigator : undefined;
  readonly platform = detectInstallPlatform(this.nav as never);
  readonly iosBrowser = signal(detectIosBrowser(this.nav?.userAgent));
  readonly mode = computed(() => (this.pwa.event() ? 'prompt' : this.platform === 'ios' ? 'ios' : 'none'));
  readonly label = computed(() => (this.platform === 'android' ? 'Scarica l’app' : this.platform === 'windows' || this.platform === 'mac' ? 'Installa l’app sul computer' : 'Installa GymTrack'));
  browserName() { return ({ chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', safari: 'Safari', other: 'un browser integrato' } as const)[this.iosBrowser()]; }
  async install() {
    if (this.busy()) return;
    this.busy.set(true); this.message.set('');
    try { await this.pwa.install(); }
    catch { this.message.set('Installazione non avviata: riprova dal menu del browser («Installa app»).'); }
    finally { this.busy.set(false); }
  }
  dismiss() {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* preferenza solo locale */ }
  }
  async copy() {
    const url = new URL('/', location.href).href;
    try { await navigator.clipboard.writeText(url); this.message.set('Link copiato: incollalo in Safari.'); }
    catch { this.message.set(url); }
  }
}
