import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appInviteLink, appInviteTokenFromUrl } from '../src/app/services/app-invite';
import { AppInviteComponent } from '../src/app/shared/app-invite.component';
import { AuthService } from '../src/app/services/auth';
import { ConfirmationService } from '../src/app/services/confirmation';

const token = 'a'.repeat(48);
const invite = { id: 'i1', token, createdAt: 0, expiresAt: Date.UTC(2026, 11, 3), registrations: 2, maxRegistrations: 5 };

it('legge il token del link di invito all’app solo se ben formato', () => {
  const link = appInviteLink('https://gymtrack.test', token);
  expect(link).toBe('https://gymtrack.test/#/benvenuto?accesso=' + token);
  expect(appInviteTokenFromUrl(link)).toBe(token);
  expect(appInviteTokenFromUrl('https://gymtrack.test/#/benvenuto?accesso=' + token + '&x=1')).toBe(token);
  expect(appInviteTokenFromUrl('https://gymtrack.test/#/benvenuto?accesso=corto')).toBe('');
  expect(appInviteTokenFromUrl('https://gymtrack.test/#/gruppo?invito=' + token)).toBe('');
});

let injector: EnvironmentInjector;
let request: ReturnType<typeof vi.fn>;
let ask: ReturnType<typeof vi.fn>;
const role = signal<'SuperAdmin' | 'User'>('SuperAdmin');
function setup() {
  injector = createEnvironmentInjector([
    { provide: AuthService, useValue: { user: () => ({ role: role() }), viewAsClient: () => false, offlineMode: () => false, request } },
    { provide: ConfirmationService, useValue: { ask } },
  ], null as unknown as EnvironmentInjector);
  return runInInjectionContext(injector, () => new AppInviteComponent());
}
beforeEach(() => {
  role.set('SuperAdmin');
  request = vi.fn(async (path: string, body?: unknown) => {
    if (path === 'app-invites' && body === undefined) return { invites: [invite] };
    if (path === 'app-invites') return { invite: { ...invite, id: 'i2', token: 'b'.repeat(48), registrations: 0 } };
    return { ok: true };
  });
  ask = vi.fn(async () => true);
  vi.stubGlobal('location', { origin: 'https://gymtrack.test' });
});
afterEach(() => { injector?.destroy(); vi.unstubAllGlobals(); });

it('il Super Admin vede il link attivo con scadenza e account usati', async () => {
  const c = setup();
  await vi.waitFor(() => expect(c.current()).toBeTruthy());
  expect(request).toHaveBeenCalledWith('app-invites');
  expect(c.link(c.current()!)).toBe('https://gymtrack.test/#/benvenuto?accesso=' + token);
  expect(c.expiry(c.current()!)).toBe('3 dicembre');
});

it('un nuovo link chiede conferma e sostituisce il precedente; disattivare lo toglie', async () => {
  const c = setup();
  await vi.waitFor(() => expect(c.current()).toBeTruthy());
  ask.mockResolvedValueOnce(false);
  await c.create();
  expect(c.current()!.id).toBe('i1');
  await c.create();
  expect(request).toHaveBeenCalledWith('app-invites', {});
  expect(c.current()!.id).toBe('i2');
  await c.revoke();
  expect(request).toHaveBeenCalledWith('app-invites/revoke', {});
  expect(c.current()).toBeUndefined();
});

it('senza ruolo Super Admin non carica nulla', () => {
  role.set('User');
  const c = setup();
  expect(c.available()).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it('mostra l’errore del server senza fingere la riuscita', async () => {
  const c = setup();
  await vi.waitFor(() => expect(c.current()).toBeTruthy());
  request.mockRejectedValueOnce(new Error('Accesso riservato al Super Admin.'));
  await c.create();
  expect(c.error()).toBe('Accesso riservato al Super Admin.');
  expect(c.current()!.id).toBe('i1');
});
