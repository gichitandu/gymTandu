import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { addMonths, isoDay, monthKey } from '../hub/hub-model';
import { HubStore } from '../hub/hub-store';
import { AuthService } from '../services/auth';
import { HubView } from '../hub/hub-view';
import { applyLive, carCosts, carDeadlines, carStatus, CarLive, monthSeries, monthTotals, odometerReadings, suggestedBudget, unlinkedFuelCosts } from './garage-stats';

/** Stato del collegamento al portale Volkswagen, come lo restituisce /api/hub/vw. */
export interface VwStatus {
  configured: boolean;
  state: 'off' | 'pending' | 'ok' | 'waiting' | 'norequest' | 'novehicle' | 'auth' | 'error';
  message: string; checkedAt: number | null; updatedAt: number | null; capturedAt: number | null; vehicle: string | null;
  values: (CarLive & { inspectionDays?: number | null; inspectionKm?: number | null; oilDays?: number | null; oilKm?: number | null }) | null;
}

/** Valori calcolati di GT Garage: auto, costi dal Planner e stime (nessun dato salvato qui). */
@Injectable({ providedIn: 'root' })
export class GarageView {
  readonly hub = inject(HubStore);
  private auth = inject(AuthService);
  readonly view = inject(HubView);
  readonly car = this.hub.car;
  readonly fuelups = computed(() => { const car = this.car(); return this.hub.fuelups().filter(f => !car || f.carId === car.id); });
  readonly costs = computed(() => carCosts(this.view.spend(), this.fuelups()));
  private readonly amounts = computed(() => new Map(this.costs().map(c => [c.id, c.amount])));
  readonly amountOf = (transactionId: string) => this.amounts().get(transactionId) ?? 0;
  readonly vw = signal<VwStatus | null>(null);
  readonly vwBusy = signal(false);
  readonly vwError = signal('');
  /** Valori dell'auto con l'ora della rilevazione, se il collegamento è attivo. */
  readonly live = computed<CarLive | null>(() => { const v = this.vw(); return v?.values ? { ...v.values, capturedAt: v.capturedAt } : null; });
  readonly status = computed(() => applyLive(carStatus(this.car(), this.fuelups(), this.amountOf, this.view.today()), this.live(), this.car()?.tankLiters, this.clock()));
  private readonly clock = signal(Date.now());
  private loadedAt = 0;
  readonly month = computed(() => monthKey(this.view.today()));
  readonly totals = computed(() => monthTotals(this.costs(), this.month()));
  readonly previous = computed(() => monthTotals(this.costs(), addMonths(this.month(), -1)));
  readonly series = computed(() => monthSeries(this.costs(), this.month(), 6));
  readonly budget = computed(() => suggestedBudget(this.costs(), this.month()));
  readonly deadlines = computed(() => carDeadlines(this.car(), this.view.today()));
  readonly unlinked = computed(() => unlinkedFuelCosts(this.costs()));

  constructor() {
    // I chilometri letti dall'auto diventano una lettura del contachilometri (solo se più alti dell'ultima).
    effect(() => {
      const car = this.car(), live = this.live(), km = live?.odometerKm, at = live?.capturedAt;
      if (!car || !km || !at || !this.hub.ready()) return;
      untracked(() => {
        const readings = odometerReadings(car, this.fuelups()), last = readings[readings.length - 1];
        if (last && km <= last.km) return;
        const day = isoDay(new Date(at));
        const next = [...car.readings.filter(r => r.date !== day), { date: day, km }].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
        this.hub.upsert('cars', { ...car, readings: next });
      });
    });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.loadVw(); });
  }

  /** Legge lo stato del collegamento (al massimo una volta al minuto, salvo richiesta esplicita). */
  async loadVw(force = false) {
    // Il collegamento Volkswagen è quello dell'auto del Super Admin: gli altri utenti non lo vedono.
    if (!this.hub.allowed() || this.auth.user()?.role !== 'SuperAdmin' || this.auth.viewAsClient() || (!force && Date.now() - this.loadedAt < 60000)) return;
    this.loadedAt = Date.now();
    try {
      const res = await fetch('/api/hub/vw', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) { this.vw.set(await res.json()); this.clock.set(Date.now()); }
    } catch { /* senza rete restano le stime */ }
  }
  /** Chiede subito un controllo al portale (il server lo limita a uno ogni 3 minuti). */
  async syncVw() {
    if (this.vwBusy()) return;
    this.vwBusy.set(true); this.vwError.set('');
    try {
      const res = await fetch('/api/hub/vw/sync', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Aggiornamento non riuscito.');
      this.vw.set(body); this.clock.set(Date.now()); this.loadedAt = Date.now();
    } catch (error) { this.vwError.set(error instanceof Error ? error.message : 'Aggiornamento non riuscito.'); }
    finally { this.vwBusy.set(false); }
  }
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
