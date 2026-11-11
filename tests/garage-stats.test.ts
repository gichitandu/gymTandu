import { expect, it } from 'vitest';
import { applyLive, carCosts, carDeadlines, carStatus, classifyCarCost, fuelSegments, monthSeries, monthTotals, odometerReadings, suggestedBudget } from '../src/app/garage/garage-stats';
import { HubCar, HubFuelup } from '../src/app/hub/hub-model';
import { SpendItem } from '../src/app/hub/hub-finance';

const car = (extra: Partial<HubCar> = {}): HubCar => ({ id: 'car', updatedAt: 1, name: 'Golf 8', fuel: 'benzina', tankLiters: 50, readings: [], deadlines: {}, ...extra });
const fill = (id: string, date: string, odometer: number, liters: number, full = true): HubFuelup => ({ id, updatedAt: 1, carId: 'car', date, transactionId: 't-' + id, odometer, liters, full });
const spend = (id: string, date: string, amount: number, label: string, category = 'trasporti'): SpendItem => ({ id, date, amount, label, category, source: 'bank' });

it('recognises fuel, tolls, parking and other car costs, and ignores public transport', () => {
  expect(classifyCarCost('PAGAMENTO POS ENI STATION 1234')).toBe('fuel');
  expect(classifyCarCost('Q8 Easy Milano')).toBe('fuel');
  expect(classifyCarCost('TELEPASS SPA ADDEBITO')).toBe('toll');
  expect(classifyCarCost('EasyPark sosta')).toBe('parking');
  expect(classifyCarCost('Gommista Rossi')).toBe('other');
  expect(classifyCarCost('TRENITALIA BIGLIETTO')).toBeNull();
});

it('takes car costs from Planner spending: transport category only, plus anything linked to a fill-up', () => {
  const items = [spend('a', '2026-11-03', 5840, 'ENI 1234'), spend('b', '2026-11-04', 420, 'Autostrade A4'), spend('c', '2026-11-05', 1200, 'Trenitalia'),
    spend('d', '2026-11-06', 900, 'Eni Cafe', 'ristoranti'), spend('t-x', '2026-11-07', 4000, 'Contanti', 'altro')];
  const costs = carCosts(items, [fill('x', '2026-11-07', 1000, 20)]);
  expect(costs.map(c => [c.id, c.type])).toEqual([['t-x', 'fuel'], ['b', 'toll'], ['a', 'fuel']]);
  expect(monthTotals(costs, '2026-11')).toEqual({ byType: { fuel: 9840, toll: 420, parking: 0, other: 0 }, total: 10260 });
  expect(monthSeries(costs, '2026-11', 3).map(m => m.month)).toEqual(['2026-09', '2026-10', '2026-11']);
});

it('suggests a budget from the average of the past months with costs, rounded up to 10 euro', () => {
  const costs = carCosts([spend('a', '2026-10-03', 12800, 'ENI'), spend('b', '2026-09-03', 15100, 'Q8')], []);
  expect(suggestedBudget(costs, '2026-11')).toBe(14000);
  expect(suggestedBudget([], '2026-11')).toBeNull();
});

it('measures consumption from full tank to full tank and skips segments with missing litres', () => {
  const amount = (id: string) => ({ 't-b': 6000, 't-c': 3000, 't-d': 5000 } as Record<string, number>)[id] ?? 0;
  const ups = [fill('a', '2026-10-01', 10000, 40), fill('b', '2026-10-10', 10600, 33), fill('c', '2026-10-15', 10900, 15, false), fill('d', '2026-10-20', 11200, 21)];
  expect(fuelSegments(ups, amount)).toEqual([{ km: 600, liters: 33, cost: 6000 }, { km: 600, liters: 36, cost: 8000 }]);
  const noLitres = [fill('a', '2026-10-01', 10000, 40), { ...fill('b', '2026-10-10', 10600, 0), liters: undefined }];
  expect(fuelSegments(noLitres, amount)).toEqual([]);
});

it('estimates fuel left, range, next refuel and month distance from readings', () => {
  const ups = [fill('a', '2026-10-20', 10000, 40), fill('b', '2026-11-01', 10500, 30)];
  const status = carStatus(car({ readings: [{ date: '2026-11-11', km: 10800 }] }), ups, () => 5400, '2026-11-11');
  expect(status.odometer).toBe(10800);
  expect(status.measured).toBe(true);
  expect(status.consumption).toBeCloseTo(6, 5);
  expect(status.costPer100).toBe(1080);
  expect(status.fuelLiters).toBeCloseTo(32, 5);
  expect(status.fuelPct).toBe(64);
  expect(status.rangeKm).toBe(533);
  expect(status.kmPerDay).toBeCloseTo(800 / 22, 5);
  expect(status.refuelInDays).toBe(13);
  // Dal 20 ottobre (10.000 km) al 1° novembre (10.500 km) nessuna lettura intermedia: il mese parte da 10.500.
  expect(status.kmMonth).toBe(300);
});

it('falls back to the declared consumption and reports unknown values as null', () => {
  const empty = carStatus(car(), [], () => 0, '2026-11-11');
  expect(empty).toMatchObject({ odometer: null, consumption: null, fuelPct: null, rangeKm: null, refuelInDays: null, kmMonth: null });
  const declared = carStatus(car({ declaredConsumption: 5 }), [fill('a', '2026-11-01', 20000, 45)], () => 9000, '2026-11-11');
  expect(declared.measured).toBe(false);
  expect(declared.consumption).toBe(5);
  expect(declared.fuelPct).toBe(100);
  expect(declared.costPer100).toBe(1000);
});

it('keeps odometer readings increasing and sorts deadlines by urgency', () => {
  expect(odometerReadings(car({ readings: [{ date: '2026-11-02', km: 900 }, { date: '2026-11-01', km: 1000 }, { date: '2026-11-05', km: 1100 }] }), [])).toEqual([{ date: '2026-11-01', km: 1000 }, { date: '2026-11-05', km: 1100 }]);
  const list = carDeadlines(car({ deadlines: { insurance: '2027-03-01', tax: '2026-11-20', inspection: '2026-11-01' } }), '2026-11-11');
  expect(list.map(d => [d.key, d.days, d.tone])).toEqual([['inspection', -10, 'late'], ['tax', 9, 'soon'], ['insurance', 110, 'ok']]);
});

it('uses fuel level, range and consumption read from the car when they are recent', () => {
  const base = carStatus(car({ declaredConsumption: 5, readings: [{ date: '2026-11-01', km: 10000 }, { date: '2026-11-11', km: 10400 }] }), [], () => 0, '2026-11-11');
  const now = Date.parse('2026-11-11T20:00:00Z');
  const live = applyLive(base, { fuelPct: 62, rangeKm: 410, odometerKm: 10450, consumption: 5.8, capturedAt: now - 3600000 }, 50, now);
  expect(live).toMatchObject({ live: true, fuelPct: 62, fuelLiters: 31, rangeKm: 410, odometer: 10450, consumption: 5.8, consumptionFrom: 'car', refuelInDays: 8 });
  // Valori di più di 3 giorni fa: restano le stime.
  expect(applyLive(base, { fuelPct: 62, capturedAt: now - 4 * 86400000 }, 50, now)).toBe(base);
  // Senza autonomia dall'auto la si ricava da litri e consumo.
  expect(applyLive(base, { fuelPct: 50, capturedAt: now }, 50, now).rangeKm).toBe(500);
});
