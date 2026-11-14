import { expect, it } from 'vitest';
import { applyInviteJoins, inviteTokenFromUrl, inviteUrl } from '../src/app/hub/hub-invite-links';

const HUB_ME = 'me';

const token = 'A'.repeat(32);

it('riconosce solo URL d’invito con token valido', () => {
  expect(inviteTokenFromUrl('/invito/' + token)).toBe(token);
  expect(inviteTokenFromUrl('/invito/' + token + '?x=1')).toBe(token);
  expect(inviteTokenFromUrl('/invito/corto')).toBe('');
  expect(inviteTokenFromUrl('/hub/dividi')).toBe('');
  expect(inviteUrl(token, 'https://app.test/')).toBe('https://app.test/#/invito/' + token);
});

it('aggiunge al gruppo chi entra dal link senza duplicare persone con lo stesso nome', () => {
  const people = [{ id: 'p1', updatedAt: 1, name: 'Marta', color: '#111' }];
  const group = { id: 'g', updatedAt: 1, name: 'Casa', icon: 'house', members: [HUB_ME, 'p1'], invite: token };
  const result = applyInviteJoins(group, people, [{ id: 'j1', name: 'marta', at: 1 }, { id: 'j2', name: 'Giulia', at: 2 }, { id: 'j3', name: 'GIULIA ', at: 3 }]);
  expect(result.added.map(p => p.name)).toEqual(['Giulia']);
  expect(result.group?.members).toEqual([HUB_ME, 'p1', result.added[0].id]);
  expect(result.group?.invite).toBe(token);
  // Persona già nota ma non nel gruppo: viene aggiunta come membro, senza crearne una nuova.
  const outside = applyInviteJoins({ ...group, members: [HUB_ME] }, people, [{ id: 'j4', name: 'Marta', at: 4 }]);
  expect(outside.added).toEqual([]);
  expect(outside.group?.members).toEqual([HUB_ME, 'p1']);
  expect(applyInviteJoins(group, people, [{ id: 'j5', name: 'Marta', at: 5 }]).group).toBeNull();
});
