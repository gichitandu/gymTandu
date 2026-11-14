import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService } from './auth';
import { Store } from './store';
import { GroupExercise, GroupMember, GroupSession, groupExercisesOf } from './group-workout';

const LINK_KEY = 'gymtrack-group-link-v1';
const POLL_MS = 4000;
interface GroupLink { sessionId: string; workoutId: string; userId: string }

/**
 * Stato dell'allenamento in gruppo. Il server conserva solo esercizi e avanzamento della
 * seduta in corso; questo servizio li pubblica quando la mia seduta cambia e rilegge quelli
 * degli altri a intervalli regolari mentre una schermata interessata è aperta.
 */
@Injectable({ providedIn: 'root' })
export class GroupSessionService {
  private auth = inject(AuthService);
  private store = inject(Store);
  readonly session = signal<GroupSession | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  /** Errore dell'ultima operazione richiesta dall'utente. */
  readonly error = signal('');
  /** Aggiornamento automatico non riuscito: i dati degli altri possono essere vecchi. */
  readonly stale = signal(false);
  readonly available = computed(() => !!this.auth.user() && !this.auth.offlineMode());
  readonly me = computed(() => this.session()?.members.find(m => m.me));
  readonly others = computed(() => this.session()?.members.filter(m => !m.me) || []);
  readonly host = computed(() => this.session()?.members.find(m => m.host));
  /** Sono dentro un gruppo aperto e ho già scelto come allenarmi. */
  readonly active = computed(() => { const s = this.session(); return !!s && !s.ended && !!this.me()?.mode; });
  private watchers = 0;
  private timer?: ReturnType<typeof setInterval>;
  private published = '';
  private publishTimer?: ReturnType<typeof setTimeout>;
  private requestId = 0;

  constructor() {
    // Cambio di account: lo stato del gruppo appartiene a chi lo ha aperto.
    effect(() => { this.auth.user()?.id; untracked(() => { this.session.set(null); this.loaded.set(false); this.published = ''; this.error.set(''); if (this.watchers) void this.refresh(); }); });
    effect(() => {
      const snapshot = this.snapshot();
      if (!snapshot || snapshot.key === this.published) return;
      clearTimeout(this.publishTimer);
      this.publishTimer = setTimeout(() => void this.publish(), 700);
    });
  }

  /** Una schermata chiede aggiornamenti continui; la funzione restituita li interrompe. */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) {
      void this.refresh();
      this.timer = setInterval(() => { if (this.session() && !this.session()!.ended && (typeof document === 'undefined' || document.visibilityState !== 'hidden')) void this.refresh(); }, POLL_MS);
    }
    let stopped = false;
    return () => { if (stopped) return; stopped = true; if (--this.watchers === 0) { clearInterval(this.timer); this.timer = undefined; } };
  }

  private link(): GroupLink | null {
    try { const raw = JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); return raw && typeof raw.sessionId === 'string' && typeof raw.workoutId === 'string' && typeof raw.userId === 'string' ? raw : null; } catch { return null; }
  }
  /** Ricorda quale seduta locale sto condividendo, così a fine allenamento posso segnalarlo. */
  linkWorkout(workoutId: string) {
    const session = this.session(), user = this.auth.user();
    if (!session || !user) return;
    try { localStorage.setItem(LINK_KEY, JSON.stringify({ sessionId: session.id, workoutId, userId: user.id } satisfies GroupLink)); } catch { /* senza memoria locale vale la seduta aperta */ }
  }
  private linkedWorkout() {
    const session = this.session(), link = this.link(), data = this.store.data();
    const linked = link && session && link.sessionId === session.id && link.userId === this.auth.user()?.id ? data.workouts.find(w => w.id === link.workoutId) : undefined;
    return linked || this.store.draft();
  }
  /** Quello che gli altri devono vedere di me in questo momento. */
  private snapshot(): { key: string; body: { exercises: GroupExercise[]; current: string; finished: boolean } } | null {
    if (!this.active() || !this.store.ready()) return null;
    const workout = this.linkedWorkout();
    if (!workout) return null;
    const data = this.store.data(), exercises = groupExercisesOf(data, workout.id);
    const ui = workout.status === 'draft' ? data.workoutUi.find(row => row.id === workout.id) : undefined;
    const current = ui && ui.step !== 'list' ? data.workoutExercises.find(e => e.id === ui.exerciseId)?.exerciseId || '' : '';
    const body = { exercises, current, finished: workout.status === 'completed' };
    return { key: this.session()!.id + JSON.stringify(body), body };
  }
  private async publish() {
    const snapshot = untracked(() => this.snapshot()), session = untracked(() => this.session());
    if (!snapshot || !session || snapshot.key === this.published) return;
    try {
      const result = await this.auth.request('group/update', { id: session.id, ...snapshot.body });
      this.published = snapshot.key;
      this.accept(result.session);
    } catch { this.stale.set(true); /* il prossimo aggiornamento della seduta riprova */ }
  }

  private accept(session: GroupSession | null) { this.session.set(session); this.loaded.set(true); this.stale.set(false); }
  async refresh() {
    if (!this.available()) { this.loaded.set(true); return; }
    const request = ++this.requestId, current = untracked(() => this.session());
    try {
      const result = await this.auth.request('group' + (current ? '?id=' + encodeURIComponent(current.id) : ''));
      if (request !== this.requestId) return;
      this.accept(result.session);
    } catch { if (request === this.requestId) { this.stale.set(true); this.loaded.set(true); } }
  }
  private async act(path: string, body: unknown): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true); this.error.set(''); this.requestId++;
    try { const result = await this.auth.request(path, body); this.accept(result.session); return true; }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Operazione non riuscita.'); return false; }
    finally { this.busy.set(false); }
  }
  /** Crea il gruppo a partire dalla mia seduta aperta. */
  async create(): Promise<boolean> {
    const draft = this.store.draft();
    if (!draft) { this.error.set('Apri prima l’allenamento di oggi: il gruppo parte dalla tua seduta.'); return false; }
    const ok = await this.act('group/create', { dayName: draft.dayName, exercises: groupExercisesOf(this.store.data(), draft.id) });
    if (ok) this.linkWorkout(draft.id);
    return ok;
  }
  join(access: { code: string } | { token: string }) { return this.act('group/join', access); }
  /** Conferma come mi alleno nel gruppo, dopo aver preparato la seduta locale. */
  async choose(mode: 'same' | 'match', workoutId: string): Promise<boolean> {
    const session = this.session();
    if (!session) return false;
    this.linkWorkout(workoutId);
    return this.act('group/update', { id: session.id, mode, exercises: groupExercisesOf(this.store.data(), workoutId) });
  }
  async leave(): Promise<boolean> {
    const session = this.session();
    if (!session) return true;
    if (session.ended) { this.forget(); return true; }
    const ok = await this.act('group/leave', { id: session.id });
    if (ok) this.forget();
    return ok;
  }
  /** Chiude localmente un gruppo già terminato. */
  forget() { this.session.set(null); this.published = ''; try { localStorage.removeItem(LINK_KEY); } catch { /* niente da dimenticare */ } }
  memberLabel(member: GroupMember): string { return member.me ? 'Tu' : member.name; }
}
