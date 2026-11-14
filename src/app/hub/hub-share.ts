/** Testi da condividere fuori dall'app (WhatsApp, Messaggi…): funzioni pure, senza Angular. */
import { euro, HubExpense, shortDay } from './hub-model';
import { Debt, expenseShares } from './hub-split';

/** Testo da condividere (WhatsApp, Messaggi…) con chi deve a chi; con le spese, anche l'elenco con descrizioni e importi. */
export function shareSummary(title: string, debts: readonly Debt[], name: (id: string) => string, expenses: readonly HubExpense[] = []) {
  const lines = debts.length ? debts.map(d => `• ${name(d.from)} deve ${euro(d.amount)} € a ${name(d.to)}`) : ['Tutti in pari ✓'];
  const live = expenses.filter(e => !e.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const shown = live.slice(0, 20);
  const list = shown.length ? `\n\nSpese:\n${shown.map(e => `• ${shortDay(e.date)} · ${e.description}: ${euro(e.amount)} € (pagato da ${name(e.paidBy)})`).join('\n')}${live.length > shown.length ? `\n…e altre ${live.length - shown.length}` : ''}\nTotale: ${euro(live.reduce((s, e) => s + e.amount, 0))} €` : '';
  return `${title}${list}\n\n${debts.length ? 'Da saldare' : 'Saldi'}:\n${lines.join('\n')}\n\nDa GymTrack · Dividi`;
}
/** Una singola spesa: descrizione, importo esatto, chi ha pagato e la quota di ognuno. */
export function expenseShareText(e: { description: string; amount: number; paidBy: string; date: string; shares?: Record<string, number>; mode?: HubExpense['mode']; parts?: HubExpense['parts'] }, group: string, name: (id: string) => string) {
  const shares = e.shares ?? expenseShares({ amount: e.amount, mode: e.mode ?? 'equal', parts: e.parts ?? {} });
  const ids = Object.keys(shares).filter(id => shares[id] > 0);
  const quote = ids.map(id => `• ${name(id)}: ${euro(shares[id])} €`);
  const owe = ids.filter(id => id !== e.paidBy).map(id => `${name(id)} deve ${euro(shares[id])} € a ${name(e.paidBy)}`);
  return [
    `${e.description} — ${euro(e.amount)} €`,
    `${shortDay(e.date)}${group ? ' · ' + group : ''} · pagato da ${name(e.paidBy)}`,
    '', `Diviso tra ${ids.length}:`, ...quote,
    ...(owe.length ? ['', ...owe] : []),
    '', 'Da GymTrack · Dividi',
  ].join('\n');
}
export async function shareText(text: string, title: string) {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) { try { await nav.share({ title, text }); return 'shared'; } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
