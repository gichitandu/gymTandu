import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth';
import { exportBackup, importBackup } from './backup';
import { DataSet } from '../models/domain';
import { defaultExercises, defaultGroups } from '../core/default-catalog';

export type ArchiveSyncState = 'local' | 'syncing' | 'saved' | 'offline' | 'conflict';
interface SyncMeta { revision: number; fingerprint: string; pending: boolean; blocked?: boolean }
interface PendingArchive { data: DataSet; generation: number }
interface ArchiveHead { revision: number; backup: string | null; updatedAt?: number | null }

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function archiveFingerprint(backup: string): Promise<string> {
  const data = JSON.parse(backup).data;
  for (const table of Object.values(data) as any[][]) if (Array.isArray(table)) table.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  // The account's current permission is runtime identity, not a personal edit.
  for (const profile of data.profiles || []) delete profile.role;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(data)));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function exerciseSignature(exercise: DataSet['exercises'][number]) {
  const { createdAt, image, ...fields } = exercise;
  return JSON.stringify(canonical({ ...fields, image: image ? { size: image.size, type: image.type } : undefined }));
}
export function archiveSummary(data: DataSet) {
  const known = new Map(defaultExercises.map(exercise => [exercise.id, exerciseSignature(exercise)]));
  return { plans: data.plans.length, plannedExercises: data.planExercises.length,
    personalExercises: data.exercises.filter(exercise => known.get(exercise.id) !== exerciseSignature(exercise)).length,
    workouts: data.workouts.length, meals: data.meals.length };
}
export function archiveHasContent(data: DataSet): boolean {
  const counts = archiveSummary(data);
  if (Object.values(counts).some(Boolean) || data.days.length || data.sets.length || data.scheduledWorkouts.length || data.measurements.length || data.exercisePreferences.length || data.workoutUi.length) return true;
  if (data.profiles.some(profile => profile.name !== 'Atleta' || profile.photo || profile.bodyWeight || profile.height || profile.birthDate || profile.goal)) return true;
  const groups = new Map(defaultGroups.map(group => [group.id, group.name]));
  if (data.muscleGroups.some(group => groups.get(group.id) !== group.name)) return true;
  return data.settings.some(settings => settings.theme !== 'dark' || settings.unit !== 'kg' || settings.prefill || settings.goals || settings.externalTimerEnabled === false);
}

@Injectable({ providedIn: 'root' })
export class ArchiveSyncService {
  private auth = inject(AuthService, { optional: true });
  readonly status = signal<ArchiveSyncState>('local');
  readonly message = signal('');
  readonly lastSaved = signal<number | null>(null);
  readonly revision = signal(0);
  readonly remoteSummary = signal<ReturnType<typeof archiveSummary> | null>(null);
  private archive = '';
  private scope: 'device' | 'account' | undefined;
  private meta?: SyncMeta;
  private knownHead = false;
  private latest?: DataSet;
  private pending?: PendingArchive;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private opening?: Promise<DataSet>;
  private generation = 0;
  private controller?: AbortController;
  private downloaded?: { scope: 'device'|'account'; revision:number; fingerprint:string; updatedAt:number|null };
  // Start pending work while iOS still gives the page execution time. This is
  // best effort: IndexedDB and the pending marker remain the recovery path if
  // the operating system suspends the network request.
  private readonly pageHide = () => { void this.flush(); };
  private readonly visibility = () => { if(document.visibilityState==='hidden')void this.flush(); };
  private readonly online = () => {
    if (!this.latest || !this.scope || this.status() === 'conflict') return;
    const key = this.archive, local = this.latest;
    void this.open(key, local, false).then(() => this.flush());
  };

  constructor() {
    if (typeof window !== 'undefined') { window.addEventListener('online', this.online);window.addEventListener('pagehide',this.pageHide); }
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility);
  }
  private storageKey() { return 'gymtrack-server-copy-v1:' + this.archive; }
  private readMeta(): SyncMeta | undefined {
    try { const meta = JSON.parse(localStorage.getItem(this.storageKey()) || 'null');
      if (Number.isSafeInteger(meta?.revision) && meta.revision >= 0 && typeof meta.fingerprint === 'string' && typeof meta.pending === 'boolean') return meta;
    } catch {} return undefined;
  }
  private saveMeta() { if (this.meta) try { localStorage.setItem(this.storageKey(), JSON.stringify(this.meta)); } catch {} }
  private identify(archive: string) {
    const user = this.auth?.user();
    if (!user || archive !== (user.owner ? 'gymtrack-v1' : 'gymtrack-user-' + user.id)) return undefined;
    return user.id === 'device-local' ? 'device' as const : 'account' as const;
  }
  private async request(method = 'GET', body?: string, scope = this.scope): Promise<Pick<Response,'ok'|'status'|'json'>> {
    const controller = new AbortController();this.controller = controller;
    const timer = setTimeout(() => controller.abort(), method==='POST'?60000:15000);
    try {
      const response=await fetch('/api/archive?scope=' + scope, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'If-Match': String(this.revision()) }, body });
      // Keep the timeout active until the backup body is received as well.
      const value=await response.json().catch(()=>undefined);
      return {ok:response.ok,status:response.status,json:async()=>value};
    } finally { clearTimeout(timer);if (this.controller === controller) this.controller = undefined; }
  }
  private offline(error?: unknown) {
    this.status.set('offline');
    this.message.set('Modifiche conservate su questo dispositivo. Copia server da completare quando la connessione e l’accesso sono disponibili.');
    if (this.meta) { this.meta.pending = !!this.pending || this.meta.pending;this.saveMeta(); }
  }
  private conflict(markPending = true) {
    this.status.set('conflict');
    this.message.set('Sul dispositivo e sul server ci sono copie diverse. Entrambe sono conservate: scegli quale ripristinare prima di continuare la copia automatica.');
    if (this.meta) { this.meta.blocked = true;if(markPending)this.meta.pending = true;this.saveMeta(); }
  }

  async open(archive: string, local: DataSet, allowRestore = true): Promise<DataSet> {
    clearTimeout(this.timer);this.controller?.abort();
    const generation = ++this.generation;
    this.archive = archive;this.scope = this.identify(archive);this.latest = structuredClone(local);
    this.meta = this.readMeta();this.pending = undefined;this.knownHead = false;
    this.revision.set(this.meta?.revision || 0);this.remoteSummary.set(null);
    if (!this.scope) { this.status.set('local');this.message.set('Archivio conservato su questo dispositivo.');return local; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (archiveHasContent(local) || this.meta?.pending) this.pending = { data: structuredClone(local), generation };
      this.offline();return local;
    }
    const opening = this.openRemote(local, generation, allowRestore);
    this.opening = opening;
    try { return await opening; } finally { if (this.opening === opening) this.opening = undefined; }
  }
  private async openRemote(local: DataSet, generation: number, allowRestore: boolean): Promise<DataSet> {
    this.status.set('syncing');this.message.set('Controllo della copia server…');
    try {
      const response = await this.request();
      if (!response.ok) throw Error('Copia server non disponibile');
      const head = await response.json() as ArchiveHead;
      if (!Number.isSafeInteger(head.revision) || head.revision < 0 || !(head.backup === null || typeof head.backup === 'string')) throw Error('Copia server non valida');
      const backup = await exportBackup(local), fingerprint = await archiveFingerprint(backup);
      const remote = head.backup ? await importBackup(head.backup) : undefined;
      const remoteFingerprint = head.backup ? await archiveFingerprint(head.backup) : '';
      if (generation !== this.generation) return local;
      this.knownHead = true;this.revision.set(head.revision);this.lastSaved.set(head.updatedAt ?? null);
      if (remote) this.remoteSummary.set(archiveSummary(remote));
      const previous = this.meta;
      if (!remote) {
        this.meta = { revision: head.revision, fingerprint: '', pending: archiveHasContent(local) || !!previous?.pending };
        this.saveMeta();
        if (this.meta.pending) this.changed(local);else { this.status.set('local');this.message.set('La copia server si attiva al primo salvataggio.'); }
        return local;
      }
      if (fingerprint === remoteFingerprint) {
        this.meta = { revision: head.revision, fingerprint, pending: false };this.saveMeta();this.saved(head.updatedAt);return local;
      }
      // A freshly installed PWA may have created only an untouched seed copy.
      // An existing Safari archive with real plans can safely populate that head.
      if (!previous && !archiveHasContent(remote) && archiveHasContent(local)) {
        this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: true };
        this.changed(local);return local;
      }
      const cleanBaseline = previous && !previous.pending && fingerprint === previous.fingerprint;
      if ((!archiveHasContent(local) && !previous?.pending) || cleanBaseline) {
        if (!allowRestore) {
          this.meta = previous ? { ...previous, blocked: true } : { revision: head.revision, fingerprint: remoteFingerprint, pending: false, blocked: true };
          this.conflict(false);return local;
        }
        this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: false };this.saveMeta();
        this.latest = structuredClone(remote);this.saved(head.updatedAt);return remote;
      }
      if (previous && !previous.blocked && previous.revision === head.revision && previous.fingerprint === remoteFingerprint) {
        this.meta = { ...previous, pending: true };this.changed(local);return local;
      }
      this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: true, blocked: true };
      this.pending = { data: structuredClone(local), generation };this.conflict();return local;
    } catch (error) {
      if (generation === this.generation) {
        if (archiveHasContent(local) || this.meta?.pending) this.pending = { data: structuredClone(local), generation };
        this.offline(error);
      }
      return local;
    }
  }
  private saved(updatedAt?: number | null) {
    this.status.set('saved');this.lastSaved.set(updatedAt ?? Date.now());
    this.message.set('Copia server aggiornata.');
  }
  changed(data: DataSet) {
    if (!this.archive || !this.scope) return;
    if (!archiveHasContent(data) && !this.running && !this.meta?.fingerprint && !this.meta?.blocked) {
      clearTimeout(this.timer);this.latest=structuredClone(data);this.pending=undefined;
      if(this.meta){this.meta.pending=false;this.saveMeta();}
      this.status.set('local');this.message.set('La copia server si attiva al primo salvataggio.');return;
    }
    this.latest = structuredClone(data);this.pending = { data: structuredClone(data), generation: this.generation };
    if (this.meta) { this.meta.pending = true;this.saveMeta(); }
    if (this.status() === 'conflict' || this.meta?.blocked) { this.conflict();return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.offline();return; }
    this.status.set('syncing');this.message.set('Modifiche salvate sul dispositivo; copia server in corso…');
    clearTimeout(this.timer);this.timer = setTimeout(() => { void this.flush(); }, 1000);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.opening) await this.opening;
    if (!this.scope) return true;
    if (this.running) return this.running;
    if (this.status() === 'conflict' || this.meta?.blocked) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.offline();return false; }
    if (!this.knownHead) {
      if (!this.latest) return false;
      await this.open(this.archive, this.latest, false);
      if (!this.knownHead || this.status() === 'conflict') return false;
    }
    const run = this.uploadPending();this.running = run;
    try { return await run; } finally { if (this.running === run) this.running = undefined; }
  }
  private async uploadPending(): Promise<boolean> {
    while (this.pending) {
      const job = this.pending;this.pending = undefined;
      try {
        const backup = await exportBackup(job.data), fingerprint = await archiveFingerprint(backup);
        if (job.generation !== this.generation) return false;
        if (this.meta?.fingerprint === fingerprint) {
          this.meta.pending = !!this.pending;this.saveMeta();if (!this.pending) this.saved(this.lastSaved());continue;
        }
        const response = await this.request('POST', backup);
        if (job.generation !== this.generation) return false;
        if (response.status === 409) {
          // An acknowledgement can be lost after a successful server commit.
          // Reconcile only an identical snapshot; never retry over a different head.
          this.pending ||= job;this.conflict();
          const check = await this.request();
          if (check.ok) {
            const head = await check.json() as ArchiveHead;
            if (head.backup && await archiveFingerprint(head.backup) === fingerprint) {
              if(this.pending===job)this.pending=undefined;
              this.revision.set(head.revision);this.meta={revision:head.revision,fingerprint,pending:!!this.pending};this.saveMeta();
              this.remoteSummary.set(archiveSummary(job.data));this.lastSaved.set(head.updatedAt??Date.now());
              if(!this.pending)this.saved(head.updatedAt);
              continue;
            }
          }
          return false;
        }
        if (!response.ok) throw Error('Copia server non salvata');
        const result = await response.json() as ArchiveHead;
        if (!Number.isSafeInteger(result.revision) || result.revision <= this.revision()) throw Error('Conferma server non valida');
        this.revision.set(result.revision);
        this.meta = { revision: result.revision, fingerprint, pending: !!this.pending };this.saveMeta();
        this.remoteSummary.set(archiveSummary(job.data));this.lastSaved.set(result.updatedAt ?? Date.now());
        if (!this.pending) this.saved(result.updatedAt);
      } catch (error) { if (job.generation === this.generation) { this.pending ||= job;this.offline(error); }return false; }
    }
    return true;
  }
  currentScope(){return this.scope;}
  canRecoverDevice(){return this.scope==='account'&&!!this.auth?.user()?.owner;}
  async readRemote(sourceScope = this.scope): Promise<DataSet | undefined> {
    if (!this.scope || (typeof navigator !== 'undefined' && !navigator.onLine)) { this.offline();return; }
    if(!sourceScope||sourceScope!==this.scope&&!(sourceScope==='device'&&this.canRecoverDevice()))return;
    try {
      const response = await this.request('GET',undefined,sourceScope);if (!response.ok) throw Error();
      const head = await response.json() as ArchiveHead;
      if (!head.backup) { this.message.set('Non è ancora presente una copia server per questo archivio.');return; }
      if(!Number.isSafeInteger(head.revision)||head.revision<1)throw Error();
      const data = await importBackup(head.backup);
      this.downloaded={scope:sourceScope,revision:head.revision,fingerprint:await archiveFingerprint(await exportBackup(data)),updatedAt:head.updatedAt??null};
      if(sourceScope===this.scope)this.remoteSummary.set(archiveSummary(data));
      return data;
    } catch { this.offline();return; }
  }
  /** Call only after the downloaded dataset has been safely committed locally. */
  async acceptRemote(data: DataSet, sourceScope = this.scope) {
    if(sourceScope!==this.scope)return;
    const fingerprint = await archiveFingerprint(await exportBackup(data));
    if(!this.downloaded||this.downloaded.scope!==sourceScope||this.downloaded.fingerprint!==fingerprint)throw Error('La copia server da recuperare è cambiata. Scaricala di nuovo prima di confermare.');
    clearTimeout(this.timer);this.pending = undefined;this.latest = structuredClone(data);
    this.revision.set(this.downloaded.revision);this.knownHead=true;this.lastSaved.set(this.downloaded.updatedAt);
    this.meta = { revision: this.revision(), fingerprint, pending: false };this.saveMeta();this.saved(this.lastSaved());
  }
  ngOnDestroy() {
    clearTimeout(this.timer);this.controller?.abort();
    if (typeof window !== 'undefined') { window.removeEventListener('online', this.online);window.removeEventListener('pagehide',this.pageHide); }
    if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);
  }
}
