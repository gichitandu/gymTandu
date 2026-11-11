import { effect, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';

export type HubLaunchMode = 'ask' | 'last' | 'gymtrack';
export type HubApp = 'gymtrack' | 'hub';
interface HubLaunch { mode: HubLaunchMode; last: HubApp }
const KEY = 'gymtrack-app-launch-v1:';

/** Chi può aprire GT Hub: per ora solo il Super Admin (il Worker lo verifica di nuovo). */
export function hubAllowed(auth: AuthService) {
  const user = auth.user();
  return !!user && user.role === 'SuperAdmin' && !auth.viewAsClient() && !auth.offlineMode();
}

/** Preferenza di apertura dopo l'accesso, per account e dispositivo. */
@Injectable({ providedIn: 'root' })
export class HubLaunchService {
  private auth = inject(AuthService);
  readonly version = signal(0);
  private opened = new Set<string>();
  constructor() { effect(() => { if (!this.auth.user()) this.opened.clear(); }); }
  /** La prima apertura dopo l'accesso va gestita una sola volta, anche se la cornice di GymTrack viene ricreata. */
  claimFirstOpen(account: string) { if (this.opened.has(account)) return false; this.opened.add(account); return true; }
  private key() { return KEY + (this.auth.user()?.id ?? ''); }
  read(): HubLaunch {
    this.version();
    try {
      const value = JSON.parse(localStorage.getItem(this.key()) || 'null');
      if (value && ['ask', 'last', 'gymtrack'].includes(value.mode) && ['gymtrack', 'hub'].includes(value.last)) return value;
    } catch { /* preferenza assente o illeggibile */ }
    return { mode: 'ask', last: 'gymtrack' };
  }
  private write(value: HubLaunch) { try { localStorage.setItem(this.key(), JSON.stringify(value)); } catch { /* best effort */ } this.version.update(v => v + 1); }
  setMode(mode: HubLaunchMode) { this.write({ ...this.read(), mode }); }
  remember(app: HubApp) { const current = this.read(); if (current.last !== app) this.write({ ...current, last: app }); }
  /** Dove andare all'apertura dell'app: null = resta in GymTrack. */
  startTarget(): string | null {
    if (!hubAllowed(this.auth)) return null;
    const pref = this.read();
    if (pref.mode === 'ask') return '/scegli-app';
    if (pref.mode === 'last' && pref.last === 'hub') return '/hub';
    return null;
  }
}

export const hubGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  // All'avvio (es. tocco su una notifica) si attende la verifica dell'account, al massimo 6 secondi.
  for (let i = 0; i < 120 && auth.loading() && !auth.user(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  return hubAllowed(auth) ? true : router.parseUrl('/');
};

/** Pagine mostrate fuori dalla cornice di GymTrack (Hub e scelta dell'app). */
export function isHubUrl(url: string) { return /^\/(hub|scegli-app)(?=$|[/?#])/.test(url); }
