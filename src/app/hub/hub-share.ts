import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HubStore } from './hub-store';
import { HUB_PENDING_INVITE } from './hub-access';

import { collectShared, localizeShared, sharedSignature, SharedGroupData } from './hub-share-data';

export interface InvitePreview { groupId: string; name: string; icon: string; by: string; members: number; joined: boolean }
class ShareHttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }

/** Sincronizza i gruppi condivisi e gestisce gli inviti con link. */
@Injectable({ providedIn: 'root' })
export class HubShareService {
  private hub = inject(HubStore);
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly error = signal('');
  private lastSig = new Map<string, string>();
  private revisions = new Map<string, number>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private again = false;
  private readonly sharedIds = computed(() => this.hub.groups().filter(g => g.shared).map(g => g.id));
  private readonly localSig = computed(() => {
    const uid = this.hub.account(), doc = this.hub.doc();
    if (!uid) return '';
    return this.sharedIds().map(id => { const d = collectShared(doc, id, uid, this.myName()); return d ? sharedSignature(d) : id; }).join('#');
  });

  constructor() {
    effect(() => { const sig = this.localSig(); if (sig && this.hub.ready()) untracked(() => this.schedule(1500)); });
    // Un invito aperto prima del login viene ripreso appena l'account è pronto.
    effect(() => {
      if (!this.hub.account() || !this.hub.ready()) return;
      untracked(() => {
        let token = '';
        try { token = sessionStorage.getItem(HUB_PENDING_INVITE) ?? ''; sessionStorage.removeItem(HUB_PENDING_INVITE); } catch { /* nessun invito */ }
        if (token) void this.router.navigate(['/hub/invito', token], { replaceUrl: true });
      });
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(0));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.schedule(0); });
      setInterval(() => { if (document.visibilityState === 'visible') this.schedule(0); }, 60000);
    }
  }

  private myName() { return this.auth.user()?.name?.trim() || 'Io'; }
  isShared(groupId: string) { return this.sharedIds().includes(groupId); }

  schedule(delay: number) {
    if (!this.hub.account() || !this.hub.ready() || !this.sharedIds().length) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncAll(), delay);
  }
  async syncAll() {
    if (this.running) { this.again = true; return; }
    this.running = true;
    try { for (const id of this.sharedIds()) await this.syncGroup(id); }
    finally { this.running = false; if (this.again) { this.again = false; this.schedule(300); } }
  }

  /** Scarica la versione condivisa, la unisce alla locale e, se serve, invia le modifiche. */
  async syncGroup(id: string): Promise<void> {
    const uid = this.hub.account();
    if (!uid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await this.http<{ revision: number; data: SharedGroupData }>('GET', `/api/hub/share/${id}`);
        this.revisions.set(id, remote.revision);
        this.hub.applyRemote(localizeShared(remote.data, uid));
        const mine = collectShared(this.hub.doc(), id, uid, this.myName());
        if (!mine || sharedSignature(mine) === sharedSignature(remote.data)) { this.lastSig.set(id, mine ? sharedSignature(mine) : ''); this.error.set(''); return; }
        try {
          const saved = await this.http<{ revision: number; data: SharedGroupData }>('PUT', `/api/hub/share/${id}`, { baseRevision: remote.revision, data: mine });
          this.revisions.set(id, saved.revision);
          this.hub.applyRemote(localizeShared(saved.data, uid));
          this.error.set('');
          return;
        } catch (error) { if (error instanceof ShareHttpError && error.status === 409) continue; throw error; }
      }
      throw new Error('Il gruppo è stato modificato da altri: riprova tra poco.');
    } catch (error) {
      if (error instanceof ShareHttpError && error.status === 404) { this.error.set('Non fai più parte di questo gruppo condiviso.'); return; }
      this.error.set(error instanceof Error ? error.message : 'Sincronizzazione del gruppo non riuscita.');
    }
  }

  /** Rende condiviso un gruppo esistente e restituisce il link da mandare. */
  async createInvite(groupId: string, renew = false): Promise<string> {
    const uid = this.hub.account();
    const group = this.hub.groups().find(g => g.id === groupId);
    if (!uid || !group) throw new Error('Gruppo non trovato.');
    if (!group.shared) {
      const data = collectShared(this.hub.doc(), groupId, uid, this.myName())!;
      await this.http('POST', '/api/hub/share', data);
      this.hub.upsert('groups', { ...group, shared: true });
    }
    await this.syncGroup(groupId);
    const invite = await this.http<{ token: string }>('POST', `/api/hub/share/${groupId}/invite`, { renew });
    return this.linkFor(invite.token);
  }
  linkFor(token: string) { return `${location.origin}${location.pathname}#/hub/invito/${token}`; }

  preview(token: string) { return this.http<InvitePreview>('GET', `/api/hub/invite/${token}`); }
  /** Accetta l'invito: l'account entra nel gruppo e riceve spese e persone. */
  async accept(token: string): Promise<string> {
    const result = await this.http<{ groupId: string }>('POST', `/api/hub/invite/${token}`, {});
    const uid = this.hub.account();
    if (uid) {
      const remote = await this.http<{ revision: number; data: SharedGroupData }>('GET', `/api/hub/share/${result.groupId}`);
      this.hub.applyRemote(localizeShared(remote.data, uid));
    }
    return result.groupId;
  }

  private async http<T>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
      let data: unknown;
      try { data = await res.json(); } catch { throw new ShareHttpError('Servizio non disponibile.', res.status || 503); }
      if (!res.ok) throw new ShareHttpError((data as { error?: string })?.error || 'Operazione non riuscita.', res.status);
      return data as T;
    } catch (error) {
      if (controller.signal.aborted) throw new ShareHttpError('Il server non ha risposto in tempo.', 504);
      throw error;
    } finally { clearTimeout(timer); }
  }
}
