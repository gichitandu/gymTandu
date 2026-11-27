import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/services/auth';
import { CoachAiService, coachAiSessionContext, coachAiSetContext, validCoachAiAdvice } from '../src/app/services/coach-ai';
import { coachNextSet } from '../src/app/services/coach-shadow';
import type { CoachReview } from '../src/app/services/coach-review';
import { coachAiClean } from '../worker/coach-ai.js';

// Dati sintetici: nessuna seduta reale, il server è sostituito da fetch simulato.
const reply = (body: any, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
let injector: EnvironmentInjector | undefined, fetchMock: ReturnType<typeof vi.fn>;
const auth = { user: signal<any>({ id: 'account' }), offlineMode: signal(false) };
function service() {
  injector = createEnvironmentInjector([{ provide: AuthService, useValue: auth }, CoachAiService], null as unknown as EnvironmentInjector);
  return injector.get(CoachAiService);
}
beforeEach(() => {
  auth.user.set({ id: 'account' }); auth.offlineMode.set(false);
  fetchMock = vi.fn(async () => reply({ headline: 'Ok', advice: 'Tieni il carico.', cues: ['Scapole indietro'], stance: 'agree', provider: 'gemini', remaining: 19 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { injector?.destroy(); injector = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('prepara il contesto della serie senza dati personali e nell’unità dell’utente', () => {
  const suggestion = coachNextSet({ repsMin: 6, repsMax: 10, incrementKg: 2.5, done: [{ weight: 100, reps: 8, rpe: 8 }] });
  const context = coachAiSetContext({
    exercise: 'Panca piana', muscle: 'Petto', equipment: 'Bilanciere', loadMode: 'external', unit: 'lb', repsMin: 6, repsMax: 10, targetRpe: 8,
    setNumber: 2, plannedSets: 4, today: [{ weight: 100, reps: 8, rpe: 8 }, { weight: 100, reps: 6, rir: 1, pain: true }], history: [{ date: '2026-03-01', sets: [{ weight: 95, reps: 9, rpe: 8 }] }],
    suggestion, readiness: 'low', sore: true, weeklySets: 9.5, week: 3, phase: 'Accumulo', toUnit: (kg) => kg * 2.20462,
  }) as any;
  expect(context).toMatchObject({ esercizio: 'Panca piana', muscolo: 'Petto', unita: 'lb', modalitaCarico: 'carico esterno', obiettivo: { ripetizioni: '6–10', rpe: 8 }, serie: { numero: 2, previste: 4 }, checkin: { recupero: 'basso', muscoloIndolenzito: true }, serieSettimanaliMuscolo: 9.5, programma: { settimana: 3, fase: 'Accumulo' } });
  expect(context.oggi).toEqual([{ carico: 220.46, ripetizioni: 8, rpe: 8 }, { carico: 220.46, ripetizioni: 6, riserva: 1, dolore: true }]);
  expect(context.sedutePrecedenti[0]).toEqual({ data: '2026-03-01', serie: [{ carico: 209.44, ripetizioni: 9, rpe: 8 }] });
  expect(context.proposta).toMatchObject({ azione: suggestion!.title, tipo: suggestion!.action, ripetizioni: suggestion!.reps, motivo: suggestion!.reason, affidabilita: 'high' });
  // Il server accetta il contesto così com'è.
  expect(coachAiClean(context)).toEqual(context);
  const bodyweight = coachAiSetContext({ exercise: 'Trazioni', loadMode: 'bodyweight', unit: 'kg', repsMin: 5, repsMax: 8, setNumber: 1, plannedSets: 3, today: [{ weight: 0, reps: 6 }], history: [], suggestion: null, toUnit: (kg) => kg }) as any;
  expect(bodyweight.oggi).toEqual([{ ripetizioni: 6 }]);
  expect(bodyweight.proposta).toBeUndefined();
});

it('il contesto della seduta resta entro i limiti del server anche con molti esercizi', () => {
  const sets = Array.from({ length: 10 }, (_, index) => ({ weight: 82.5, reps: 10 - (index % 3), effort: 8.5 }));
  const review: CoachReview = {
    workingSets: 120, declared: 120, effective: 100, easy: 10, failure: 6, pain: 1, degraded: 0,
    muscles: Array.from({ length: 10 }, (_, index) => ({ id: 'm' + index, name: 'Muscolo ' + index, session: 6, weekly: 14.5 })),
    exercises: Array.from({ length: 14 }, (_, index) => ({ name: 'Esercizio con un nome piuttosto lungo ' + index, sets, loadMode: 'external', repsMin: 8, repsMax: 12 })),
    insights: Array.from({ length: 10 }, (_, index) => ({ tone: 'info' as const, title: 'Segnale ' + index, text: 'x'.repeat(180) })),
  };
  const context = coachAiSessionContext({ dayName: 'Spinta', planName: 'Blocco', date: '2026-03-10', duration: 72, unit: 'kg', review, next: [{ name: 'Esercizio con un nome piuttosto lungo 0', target: '85 kg × 8 · 8 · 8 rip.', title: 'Sali di carico' }], records: [{ name: 'Panca', kind: 'load', before: 80, after: 82.5 }], toUnit: (kg) => kg }) as any;
  expect(context.esercizi).toHaveLength(12);
  expect(context.esercizi[0]).toMatchObject({ obiettivo: '8–12', prossimaVolta: 'Sali di carico: 85 kg × 8 · 8 · 8 rip.' });
  expect(context.esercizi[0].serie).toBe('82.5×10 RPE 8.5, 82.5×9 RPE 8.5, 82.5×8 RPE 8.5, 82.5×10 RPE 8.5, 82.5×9 RPE 8.5, 82.5×8 RPE 8.5, 82.5×10 RPE 8.5, 82.5×9 RPE 8.5');
  expect(context.sforzo).toEqual({ conSforzoIndicato: 120, utili0a3Riserva: 94, cedimento: 6, facili4piuRiserva: 10 });
  expect(context.record).toEqual(['Panca: carico 80 → 82.5']);
  expect(JSON.stringify(coachAiClean(context)).length).toBeLessThanOrEqual(9000);
});

it('accetta solo risposte con un parere e ne limita i testi', () => {
  expect(validCoachAiAdvice(null, 'set')).toBeNull();
  expect(validCoachAiAdvice({ headline: 'Solo titolo' }, 'set')).toBeNull();
  expect(validCoachAiAdvice({ advice: '<i>Sali</i>', cues: ['a', 'b', 'c', 'd'], positives: ['x'], stance: 'other', provider: 'altro', remaining: -1 }, 'set'))
    .toEqual({ kind: 'set', headline: '', advice: 'i Sali /i', answer: '', stance: 'agree', cues: ['a', 'b', 'c'], positives: [], improvements: [], focus: '', provider: 'cloudflare' });
  expect(validCoachAiAdvice({ answer: 'Sì', positives: ['p'], improvements: ['i'], focus: 'f', cues: ['c'], stance: 'cautious', provider: 'gemini', remaining: 3 }, 'session'))
    .toMatchObject({ answer: 'Sì', positives: ['p'], improvements: ['i'], focus: 'f', cues: [], stance: 'cautious', provider: 'gemini', remaining: 3 });
});

it('chiede il parere al Worker e mostra gli errori del server', async () => {
  const coach = service();
  const advice = await coach.ask('set', { esercizio: 'Panca' }, '  come tengo i gomiti?  ');
  expect(advice).toMatchObject({ advice: 'Tieni il carico.', provider: 'gemini', remaining: 19, cues: ['Scapole indietro'] });
  const [url, init] = fetchMock.mock.calls[0] as any[];
  expect(url).toBe('/api/coach-ai');
  expect(JSON.parse(init.body)).toEqual({ kind: 'set', context: { esercizio: 'Panca' }, question: 'come tengo i gomiti?' });
  expect(coach.busy()).toBe(false);
  fetchMock.mockResolvedValueOnce(reply({ error: 'Hai usato tutte le analisi AI del Coach per oggi.', code: 'COACH_AI_LIMIT' }, 429));
  await expect(coach.ask('set', {})).rejects.toThrow('Hai usato tutte le analisi AI del Coach per oggi.');
  fetchMock.mockResolvedValueOnce(reply({ headline: 'vuoto' }));
  await expect(coach.ask('set', {})).rejects.toThrow('formato non valido');
  auth.offlineMode.set(true);
  expect(coach.online()).toBe(false);
  await expect(coach.ask('set', {})).rejects.toThrow('richiede la connessione');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
