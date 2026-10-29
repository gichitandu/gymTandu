import { Inject, Injectable, InjectionToken } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { feedbackForContext, feedbackSignal } from './feedback';

interface DraftRecord { id: string; scope: string; key: string; value: unknown; updatedAt: string }
interface PendingDraft { id: string; scope: string; key: string; value: unknown; remove: boolean }
export const FORM_DRAFT_DATABASE_NAME = new InjectionToken<string>('FORM_DRAFT_DATABASE_NAME', { providedIn: 'root', factory: () => 'gymtrack-form-drafts-v1' });
export interface DraftSession<T> {
  readonly ready: Promise<void>;
  changed(): void;
  flush(): Promise<boolean>;
  clear(): Promise<void>;
  destroy(): Promise<boolean>;
}

// Form recovery is deliberately separate from the saved training archive. A
// draft can contain incomplete numbers and must never be imported as a meal.
class DraftDatabase extends Dexie {
  drafts!: Table<DraftRecord, string>;
  constructor(name: string) { super(name); this.version(1).stores({ drafts: 'id,scope,key,updatedAt' }); }
}

export function validateFormDraft(value: unknown) {
  let nodes = 0, bytes = 0;
  const seen = new WeakSet<object>();
  const visit = (item: unknown, depth: number) => {
    if (++nodes > 25000 || depth > 20) throw Error('Bozza troppo complessa. Riduci i dati inseriti prima di uscire.');
    if (item === null || item === undefined || typeof item === 'boolean' || typeof item === 'number') return;
    if (typeof item === 'string') { bytes += item.length * 2; if (item.length > 100000) throw Error('Testo della bozza troppo lungo.'); }
    else if (typeof Blob !== 'undefined' && item instanceof Blob) {
      if (item.size > 20 * 1024 * 1024) throw Error('Immagine della bozza troppo grande. Usa una foto entro 20 MB.');
      bytes += item.size;
    } else if (typeof item === 'object') {
      if (seen.has(item)) throw Error('Bozza non valida.');
      seen.add(item);
      if (Array.isArray(item)) item.forEach(entry => visit(entry, depth + 1));
      else if (Object.prototype.toString.call(item) === '[object Object]') {
        for (const [key, entry] of Object.entries(item)) { bytes += key.length * 2; visit(entry, depth + 1); }
      } else throw Error('Formato della bozza non supportato.');
      seen.delete(item);
    } else throw Error('Formato della bozza non supportato.');
    if (bytes > 24 * 1024 * 1024) throw Error('Bozza troppo grande. Riduci le immagini prima di uscire.');
  };
  visit(value, 0);
}

@Injectable({ providedIn: 'root' })
export class FormDraftService {
  private feedback = feedbackForContext();
  readonly error = feedbackSignal('error', this.feedback);
  private db: DraftDatabase;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, PendingDraft>();
  private sessions = new Set<DraftSession<unknown>>();
  private owners = new Map<string, symbol>();
  private disposeListeners: (() => void)[] = [];

  constructor(@Inject(FORM_DRAFT_DATABASE_NAME) databaseName = 'gymtrack-form-drafts-v1') {
    this.db = new DraftDatabase(databaseName);
    const listen = (target: EventTarget | undefined, name: string, listener: EventListener) => {
      if (!target?.addEventListener) return;
      target.addEventListener(name, listener);
      this.disposeListeners.push(() => target.removeEventListener(name, listener));
    };
    listen(typeof window === 'undefined' ? undefined : window, 'pagehide', () => { void this.flushAll(); });
    listen(typeof document === 'undefined' ? undefined : document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flushAll();
    });
    listen(typeof window === 'undefined' ? undefined : window, 'gymtrack:before-update', event => {
      (event as Event & { waitUntil?: (save: Promise<boolean>) => void }).waitUntil?.(this.flushAll());
    });
  }

  private id(scope: string, key: string) {
    if (!scope || !key || scope.length > 500 || key.length > 500) throw Error('Archivio della bozza non valido.');
    return JSON.stringify([scope, key]);
  }

  async read<T>(scope: string, key: string): Promise<T | null> {
    const id = this.id(scope, key);
    await this.queue;
    const pending = this.pending.get(id);
    if (pending) return pending.remove ? null : structuredClone(pending.value) as T;
    try {
      const record = await this.db.drafts.get(id);
      if (!record || record.scope !== scope || record.key !== key) return null;
      validateFormDraft(record.value);
      return structuredClone(record.value) as T;
    } catch (error) {
      this.error.set('Bozza non leggibile. I dati già salvati sono conservati. ' + this.message(error));
      return null;
    }
  }

  write<T>(scope: string, key: string, value: T): Promise<boolean> {
    try {
      return this.persist(this.stage(scope, key, value));
    } catch (error) { this.error.set(this.message(error)); return Promise.resolve(false); }
  }

  private stage<T>(scope: string, key: string, value: T) {
    validateFormDraft(value);
    const entry: PendingDraft = { id: this.id(scope, key), scope, key, value: structuredClone(value), remove: false };
    this.pending.set(entry.id, entry);
    return entry;
  }

  remove(scope: string, key: string): Promise<boolean> {
    const entry: PendingDraft = { id: this.id(scope, key), scope, key, value: null, remove: true };
    this.pending.set(entry.id, entry);
    return this.persist(entry);
  }

  private persist(entry: PendingDraft): Promise<boolean> {
    const job = this.queue.then(async () => {
      // A clear or more recent snapshot supersedes a queued older write.
      if (this.pending.get(entry.id) !== entry) return true;
      try {
        if (entry.remove) await this.db.drafts.delete(entry.id);
        else await this.db.drafts.put({ id: entry.id, scope: entry.scope, key: entry.key, value: entry.value, updatedAt: new Date().toISOString() });
        if (this.pending.get(entry.id) === entry) this.pending.delete(entry.id);
        if (!this.pending.size) this.error.set('');
        return true;
      } catch (error) {
        this.error.set('Bozza non salvata: resta aperta e riprova prima di uscire. ' + this.message(error));
        return false;
      }
    });
    this.queue = job.catch(() => false);
    return job;
  }

  bind<T>(scope: string, key: string, capture: () => T | null, restore: (value: T) => void): DraftSession<T> {
    const id = this.id(scope, key), owner = Symbol(key);
    this.owners.set(id, owner);
    let timer: ReturnType<typeof setTimeout> | undefined, touched = false, destroyed = false, initialized = false, generation = 0;
    const owns = () => this.owners.get(id) === owner;
    const stageCurrent = () => { const value = capture(); return value === null ? null : this.stage(scope, key, value); };
    const ready = this.read<T>(scope, key).then(value => {
      if (value !== null && !touched && !destroyed && owns()) restore(value);
    }).catch(error => { this.error.set('Bozza non ripristinata. ' + this.message(error)); }).finally(() => { initialized = true; });
    const session: DraftSession<T> = {
      ready,
      changed: () => {
        if (destroyed || !owns()) return;
        touched = true;
        // Stage immediately so a component opened before the debounce fires
        // can already recover the most recent typing from this tab.
        try { stageCurrent(); } catch (error) { this.error.set('Bozza non salvata. ' + this.message(error)); }
        clearTimeout(timer);
        timer = setTimeout(() => { timer = undefined; void session.flush(); }, 200);
      },
      flush: async () => {
        clearTimeout(timer); timer = undefined;
        if (!owns()) return true;
        const current = generation;
        try {
          // Capture before yielding on route destruction. Only an untouched
          // initial restore has to complete first.
          let entry = initialized || touched ? stageCurrent() : null;
          await ready;
          if (current !== generation || !owns()) return true;
          if (!entry) entry = stageCurrent();
          return entry === null ? true : await this.persist(entry);
        } catch (error) { this.error.set('Bozza non salvata. ' + this.message(error)); return false; }
      },
      clear: async () => {
        touched = true; generation++; clearTimeout(timer); timer = undefined;
        if (!owns()) return;
        if (!await this.remove(scope, key)) throw Error(this.error() || 'Bozza non eliminata. Riprova.');
      },
      destroy: () => {
        if (destroyed) return Promise.resolve(true);
        destroyed = true; clearTimeout(timer); timer = undefined;
        // flush captures after ready even after the component has been removed;
        // callers must invoke this before resetting their form fields.
        const saved = session.flush();
        this.sessions.delete(session as DraftSession<unknown>);
        return saved.finally(() => { if (owns()) this.owners.delete(id); });
      },
    };
    this.sessions.add(session as DraftSession<unknown>);
    return session;
  }

  async flushAll(): Promise<boolean> {
    const sessions = await Promise.all([...this.sessions].map(session => session.flush()));
    await this.queue;
    const retries = await Promise.all([...this.pending.values()].map(entry => this.persist(entry)));
    await this.queue;
    const saved = sessions.every(Boolean) && retries.every(Boolean) && this.pending.size === 0;
    if (saved) this.error.set('');
    return saved;
  }

  /** Only used for an explicitly authorized, server-confirmed archive reset. */
  async discardScope(scope:string):Promise<void>{
    for(const id of [...this.owners.keys()]){try{if(JSON.parse(id)[0]===scope)this.owners.delete(id);}catch{}}
    for(const [id,entry] of this.pending)if(entry.scope===scope)this.pending.delete(id);
    const job=this.queue.then(async()=>{await this.db.drafts.where('scope').equals(scope).delete();});
    this.queue=job;await job;
  }

  private message(error: unknown) { return error instanceof Error ? error.message : 'Controlla lo spazio disponibile sul dispositivo.'; }
  ngOnDestroy() { this.disposeListeners.forEach(dispose => dispose()); this.disposeListeners = []; void this.flushAll().finally(() => this.db.close()); }
}
