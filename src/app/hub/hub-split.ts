/** Dividi (stile Splitwise): quote, saldi e debiti semplificati. Importi in centesimi. */
import { HubExpense, HubSettlement, HubSplitMode } from './hub-model';

/** Distribuisce `total` secondo i pesi, assegnando i centesimi di resto ai primi. */
export function distribute(total: number, weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights).filter(id => weights[id] > 0);
  const sum = ids.reduce((s, id) => s + weights[id], 0);
  const out: Record<string, number> = {};
  if (!sum) return out;
  let given = 0;
  const raw = ids.map(id => { const exact = total * weights[id] / sum, floor = Math.floor(exact); given += floor; return { id, floor, rest: exact - floor }; });
  let left = total - given;
  raw.sort((a, b) => b.rest - a.rest || ids.indexOf(a.id) - ids.indexOf(b.id));
  for (const r of raw) { out[r.id] = r.floor + (left > 0 ? 1 : 0); if (left > 0) left--; }
  return Object.fromEntries(ids.map(id => [id, out[id]]));
}

/** Quota di ogni partecipante. `parts`: equal → 1/0, amounts → centesimi, percent → %, shares → quote. */
export function computeShares(amount: number, mode: HubSplitMode, parts: Record<string, number>): Record<string, number> {
  if (mode === 'amounts') return Object.fromEntries(Object.entries(parts).filter(([, v]) => v > 0));
  if (mode === 'equal') return distribute(amount, Object.fromEntries(Object.entries(parts).map(([id, v]) => [id, v > 0 ? 1 : 0])));
  return distribute(amount, parts);
}
export function expenseShares(e: Pick<HubExpense, 'amount' | 'mode' | 'parts'>) { return computeShares(e.amount, e.mode, e.parts); }

export function splitProblem(amount: number, mode: HubSplitMode, parts: Record<string, number>): string {
  const active = Object.values(parts).filter(v => v > 0);
  if (amount <= 0) return 'Inserisci un importo.';
  if (!active.length) return 'Scegli almeno una persona.';
  if (mode === 'amounts') { const sum = active.reduce((s, v) => s + v, 0); if (sum !== amount) return `Mancano ${((amount - sum) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })} € da assegnare.`; }
  if (mode === 'percent') { const sum = active.reduce((s, v) => s + v, 0); if (Math.abs(sum - 100) > 0.001) return `Le percentuali sommano ${sum.toLocaleString('it-IT')}%, devono fare 100%.`; }
  return '';
}

/** Saldo netto per persona: positivo = deve ricevere. */
export function groupBalances(expenses: readonly HubExpense[], settlements: readonly HubSettlement[]): Record<string, number> {
  const net: Record<string, number> = {};
  const add = (id: string, v: number) => { net[id] = (net[id] ?? 0) + v; };
  for (const e of expenses) {
    if (e.deleted) continue;
    add(e.paidBy, e.amount);
    for (const [id, share] of Object.entries(expenseShares(e))) add(id, -share);
  }
  for (const s of settlements) { if (s.deleted) continue; add(s.from, s.amount); add(s.to, -s.amount); }
  for (const id of Object.keys(net)) if (net[id] === 0) delete net[id];
  return net;
}

export interface Debt { from: string; to: string; amount: number }
/** Riduce i pagamenti al minimo: il debitore maggiore paga il creditore maggiore, e così via. */
export function simplifyDebts(balances: Record<string, number>): Debt[] {
  const creditors = Object.entries(balances).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(balances).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: Debt[] = [];
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].v -= pay; creditors[j].v -= pay;
    if (!debtors[i].v) i++;
    if (!creditors[j].v) j++;
  }
  return out;
}

/** Totali verso di me su più gruppi: chi mi deve e a chi devo. */
export function myPosition(debtsByGroup: readonly Debt[][], me: string) {
  const people: Record<string, number> = {};
  let owed = 0, owe = 0;
  for (const debts of debtsByGroup) for (const d of debts) {
    if (d.to === me) { owed += d.amount; people[d.from] = (people[d.from] ?? 0) + d.amount; }
    if (d.from === me) { owe += d.amount; people[d.to] = (people[d.to] ?? 0) - d.amount; }
  }
  return { owed, owe, net: owed - owe, people };
}
