import { addDays, addMonths, HubCar, HubCarReading, HubDoc, HubFuelup, monthKey, parseDay } from '../hub/hub-model';
import { SpendItem } from '../hub/hub-finance';

/**
 * GT Garage: calcoli interni (nessuna AI, nessun servizio esterno).
 * I costi arrivano dai movimenti del Planner; litri e chilometri dai rifornimenti registrati.
 */
export type CarCostType = 'fuel' | 'toll' | 'parking' | 'other';
export interface CarCost { id: string; date: string; amount: number; label: string; type: CarCostType; fuelup?: HubFuelup }

export const CAR_COST_LABEL: Record<CarCostType, string> = { fuel: 'Carburante', toll: 'Pedaggi', parking: 'Parcheggi', other: 'Altro' };
export const CAR_COST_ICON: Record<CarCostType, string> = { fuel: 'fuel', toll: 'road', parking: 'parking', other: 'car' };
export const CAR_COST_TONE: Record<CarCostType, string> = { fuel: 'g', toll: 'b', parking: 'y', other: 'n' };

const FUEL = /\bq8\b|\beni\b|\bagip\b|\bip\b|\bapi\b|esso|tamoil|\bshell\b|repsol|totalerg|total ?energies|\berg\b|keropetrol|europam|costantin|vega carbur|carburant|benzin|gasolio|diesel|distributor|rifornim|stazione di servizio|area di servizio|\bfuel\b|\bpetrol/;
const TOLL = /telepass|autostrad|pedaggi|unipolmove|mooneygo|\baspi\b|tangenziale|brennero|\bcav\b/;
const PARKING = /parchegg|parking|easypark|\bsosta\b|strisce blu|\bapcoa\b|saba ital|interparking|garage/;
const OTHER = /officina|gommist|pneumatic|autolavagg|lavaggio|car ?wash|\bbollo\b|\baci\b|assicuraz|\brca\b|revision|tagliand|ricamb|norauto|carrozzer|volkswagen|concessionari|autoricambi|motorizzazione/;

/** Riconosce le spese dell'auto dalla descrizione di un movimento. */
export function classifyCarCost(description: string): CarCostType | null {
  const text = description.toLowerCase();
  if (TOLL.test(text)) return 'toll';
  if (PARKING.test(text)) return 'parking';
  if (FUEL.test(text)) return 'fuel';
  if (OTHER.test(text)) return 'other';
  return null;
}

/** Costi dell'auto presi dalle uscite del Planner (solo la propria parte se divise). */
export function carCosts(spend: readonly SpendItem[], fuelups: readonly HubFuelup[]): CarCost[] {
  const linked = new Map(fuelups.map(f => [f.transactionId, f]));
  const out: CarCost[] = [];
  for (const item of spend) {
    const fuelup = linked.get(item.id);
    const type = fuelup ? 'fuel' : item.category === 'trasporti' ? classifyCarCost(item.label) : null;
    if (type) out.push({ id: item.id, date: item.date, amount: item.amount, label: item.label, type, fuelup });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
}

export function emptyTotals(): Record<CarCostType, number> { return { fuel: 0, toll: 0, parking: 0, other: 0 }; }
export function monthTotals(costs: readonly CarCost[], month: string) {
  const byType = emptyTotals(); let total = 0;
  for (const c of costs) if (monthKey(c.date) === month) { byType[c.type] += c.amount; total += c.amount; }
  return { byType, total };
}
/** Ultimi `count` mesi (dal più vecchio), con la spesa di carburante e il totale. */
export function monthSeries(costs: readonly CarCost[], month: string, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const key = addMonths(month, i - count + 1), totals = monthTotals(costs, key);
    return { month: key, fuel: totals.byType.fuel, total: totals.total };
  });
}
/** Budget consigliato per il mese prossimo: media dei tre mesi conclusi con spese, arrotondata ai 10 €. */
export function suggestedBudget(costs: readonly CarCost[], month: string): number | null {
  const past = [1, 2, 3].map(n => monthTotals(costs, addMonths(month, -n)).total).filter(t => t > 0);
  if (!past.length) return null;
  const average = past.reduce((s, t) => s + t, 0) / past.length;
  return Math.ceil(average / 1000) * 1000;
}

function daysBetween(a: string, b: string) { return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000); }

/** Letture del contachilometri (manuali + rifornimenti), ordinate e sempre crescenti. */
export function odometerReadings(car: HubCar | undefined, fuelups: readonly HubFuelup[]): HubCarReading[] {
  const all: HubCarReading[] = [...(car?.readings ?? [])];
  for (const f of fuelups) if (f.odometer && f.odometer > 0) all.push({ date: f.date, km: f.odometer });
  all.sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
  const out: HubCarReading[] = [];
  for (const r of all) {
    if (!Number.isFinite(r.km) || r.km <= 0) continue;
    const last = out[out.length - 1];
    if (last && r.km < last.km) continue;
    if (last && last.date === r.date) last.km = r.km; else out.push({ ...r });
  }
  return out;
}

export interface FuelSegment { km: number; liters: number; cost: number }
/** Tratte da pieno a pieno: i litri aggiunti coprono i chilometri fatti dal pieno precedente. */
export function fuelSegments(fuelups: readonly HubFuelup[], amountOf: (transactionId: string) => number): FuelSegment[] {
  const list = fuelups.filter(f => f.odometer && f.odometer > 0).sort((a, b) => a.odometer! - b.odometer!);
  const out: FuelSegment[] = [];
  let start: HubFuelup | undefined, liters = 0, cost = 0, complete = true;
  for (const f of list) {
    if (start) { if (f.liters && f.liters > 0) liters += f.liters; else complete = false; cost += amountOf(f.transactionId); }
    if (!f.full) continue;
    if (start && complete && liters > 0 && f.odometer! > start.odometer!) out.push({ km: f.odometer! - start.odometer!, liters, cost });
    start = f; liters = 0; cost = 0; complete = true;
  }
  return out;
}

export interface CarStatus {
  odometer: number | null;
  /** L/100 km misurati sugli ultimi pieni, altrimenti quelli dichiarati. */
  consumption: number | null; measured: boolean;
  /** Centesimi ogni 100 km. */
  costPer100: number | null;
  fuelLiters: number | null; fuelPct: number | null; rangeKm: number | null;
  kmPerDay: number | null; refuelInDays: number | null;
  kmMonth: number | null;
  /** Carburante e autonomia letti dall'auto (portale Volkswagen) invece che stimati. */
  live?: boolean;
  consumptionFrom?: 'fills' | 'car' | 'declared' | null;
}
const RESERVE_KM = 60;

export function carStatus(car: HubCar | undefined, fuelups: readonly HubFuelup[], amountOf: (transactionId: string) => number, today: string): CarStatus {
  const readings = odometerReadings(car, fuelups), odometer = readings.length ? readings[readings.length - 1].km : null;
  const segments = fuelSegments(fuelups, amountOf).slice(-5);
  const km = segments.reduce((s, x) => s + x.km, 0), liters = segments.reduce((s, x) => s + x.liters, 0), cost = segments.reduce((s, x) => s + x.cost, 0);
  const measured = km > 0 && liters > 0;
  const declared = car?.declaredConsumption && car.declaredConsumption > 0 ? car.declaredConsumption : null;
  const consumption = measured ? liters / km * 100 : declared;

  // Prezzo medio al litro dai rifornimenti con litri e importo: serve se mancano le tratte complete.
  let priced = 0, pricedLiters = 0;
  for (const f of fuelups) { const amount = amountOf(f.transactionId); if (f.liters && f.liters > 0 && amount > 0) { priced += amount; pricedLiters += f.liters; } }
  const costPer100 = measured && cost > 0 ? Math.round(cost / km * 100) : consumption && pricedLiters > 0 ? Math.round(priced / pricedLiters * consumption) : null;

  // Carburante stimato: dall'ultimo pieno, meno i chilometri fatti, più i rabbocchi successivi.
  let fuelLiters: number | null = null;
  const tank = car?.tankLiters && car.tankLiters > 0 ? car.tankLiters : null;
  const lastFull = fuelups.filter(f => f.full && f.odometer && f.odometer > 0).sort((a, b) => b.odometer! - a.odometer!)[0];
  if (tank && consumption && lastFull && odometer !== null) {
    const added = fuelups.filter(f => !f.full && f.odometer && f.odometer > lastFull.odometer! && f.liters).reduce((s, f) => s + f.liters!, 0);
    fuelLiters = Math.max(0, Math.min(tank, tank - (odometer - lastFull.odometer!) * consumption / 100 + added));
  }
  const fuelPct = fuelLiters !== null && tank ? Math.round(fuelLiters / tank * 100) : null;
  const rangeKm = fuelLiters !== null && consumption ? Math.round(fuelLiters / consumption * 100) : null;

  // Chilometri al giorno sulle letture degli ultimi 60 giorni (almeno 3 giorni di distanza).
  let kmPerDay: number | null = null;
  const recent = readings.filter(r => r.date >= addDays(today, -60));
  const window = recent.length >= 2 ? recent : readings.slice(-2);
  if (window.length >= 2) {
    const days = daysBetween(window[0].date, window[window.length - 1].date);
    if (days >= 3) kmPerDay = (window[window.length - 1].km - window[0].km) / days;
  }
  const refuelInDays = rangeKm !== null && kmPerDay && kmPerDay > 0 ? Math.max(0, Math.floor((rangeKm - RESERVE_KM) / kmPerDay)) : null;

  // Chilometri del mese: da inizio mese (valore interpolato tra le due letture a cavallo) a oggi.
  let kmMonth: number | null = null;
  if (odometer !== null) {
    const first = today.slice(0, 8) + '01';
    const before = [...readings].reverse().find(r => r.date < first), inMonth = readings.filter(r => r.date >= first);
    if (before && inMonth.length) {
      const span = daysBetween(before.date, inMonth[0].date), start = before.km + (inMonth[0].km - before.km) * daysBetween(before.date, first) / span;
      kmMonth = Math.round(odometer - start);
    } else if (inMonth.length > 1) kmMonth = odometer - inMonth[0].km;
  }
  return { odometer, consumption, measured, costPer100, fuelLiters, fuelPct, rangeKm, kmPerDay, refuelInDays, kmMonth, live: false, consumptionFrom: measured ? 'fills' : consumption ? 'declared' : null };
}

export interface CarDeadline { key: keyof HubCar['deadlines']; label: string; date: string; days: number; tone: 'ok' | 'soon' | 'late' }
const DEADLINE_LABEL: Record<keyof HubCar['deadlines'], string> = { insurance: 'Assicurazione', tax: 'Bollo', inspection: 'Revisione', service: 'Tagliando' };
export function carDeadlines(car: HubCar | undefined, today: string): CarDeadline[] {
  const out: CarDeadline[] = [];
  for (const key of Object.keys(DEADLINE_LABEL) as (keyof HubCar['deadlines'])[]) {
    const date = car?.deadlines?.[key];
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const days = daysBetween(today, date);
    out.push({ key, label: DEADLINE_LABEL[key], date, days, tone: days < 0 ? 'late' : days <= 30 ? 'soon' : 'ok' });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Movimenti di carburante del Planner non ancora collegati a un rifornimento. */
export function unlinkedFuelCosts(costs: readonly CarCost[]) { return costs.filter(c => c.type === 'fuel' && !c.fuelup); }

export function carCostsFromDoc(doc: HubDoc, spend: readonly SpendItem[]) { return carCosts(spend, doc.fuelups.filter(f => !f.deleted)); }

/** Valori letti dall'auto tramite il portale Volkswagen (vedi worker/vw.js). */
export interface CarLive { fuelPct?: number | null; rangeKm?: number | null; odometerKm?: number | null; consumption?: number | null; capturedAt?: number | null }
const LIVE_MAX_AGE_MS = 3 * 86400000;

/** Sostituisce le stime con i valori dell'auto, se recenti (al massimo 3 giorni). */
export function applyLive(status: CarStatus, live: CarLive | null | undefined, tankLiters: number | undefined, now: number): CarStatus {
  if (!live?.capturedAt || now - live.capturedAt > LIVE_MAX_AGE_MS || (live.fuelPct == null && live.rangeKm == null)) return status;
  const tank = tankLiters && tankLiters > 0 ? tankLiters : null;
  const useCar = !status.measured && !!live.consumption;
  const consumption = useCar ? live.consumption! : status.consumption;
  const fuelPct = live.fuelPct ?? status.fuelPct;
  const fuelLiters = live.fuelPct != null && tank ? tank * live.fuelPct / 100 : status.fuelLiters;
  const rangeKm = live.rangeKm ?? (fuelLiters !== null && consumption ? Math.round(fuelLiters / consumption * 100) : status.rangeKm);
  const odometer = Math.max(status.odometer ?? 0, live.odometerKm ?? 0) || null;
  const refuelInDays = rangeKm !== null && status.kmPerDay && status.kmPerDay > 0 ? Math.max(0, Math.floor((rangeKm - RESERVE_KM) / status.kmPerDay)) : status.refuelInDays;
  return { ...status, consumption, fuelPct, fuelLiters, rangeKm, odometer, refuelInDays, live: true, consumptionFrom: useCar ? 'car' : status.consumptionFrom };
}
