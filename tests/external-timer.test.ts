import '@angular/compiler';
import { afterEach, expect, it, vi } from 'vitest';
import { ExternalTimerService, ExternalTimerState, externalTimerNotification, externalTimerSeconds } from '../src/app/services/external-timer';
import { exportBackup, importBackup } from '../src/app/services/backup';
import { seed } from '../src/app/core/seed';

const instances: ExternalTimerService[] = [];
afterEach(() => {
  instances.forEach(service => service.ngOnDestroy());
  instances.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function browser(windowExtras: Record<string, unknown> = {}) {
  const listeners = new Map<string, () => void>();
  const document = {
    title: 'GymTrack',
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
    createElement: () => ({}),
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { focus: vi.fn(), ...windowExtras });
  vi.stubGlobal('navigator', {});
  return { document, listeners };
}

function service() {
  const instance = new ExternalTimerService();
  instances.push(instance);
  return instance;
}

function state(seconds = 90): ExternalTimerState {
  return { end: Date.now() + seconds * 1000, paused: false, pausedSeconds: 0, title: 'Panca piana' };
}

it('reconciles elapsed background time from the deadline and holds the paused duration', () => {
  const timer = { end: 100_000, paused: false, pausedSeconds: 17, title: 'Squat' };
  expect(externalTimerSeconds(timer, 9_500)).toBe(91);
  expect(externalTimerSeconds(timer, 99_100)).toBe(1);
  expect(externalTimerSeconds(timer, 200_000)).toBe(0);
  expect(externalTimerSeconds({ ...timer, paused: true }, 200_000)).toBe(17);
  expect(externalTimerNotification(timer, 200_000)).toBe('Recupero terminato. Squat');
});

it('requests notification permission only on an explicit click and keeps an accurate finish-time notification while suspended', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  const notification = { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') };
  const { listeners } = browser({ Notification: notification });
  vi.stubGlobal('Notification', notification);
  const registration = { showNotification: vi.fn().mockResolvedValue(undefined), getNotifications: vi.fn().mockResolvedValue([]) };
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
  const timer = service(), initial = state();
  timer.sync(initial);
  expect(notification.requestPermission).not.toHaveBeenCalled();
  await timer.requestAutomaticPermission();
  expect(notification.requestPermission).toHaveBeenCalledOnce();
  expect(timer.active()).toBe(true);
  expect(registration.showNotification.mock.calls[0][1].body).toBe(externalTimerNotification(initial));
  await vi.advanceTimersByTimeAsync(10_000);
  expect(registration.showNotification).toHaveBeenCalledOnce();
  timer.sync({ ...initial, paused: true, pausedSeconds: 23 });
  expect(registration.showNotification.mock.calls[1][1].body).toBe('In pausa · 00:23. Panca piana');
  timer.sync(initial);
  await Promise.resolve();
  vi.setSystemTime(initial.end + 60_000);
  listeners.get('visibilitychange')!();
  await Promise.resolve();
  expect(registration.showNotification.mock.lastCall![1].body).toBe('Recupero terminato. Panca piana');
  expect(timer.message()).toContain('può arrivare al rientro');
});

it('updates the floating window from the same deadline and closes it when recovery is skipped', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  const elements = new Map<string, { id: string; textContent?: string }>();
  const external = {
    closed: false, close: vi.fn(), focus: vi.fn(), addEventListener: vi.fn(),
    document: {
      title: '',
      createElement: () => ({ id: '', setAttribute: vi.fn() }),
      head: { append: vi.fn() },
      body: { append: (...items: { id: string }[]) => items.forEach(item => elements.set(item.id, item)) },
      getElementById: (id: string) => elements.get(id),
    },
  };
  const requestWindow = vi.fn().mockResolvedValue(external);
  const { listeners, document } = browser({ documentPictureInPicture: { requestWindow } });
  const timer = service(), initial = state();
  await timer.open(initial);
  expect(timer.active()).toBe(true);
  expect(elements.get('countdown')!.textContent).toBe('01:30');
  vi.setSystemTime(initial.end - 12_000);
  listeners.get('visibilitychange')!();
  expect(elements.get('countdown')!.textContent).toBe('00:12');
  timer.sync({ ...initial, paused: true, pausedSeconds: 12 });
  vi.setSystemTime(initial.end + 100_000);
  listeners.get('visibilitychange')!();
  expect(elements.get('countdown')!.textContent).toBe('00:12');
  expect(elements.get('timer-status')!.textContent).toBe('In pausa');
  timer.stop();
  expect(external.close).toHaveBeenCalledOnce();
  expect(timer.active()).toBe(false);
  expect(document.title).toBe('GymTrack');
});

it('reports unavailable platform features without claiming the timer is externally visible', async () => {
  browser();
  const timer = service();
  await timer.open(state());
  expect(timer.active()).toBe(false);
  expect(timer.message()).toContain('Live Activities');
});

it('handles rejected notification delivery without leaving an active external timer', async () => {
  const notification = { permission: 'granted' };
  browser({ Notification: notification });
  vi.stubGlobal('Notification', notification);
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ showNotification: vi.fn().mockRejectedValue(Error('Not supported')), getNotifications: vi.fn().mockResolvedValue([]) }) } });
  const timer = service();
  timer.sync(state());await timer.requestAutomaticPermission();
  expect(timer.active()).toBe(false);
  expect(timer.message()).toContain('non ha mostrato la notifica');
});

it('automatically shows each recovery after permission is granted and keeps the next timer enabled after a skip', async () => {
  const notification={permission:'granted',requestPermission:vi.fn()};
  browser({Notification:notification});vi.stubGlobal('Notification',notification);
  const registration={showNotification:vi.fn().mockResolvedValue(undefined),getNotifications:vi.fn().mockResolvedValue([])};
  vi.stubGlobal('navigator',{serviceWorker:{getRegistration:vi.fn().mockResolvedValue(registration)}});
  const timer=service();timer.sync(state());
  await vi.waitFor(()=>expect(timer.active()).toBe(true));
  expect(registration.showNotification).toHaveBeenCalledOnce();expect(notification.requestPermission).not.toHaveBeenCalled();
  timer.stop();timer.sync(state(120));
  await vi.waitFor(()=>expect(registration.showNotification).toHaveBeenCalledTimes(2));
  expect(timer.active()).toBe(true);
  timer.setAutomaticEnabled(false);
  expect(timer.active()).toBe(false);
  timer.sync(state(90),false);
  await Promise.resolve();expect(registration.showNotification).toHaveBeenCalledTimes(2);
});

it('requests permission directly on the user gesture before a timer exists, then starts automatic notifications', async () => {
  let grant!:(permission:string)=>void;
  const notification={permission:'default',requestPermission:vi.fn(()=>new Promise<string>(resolve=>grant=resolve))};
  browser({Notification:notification});vi.stubGlobal('Notification',notification);
  const registration={showNotification:vi.fn().mockResolvedValue(undefined),getNotifications:vi.fn().mockResolvedValue([])};
  vi.stubGlobal('navigator',{serviceWorker:{getRegistration:vi.fn().mockResolvedValue(registration)}});
  const timer=service(),permission=timer.requestAutomaticPermission();
  expect(notification.requestPermission).toHaveBeenCalledOnce();
  grant('granted');await permission;
  expect(registration.showNotification).not.toHaveBeenCalled();
  timer.sync(state());await vi.waitFor(()=>expect(timer.active()).toBe(true));
  expect(registration.showNotification).toHaveBeenCalledOnce();
});

it('does not deliver an obsolete automatic notification when setup finishes after a skip', async () => {
  const notification={permission:'granted'};
  browser({Notification:notification});vi.stubGlobal('Notification',notification);
  let ready!:(registration:unknown)=>void;
  vi.stubGlobal('navigator',{serviceWorker:{getRegistration:vi.fn(()=>new Promise(resolve=>ready=resolve))}});
  const registration={showNotification:vi.fn().mockResolvedValue(undefined),getNotifications:vi.fn().mockResolvedValue([])};
  const timer=service();timer.sync(state());timer.stop();ready(registration);
  await Promise.resolve();await Promise.resolve();
  expect(registration.showNotification).not.toHaveBeenCalled();expect(timer.active()).toBe(false);
});

it('roundtrips an explicitly disabled automatic timer preference without requiring a data migration', async () => {
  const data=seed();expect(data.settings[0].externalTimerEnabled!==false).toBe(true);
  data.settings[0].externalTimerEnabled=false;
  const restored=await importBackup(await exportBackup(data));
  expect(restored.settings[0].externalTimerEnabled).toBe(false);
});

it('does not create hidden media when only synchronizing the recovery',()=>{
  const {document}=browser();const create=vi.spyOn(document,'createElement');const timer=service();
  timer.sync(state());timer.sync(state());expect(create).not.toHaveBeenCalled();
});
it('does not silently substitute a notification when the requested floating timer is unavailable',async()=>{
  const notification={permission:'default',requestPermission:vi.fn()};browser({Notification:notification});vi.stubGlobal('Notification',notification);
  const timer=service();await timer.open(state());expect(notification.requestPermission).not.toHaveBeenCalled();expect(timer.active()).toBe(false);expect(timer.message()).toContain('Live Activities');
});
