import { effect, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { AppFeaturesService } from '../services/app-features';

export type HubLaunchMode = 'ask' | 'last' | 'gymtrack';
export type HubApp = 'gymtrack' | 'hub' | 'auto';
/** Le app raggiungibili dal selettore (GymTrack per tutti, le altre se abilitate dal Super Admin). */
export const HUB_APPS: { id: HubApp; path: string; name: string; text: string }[] = [
  { id: 'gymtrack', path: '/', name: 'GymTrack', text: 'Allenamenti, pasti e progressi' },
  { id: 'hub', path: '/hub', name: 'GT Hub', text: 'Agenda, spese, Dividi e note' },
  { id: 'auto', path: '/auto', name: 'GT Garage', text: 'La tua auto, carburante e costi' },
];
interface HubLaunch { mode: HubLaunchMode; last: HubApp }
const KEY = 'gymtrack-app-launch-v1:';

type AppFlags = Pick<AppFeaturesService, 'hubEnabled' | 'garageEnabled'>;
/** Chi può aprire GT Hub o GT Garage: il Super Admin sempre, gli altri se l'app è abilitata per tutti.
 *  Il Worker lo verifica di nuovo; senza rete le due app restano chiuse. */
export function appAllowed(auth: AuthService, features: AppFlags, app: 'hub' | 'auto') {
  const user = auth.user();
  if (!user || auth.offlineMode()) return false;
  if (user.role === 'SuperAdmin' && !auth.viewAsClient()) return true;
  return app === 'hub' ? features.hubEnabled() : features.garageEnabled();
}
/** Almeno una delle due app oltre a GymTrack è disponibile. */
export function hubAllowed(auth: AuthService, features: AppFlags) { return appAllowed(auth, features, 'hub') || appAllowed(auth, features, 'auto'); }
/** L'app è visibile solo perché l'utente è Super Admin (non ancora aperta a tutti). */
export function adminOnly(features: AppFlags, app: 'hub' | 'auto') { return !(app === 'hub' ? features.hubEnabled() : features.garageEnabled()); }

/** Preferenza di apertura dopo l'accesso, per account e dispositivo. */
@Injectable({ providedIn: 'root' })
export class HubLaunchService {
  private auth = inject(AuthService);
  private features = inject(AppFeaturesService);
  readonly version = signal(0);
  private opened = new Set<string>();
  /** Account che in questa apertura hanno già scelto l'app (scelta, Hub o selettore). */
  private chosen = new Set<string>();
  constructor() { effect(() => { if (!this.auth.user()) { this.opened.clear(); this.chosen.clear(); } }); }
  /** La prima apertura dopo l'accesso va gestita una sola volta, anche se la cornice di GymTrack viene ricreata. */
  claimFirstOpen(account: string) { if (this.opened.has(account)) return false; this.opened.add(account); return true; }
  private account() { return this.auth.user()?.id ?? ''; }
  private key() { return KEY + this.account(); }
  read(): HubLaunch {
    this.version();
    try {
      const value = JSON.parse(localStorage.getItem(this.key()) || 'null');
      if (value && ['ask', 'last', 'gymtrack'].includes(value.mode) && ['gymtrack', 'hub', 'auto'].includes(value.last)) return value;
    } catch { /* preferenza assente o illeggibile */ }
    return { mode: 'ask', last: 'gymtrack' };
  }
  private write(value: HubLaunch) { try { localStorage.setItem(this.key(), JSON.stringify(value)); } catch { /* best effort */ } this.version.update(v => v + 1); }
  setMode(mode: HubLaunchMode) { this.write({ ...this.read(), mode }); }
  remember(app: HubApp) { this.chosen.add(this.account()); const current = this.read(); if (current.last !== app) this.write({ ...current, last: app }); }
  /** Dove andare all'apertura dell'app: null = resta in GymTrack. */
  startTarget(): string | null {
    // Se l'app si è riaperta già sulla scelta o nel Hub (ricarica, aggiornamento),
    // la scelta è già stata fatta: GymTrack non deve rimandare alla schermata di scelta.
    if (!hubAllowed(this.auth, this.features) || this.chosen.has(this.account())) return null;
    const pref = this.read();
    if (pref.mode === 'ask') return '/scegli-app';
    if (pref.mode === 'last' && pref.last !== 'gymtrack' && appAllowed(this.auth, this.features, pref.last)) return pref.last === 'auto' ? '/auto' : '/hub';
    return null;
  }
}

function appGuard(app: 'hub' | 'auto' | 'any'): CanActivateFn {
  return async () => {
    const auth = inject(AuthService), features = inject(AppFeaturesService), router = inject(Router);
    // All'avvio (es. tocco su una notifica) si attende la verifica dell'account, al massimo 6 secondi.
    for (let i = 0; i < 120 && auth.loading() && !auth.user(); i++) await new Promise(resolve => setTimeout(resolve, 50));
    if (auth.user()?.role !== 'SuperAdmin' || auth.viewAsClient()) await features.ensureLoaded();
    const ok = app === 'any' ? hubAllowed(auth, features) : appAllowed(auth, features, app);
    return ok ? true : router.parseUrl('/');
  };
}
/** GT Hub (agenda, spese, Dividi, note). */
export const hubGuard: CanActivateFn = appGuard('hub');
/** GT Garage (auto, rifornimenti, statistiche). */
export const garageGuard: CanActivateFn = appGuard('auto');
/** Schermata di scelta: basta una delle due app. */
export const appChooserGuard: CanActivateFn = appGuard('any');

/** Pagine mostrate fuori dalla cornice di GymTrack (Hub, Garage e scelta dell'app). */
export function isHubUrl(url: string) { return /^\/(hub|auto|scegli-app)(?=$|[/?#])/.test(url); }

/** Selettore delle app aperto dall'icona del profilo dentro GymTrack. */
@Injectable({ providedIn: 'root' })
export class AppSwitcherService {
  private auth = inject(AuthService);
  private features = inject(AppFeaturesService);
  readonly open = signal(false);
  /** Solo chi può aprire le altre app vede il selettore. */
  available() { return hubAllowed(this.auth, this.features); }
  /** App mostrate nel selettore: GymTrack più quelle consentite. */
  apps() { return HUB_APPS.filter(app => app.id === 'gymtrack' || appAllowed(this.auth, this.features, app.id)); }
  allowed(app: 'hub' | 'auto') { return appAllowed(this.auth, this.features, app); }
  adminOnly(app: 'hub' | 'auto') { return adminOnly(this.features, app); }
}
