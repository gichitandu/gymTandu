import { HubDoc, HubExpense, HubGroup, HubPerson, HubSettlement } from './hub-model';

const HUB_ME = 'me';

/** Contenuto di un gruppo condiviso: gli stessi record del Hub, con identità valide per tutti i membri. */
export interface SharedGroupData { group: HubGroup; people: HubPerson[]; expenses: HubExpense[]; settlements: HubSettlement[]; accounts?: string[] }

/** Id di una persona con account nel gruppo condiviso. */
export const shareMemberId = (uid: string) => 'm-' + uid;
const mapId = (id: string, from: string, to: string) => id === from ? to : id;
const mapParts = (parts: Record<string, number>, from: string, to: string) => Object.fromEntries(Object.entries(parts).map(([k, v]) => [mapId(k, from, to), v]));

function remap(data: SharedGroupData, from: string, to: string): SharedGroupData {
  return {
    ...data,
    group: { ...data.group, members: data.group.members.map(m => mapId(m, from, to)) },
    people: data.people.map(p => ({ ...p, id: mapId(p.id, from, to) })),
    expenses: data.expenses.map(e => ({ ...e, paidBy: mapId(e.paidBy, from, to), parts: mapParts(e.parts, from, to) })),
    settlements: data.settlements.map(s => ({ ...s, from: mapId(s.from, from, to), to: mapId(s.to, from, to) })),
  };
}

/** Dal Hub locale al formato condiviso: "Tu" diventa l'id dell'account. */
export function collectShared(doc: HubDoc, groupId: string, uid: string, myName: string): SharedGroupData | null {
  const group = doc.groups.find(g => g.id === groupId && !g.deleted);
  if (!group) return null;
  const me = shareMemberId(uid), meRow = doc.people.find(p => p.id === HUB_ME);
  const ids = new Set(group.members);
  const people = doc.people.filter(p => ids.has(p.id) && p.id !== HUB_ME).map(p => ({ ...p }));
  if (meRow) people.push({ id: HUB_ME, updatedAt: 1, name: myName, color: meRow.color });
  const { shared: _shared, ...plain } = group;
  return remap({
    group: plain,
    people,
    expenses: doc.expenses.filter(e => e.groupId === groupId),
    settlements: doc.settlements.filter(s => s.groupId === groupId),
  }, HUB_ME, me);
}

/** Dal formato condiviso al Hub locale: l'id dell'account torna "Tu". */
export function localizeShared(data: SharedGroupData, uid: string): Pick<HubDoc, 'groups' | 'people' | 'expenses' | 'settlements'> {
  const me = shareMemberId(uid), local = remap(data, me, HUB_ME);
  return {
    groups: [{ ...local.group, shared: true }],
    people: local.people.filter(p => p.id !== HUB_ME),
    expenses: local.expenses,
    settlements: local.settlements,
  };
}

/** Impronta del contenuto: uguale se due copie hanno gli stessi record alla stessa versione. */
export function sharedSignature(data: SharedGroupData) {
  const rows = (list: { id: string; updatedAt: number; deleted?: boolean }[]) => list.map(r => `${r.id}:${r.updatedAt}:${r.deleted ? 1 : 0}`).sort().join(',');
  const g = data.group;
  return [`${g.id}:${g.updatedAt}:${g.name}:${[...g.members].sort().join('+')}:${g.archived ? 1 : 0}`, rows(data.people.filter(p => !p.id.startsWith('m-'))), rows(data.expenses), rows(data.settlements)].join('|');
}

