import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { AuthService } from '../services/auth';
import {
  emptyHubDoc, HubCollection, HubDoc, HubPerson, HubPlan, HubRecord, HUB_COLLECTIONS, HUB_DOC_VERSION, HubPrefs,
} from './hub-model';

/** Identità fissa dell'utente nei gruppi di Dividi. */
export const HUB_ME = 'me';
const TOMBSTONE_DAYS = 90;

interface HubLocalRow { account: string; doc: HubDoc; revision: number; dirty: boolean; savedAt: number }
class HubLocalDb extends Dexie {
  docs!: Table<HubLocalRow, string>;
  constructor() { super('gymtrack-hub-v1'); this.version(1).stores({ docs: 'account' }); }
}

type Item<K extends HubCollection> = HubDoc[K][number];

/** Unisce due copie record per record: vince la modifica più recente, eliminazioni comprese. */
export function mergeHubDocs(local: HubDoc, remote: HubDoc): HubDoc {
  const out = emptyHubDoc();
  for (const name of HUB_COLLECTIONS) {
    const map = new Map<string, HubRecord>();
    for (const r of (remote[name] ?? []) as HubRecord[]) if (r && typeof r.id === 'string') map.set(r.id, r);
    for (const r of (local[name] ?? []) as HubRecord[]) {
      if (!r || typeof r.id !== 'string') continue;
      const other = map.get(r.id);
      if (!other || (r.updatedAt ?? 0) > (other.updatedAt ?? 0)) map.set(r.id, r);
    }
    (out[name] as HubRecord[]) = [...map.values()];
  }
  return out;
}
export function hubSignature(doc: HubDoc) {
  return HUB_COLLECTIONS.map(name => (doc[name] as HubRecord[]).map(r => `${r.id}:${r.updatedAt}:${r.deleted ? 1 : 0}`).sort().join(',')).join('|');
}
export function pruneHubDoc(doc: HubDoc, now = Date.now()): HubDoc {
  const limit = now - TOMBSTONE_DAYS * 86400000, out = emptyHubDoc();
  for (const name of HUB_COLLECTIONS) (out[name] as HubRecord[]) = (doc[name] as HubRecord[]).filter(r => !r.deleted || r.updatedAt > limit);
  return out;
}
function normalizeDoc(value: unknown): HubDoc {
  const doc = emptyHubDoc();
  if (!value || typeof value !== 'object') return doc;
  for (const name of HUB_COLLECTIONS) {
    const rows = (value as Record<string, unknown>)[name];
    if (Array.isArray(rows)) (doc[name] as unknown[]) = rows.filter(r => r && typeof r === 'object' && typeof (r as HubRecord).id === 'string');
  }
  return doc;
}

class HubHttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }

@Injectable({ providedIn: 'root' })
export class HubStore {
  private auth = inject(AuthService);
  private local?: HubLocalDb;
  readonly doc = signal<HubDoc>(emptyHubDoc());
  readonly ready = signal(false);
  readonly status = signal<'local' | 'syncing' | 'saved' | 'offline' | 'error'>('local');
  readonly error = signal('');
  readonly allowed = computed(() => { const u = this.auth.user(); return !!u && u.role === 'SuperAdmin' && !this.auth.viewAsClient() && !this.auth.offlineMode(); });
  readonly account = computed(() => this.allowed() ? this.auth.user()!.id : '');
  private opened = '';
  private revision = 0;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private again = false;

  readonly events = computed(() => this.doc().events.filter(r => !r.deleted));
  readonly notes = computed(() => this.doc().notes.filter(r => !r.deleted));
  readonly transactions = computed(() => this.doc().transactions.filter(r => !r.deleted).sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description)));
  readonly imports = computed(() => this.doc().imports.filter(r => !r.deleted).sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
  readonly rules = computed(() => this.doc().rules.filter(r => !r.deleted));
  readonly people = computed(() => this.doc().people.filter(r => !r.deleted));
  readonly groups = computed(() => this.doc().groups.filter(r => !r.deleted));
  readonly expenses = computed(() => this.doc().expenses.filter(r => !r.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt));
  readonly settlements = computed(() => this.doc().settlements.filter(r => !r.deleted));
  readonly plan = computed<HubPlan | undefined>(() => this.doc().plans.filter(r => !r.deleted).sort((a, b) => b.updatedAt - a.updatedAt)[0]);
  readonly prefs = computed<HubPrefs>(() => this.doc().prefs.find(p => !p.deleted) ?? { id: 'prefs', updatedAt: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome' });

  constructor() {
    effect(() => { const account = this.account(); untracked(() => void this.open(account)); });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(0));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.schedule(0); else if (this.dirty) this.schedule(0); });
    }
  }

  person(id: string): HubPerson | undefined { return this.doc().people.find(p => p.id === id); }
  personName(id: string) { return id === HUB_ME ? 'Tu' : this.person(id)?.name ?? 'Persona'; }

  private db() { return this.local ??= new HubLocalDb(); }

  private async open(account: string) {
    if (account === this.opened) return;
    clearTimeout(this.timer);
    this.opened = account; this.ready.set(false); this.doc.set(emptyHubDoc()); this.revision = 0; this.dirty = false; this.error.set('');
    if (!account) return;
    try {
      const row = await this.db().docs.get(account);
      if (this.opened !== account) return;
      if (row) { this.doc.set(normalizeDoc(row.doc)); this.revision = row.revision; this.dirty = row.dirty; }
    } catch { /* L'archivio locale è facoltativo: resta la copia server. */ }
    this.ensureMe();
    this.ready.set(true);
    this.schedule(0);
  }

  private ensureMe() {
    if (this.doc().people.some(p => p.id === HUB_ME)) return;
    const me: HubPerson = { id: HUB_ME, updatedAt: 1, name: 'Tu', color: 'linear-gradient(140deg,#F39AC7,#8ABDFB)', me: true };
    this.doc.update(d => ({ ...d, people: [...d.people, me] }));
  }

  private async persist() {
    const account = this.opened;
    if (!account) return;
    try { await this.db().docs.put({ account, doc: this.doc(), revision: this.revision, dirty: this.dirty, savedAt: Date.now() }); } catch { /* best effort */ }
  }

  /** Inserisce o aggiorna record della stessa raccolta, marcandoli con l'ora della modifica. */
  upsert<K extends HubCollection>(name: K, ...records: Item<K>[]) {
    if (!records.length) return;
    const now = Date.now();
    this.doc.update(d => {
      const list = [...(d[name] as HubRecord[])];
      for (const r of records as HubRecord[]) {
        const next = { ...r, updatedAt: Math.max(now, (r.updatedAt ?? 0) + 1) };
        const i = list.findIndex(x => x.id === r.id);
        if (i >= 0) list[i] = next; else list.push(next);
      }
      return { ...d, version: HUB_DOC_VERSION, [name]: list } as HubDoc;
    });
    this.changed();
  }
  remove<K extends HubCollection>(name: K, ...ids: string[]) {
    const now = Date.now(), set = new Set(ids);
    this.doc.update(d => ({ ...d, [name]: (d[name] as HubRecord[]).map(r => set.has(r.id) ? { ...r, deleted: true, updatedAt: Math.max(now, r.updatedAt + 1) } : r) }) as HubDoc);
    this.changed();
  }

  private changed() { this.dirty = true; void this.persist(); this.schedule(1200); }

  schedule(delay: number) {
    if (!this.opened) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), delay);
  }

  /** Invia le modifiche e unisce quelle arrivate da altri dispositivi. */
  async sync(): Promise<void> {
    if (!this.opened) return;
    if (this.running) { this.again = true; return this.running; }
    this.running = this.run().finally(() => { this.running = undefined; if (this.again) { this.again = false; this.schedule(300); } });
    return this.running;
  }

  private async run() {
    const account = this.opened;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { this.status.set('offline'); return; }
    this.status.set('syncing');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await this.http<{ revision: number; data: unknown }>('GET');
        if (this.opened !== account) return;
        const remoteDoc = remote.data ? normalizeDoc(remote.data) : null;
        const merged = remoteDoc ? mergeHubDocs(this.doc(), remoteDoc) : this.doc();
        if (hubSignature(merged) !== hubSignature(this.doc())) this.doc.set(merged);
        if (!this.dirty && remoteDoc && hubSignature(merged) === hubSignature(remoteDoc)) {
          this.revision = remote.revision; await this.persist(); this.status.set('saved'); this.error.set(''); return;
        }
        try {
          const sent = pruneHubDoc(this.doc());
          const saved = await this.http<{ revision: number }>('PUT', { baseRevision: remote.revision, data: sent });
          if (this.opened !== account) return;
          this.revision = saved.revision;
          if (hubSignature(sent) === hubSignature(pruneHubDoc(this.doc()))) this.dirty = false;
          await this.persist(); this.status.set('saved'); this.error.set('');
          if (this.dirty) this.schedule(500);
          return;
        } catch (error) {
          if (error instanceof HubHttpError && error.status === 409) continue;
          throw error;
        }
      }
      throw new Error('Copia del Hub modificata altrove: riprova tra poco.');
    } catch (error) {
      if (this.opened !== account) return;
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      this.status.set(offline ? 'offline' : 'error');
      this.error.set(offline ? '' : error instanceof Error ? error.message : 'Sincronizzazione non riuscita.');
    }
  }

  private async http<T>(method: 'GET' | 'PUT', body?: unknown): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('/api/hub', { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      let data: unknown;
      try { data = await res.json(); } catch { throw new HubHttpError('Servizio del Hub non disponibile.', res.status || 503); }
      if (!res.ok) throw new HubHttpError((data as { error?: string })?.error || 'Operazione non riuscita.', res.status);
      return data as T;
    } catch (error) {
      if (controller.signal.aborted) throw new HubHttpError('Il server non ha risposto in tempo.', 504);
      throw error;
    } finally { clearTimeout(timer); }
  }

  /** Avvisi che il server può mandare come notifica: utile per mostrare lo stato nel foglio. */
  readonly syncLabel = computed(() => ({ local: 'Salvato sul dispositivo', syncing: 'Sincronizzazione…', saved: 'Sincronizzato', offline: 'In attesa della rete', error: this.error() || 'Sincronizzazione non riuscita' })[this.status()]);
}
