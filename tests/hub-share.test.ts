import { describe, expect, it } from 'vitest';
import { hubApi, hubShareClean } from '../worker/hub.js';
import { collectShared, localizeShared, sharedSignature } from '../src/app/hub/hub-share-data';
import { emptyHubDoc, HubDoc } from '../src/app/hub/hub-model';

const base = (): HubDoc => ({
  ...emptyHubDoc(),
  people: [{ id: 'me', updatedAt: 1, name: 'Tu', color: '#111', me: true }, { id: 'marco', updatedAt: 5, name: 'Marco', color: '#222' }],
  groups: [{ id: 'grp-12345678', updatedAt: 9, name: 'Casa', icon: 'house', members: ['me', 'marco'] }],
  expenses: [{ id: 'e1', updatedAt: 10, groupId: 'grp-12345678', description: 'Spesa', amount: 3000, paidBy: 'me', date: '2026-11-01', category: 'altro', mode: 'equal', parts: { me: 1, marco: 1 } }],
  settlements: [{ id: 's1', updatedAt: 11, groupId: 'grp-12345678', from: 'marco', to: 'me', amount: 500, date: '2026-11-02' }],
});

describe('identità nei gruppi condivisi', () => {
  it('traduce "Tu" nell\'id account e ritorno senza perdere dati', () => {
    const shared = collectShared(base(), 'grp-12345678', 'u1', 'Giulia')!;
    expect(shared.group.members).toEqual(['m-u1', 'marco']);
    expect(shared.expenses[0].paidBy).toBe('m-u1');
    expect(Object.keys(shared.expenses[0].parts).sort()).toEqual(['m-u1', 'marco']);
    expect(shared.settlements[0].to).toBe('m-u1');
    expect(shared.people.find(p => p.id === 'm-u1')?.name).toBe('Giulia');
    const back = localizeShared(shared, 'u1');
    expect(back.groups[0]).toMatchObject({ shared: true, members: ['me', 'marco'] });
    expect(back.expenses[0].paidBy).toBe('me');
    expect(back.people.map(p => p.id)).toEqual(['marco']);
  });
  it('un altro account vede se stesso come "Tu" e chi ha pagato come persona', () => {
    const shared = collectShared(base(), 'grp-12345678', 'u1', 'Giulia')!;
    const other = localizeShared(shared, 'u2');
    expect(other.expenses[0].paidBy).toBe('m-u1');
    expect(other.people.some(p => p.id === 'm-u1' && p.name === 'Giulia')).toBe(true);
  });
  it('la firma ignora i dati dell\'account e cambia con una spesa nuova', () => {
    const a = collectShared(base(), 'grp-12345678', 'u1', 'Giulia')!, b = structuredClone(a);
    expect(sharedSignature(a)).toBe(sharedSignature(b));
    b.expenses.push({ ...b.expenses[0], id: 'e2' });
    expect(sharedSignature(a)).not.toBe(sharedSignature(b));
  });
});

describe('API gruppi condivisi', () => {
  const store = new Map<string, { text: string; meta: any; etag: string }>(); let n = 0;
  const bucket = {
    head: async (k: string) => store.get(k) ?? null,
    get: async (k: string) => { const o = store.get(k); return o ? { etag: o.etag, customMetadata: o.meta, text: async () => o.text } : null; },
    put: async (k: string, text: string, opt: any = {}) => { const o = store.get(k); if (opt.onlyIf?.etagMatches && o?.etag !== opt.onlyIf.etagMatches) return null; const v = { text, meta: opt.customMetadata, etag: 'e' + ++n }; store.set(k, v); return v; },
    delete: async (k: string) => { store.delete(k); },
  };
  const env = { BUCKET: bucket }, admin = { id: 'u1', role: 'SuperAdmin', name: 'Giulia' }, guest = { id: 'u2', role: 'SuperAdmin', name: 'Luca' }, stranger = { id: 'u3', role: 'SuperAdmin', name: 'Intruso' };
  const call = (user: any, method: string, path: string, body?: any) => hubApi(new Request('https://x.test' + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) }), env as any, user);

  it('crea, invita, fa entrare un secondo account e sincronizza le spese', async () => {
    const shared = collectShared(base(), 'grp-12345678', 'u1', 'Giulia')!;
    expect((await call(admin, 'POST', '/api/hub/share', shared)).status).toBe(200);
    const invite = await (await call(admin, 'POST', '/api/hub/share/grp-12345678/invite', {})).json() as any;
    expect(invite.token.length).toBeGreaterThan(20);
    expect((await call(admin, 'POST', '/api/hub/share/grp-12345678/invite', {}).then(r => r.json()) as any).token).toBe(invite.token);

    expect((await call(stranger, 'GET', '/api/hub/share/grp-12345678')).status).toBe(404);
    const preview = await (await call(guest, 'GET', '/api/hub/invite/' + invite.token)).json() as any;
    expect(preview).toMatchObject({ name: 'Casa', by: 'Giulia', members: 1, joined: false });
    expect((await call(guest, 'POST', '/api/hub/invite/' + invite.token)).status).toBe(200);
    expect((await call(guest, 'POST', '/api/hub/invite/' + invite.token)).status).toBe(200);

    const read = await (await call(guest, 'GET', '/api/hub/share/grp-12345678')).json() as any;
    expect(read.data.accounts).toEqual(['u1', 'u2']);
    expect(read.data.group.members).toContain('m-u2');
    expect(read.data.people.find((p: any) => p.id === 'm-u2').name).toBe('Luca');

    const stale = await call(guest, 'PUT', '/api/hub/share/grp-12345678', { baseRevision: 0, data: read.data });
    expect(stale.status).toBe(409);
    const next = { ...read.data, expenses: [...read.data.expenses, { ...read.data.expenses[0], id: 'e2', updatedAt: 99 }] };
    const saved = await call(guest, 'PUT', '/api/hub/share/grp-12345678', { baseRevision: read.revision, data: next });
    expect(saved.status).toBe(200);
    const again = await (await call(admin, 'GET', '/api/hub/share/grp-12345678')).json() as any;
    expect(again.data.expenses.map((e: any) => e.id)).toEqual(['e1', 'e2']);
  });
  it('rifiuta inviti sconosciuti e non lascia aggiungere account falsi', async () => {
    expect((await call(guest, 'GET', '/api/hub/invite/' + 'x'.repeat(32))).status).toBe(404);
    const cleaned = hubShareClean({ group: { id: 'g', name: 'G', icon: 'house', members: ['m-evil', 'ok'], updatedAt: 1 }, people: [{ id: 'm-evil', updatedAt: 1 }, { id: 'ok', updatedAt: 1 }] }, { accounts: ['u1'], group: { members: ['m-u1'], updatedAt: 1 } });
    expect(cleaned.group.members).toEqual(['m-u1', 'ok']);
    expect(cleaned.people.map((p: any) => p.id)).toEqual(['ok']);
  });
});
