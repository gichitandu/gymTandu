import { ErrorHandler, Injectable, Injector, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, NavigationEnd, Router } from '@angular/router';
import Dexie, { Table } from 'dexie';
import { AuthService } from './auth';
import { AppReleaseService } from './app-release';
import { setFeedbackErrorHook } from './feedback';

// Registro sviluppo: per ora raccoglie solo gli errori del Super Admin. La coda vive in un
// database separato del dispositivo, mai nell'archivio personale, e contiene solo testo ripulito.
export type DevLogKind = 'error' | 'bug' | 'improvement' | 'idea';
export type DevLogStatus = 'open' | 'in_progress' | 'fixed' | 'resolved' | 'dismissed';
export type DevLogPriority = 'low' | 'medium' | 'high';
export type DevLogSource = 'client' | 'feedback';
export interface DevLogVerification { ready: boolean; newBuilds: number; appStarts: number; routeVisits: number | null; reason: string }
export interface DevLogEvent { at: number; actor: 'user' | 'claude' | 'system'; kind: string; note: string }
export interface DevLogOccurrence { at: number; build: string; route: string | null; device: string | null; message: string; stack: string | null }
export interface DevLogItem {
  id: number; code: string; kind: DevLogKind; source: 'auto' | 'manual' | 'claude'; title: string; details: string; route: string | null;
  status: DevLogStatus; priority: DevLogPriority; regression: boolean; occurrences: number; firstSeen: number | null; lastSeen: number | null;
  lastBuild: string | null; fixedAt: number | null; fixSummary: string | null; fixCommit: string | null; resolvedAt: number | null;
  createdAt: number; updatedAt: number; verification?: DevLogVerification | null; events?: DevLogEvent[]; recent?: DevLogOccurrence[];
}
interface QueuedReport { id?: number; source: DevLogSource; message: string; stack: string; route: string; at: number }

export const DEV_LOG_QUEUE_LIMIT = 50;
export const DEV_LOG_DEDUP_MS = 60_000;
export const DEV_LOG_FLUSH_MS = 30_000;

/** Stessa pulizia del Worker, applicata già prima di salvare sul dispositivo. */
export function devLogScrub(value: unknown, limit: number) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[dati]')
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b(bearer|token|password|secret|cookie|authorization|setupcode)(\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=[nascosto]')
    .replace(/([?&][^=\s&#]+=)[^&\s#]+/g, '$1[x]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[id]')
    .slice(0, limit);
}
/** Messaggio e stack da qualsiasi valore lanciato (Error, stringa, motivo di una promessa). */
export function devLogMessage(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message, stack: error.stack || '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') return { message: (error as { message: string }).message, stack: '' };
  return { message: error === undefined ? '' : String(error), stack: '' };
}
/** Pagina come definita nelle route (`piano/:id`), mai con gli id reali. */
export function devLogRoutePattern(root: ActivatedRouteSnapshot | null) {
  const parts: string[] = [];
  for (let node = root; node; node = node.firstChild) if (node.routeConfig?.path) parts.push(node.routeConfig.path);
  return '/' + parts.join('/');
}

class DevLogDatabase extends Dexie {
  queue!: Table<QueuedReport, number>;
  constructor() { super('gymtrack-devlog-v1'); this.version(1).stores({ queue: '++id,at' }); }
}

@Injectable({ providedIn: 'root' })
export class DevLogReporter {
  private auth = inject(AuthService);
  private router = inject(Router);
  private injector = inject(Injector);
  private db?: DevLogDatabase;
  private started = false;
  private flushing = false;
  private route = '/';
  private recent = new Map<string, number>();
  private visits = new Map<string, number>();
  private appStarts = 1;
  private build: string | null = null;
  readonly pending = signal(0);

  start() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('error', event => this.capture((event as ErrorEvent).error ?? (event as ErrorEvent).message, 'client'));
    window.addEventListener('unhandledrejection', event => this.capture((event as PromiseRejectionEvent).reason, 'client'));
    window.addEventListener('online', () => void this.flush());
    setFeedbackErrorHook(message => this.capture(message, 'feedback'));
    this.router.events.subscribe(event => {
      if (!(event instanceof NavigationEnd)) return;
      this.route = devLogRoutePattern(this.router.routerState.snapshot.root);
      this.visits.set(this.route, (this.visits.get(this.route) || 0) + 1);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void this.flush(); });
    setInterval(() => void this.flush(), DEV_LOG_FLUSH_MS);
    setTimeout(() => void this.flush(), 5000);
  }

  private superAdmin() { return this.auth.user()?.role === 'SuperAdmin'; }

  capture(error: unknown, source: DevLogSource) {
    try {
      // Prima che l'account sia noto l'errore resta in coda; viene scartato se non è del Super Admin.
      if (!this.started || (!this.superAdmin() && !this.auth.loading())) return;
      const { message, stack } = devLogMessage(error);
      const text = devLogScrub(message, 300).trim();
      if (!text) return;
      const key = source + '|' + this.route + '|' + text.slice(0, 200), now = Date.now();
      if (now - (this.recent.get(key) || 0) < DEV_LOG_DEDUP_MS) return;
      if (this.recent.size > 200) this.recent.clear();
      this.recent.set(key, now);
      void this.enqueue({ source, message: text, stack: devLogScrub(stack, 2000), route: this.route, at: now });
    } catch { /* il registro non deve mai generare altri errori */ }
  }

  private database() { return this.db ??= new DevLogDatabase(); }

  private async enqueue(report: QueuedReport) {
    try {
      const db = this.database();
      await db.queue.add(report);
      const count = await db.queue.count();
      if (count > DEV_LOG_QUEUE_LIMIT) await db.queue.bulkDelete(await db.queue.orderBy('at').limit(count - DEV_LOG_QUEUE_LIMIT).primaryKeys());
      this.pending.set(Math.min(count, DEV_LOG_QUEUE_LIMIT));
    } catch { /* senza IndexedDB l'errore si perde, l'app continua */ }
  }

  private async currentBuild() {
    let running: string | null = null;
    try { running = this.injector.get(AppReleaseService).currentBuild(); } catch { /* servizio aggiornamenti assente */ }
    if (running) return running;
    if (this.build) return this.build;
    try {
      const response = await fetch('/app-build.json', { cache: 'no-store' });
      const id = (await response.json())?.buildId;
      if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) return this.build = id;
    } catch { /* in sviluppo il file non esiste */ }
    return isDevMode() ? 'development' : null;
  }

  async flush() {
    if (this.flushing || !this.started) return;
    if (!this.superAdmin()) {
      if (!this.auth.loading()) { try { await this.database().queue.clear(); this.pending.set(0); } catch { /* niente da fare */ } }
      return;
    }
    if (this.auth.offlineMode() || !navigator.onLine) return;
    this.flushing = true;
    try {
      const build = await this.currentBuild();
      if (!build) return;
      const db = this.database();
      const batch = await db.queue.orderBy('at').limit(20).toArray();
      const visits = new Map(this.visits), appStarts = this.appStarts;
      if (!batch.length && !appStarts && !visits.size) return;
      const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
      await this.auth.request('dev-log/report', {
        reports: batch.map(({ source, message, stack, route, at }) => ({ source, message, stack, route, at })),
        usage: { build, appStarts, routes: Object.fromEntries(visits), standalone },
      });
      this.appStarts = 0;
      for (const [route, count] of visits) { const left = (this.visits.get(route) || 0) - count; if (left > 0) this.visits.set(route, left); else this.visits.delete(route); }
      await db.queue.bulkDelete(batch.map(report => report.id!));
      this.pending.set(await db.queue.count());
    } catch { /* riprova al prossimo invio */ } finally { this.flushing = false; }
  }
}

/** Errori intercettati da Angular: restano in console come prima e vanno anche nel registro. */
@Injectable()
export class DevLogErrorHandler implements ErrorHandler {
  private injector = inject(Injector);
  handleError(error: unknown) {
    console.error(error);
    try { this.injector.get(DevLogReporter).capture(error, 'client'); } catch { /* registro non disponibile */ }
  }
}

/** Il registro si apre solo per il Super Admin online; il Worker lo verifica di nuovo. */
export const devLogGuard: CanActivateFn = async () => {
  const auth = inject(AuthService), router = inject(Router);
  if (auth.loading()) await auth.refresh();
  return auth.user()?.role === 'SuperAdmin' && !auth.viewAsClient() && !auth.offlineMode() || router.createUrlTree(['/profilo']);
};
