import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NutritionComponent } from '../src/app/features/nutrition.component';
import { Store } from '../src/app/services/store';
import { LocalAiService } from '../src/app/services/local-ai';
import { MealScanLimitError, MealScanService } from '../src/app/services/meal-scan';
import { FeedbackService } from '../src/app/services/feedback';
import { mealTypeForHour } from '../src/app/services/nutrition';
import { seed } from '../src/app/core/seed';
import { DataSet } from '../src/app/models/domain';

// Dati sintetici: la lettura con AI e il riconoscimento sul dispositivo sono simulati.
const RESET = Date.UTC(2026, 10, 15);
const available = { available: true, blocked: false, usedPercent: 12, thresholdPercent: 95, resetAt: RESET, remainingScans: 80 };
const scanned = { kind: 'plate' as const, dish: 'Pollo e riso', items: [{ name: 'Petto di pollo', grams: 150, calories: 248, protein: 46.5, carbs: 0, fat: 5.4 }, { name: 'Riso', grams: 180, calories: 234, protein: 4.9, carbs: 50.8, fat: 0.5 }] };
let injector: EnvironmentInjector, component: NutritionComponent, data: ReturnType<typeof signal<DataSet>>;
const ai = { cancel: vi.fn(), run: vi.fn(), supported: true };
const blockedUntil = signal(0);
const cloud = { status: signal<any>(available), busy: signal(false), blocked: () => blockedUntil() > 0, resetTime: () => '01:00', waitMessage: () => 'Attendere ripristino: il limite gratuito è quasi raggiunto.', online: () => true, ensureStatus: vi.fn(), scan: vi.fn(), cancel: vi.fn() };
beforeEach(() => {
  data = signal(seed()); blockedUntil.set(0);
  const store = { data, ready: signal(true), busy: signal(false), change: vi.fn(async (fn: (draft: DataSet) => void) => { const draft = structuredClone(data()); fn(draft); data.set(draft); return true; }) };
  ai.cancel.mockReset(); ai.run.mockReset(); ai.run.mockResolvedValue([{ label: 'banana', probability: .9 }]);
  cloud.ensureStatus.mockReset(); cloud.ensureStatus.mockResolvedValue(available); cloud.scan.mockReset(); cloud.scan.mockResolvedValue(scanned); cloud.cancel.mockReset();
  vi.stubGlobal('window', { scrollTo: vi.fn() });
  injector = createEnvironmentInjector([
    { provide: Store, useValue: store }, { provide: LocalAiService, useValue: ai }, { provide: MealScanService, useValue: cloud },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } }, FeedbackService,
  ], null as unknown as EnvironmentInjector);
  component = runInInjectionContext(injector, () => new NutritionComponent());
  component.openNew(); component.photo = new Blob(['foto'], { type: 'image/jpeg' });
});
afterEach(() => { component.ngOnDestroy(); injector.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('compila gli alimenti letti dall’AI e salva il pasto dopo la conferma', async () => {
  await component.recognize();
  expect(cloud.scan).toHaveBeenCalledTimes(1); expect(ai.run).not.toHaveBeenCalled();
  expect(component.analysisState()).toBe('done'); expect(component.analysisSource()).toBe('cloud');
  expect(component.ingredients.map(({ id, ...values }) => values)).toEqual(scanned.items);
  expect(component.composedName).toBe('Pollo e riso'); expect(component.source).toBe('photo-suggestion');
  expect(data().meals).toHaveLength(0);
  component.changeIngredientGrams(component.ingredients[1].id, 90); component.renameIngredient(component.ingredients[1].id, ' Riso basmati ');
  await component.save();
  expect(data().meals).toHaveLength(1);
  expect(data().meals[0]).toMatchObject({ name: 'Pollo e riso', source: 'photo-suggestion', grams: 240, calories: 365 });
  expect(data().meals[0].ingredients![1]).toMatchObject({ name: 'Riso basmati', grams: 90, calories: 117 });
});

it('una nuova analisi sostituisce le voci dell’AI e conserva quelle aggiunte a mano', async () => {
  await component.recognize();
  component.name = 'Olio'; component.grams = 10; component.calories = 90; component.fat = 10; component.addIngredient();
  cloud.scan.mockResolvedValue({ kind: 'label', dish: 'Altro', items: [{ name: 'Yogurt', grams: 125, calories: 80, protein: 5, carbs: 6, fat: 4 }] });
  await component.recognize();
  expect(component.ingredients.map(item => item.name)).toEqual(['Olio', 'Yogurt']);
  expect(component.composedName).toBe('Pollo e riso'); expect(component.analysisMessage()).toContain('etichetta');
});

it('con il limite quasi raggiunto mostra «attendere ripristino» senza alcuna richiesta', async () => {
  blockedUntil.set(RESET);
  await component.recognize();
  expect(component.analysisState()).toBe('blocked'); expect(component.analysisMessage()).toContain('Attendere ripristino');
  expect(component.aiBlocked()).toBe(true); expect(component.aiWaitDetail()).toContain('01:00'); expect(component.aiMeter()).toBeNull();
  expect(cloud.ensureStatus).not.toHaveBeenCalled(); expect(cloud.scan).not.toHaveBeenCalled(); expect(ai.run).not.toHaveBeenCalled();
  expect(component.ingredients).toEqual([]); expect(component.error()).toBe('');
  // Il pasto si può comunque scrivere e salvare a mano.
  component.name = 'Pasta'; component.calories = 350; await component.save();
  expect(data().meals).toHaveLength(1);
});

it('si ferma se il blocco arriva con lo stato o durante la lettura', async () => {
  cloud.ensureStatus.mockImplementation(async () => { blockedUntil.set(RESET); return { ...available, blocked: true }; });
  await component.recognize();
  expect(component.analysisState()).toBe('blocked'); expect(cloud.scan).not.toHaveBeenCalled();
  blockedUntil.set(0); cloud.ensureStatus.mockResolvedValue(available);
  cloud.scan.mockImplementation(async () => { blockedUntil.set(RESET); throw new MealScanLimitError(RESET); });
  await component.recognize();
  expect(component.analysisState()).toBe('blocked'); expect(ai.run).not.toHaveBeenCalled(); expect(component.ingredients).toEqual([]);
});

it('durante la pausa il riconoscimento sul dispositivo resta una scelta esplicita', async () => {
  blockedUntil.set(RESET);
  await component.recognize(true);
  expect(ai.run).toHaveBeenCalledTimes(1); expect(cloud.scan).not.toHaveBeenCalled(); expect(cloud.ensureStatus).not.toHaveBeenCalled();
  expect(component.analysisSource()).toBe('device'); expect(component.suggestions().map(food => food.id)).toEqual(['banana']);
});

it('senza Workers AI usa il riconoscimento sul dispositivo come prima', async () => {
  cloud.ensureStatus.mockResolvedValue({ ...available, available: false });
  await component.recognize();
  expect(cloud.scan).not.toHaveBeenCalled(); expect(ai.run).toHaveBeenCalledTimes(1); expect(component.analysisState()).toBe('done');
  cloud.ensureStatus.mockResolvedValue(null); await component.recognize(); expect(ai.run).toHaveBeenCalledTimes(2);
  cloud.ensureStatus.mockResolvedValue(available); cloud.scan.mockRejectedValue(Object.assign(Error('non configurata'), { code: 'AI_UNAVAILABLE' }));
  await component.recognize(); expect(ai.run).toHaveBeenCalledTimes(3);
});

it('mostra l’errore della lettura senza inventare alimenti e segnala le foto non riconosciute', async () => {
  cloud.scan.mockRejectedValue(Error('Analisi della foto non riuscita. Riprova.'));
  await component.recognize();
  expect(component.analysisState()).toBe('error'); expect(component.error()).toBe('Analisi della foto non riuscita. Riprova.');
  expect(ai.run).not.toHaveBeenCalled(); expect(component.ingredients).toEqual([]);
  cloud.scan.mockResolvedValue({ kind: 'none', dish: '', items: [] });
  await component.recognize();
  expect(component.analysisState()).toBe('unrecognized'); expect(component.source).toBe('manual');
});

it('scarta una risposta arrivata dopo la rimozione della foto', async () => {
  let resolve!: (value: typeof scanned) => void; cloud.scan.mockReturnValue(new Promise(done => resolve = done));
  const pending = component.recognize(); await Promise.resolve(); await Promise.resolve();
  component.removePhoto(); resolve(scanned); await pending;
  expect(cloud.cancel).toHaveBeenCalled(); expect(component.ingredients).toEqual([]); expect(component.photo).toBeUndefined();
});

it('propone il momento del pasto in base all’ora e mostra l’uso del limite', () => {
  expect([6, 12, 16, 20, 2].map(mealTypeForHour)).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'dinner']);
  expect(component.mealType).toBe(mealTypeForHour(new Date().getHours()));
  component.setMealType('snack'); expect(component.mealType).toBe('snack');
  expect(component.aiMeter()).toMatchObject({ text: expect.stringContaining('12%') });
  expect(component.aiMeter()!.percent).toBeCloseTo(12 / 95 * 100);
});
