import { Component, computed, inject, input, signal } from '@angular/core';
import { PwaService } from '../services/pwa';
import { IconComponent } from './icon.component';

const DISMISS_KEY = 'gt-install-banner-dismissed';

function readDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

/**
 * Pulsante «Installa app».
 * - Chrome/Edge (Windows, macOS, Linux, Android): usa l'evento beforeinstallprompt.
 * - iOS/Safari non espone quell'evento: mostra le istruzioni Condividi → Home.
 * - `banner`: versione compatta, visibile solo se l'installazione è davvero possibile.
 */
@Component({
  selector: 'gt-install-app', standalone: true, imports: [IconComponent],
  template: `
@if (banner()) {
  @if (!pwa.installed() && pwa.event() && !dismissed()) {
    <div class="ia-banner" role="region" aria-label="Installa GymTrack">
      <gt-icon name="download" />
      <span>Installa GymTrack come app sul dispositivo</span>
      <button type="button" class="primary" (click)="install()" [disabled]="busy()">Installa</button>
      <button type="button" class="ghost" (click)="dismiss()" aria-label="Nascondi">✕</button>
    </div>
  }
} @else {
  @if (pwa.installed()) {
    <span class="pill green">App installata</span>
  } @else if (pwa.event()) {
    <button type="button" class="primary" (click)="install()" [disabled]="busy()"><gt-icon name="download" /> Scarica / installa l’app</button>
  } @else if (ios()) {
    <p class="subtle">Su iPhone e iPad apri GymTrack in Safari, tocca <strong>Condividi</strong> e scegli <strong>Aggiungi alla schermata Home</strong>.</p>
  } @else {
    <p class="subtle">Se il pulsante non compare, usa il menu del browser: <strong>Installa GymTrack</strong> (Chrome/Edge, icona nella barra degli indirizzi). Firefox e alcuni browser non supportano l’installazione.</p>
  }
  @if (message()) { <p class="subtle" role="status">{{message()}}</p> }
}`,
  styles: [`
:host{display:block}
.ia-banner{display:flex;align-items:center;gap:10px;margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:14px;font-size:13px}
.ia-banner span{flex:1;min-width:0}
.ia-banner button{min-height:40px}
`]
})
export class InstallAppComponent {
  readonly banner = input(false);
  readonly pwa = inject(PwaService);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly dismissed = signal(readDismissed());
  readonly ios = computed(() => {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  });

  async install() {
    if (this.busy()) return;
    this.busy.set(true); this.message.set('');
    try { await this.pwa.install(); }
    catch { this.message.set('Installazione non riuscita. Riprova dal menu del browser.'); }
    finally { this.busy.set(false); }
  }

  dismiss() {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* preferenza solo di comodità */ }
  }
}
