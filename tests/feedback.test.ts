import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { FeedbackService, feedbackSignal } from '../src/app/services/feedback';
import { Store } from '../src/app/services/store';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { seed } from '../src/app/core/seed';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('hides feedback after three seconds without any layout or store action', () => {
  vi.useFakeTimers();
  const feedback = new FeedbackService();
  feedback.show('success', 'Esercizio salvato.');
  expect(feedback.current()).toMatchObject({ kind: 'success', message: 'Esercizio salvato.' });
  vi.advanceTimersByTime(2999);
  expect(feedback.current()).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(feedback.current()).toBeNull();
});

it('renews all three seconds for an identical new message and ignores stale dismissals', () => {
  vi.useFakeTimers();
  const feedback = new FeedbackService(), message = feedbackSignal('success', feedback);
  message.set('Modifiche salvate.');
  const first = feedback.current()!.id;
  vi.advanceTimersByTime(2500);
  message.set('Modifiche salvate.');
  const second = feedback.current()!.id;
  expect(second).not.toBe(first);
  feedback.dismiss(first);
  vi.advanceTimersByTime(2999);
  expect(feedback.current()?.id).toBe(second);
  vi.advanceTimersByTime(1);
  expect(feedback.current()).toBeNull();
  expect(message()).toBe('Modifiche salvate.');
});

it('replaces a popup, permits closing it, and gives the next popup its own timer', () => {
  vi.useFakeTimers();
  const feedback = new FeedbackService();
  feedback.show('error', 'Peso non valido.');
  vi.advanceTimersByTime(1000);
  feedback.show('success', 'Peso aggiornato.');
  vi.advanceTimersByTime(2000);
  expect(feedback.current()?.message).toBe('Peso aggiornato.');
  feedback.dismiss();
  expect(feedback.current()).toBeNull();
  feedback.show('error', 'Archivio occupato.');
  vi.advanceTimersByTime(2999);
  expect(feedback.current()?.kind).toBe('error');
  vi.advanceTimersByTime(1);
  expect(feedback.current()).toBeNull();
});

it('preserves a Store save error after closing or expiring its popup', async () => {
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  const injector = createEnvironmentInjector([
    { provide: GYM_REPOSITORY, useValue: { read: async () => seed(), replace: async () => {} } },
    FeedbackService, Store,
  ], null as unknown as EnvironmentInjector);
  const store = injector.get(Store), feedback = injector.get(FeedbackService);
  try {
    await vi.waitFor(() => expect(store.ready()).toBe(true));
    vi.useFakeTimers();
    store.error.set('Salvataggio non riuscito.');
    feedback.dismiss();
    expect(store.error()).toBe('Salvataggio non riuscito.');
    store.error.update(value => value);
    expect(feedback.current()?.message).toBe('Salvataggio non riuscito.');
    vi.advanceTimersByTime(3000);
    expect(feedback.current()).toBeNull();
    expect(store.error()).toBe('Salvataggio non riuscito.');
    store.error.set('');
    expect(feedback.current()).toBeNull();
  } finally { injector.destroy(); }
});
