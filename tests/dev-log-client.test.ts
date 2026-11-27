import 'fake-indexeddb/auto';
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/services/auth';
import { AppReleaseService } from '../src/app/services/app-release';
import { DevLogReporter, devLogMessage, devLogRoutePattern, devLogScrub } from '../src/app/services/dev-log';
import { FeedbackService } from '../src/app/services/feedback';

// Dati sintetici: nessun archivio, solo la coda del registro in un IndexedDB finto.
const injectors: EnvironmentInjector[] = [];
afterEach(async () => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.useRealTimers(); vi.unstubAllGlobals();
  indexedDB.deleteDatabase('gymtrack-devlog-v1');
});

function setup(role: string | null = 'SuperAdmin') {
  vi.stubGlobal('window', Object.assign(new EventTarget(), {}));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { onLine: true });
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
  const request = vi.fn().mockResolvedValue({ recorded: 1 });
  const auth = { user: signal<any>(role ? { id: 'a', role } : null), loading: signal(false), offlineMode: signal(false), request };
  const events = new Subject<unknown>();
  const router = { events, routerState: { snapshot: { root: null } } };
  const injector = createEnvironmentInjector([
    { provide: AuthService, useValue: auth }, { provide: Router, useValue: router },
    { provide: AppReleaseService, useValue: { currentBuild: () => 'c'.repeat(64) } }, DevLogReporter,
  ], null as unknown as EnvironmentInjector);
  injectors.push(injector);
  const reporter = injector.get(DevLogReporter);
  reporter.start();
  return { reporter, auth, request };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await vi.waitFor(() => {}); };

it('estrae messaggio e pagina senza id reali e ripulisce i dati personali', () => {
  expect(devLogMessage(new TypeError('x non definito'))).toMatchObject({ message: 'TypeError: x non definito' });
  expect(devLogMessage('testo').message).toBe('testo');
  expect(devLogMessage({ message: 'oggetto' }).message).toBe('oggetto');
  const root: any = { routeConfig: null, firstChild: { routeConfig: { path: 'piano/:id' }, firstChild: null } };
  expect(devLogRoutePattern(root)).toBe('/piano/:id');
  expect(devLogScrub('scrivi a nome@example.com', 100)).toBe('scrivi a [email]');
});

it('invia gli errori del Super Admin una volta sola, insieme all’uso della build', async () => {
  const t = setup();
  t.reporter.capture(new Error('Salvataggio non riuscito'), 'client');
  t.reporter.capture(new Error('Salvataggio non riuscito'), 'client');
  new FeedbackService().show('error', 'Messaggio mostrato');
  await settle();
  await t.reporter.flush();
  expect(t.request).toHaveBeenCalledTimes(1);
  const [path, body] = t.request.mock.calls[0];
  expect(path).toBe('dev-log/report');
  expect(body.reports.map((r: any) => [r.source, r.message])).toEqual([['client', 'Salvataggio non riuscito'], ['feedback', 'Messaggio mostrato']]);
  expect(body.usage).toMatchObject({ build: 'c'.repeat(64), appStarts: 1 });
  await t.reporter.flush();
  // Niente di nuovo da inviare: nessuna richiesta in più.
  expect(t.request).toHaveBeenCalledTimes(1);
});

it('non raccoglie nulla per gli altri account e tiene la coda se l’invio fallisce', async () => {
  const other = setup('User');
  other.reporter.capture(new Error('Errore cliente'), 'client');
  await settle(); await other.reporter.flush();
  expect(other.request).not.toHaveBeenCalled();
  for (const injector of injectors.splice(0)) injector.destroy();

  const t = setup();
  t.request.mockRejectedValueOnce(Error('offline'));
  t.reporter.capture(new Error('Errore da riprovare'), 'client');
  await settle(); await t.reporter.flush();
  await t.reporter.flush();
  expect(t.request).toHaveBeenCalledTimes(2);
  expect(t.request.mock.calls[1][1].reports[0].message).toBe('Errore da riprovare');
});
