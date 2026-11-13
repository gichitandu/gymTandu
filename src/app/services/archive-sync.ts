import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth';
import { exportBackup, importBackup } from './backup';
import { DataSet } from '../models/domain';
import { defaultExercises, defaultGroups } from '../core/default-catalog';
import { FormDraftService } from './form-drafts';
import {HistoryIntent, losesRecordedWork} from './workout-safety';

export type ArchiveSyncState = 'local' | 'syncing' | 'saved' | 'offline' | 'conflict';
interface SyncMeta { revision: number; fingerprint: string; pending: boolean; blocked?: boolean; historyIntent?: Record<string, number> }
interface PendingArchive { data: DataSet; generation: number; intents?: Map<string, number> }
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
  if (Object.values(counts).some(Boolean) || data.wellnessLogs.length || data.creatineLogs.length || data.days.length || data.sets.length || data.scheduledWorkouts.length || data.measurements.length || data.exercisePreferences.length || data.workoutUi.length) return true;
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
  private pinOnNextSave = false;
  private autoResolves = 0;
  private intents = new Map<string, number>();
  private intentSequence = 0;
  private pendingJob(data: DataSet, generation = this.generation): PendingArchive {return {data: structuredClone(data), generation, intents: new Map(this.intents)};}
  private acknowledgeIntents(sent: Map<string, number>) {for (const [id, sequence] of sent) if (this.intents.get(id) === sequence) this.intents.delete(id);}
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
  private saveMeta() { if (this.meta) try {if(this.intents.size)this.meta.historyIntent=Object.fromEntries(this.intents);else delete this.meta.historyIntent; localStorage.setItem(this.storageKey(), JSON.stringify(this.meta)); } catch {} }
  /** Il server (modalità self-hosted) non conserva copie per chi usa solo questo dispositivo. */
  private deviceLocalOnly = false;
  private identify(archive: string) {
    const user = this.auth?.user();
    if (!user || archive !== (user.owner ? 'gymtrack-v1' : 'gymtrack-user-' + user.id)) return undefined;
    if (user.id === 'device-local') return this.deviceLocalOnly ? undefined : 'device' as const;
    return 'account' as const;
  }
  private async request(method = 'GET', body?: string, scope = this.scope, query = ''): Promise<Pick<Response,'ok'|'status'|'json'>> {
    const controller = new AbortController();this.controller = controller;
    const timer = setTimeout(() => controller.abort(), method==='POST'?60000:15000);
    try {
      const response=await fetch('/api/archive?scope=' + scope + query, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'If-Match': String(this.revision()) }, body });
      // Keep the timeout active until the backup body is received as well.
      const value=await response.json().catch(()=>undefined);
      if (scope === 'device' && response.status === 403) {
        // Nessuna copia server possibile: i dati restano sul dispositivo e gli aggiornamenti non vanno bloccati.
        this.deviceLocalOnly = true;this.scope = undefined;this.pending = undefined;
        this.status.set('local');this.message.set('Archivio conservato su questo dispositivo.');
        throw new Error('La copia sul server richiede un account.');
      }
      return {ok:response.ok,status:response.status,json:async()=>value};
    } finally { clearTimeout(timer);if (this.controller === controller) this.controller = undefined; }
  }
  private offline(error?: unknown) {
    if (!this.scope) { this.status.set('local');return; }
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
    this.intents = new Map(Object.entries(this.meta?.historyIntent || {}).filter(([id, value]) => /^(w|s):./.test(id) && Number.isSafeInteger(value) && value > 0));
    this.intentSequence = 0; for (const value of this.intents.values()) this.intentSequence = Math.max(this.intentSequence, value);
    this.revision.set(this.meta?.revision || 0);this.remoteSummary.set(null);
    if (!this.scope) { this.status.set('local');this.message.set('Archivio conservato su questo dispositivo.');return local; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (archiveHasContent(local) || this.meta?.pending) this.pending = this.pendingJob(local, generation);
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
        this.localChanges=0;this.latest=structuredClone(remote);this.pending=undefined;this.intents.clear();
        this.meta={revision:head.revision,fingerprint:remoteFingerprint,pending:false};this.saveMeta();this.saved(head.updatedAt);
        if(typeof location!=='undefined')location.reload();
        return remote;
      }
      if (previous && head.revision < previous.revision) {
        this.meta = {...previous, pending: true, blocked: true}; this.pending = this.pendingJob(local, generation);
        this.conflict(); this.message.set('La copia server è precedente a un salvataggio già confermato. Gli allenamenti sul dispositivo sono conservati.'); return local;
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
        if (losesRecordedWork(local, remote)) {
          if (await this.adoptDeviceIfSafe(head, remote, generation, previous?.fingerprint)) { this.resumeAfterAdopt(); return local; }
          this.meta = {revision: head.revision, fingerprint: remoteFingerprint, pending: true, blocked: true}; this.pending = this.pendingJob(local, generation);
          this.conflict(); this.message.set('La copia server contiene meno progressi registrati. Le serie sul dispositivo sono conservate: verifica le copie prima di ripristinare.'); return local;
        }
        if (!allowRestore) {
          this.meta = previous ? { ...previous, blocked: true } : { revision: head.revision, fingerprint: remoteFingerprint, pending: false, blocked: true };
          this.conflict(false);return local;
        }
        const restoreChanges=this.localChanges;
        const accepted=acceptRestore?await acceptRestore(remote):true;
        if(generation!==this.generation)return local;
        if(!accepted){
          this.meta={revision:head.revision,fingerprint:remoteFingerprint,pending:true,blocked:true};
          this.pending=this.pendingJob(this.latest||local, generation);this.conflict();return local;
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
      if (await this.adoptDeviceIfSafe(head, remote, generation, previous?.fingerprint)) { this.resumeAfterAdopt(); return local; }
      this.meta = { revision: head.revision, fingerprint: remoteFingerprint, pending: true, blocked: true };
      this.pending = this.pendingJob(local, generation);this.conflict();return local;
    } catch (error) {
      if (generation === this.generation) {
        const latest=this.latest||local;
        if (archiveHasContent(latest) || this.meta?.pending) this.pending = this.pendingJob(latest, generation);
        this.offline(error);
      }
      return local;
    }
  }
  /**
   * Risoluzione automatica solo quando è sicura, cioè quando il server è "indietro" e non "diverso":
   *  - il server non è cambiato dall'ultima sincronizzazione confermata di questo dispositivo, oppure
   *  - ogni record del server è presente identico sul dispositivo (il dispositivo ha solo in più).
   * Se lo stesso dato è stato modificato su entrambi i lati o il server ha qualcosa che qui manca,
   * il conflitto resta e decide l'utente. La copia server precedente viene fissata come copia protetta.
   */
  private deviceSupersedes(remote: DataSet | undefined, local: DataSet, serverUnchanged: boolean): boolean {
    if (!remote) return true;
    const resetId = remote.settings[0]?.archiveResetId;
    if (resetId && resetId !== local.settings[0]?.archiveResetId) return false;
    if (losesRecordedWork(remote, local)) return false;
    if (serverUnchanged) return true;
    const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
    const tables: (keyof DataSet)[] = ['plans','days','planExercises','exercises','muscleGroups','workouts','workoutExercises','sets','meals','scheduledWorkouts','measurements','wellnessLogs','creatineLogs'];
    return tables.every(table => {
      const rows = new Map<string, string>(((local as any)[table] || []).map((row: {id: string}) => [row.id, canonical(row)] as [string, string]));
      return ((remote as any)[table] || []).every((row: {id: string}) => rows.get(row.id) === canonical(row));
    });
  }
  /** Prepara l'invio della copia del dispositivo sopra quella del server; il chiamante avvia il flush. */
  private async adoptDeviceIfSafe(head: ArchiveHead, remote: DataSet | undefined, generation: number, baseline?: string): Promise<boolean> {
    const local = this.latest;
    if (!local || this.autoResolves >= 2) return false;
    const fingerprint = head.backup ? await archiveFingerprint(head.backup) : '';
    if (!this.deviceSupersedes(remote, local, !!baseline && fingerprint === baseline)) return false;
    if (generation !== this.generation) return false;
    this.autoResolves++;
    this.revision.set(head.revision); this.knownHead = true;
    this.meta = {revision: head.revision, fingerprint, pending: true};
    this.pinOnNextSave = !!head.backup; this.pending = this.pendingJob(local, generation); this.saveMeta();
    this.status.set('syncing'); this.message.set('Aggiornamento della copia server con i dati di questo dispositivo…');
    return true;
  }
  private resumeAfterAdopt() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 0); }
  private saved(updatedAt?: number | null) {
    clearTimeout(this.retryTimer);this.retryTimer=undefined;this.retryAttempt=0;this.autoResolves=0;
    this.status.set('saved');this.lastSaved.set(updatedAt ?? Date.now());
    this.message.set('Copia server aggiornata.');
  }
  changed(data: DataSet, intent?: HistoryIntent) {
    if(this.latest?.settings[0]?.archiveResetId&&data.settings[0]?.archiveResetId!==this.latest.settings[0].archiveResetId){this.conflict();this.message.set('Questa copia precede la reimpostazione richiesta. Riapri l’app per usare l’archivio aggiornato.');return;}
    if (this.destroyed || !this.archive || !this.scope) return;
    for (const id of intent?.workouts || []) this.intents.set('w:' + id, ++this.intentSequence);
    for (const id of intent?.sets || []) this.intents.set('s:' + id, ++this.intentSequence);
    this.localChanges++;
    if (!archiveHasContent(data) && !this.uploading && !this.meta?.fingerprint && !this.meta?.blocked) {
      clearTimeout(this.timer);this.latest=structuredClone(data);this.pending=undefined;
      if(this.meta){this.meta.pending=false;this.saveMeta();}
      this.status.set('local');this.message.set('La copia server si attiva al primo salvataggio.');return;
    }
    this.latest = structuredClone(data);this.pending = this.pendingJob(data);
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
      const sentIntents = job.intents || new Map(this.intents);
      this.uploading=true;
      try {
        const backup = await exportBackup(job.data), fingerprint = await archiveFingerprint(backup);
        if (job.generation !== this.generation) return false;
        if (this.meta?.fingerprint === fingerprint && !this.pinOnNextSave) {
          this.acknowledgeIntents(sentIntents);
          this.meta.pending = !!this.pending;this.saveMeta();if (!this.pending) this.saved(this.lastSaved());continue;
        }
        const pin = this.pinOnNextSave;
        const envelope = sentIntents.size ? JSON.stringify({...JSON.parse(backup), historyIntent: {workouts: [...sentIntents.keys()].filter(id => id.startsWith('w:')).map(id => id.slice(2)), sets: [...sentIntents.keys()].filter(id => id.startsWith('s:')).map(id => id.slice(2))}}) : backup;
        const response = await this.request('POST', envelope, this.scope, pin ? '&checkpoint=before-update' : '');
        if (job.generation !== this.generation) return false;
        if(!response.ok){const failure=await response.json() as {code?:string;error?:string};this.lastErrorCode.set(failure?.code||'');this.lastErrorMessage.set(failure?.error||'Copia server non salvata.');}
        if (response.status === 409) {
          const baseline = this.meta?.fingerprint;
          // An acknowledgement can be lost after a successful server commit.
          // Reconcile only an identical snapshot; never retry over a different head.
          this.pending ||= job;this.conflict();
          const check = await this.request();
          if (check.ok) {
            const head = await check.json() as ArchiveHead;
            if(head.backup){const reset=JSON.parse(head.backup).data?.settings?.[0]?.archiveResetId;if(reset&&reset!==job.data.settings[0]?.archiveResetId){this.message.set('Reimpostazione dell’account disponibile. Riapri l’app per usare il nuovo archivio.');if(typeof location!=='undefined')location.reload();return false;}}
            if (head.backup && await archiveFingerprint(head.backup) === fingerprint) {
              this.acknowledgeIntents(sentIntents);
              if(this.pending===job)this.pending=undefined;
              this.revision.set(head.revision);this.meta={revision:head.revision,fingerprint,pending:!!this.pending};this.saveMeta();
              this.remoteSummary.set(archiveSummary(job.data));this.lastSaved.set(head.updatedAt??Date.now());
              if(!this.pending)this.saved(head.updatedAt);
              continue;
            }
            // Il server è solo "indietro" rispetto a questo dispositivo: lo si aggiorna, conservando la sua copia.
            const behind = head.backup ? await importBackup(head.backup) : undefined;
            if (await this.adoptDeviceIfSafe(head, behind, job.generation, baseline)) { this.pending = this.pendingJob(this.latest!, job.generation); continue; }
          }
          return false;
        }
        if (!response.ok) throw Error('Copia server non salvata');
        const result = await response.json() as ArchiveHead;
        if (!Number.isSafeInteger(result.revision) || result.revision <= this.revision()) throw Error('Conferma server non valida');
        this.revision.set(result.revision);
        this.acknowledgeIntents(sentIntents);
        if (pin) this.pinOnNextSave = false;
        this.meta = { revision: result.revision, fingerprint, pending: !!this.pending };this.saveMeta();
        this.remoteSummary.set(archiveSummary(job.data));this.lastSaved.set(result.updatedAt ?? Date.now());
        if (!this.pending) this.saved(result.updatedAt);
      } catch (error) { if (job.generation === this.generation) { this.pending ||= job;this.offline(error); }return false; }
      finally{this.uploading=false;}
    }
    return true;
  }
  currentScope(){return this.scope;}
  /** Se il conflitto è solo un server "indietro" rispetto al dispositivo, lo risolve (copia server conservata). */
  async resolveConflictIfSafe(): Promise<boolean> {
    if (!this.scope || !this.latest || this.status() !== 'conflict' || typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (this.running) await this.running.catch(() => false);
    const generation = this.generation, response = await this.request();
    if (!response.ok || generation !== this.generation || !this.latest) return false;
    const head = await response.json() as ArchiveHead;
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 || !(head.backup === null || typeof head.backup === 'string')) return false;
    const remote = head.backup ? await importBackup(head.backup) : undefined;
    const baseline = this.meta?.fingerprint;this.autoResolves = 0;
    if (!await this.adoptDeviceIfSafe(head, remote, generation, baseline)) return false;
    return this.flush();
  }
  async checkpointForUpdate(): Promise<boolean> {
    if (!this.scope) return true;
    if (!this.latest || typeof navigator !== 'undefined' && !navigator.onLine) return false;
    if (this.status() === 'conflict') { try { await this.resolveConflictIfSafe(); } catch { /* il conflitto resta e blocca l'aggiornamento */ } }
    // Un'apertura o un salvataggio concorrente può azzerare la copia in attesa prima che
    // la copia protetta venga inviata: si ritenta, ma mai oltre un conflitto reale.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.running) await this.running.catch(() => false);
      if (!this.latest || this.status() === 'conflict' || this.meta?.blocked || typeof navigator !== 'undefined' && !navigator.onLine) return false;
      this.pinOnNextSave = true;
      this.pending ||= this.pendingJob(this.latest);
      const saved = await this.flush();
      if (saved && !this.pinOnNextSave) return true;
    }
    return false;
  }
  async history(date?: string): Promise<{revision: number; updatedAt: number; reason?: string; workoutId?: string; workoutDate?: string; dayName?: string}[]> {
    if (!this.scope) return [];
    const response = await this.request('GET', undefined, this.scope, '&history=1' + (date ? '&date=' + encodeURIComponent(date) : ''));
    if (!response.ok) throw Error('Le copie server non sono disponibili. I dati locali restano conservati.');
    return ((await response.json()) as {versions?: any[]}).versions || [];
  }
  async readVersion(revision: number): Promise<DataSet> {
    if (!this.scope || !Number.isSafeInteger(revision) || revision < 1) throw Error('Copia non valida.');
    const response = await this.request('GET', undefined, this.scope, '&version=' + revision);
    if (!response.ok) throw Error('La copia selezionata non è disponibile.');
    const head = await response.json() as ArchiveHead;
    if (!head.backup) throw Error('Copia vuota.');
    return importBackup(head.backup);
  }
  async syncRecoveredArchive(): Promise<boolean> {
    if (!this.scope) return true;
    if (this.running) await this.running;
    const generation = this.generation, response = await this.request();
    if (!response.ok || generation !== this.generation || !this.latest) return false;
    const head = await response.json() as ArchiveHead;
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 || !(head.backup === null || typeof head.backup === 'string')) throw Error('Copia server non valida. Il recupero locale è conservato.');
    const remote = head.backup ? await importBackup(head.backup) : undefined;
    if (remote && (losesRecordedWork(remote, this.latest) || remote.settings[0].archiveResetId !== this.latest.settings[0].archiveResetId)) {
      this.conflict(); this.message.set('Il server contiene altri progressi da confrontare. Il recupero locale è conservato e nessuna copia è stata sovrascritta.'); return false;
    }
    this.revision.set(head.revision); this.knownHead = true;
    this.meta = {revision: head.revision, fingerprint: head.backup ? await archiveFingerprint(head.backup) : '', pending: true};
    this.pending = this.pendingJob(this.latest); this.saveMeta(); this.status.set('syncing');
    return this.flush();
  }
  /**
   * Scelta esplicita dell'utente in caso di copie diverse: la copia di questo dispositivo diventa quella del server.
   * La copia server precedente resta nello storico come copia protetta; una reimpostazione dell'account resta prioritaria.
   */
  async keepDeviceCopy(): Promise<boolean> {
    if (!this.scope || !this.latest) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.offline(); return false; }
    if (this.running) await this.running.catch(() => false);
    const generation = this.generation, response = await this.request();
    if (!response.ok || generation !== this.generation || !this.latest) return false;
    const head = await response.json() as ArchiveHead;
    if (!Number.isSafeInteger(head.revision) || head.revision < 0 || !(head.backup === null || typeof head.backup === 'string')) throw Error('Copia server non valida. La copia del dispositivo è conservata.');
    const remote = head.backup ? await importBackup(head.backup) : undefined;
    if (remote?.settings[0]?.archiveResetId && remote.settings[0].archiveResetId !== this.latest.settings[0]?.archiveResetId) {
      this.conflict(); this.message.set('L’account è stato reimpostato su richiesta: riapri l’app per usare il nuovo archivio.'); return false;
    }
    this.revision.set(head.revision); this.knownHead = true;
    this.meta = {revision: head.revision, fingerprint: head.backup ? await archiveFingerprint(head.backup) : '', pending: true};
    this.pinOnNextSave = !!head.backup; this.pending = this.pendingJob(this.latest); this.saveMeta();
    this.status.set('syncing'); this.message.set('Invio della copia di questo dispositivo…');
    const saved = await this.flush();
    if (!saved && this.status() !== 'conflict') this.message.set(this.lastErrorMessage() || 'Copia server non aggiornata. La copia del dispositivo è conservata.');
    return saved;
  }
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
