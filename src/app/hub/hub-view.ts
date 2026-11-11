import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Store } from '../services/store';
import { AuthService } from '../services/auth';
import {
  budgetAlerts, computePlan, dailyBudget, monthIncome, monthSpending, planInsights, recurringCharges, spendingItems,
} from './hub-finance';
import { hubCategory, HubGroup, HubPrefs, hubToday, monthKey } from './hub-model';
import { groupBalances, myPosition, simplifyDebts } from './hub-split';
import { HUB_ME, HubStore } from './hub-store';

/** Valori calcolati condivisi dalle schermate del Hub (nessun dato salvato qui). */
@Injectable({ providedIn: 'root' })
export class HubView {
  readonly hub = inject(HubStore);
  private gym = inject(Store, { optional: true });
  readonly today = signal(hubToday());
  readonly gymData = computed(() => this.gym?.data());
  private auth = inject(AuthService, { optional: true });
  /** Nome da usare nei messaggi condivisi con gli altri ("Tu" non ha senso fuori dall'app). */
  readonly myName = computed(() => (this.gym?.profile()?.name || this.auth?.user()?.name || '').split(' ')[0] || 'Io');
  shareName = (id: string) => id === HUB_ME ? this.myName() : this.hub.personName(id);

  readonly spend = computed(() => spendingItems(this.hub.doc(), HUB_ME));
  readonly recurring = computed(() => recurringCharges(this.hub.transactions(), this.today()));
  readonly month = computed(() => monthKey(this.today()));
  readonly monthSpend = computed(() => monthSpending(this.spend(), this.month()));
  readonly monthIncome = computed(() => monthIncome(this.hub.transactions(), this.month()));
  readonly spentToday = computed(() => this.spend().filter(i => i.date === this.today()).reduce((s, i) => s + i.amount, 0));

  readonly planResult = computed(() => { const p = this.hub.plan(); return p ? computePlan(this.spend(), p.goal, this.today()) : null; });
  readonly activePlan = computed(() => { const p = this.hub.plan(); return p?.active ? p : undefined; });
  readonly budget = computed(() => {
    const plan = this.activePlan(), result = this.planResult();
    if (!plan || !result) return null;
    return dailyBudget(this.spend(), plan.caps, result.avgTotal, this.today());
  });
  readonly insights = computed(() => { const r = this.planResult(); return r ? planInsights(r, this.spend(), this.recurring()) : []; });

  readonly groupViews = computed(() => {
    const expenses = this.hub.expenses(), settlements = this.hub.settlements();
    return this.hub.groups().map((group: HubGroup) => {
      const own = expenses.filter(e => e.groupId === group.id), paid = settlements.filter(s => s.groupId === group.id);
      const balances = groupBalances(own, paid), debts = simplifyDebts(balances);
      const month = this.month(), monthTotal = own.filter(e => monthKey(e.date) === month).reduce((s, e) => s + e.amount, 0);
      return { group, expenses: own, settlements: paid, balances, debts, mine: balances[HUB_ME] ?? 0, monthTotal };
    });
  });
  readonly position = computed(() => myPosition(this.groupViews().map(g => g.debts), HUB_ME));

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.today.set(hubToday()); });
    setInterval(() => { const t = hubToday(); if (t !== this.today()) this.today.set(t); }, 60000);
    // Il server manda la notifica di budget quando un ambito supera l'80% del tetto.
    effect(() => {
      if (!this.hub.ready()) return;
      const plan = this.activePlan(), prefs = this.hub.prefs();
      const alerts = plan?.alert80 ? budgetAlerts(this.spend(), plan.caps, this.month()).map(a => ({ ...a, label: hubCategory(a.category).label, month: this.month() })) : [];
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
      const current = JSON.stringify(prefs.budgetAlerts ?? []);
      if (current === JSON.stringify(alerts) && prefs.updatedAt && prefs.timezone === tz) return;
      untracked(() => this.hub.upsert('prefs', { ...prefs, id: prefs.id || 'prefs', timezone: tz, budgetAlerts: alerts }));
    });
  }
}
