import { computed, inject, Injectable } from '@angular/core';
import { addMonths, monthKey } from '../hub/hub-model';
import { HubStore } from '../hub/hub-store';
import { HubView } from '../hub/hub-view';
import { carCosts, carDeadlines, carStatus, monthSeries, monthTotals, suggestedBudget, unlinkedFuelCosts } from './garage-stats';

/** Valori calcolati di GT Garage: auto, costi dal Planner e stime (nessun dato salvato qui). */
@Injectable({ providedIn: 'root' })
export class GarageView {
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  readonly car = this.hub.car;
  readonly fuelups = computed(() => { const car = this.car(); return this.hub.fuelups().filter(f => !car || f.carId === car.id); });
  readonly costs = computed(() => carCosts(this.view.spend(), this.fuelups()));
  private readonly amounts = computed(() => new Map(this.costs().map(c => [c.id, c.amount])));
  readonly amountOf = (transactionId: string) => this.amounts().get(transactionId) ?? 0;
  readonly status = computed(() => carStatus(this.car(), this.fuelups(), this.amountOf, this.view.today()));
  readonly month = computed(() => monthKey(this.view.today()));
  readonly totals = computed(() => monthTotals(this.costs(), this.month()));
  readonly previous = computed(() => monthTotals(this.costs(), addMonths(this.month(), -1)));
  readonly series = computed(() => monthSeries(this.costs(), this.month(), 6));
  readonly budget = computed(() => suggestedBudget(this.costs(), this.month()));
  readonly deadlines = computed(() => carDeadlines(this.car(), this.view.today()));
  readonly unlinked = computed(() => unlinkedFuelCosts(this.costs()));
}

/** "38,5" / "38.5" → 38.5; null se non è un numero positivo. */
export function parseAmount(value: string | number | null | undefined): number | null {
  const text = String(value ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function num(value: number, decimals = 0) { return value.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
export const FUEL_LABEL: Record<string, string> = { benzina: 'Benzina', diesel: 'Diesel', gpl: 'GPL', metano: 'Metano', ibrida: 'Ibrida' };
