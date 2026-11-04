import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth';
import { exportBackup, importBackup } from './backup';
import { DataSet } from '../models/domain';
import { defaultExercises, defaultGroups } from '../core/default-catalog';
import { FormDraftService } from './form-drafts';

export type ArchiveSyncState = 'local' | 'syncing' | 'saved' | 'offline' | 'conflict';
interface SyncMeta { revision: number; fingerprint: string; pending: boolean; blocked?: boolean }
interface PendingArchive { data: DataSet; generation: number }
interface ArchiveHead { revision: number; backup: string | null; updatedAt?: number | null }
type AcceptStartupRestore = (remote: DataSet) => Promise<boolean>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function archiveFingerprint(backup: string, ignoreCatalogReceipt = false): Promise<string> {
  const data = JSON.parse(backup).data;
  for (const table of Object.values(data) as any[][]) if (Array.isArray(table)) table.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  // The account's current permission is runtime identity, not a personal edit.
  for (const profile of data.profiles || []) delete profile.role;
  if(ignoreCatalogReceipt)for(const settings of data.settings||[])delete settings.catalogBaseline;
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
    workouts: data.workouts.length, meals: data.meals.length, wellness: data.wellnessLogs.length };
}
export function archiveHasContent(data: DataSet): boolean {
  const counts = archiveSummary(data);
  if (Object.values(counts).some(Boolean) || data.wellnessLogs.length || data.days.length || data.sets.length || data.scheduledWorkouts.length || data.measurements.length || data.exercisePreferences.length || data.workoutUi.length) return true;
  if (data.profiles.some(profile => profile.name !== 'Atleta' || profile.photo || profile.bodyWeight || profile.height || profile.birthDate || profile.goal)) return true;
  const groups = new Map(defaultGroups.map(group => [group.id, group.name]));
  if (data.muscleGroups.some(group => groups.get(group.id) !== group.name)) return true;
  return data.settings.some(settings => settings.theme !== 'dark' || settings.unit !== 'kg' || settings.prefill || settings.reusePreviousWeek === false || settings.goals || settings.externalTimerEnabled === false);
}

@Injectable({ providedIn: 'root' })
export class ArchiveSyncService {
  private auth = inject(AuthService, { optional: true });
  private drafts=inject(FormDraftService,{optional:true});
  readonly status = signal<ArchiveSyncState>('local');
  readonly message = signal('');
  readonly lastSaved = signal<number | null>(null);
  readonly revision = signal(0);
  readonly remoteSummary = signal<ReturnType<typeof archiveSummary> | null>(null);
  readonly lastErrorCode=signal('');
  readonly lastErrorMessage=signal('');
  private archive = '';
  private scope: 'device' | 'account' | undefined;
  private meta?: SyncMeta;
  private knownHead = false;
  private latest?: DataSet;
  private pending?: PendingArchive;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private uploading = false;
  private opening?: Promise<DataSet>;
  private generation = 0;
  private localChanges = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryAttempt = 0;
  private destroyed = false;
  private controller?: AbortController;
  private downloaded?: { scope: 'device'|'account'; revision:number; fingerprint:string; updatedAt:number|null };
  // Start pending work while iOS still gives the page execution time. This is
  // best effort: IndexedDB and the pending marker remain the recovery path if
  // the operating system suspends the network request.
  private readonly pageHide = () => { void this.flush(); };
  private readonly visibility = () => { if(document.visibilityState==='hidden')void this.flush();else this.resumePending(); };
  private readonly online = () => { this.resumePending(); };
  private readonly pageShow = () => { this.resumePending(); };

  constructor() {
    if (typeof window !== 'undefined') { window.addEventListener('online', this.online);window.addEventListener('pagehide',this.pageHide);window.addEventListener('pageshow',this.pageShow); }
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
    this.scheduleRetry();
  }
  private conflict(markPending = true) {
    clearTimeout(this.retryTimer);this.retryTimer=undefined;
    this.status.set('conflict');
    this.message.set('Sul dispositivo e sul server ci sono copie diverse. Entrambe sono conservate: scegli quale ripristinare prima di continuare la copia automatica.');
    if (this.meta) { this.meta.blocked = true;if(markPending)this.meta.pending = true;this.saveMeta(); }
  }

  private resumePending() {
    if(this.destroyed||!this.scope||!this.latest||this.status()==='conflict'||this.meta?.blocked||typeof navigator!=='undefined'&&!navigator.onLine)return;
    if(!this.pending&&!this.meta?.pending&&this.status()!=='offline')return;
    clearTimeout(this.retryTimer);this.retryTimer=undefined;
    if(this.opening||this.running){this.scheduleRetry();return;}
    void this.flush();
  }
  private scheduleRetry() {
    if(this.destroyed||this.retryTimer||!this.scope||!this.latest||this.status()==='conflict'||this.meta?.blocked||typeof navigator!=='undefined'&&!navigator.onLine)return;
    // A capped backoff avoids spinning on a suspended iPhone request or an
    // expired login. Foreground/online events can retry sooner.
    const delay=Math.min(60000,2000*2**Math.min(this.retryAttempt++,5));
    this.retryTimer=setTimeout(()=>{this.retryTimer=undefined;this.resumePending();},delay);
  }
  async open(archive: string, local: DataSet, allowRestore = true, acceptRestore?: AcceptStartupRestore): Promise<DataSet> {
    clearTimeout(this.timer);this.controller?.abort();
    clearTimeout(this.retryTimer);this.retryTimer=undefined;
    if(archive!==this.archive)this.retryAttempt=0;
    const generation = ++this.generation;
    this.localChanges=0;
    this.archive = archive;this.scope = this.identify(archive);this.latest = structuredClone(local);
    this.meta = this.readMeta();this.pending = undefined;this.knownHead = false;
    this.revision.set(this.meta?.revision || 0);this.remoteSummary.set(null);
    if (!this.scope) { this.status.set('local');this.message.set('Archivio conservato su questo dispositivo.');return local; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (archiveHasContent(local) || this.meta?.pending) this.pending = { data: structuredClone(local), generation };
      this.offline();return local;
    }
    const opening = this.openRemote(local, generation, allowRestore,acceptRestore);
    this.opening = opening;
    try { return await opening; } finally { if (this.opening === opening) this.opening = undefined; }
  }
  private async openRemote(local: DataSet, generation: number, allowRestore: boolean,acceptRestore?:AcceptStartupRestore): Promise<DataSet> {
    const initialLocal=local,previous=this.meta?{...this.meta}:undefined;
    this.status.set('syncing');this.message.set('Controllo della copia server…');
    try {
      const response = await this.request();
      if (!response.ok) throw Error('Copia server non disponibile');
      const head = await response.json() as ArchiveHead;
      if (!Number.isSafeInteger(head.revision) || head.revision < 0 || !(head.backup === null || typeof head.backup === 'string')) throw Error('Copia server non valida');
      const remote = head.backup ? await importBackup(head.backup) : undefined;
      const remoteFingerprint = head.backup ? await archiveFingerprint(head.backup) : '';
      const initialBackup=await exportBackup(initialLocal),initialFingerprint=await archiveFingerprint(initialBackup);
      let initialPersonalFingerprint:string|undefined;
      // A local write can finish while the GET or import is pending. Evaluate
      // the latest committed snapshot rather than the one passed at startup.
      let changes:number,fingerprint:string,personalChanged=false;
      do{
        changes=this.localChanges;if(changes)local=this.latest||local;
        const backup=await exportBackup(local);fingerprint=await archiveFingerprint(backup);
        if(changes){initialPersonalFingerprint||=await archiveFingerprint(initialBackup,true);personalChanged=await archiveFingerprint(backup,true)!==initialPersonalFingerprint;}
      }while(generation===this.generation&&changes!==this.localChanges);
      if (generation !== this.generation) return local;
      this.knownHead = true;this.revision.set(head.revision);this.lastSaved.set(head.updatedAt ?? null);
      if (remote) this.remoteSummary.set(archiveSummary(remote));
      const reset=remote?.settings[0]?.archiveResetId;
      if(remote&&reset&&reset!==local.settings[0]?.archiveResetId){
        // An explicit one-time account reset is authoritative. A stale phone
        // must never merge its old personal archive back over that decision.
        if(!acceptRestore){this.conflict();this.message.set('L’archivio è stato reimpostato su richiesta. Riapri l’app per caricare il nuovo stato.');if(typeof location!=='undefined')location.reload();return local;}
        const accepted=await acceptRestore(remote);
        if(generation!==this.generation)return local;
        if(!accepted){this.conflict();return local;}
        await this.drafts?.discardScope(this.archive);
        if(generation!==this.generation)return local;
        this.localChanges=0;this.latest=structuredClone(remote);this.pending=undefined;
        this.meta={revision:head.revision,fingerprint:remoteFingerprint,pending:false};this.saveMeta();this.saved(head.updatedAt);
        if(typeof location!=='undefined')location.reload();
        return remote;
      }
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
      const cleanBaseline = previous && !previous.pending && (fingerprint === previous.fingerprint || !personalChanged && initialFingerprint === previous.fingerprint);
      if ((!archiveHasContent(local) && !previous?.pending && !personalChanged) || cleanBaseline) {
        if (!allowRestore) {
          this.meta = previous ? { ...previous, blocked: true } : { revision: head.revision, fingerprint: remoteFingerprint, pending: false, blocked: true };
          this.conflict(false);return local;
        }
        const restoreChanges=this.localChanges;
        const accepted=acceptRestore?await acceptRestore(remote):true;
        if(generation!==this.generation)return local;
        if(!accepted){
          this.meta={revision:head.revision,fingerprint:remoteFingerprint,pending:true,blocked:true};
          this.pending={data:structuredClone(this.latest||local),generation};this.conflict();return local;
        }
        if(generation!==this.generation)return local;
        this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: this.localChanges!==restoreChanges };this.saveMeta();
        if(this.localChanges===restoreChanges){this.pending=undefined;this.latest = structuredClone(remote);this.saved(head.updatedAt);}
        else this.changed(this.latest!);
        return remote;
      }
      if (previous && !previous.blocked && previous.revision === head.revision && previous.fingerprint === remoteFingerprint) {
        this.meta = { ...previous, pending: true };this.changed(local);return local;
      }
      this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: true, blocked: true };
      this.pending = { data: structuredClone(local), generation };this.conflict();return local;
    } catch (error) {
      if (generation === this.generation) {
        const latest=this.latest||local;
        if (archiveHasContent(latest) || this.meta?.pending) this.pending = { data: structuredClone(latest), generation };
        this.offline(error);
      }
      return local;
    }
  }
  private saved(updatedAt?: number | null) {
    clearTimeout(this.retryTimer);this.retryTimer=undefined;this.retryAttempt=0;
    this.status.set('saved');this.lastSaved.set(updatedAt ?? Date.now());
    this.message.set('Copia server aggiornata.');
  }
  changed(data: DataSet) {
    if(this.latest?.settings[0]?.archiveResetId&&data.settings[0]?.archiveResetId!==this.latest.settings[0].archiveResetId){this.conflict();this.message.set('Questa copia precede la reimpostazione richiesta. Riapri l’app per usare l’archivio aggiornato.');return;}
    if (this.destroyed || !this.archive || !this.scope) return;
    this.localChanges++;
    if (!archiveHasContent(data) && !this.uploading && !this.meta?.fingerprint && !this.meta?.blocked) {
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
    if(this.running)return this.running;
    const run=this.flushPending();this.running=run;
    try{return await run;}finally{if(this.running===run)this.running=undefined;}
  }
  private async flushPending():Promise<boolean>{
    if (this.opening) await this.opening;
    if (!this.scope) return true;
    if (this.status() === 'conflict' || this.meta?.blocked) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.offline();return false; }
    if (!this.knownHead) {
      if (!this.latest) return false;
      await this.open(this.archive, this.latest, false);
      if (!this.knownHead || this.status() === 'conflict') return false;
    }
    return this.uploadPending();
  }
  private async uploadPending(): Promise<boolean> {
    this.lastErrorCode.set('');this.lastErrorMessage.set('');
    while (this.pending) {
      const job = this.pending;this.pending = undefined;
      this.uploading=true;
      try {
        const backup = await exportBackup(job.data), fingerprint = await archiveFingerprint(backup);
        if (job.generation !== this.generation) return false;
        if (this.meta?.fingerprint === fingerprint) {
          this.meta.pending = !!this.pending;this.saveMeta();if (!this.pending) this.saved(this.lastSaved());continue;
        }
        const response = await this.request('POST', backup);
        if (job.generation !== this.generation) return false;
        if(!response.ok){const failure=await response.json() as {code?:string;error?:string};this.lastErrorCode.set(failure?.code||'');this.lastErrorMessage.set(failure?.error||'Copia server non salvata.');}
        if (response.status === 409) {
          // An acknowledgement can be lost after a successful server commit.
          // Reconcile only an identical snapshot; never retry over a different head.
          this.pending ||= job;this.conflict();
          const check = await this.request();
          if (check.ok) {
            const head = await check.json() as ArchiveHead;
            if(head.backup){const reset=JSON.parse(head.backup).data?.settings?.[0]?.archiveResetId;if(reset&&reset!==job.data.settings[0]?.archiveResetId){this.message.set('Reimpostazione dell’account disponibile. Riapri l’app per usare il nuovo archivio.');if(typeof location!=='undefined')location.reload();return false;}}
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
      finally{this.uploading=false;}
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
    this.destroyed=true;this.generation++;clearTimeout(this.timer);clearTimeout(this.retryTimer);this.controller?.abort();
    if (typeof window !== 'undefined') { window.removeEventListener('online', this.online);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('pageshow',this.pageShow); }
    if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility);
  }
}
