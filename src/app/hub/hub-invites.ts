import { inject, Injectable } from '@angular/core';
import { AuthService } from '../services/auth';
import { HubGroup } from './hub-model';
import { applyInviteJoins, HubInviteGroup, HubInviteJoin } from './hub-invite-links';
import { HUB_ME, HubStore } from './hub-store';

export * from './hub-invite-links';

class InviteHttpError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let data: unknown;
    try { data = await res.json(); } catch { throw new InviteHttpError('Servizio non disponibile. Riprova.', res.status || 503); }
    if (!res.ok) throw new InviteHttpError((data as { error?: string })?.error || 'Operazione non riuscita.', res.status);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new InviteHttpError('Il server non ha risposto in tempo.', 504);
    if (error instanceof InviteHttpError) throw error;
    throw new InviteHttpError('Connessione non disponibile. Riprova.', 0);
  } finally { clearTimeout(timer); }
}
/** Pagina pubblica dell'invito. */
export const inviteApi = {
  read: (token: string) => call<{ group: HubInviteGroup }>('/api/hub/invite?t=' + encodeURIComponent(token), 'GET'),
  join: (token: string, name: string) => call<{ ok: true; group: HubInviteGroup; name: string }>('/api/hub/invite', 'POST', { token, name }),
};

/** Lato proprietario: crea il link, aggiorna i nomi visibili e porta nel gruppo chi è entrato. */
@Injectable({ providedIn: 'root' })
export class HubInviteService {
  private hub = inject(HubStore);
  private auth = inject(AuthService);
  private lastRefresh = 0;
  private running?: Promise<void>;

  private snapshot(group: HubGroup): HubInviteGroup {
    const me = this.auth.user()?.name?.trim() || 'Organizzatore';
    return { name: group.name, icon: group.icon, members: group.members.map(id => id === HUB_ME ? me : this.hub.personName(id)) };
  }
  private current(id: string) { return this.hub.groups().find(g => g.id === id); }

  /** Sincronizza un gruppo con il suo link e restituisce il token. Con `create` crea un link nuovo se manca o non è più attivo. */
  async sync(group: HubGroup, create = false): Promise<string> {
    const send = (token?: string) => call<{ token: string; joins: HubInviteJoin[] }>('/api/hub/invites', 'POST', { groupId: group.id, token, group: this.snapshot(group) });
    let first: { token: string; joins: HubInviteJoin[] };
    try { first = await send(group.invite); }
    catch (error) {
      if (!(error instanceof InviteHttpError && error.status === 404)) throw error;
      // Link revocato da un altro dispositivo: lo si toglie dal gruppo, oppure se ne crea uno nuovo su richiesta.
      if (!create) { this.forget(group.id); throw error; }
      first = await send();
    }
    let g = this.current(group.id) ?? group;
    if (g.invite !== first.token) { g = { ...g, invite: first.token }; this.hub.upsert('groups', g); }
    if (first.joins.length) {
      const { added, group: next } = applyInviteJoins(g, this.hub.people().filter(p => p.id !== HUB_ME), first.joins);
      if (added.length) this.hub.upsert('people', ...added);
      if (next) { this.hub.upsert('groups', next); g = next; }
      // Conferma al server solo dopo averli scritti nell'archivio: così nessuno va perso.
      await call('/api/hub/invites', 'POST', { groupId: g.id, token: first.token, group: this.snapshot(g), ack: first.joins.map(j => j.id) });
    }
    return first.token;
  }
  async revoke(group: HubGroup) {
    if (group.invite) await call('/api/hub/invites', 'DELETE', { token: group.invite });
    this.forget(group.id);
  }
  private forget(id: string) {
    const g = this.current(id); if (!g?.invite) return;
    const { invite: _removed, ...rest } = g;
    this.hub.upsert('groups', rest);
  }
  /** Controlla, al massimo una volta al minuto, chi è entrato dai link dei gruppi attivi. Errori silenziosi: si riprova dopo. */
  refreshAll(force = false) {
    if (this.running || (!force && Date.now() - this.lastRefresh < 60000)) return this.running ?? Promise.resolve();
    this.lastRefresh = Date.now();
    this.running = (async () => {
      for (const g of this.hub.groups().filter(x => x.invite && !x.archived)) {
        try { await this.sync(g); } catch { /* rete o link revocato: riprova alla prossima apertura */ }
      }
    })().finally(() => { this.running = undefined; });
    return this.running;
  }
}
