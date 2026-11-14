import { HubGroup, hubId, HUB_PERSON_COLORS, HubPerson } from './hub-model';

/* Funzioni pure del link d'invito di Dividi (senza dipendenze Angular, testabili in Node). */

/** Persona entrata dal link d'invito, in attesa di essere aggiunta al gruppo. */
export interface HubInviteJoin { id: string; name: string; at: number }
/** Dati pubblici mostrati a chi apre il link: nessuna spesa, solo nome, icona e nomi dei membri. */
export interface HubInviteGroup { name: string; icon: string; members: string[] }

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;
/** Token dell'invito da un URL dell'app (`/invito/<token>`), oppure stringa vuota. */
export function inviteTokenFromUrl(url: string) {
  const m = /^\/invito\/([^/?#]+)/.exec(url || '');
  return m && TOKEN.test(m[1]) ? m[1] : '';
}
export function inviteUrl(token: string, base = typeof location !== 'undefined' ? location.origin + location.pathname : '') {
  return `${base}#/invito/${token}`;
}
export function inviteMessage(groupName: string, url: string) {
  return `Ti invito nel gruppo “${groupName}” per dividere le spese. Apri il link e scrivi il tuo nome (non serve un account):\n${url}`;
}

/**
 * `others`: le persone dell'archivio escluso l'utente.
 * Aggiunge al gruppo le persone entrate dal link. Chi ha lo stesso nome di una persona già presente
 * viene riconosciuto, senza duplicati. Restituisce persone nuove e gruppo aggiornato (o null se invariato).
 */
export function applyInviteJoins(group: HubGroup, others: readonly HubPerson[], joins: readonly HubInviteJoin[]) {
  const added: HubPerson[] = [], members = [...group.members], known = others.filter(p => !p.me && !p.deleted);
  for (const join of joins) {
    const name = join.name.trim().slice(0, 40); if (!name) continue;
    let person = [...known, ...added].find(p => p.name.trim().toLowerCase() === name.toLowerCase());
    if (!person) { person = { id: hubId(), updatedAt: 0, name, color: HUB_PERSON_COLORS[(known.length + added.length) % HUB_PERSON_COLORS.length] }; added.push(person); }
    if (!members.includes(person.id)) members.push(person.id);
  }
  return { added, group: members.length !== group.members.length ? { ...group, members } : null };
}
