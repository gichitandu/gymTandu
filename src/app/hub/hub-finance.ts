/**
 * Logica spese del GT Hub, senza AI e senza rete: lettura estratti conto (Intesa Sanpaolo,
 * Revolut, Monte dei Paschi e formati simili), categorie, giroconti, ricorrenti,
 * piano risparmio e budget del giorno. Funzioni pure, testate in tests/hub-finance.test.ts.
 */
import {
  addMonths, daysInMonth, HubBank, HubCategoryType, hubCategory, HubDoc, HubExpense, HubRule, HubTransaction,
  HubTxKind, HUB_SPENDING_CATEGORIES, isoDay, monthKey, monthName, parseDay, validDay,
} from './hub-model';
import { expenseShares } from './hub-split';

/* ------------------------------------------------------------------ lettura file */

/** CSV con separatore automatico (; , o tab) e campi tra virgolette. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const sample = clean.split(/\r?\n/).slice(0, 15).join('\n');
  const count = (c: string) => (sample.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
  const sep = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDay(value);
  if (typeof value === 'object') {
    const v = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(v.richText)) return v.richText.map(p => p.text).join('');
    if (typeof v.text === 'string') return v.text;
    if (v.result !== undefined) return cellText(v.result);
    return '';
  }
  return String(value).trim();
}

/* ------------------------------------------------------------------ riconoscimento */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const HEADERS = {
  date: ['data contabile', 'data operazione', 'data di completamento', 'completed date', 'data di inizio', 'started date', 'data movimento', 'data registrazione', 'data', 'date', 'data valuta'],
  description: ['descrizione', 'descrizione operazione', 'description', 'operazione', 'dettagli', 'causale', 'descrizione estesa', 'beneficiario', 'esercente', 'merchant', 'controparte'],
  amount: ['importo', 'amount', 'importo (eur)', 'importo eur', 'importo in euro', 'importo euro'],
  debit: ['addebiti', 'addebito', 'dare', 'uscite', 'uscita', 'debit', 'debiti'],
  credit: ['accrediti', 'accredito', 'avere', 'entrate', 'entrata', 'credit', 'crediti'],
  fee: ['fee', 'costo', 'commissione', 'commissioni', 'spese'],
  state: ['state', 'stato'],
  currency: ['currency', 'valuta', 'divisa'],
  type: ['type', 'tipo'],
};
type ColumnKey = keyof typeof HEADERS;
export interface StatementColumns { date: number; description: number[]; amount?: number; debit?: number; credit?: number; fee?: number; state?: number; currency?: number; type?: number }
export interface StatementLayout { bank: HubBank; headerRow: number; columns: StatementColumns; headers: string[]; recognized: boolean }

function findColumn(headers: string[], key: ColumnKey, used: Set<number>): number | undefined {
  for (const name of HEADERS[key]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && h === name);
    if (i >= 0) return i;
  }
  // Corrispondenza parziale solo per date e importi ("Importo (EUR)", "Data contabile operazione").
  if (key === 'date' || key === 'amount') {
    const word = key === 'date' ? 'data' : 'importo';
    const i = headers.findIndex((h, idx) => !used.has(idx) && h.startsWith(word) && !h.includes('valuta'));
    if (i >= 0) return i;
  }
  return undefined;
}

export function detectStatement(rows: unknown[][], hint: HubBank = 'altro'): StatementLayout | null {
  const top = rows.slice(0, 40).map(r => Array.from(r ?? [], c => norm(cellText(c))));
  const text = top.map(r => r.join(' ')).join(' ');
  let best: StatementLayout | null = null, bestScore = 0;
  top.forEach((headers, headerRow) => {
    const used = new Set<number>();
    const pick = (key: ColumnKey) => { const i = findColumn(headers, key, used); if (i !== undefined) used.add(i); return i; };
    const date = pick('date');
    if (date === undefined) return;
    const amount = pick('amount'), debit = pick('debit'), credit = pick('credit');
    if (amount === undefined && debit === undefined && credit === undefined) return;
    const description: number[] = [];
    for (const name of HEADERS.description) { const i = headers.findIndex((h, idx) => !used.has(idx) && h === name); if (i >= 0) { used.add(i); description.push(i); } }
    const fee = pick('fee'), state = pick('state'), currency = pick('currency'), type = pick('type');
    const score = 2 + (description.length ? 2 : 0) + (amount !== undefined ? 1 : 0) + (debit !== undefined && credit !== undefined ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { bank: hint, headerRow, headers, recognized: false, columns: { date, description, amount, debit, credit, fee, state, currency, type } };
    }
  });
  if (!best) return null;
  const layout = best as StatementLayout;
  const h = layout.headers.join(' | ');
  if (/(started date|data di inizio)/.test(h) && /(product|prodotto|state|stato)/.test(h)) { layout.bank = 'revolut'; layout.recognized = true; }
  else if (/monte dei paschi|paschi di siena|\bmps\b/.test(text)) { layout.bank = 'mps'; layout.recognized = true; }
  else if (/intesa|sanpaolo|isybank/.test(text) || /contabilizzazione|conto o carta/.test(h)) { layout.bank = 'intesa'; layout.recognized = true; }
  return layout;
}

/* ------------------------------------------------------------------ normalizzazione */

export function parseStatementDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Le date Excel arrivano a mezzanotte UTC: si usa il giorno UTC.
    const d = value;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) return parseStatementDate(new Date(Math.round((value - 25569) * 86400000)));
  const text = cellText(value);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) { const day = `${m[1]}-${m[2]}-${m[3]}`; return validDay(day) ? day : null; }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(text);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const day = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return validDay(day) ? day : null;
  }
  return null;
}

/** Importo in centesimi: "1.234,56", "-34,20", "34,20-", "(12,00)", "€ 5", 12.5 */
export function parseStatementAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  let text = cellText(value).replace(/[€$£\s ]|EUR/gi, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  if (text.endsWith('-')) { negative = true; text = text.slice(0, -1); }
  if (text.startsWith('-') || text.startsWith('−')) { negative = !negative; text = text.slice(1); }
  if (text.startsWith('+')) text = text.slice(1);
  if (!/^[\d.,']+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.');
  let n: number;
  if (lastComma > lastDot) n = Number(text.replace(/[.']/g, '').replace(',', '.'));
  else if (lastDot > lastComma && /\.\d{1,2}$/.test(text)) n = Number(text.replace(/[,']/g, ''));
  else n = Number(text.replace(/[.,']/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negative ? -1 : 1);
}

export interface ParsedRow { date: string; description: string; amount: number; transfer: boolean }
export interface ParseResult { rows: ParsedRow[]; skipped: number; foreign: number; pending: number }

export function normalizeStatement(rows: unknown[][], layout: StatementLayout): ParseResult {
  const c = layout.columns, out: ParsedRow[] = [];
  let skipped = 0, foreign = 0, pending = 0;
  for (const row of rows.slice(layout.headerRow + 1)) {
    if (!row || row.every(v => cellText(v) === '')) continue;
    const state = c.state !== undefined ? norm(cellText(row[c.state])) : '';
    if (/revert|declin|fail|rifiut|stornat|annullat/.test(state)) { skipped++; continue; }
    if (/pending|sospeso|in attesa/.test(state)) { pending++; continue; }
    const date = parseStatementDate(row[c.date]);
    let amount: number | null = null;
    if (c.amount !== undefined) amount = parseStatementAmount(row[c.amount]);
    if (amount === null && (c.debit !== undefined || c.credit !== undefined)) {
      const debit = c.debit !== undefined ? parseStatementAmount(row[c.debit]) : null;
      const credit = c.credit !== undefined ? parseStatementAmount(row[c.credit]) : null;
      if (debit) amount = -Math.abs(debit); else if (credit) amount = Math.abs(credit);
    }
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    const currency = c.currency !== undefined ? cellText(row[c.currency]).toUpperCase() : '';
    if (currency && /^[A-Z]{3}$/.test(currency) && currency !== 'EUR') { foreign++; continue; }
    if (c.fee !== undefined) { const fee = parseStatementAmount(row[c.fee]); if (fee) amount -= Math.abs(fee); }
    const description = c.description.map(i => cellText(row[i])).filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 300) || 'Movimento';
    const type = c.type !== undefined ? norm(cellText(row[c.type])) : '';
    out.push({ date, description, amount, transfer: /topup|top-up|ricarica|exchange|cambio valuta/.test(type) });
  }
  return { rows: out, skipped, foreign, pending };
}

/* ------------------------------------------------------------------ categorie */

const DEFAULT_RULES: [RegExp, string][] = [
  [/giroconto|trasferimento tra|ricarica revolut|revolut\*{0,1}\s*top|top.?up|bonifico.*(revolut|intesa|paschi|mps)|(revolut|intesa|paschi).*bonifico/, 'giroconto'],
  [/stipendio|emolument|retribuzion|salary|payroll|cedolino/, 'entrate'],
  [/esselunga|conad|\bcoop\b|lidl|carrefour|eurospin|\bpam\b|iper|aldi|penny|\bmd\b|despar|todis|bennet|tigre|famila|simply|supermercat|crai|sigma|naturasi|in.s mercato|unes/, 'spesa'],
  [/ristorant|pizzeri|trattori|osteri|\bbar\b|caff|mcdonald|burger|sushi|just ?eat|deliveroo|glovo|uber ?eats|kebab|pasticceri|gelateri|\bpub\b|bistrot|starbucks|autogrill/, 'ristoranti'],
  [/\bq8\b|\beni\b|\bip\b|esso|tamoil|telepass|autostrad|trenitalia|italo|\batm\b milano|\batac\b|uber|free ?now|carburant|benzin|parchegg|parking|\btap\b|ryanair|easyjet|ita airways|flixbus|bolt|\bmooney/, 'trasporti'],
  [/enel|a2a|hera|iren|edison|\btim\b|vodafone|windtre|wind tre|iliad|fastweb|acquedott|\bgas\b|affitto|condomin|\bsky\b|\bluce\b|bolletta|\bho\.? mobile|kena|eolo|sorgenia|plenitude|octopus/, 'casa'],
  [/netflix|spotify|prime video|amazon prime|disney|apple\.com|icloud|google (one|storage)|youtube|dazn|now tv|chatgpt|openai|anthropic|claude\.ai|audible|playstation plus|xbox game pass|tidal|deezer/, 'abbonamenti'],
  [/palestra|\bgym\b|fitness|mcfit|virgin active|anytime fitness|decathlon pass|piscina|crossfit|\bsport\b/, 'palestra'],
  [/farmaci|medic|dentist|ospedal|clinic|\basl\b|analisi|ottic|parafarmac/, 'salute'],
  [/amazon|zalando|decathlon|ikea|h&m|\bzara\b|mediaworld|unieuro|euronics|shein|aliexpress|primark|ovs|leroy|brico|tecnoshop|apple store/, 'shopping'],
  [/cinema|teatro|steam|ticketone|vivaticket|concert|museo|bowling|escape|biglietteri|uci |the space/, 'svago'],
  [/prelievo|bancomat|atm|cash withdrawal|withdrawal/, 'contanti'],
];

export function normalizeDescription(description: string) {
  return norm(description).replace(/[0-9]{3,}/g, ' ').replace(/[^a-z0-9& .*'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function categorize(description: string, amount: number, rules: readonly HubRule[]): string {
  const text = normalizeDescription(description);
  for (const rule of rules) if (!rule.deleted && rule.pattern && text.includes(rule.pattern)) return rule.category;
  for (const [re, category] of DEFAULT_RULES) {
    if (!re.test(text)) continue;
    if (category === 'entrate' && amount < 0) continue;
    if (category === 'contanti' && amount > 0) continue;
    return category;
  }
  if (amount > 0) return 'entrate';
  return 'altro';
}
export function kindForCategory(category: string, amount: number): HubTxKind {
  if (category === 'giroconto') return 'transfer';
  if (category === 'entrate' || amount > 0) return 'income';
  return 'expense';
}
/** Parola chiave per una regola utente: il "nome" del negozio, senza numeri e prefissi bancari. */
export function rulePattern(description: string) {
  const text = normalizeDescription(description)
    .replace(/^(pagamento|pagam\.?|pag\.?|acquisto|addebito|sdd|pos|carta|bonifico|disposizione|operazione)( (pos|carta|sdd|del|a favore di|n\.?))*\s*/g, '')
    .replace(/\b(it|ita|italia|spa|srl|s\.r\.l\.|s\.p\.a\.)\b/g, '').trim();
  return text.split(' ').filter(w => w.length > 1).slice(0, 2).join(' ').slice(0, 40);
}

/* ------------------------------------------------------------------ duplicati e giroconti */

export function transactionHash(bank: HubBank, row: ParsedRow, occurrence: number) {
  return `${bank}|${row.date}|${row.amount}|${normalizeDescription(row.description).slice(0, 80)}|${occurrence}`;
}
/** Hash stabili anche per movimenti identici nello stesso giorno (1°, 2° …). */
export function withHashes(bank: HubBank, rows: readonly ParsedRow[]) {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const base = transactionHash(bank, row, 0);
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    return { row, hash: n ? transactionHash(bank, row, n) : base };
  });
}

const TRANSFER_HINT = /giroconto|trasferiment|revolut|intesa|sanpaolo|paschi|\bmps\b|ricarica|top.?up|bonifico|from |to |da conto|verso conto/;
/** Uscita da una banca ed entrata uguale su un'altra entro 3 giorni: è un giroconto. */
export function detectTransfers(txs: HubTransaction[]): Set<string> {
  const ids = new Set<string>();
  const live = txs.filter(t => !t.deleted && !t.manualCategory);
  for (const t of live) if (t.category === 'giroconto') ids.add(t.id);
  const outs = live.filter(t => t.amount < 0 && !ids.has(t.id));
  const ins = live.filter(t => t.amount > 0 && !ids.has(t.id));
  for (const out of outs) {
    const match = ins.find(i => !ids.has(i.id) && i.bank !== out.bank && i.amount === -out.amount
      && Math.abs(parseDay(i.date).getTime() - parseDay(out.date).getTime()) <= 3 * 86400000
      && (TRANSFER_HINT.test(normalizeDescription(out.description)) || TRANSFER_HINT.test(normalizeDescription(i.description))));
    if (match) { ids.add(out.id); ids.add(match.id); }
  }
  return ids;
}

/* ------------------------------------------------------------------ spese effettive */

export interface SpendItem { date: string; category: string; amount: number; label: string; source: 'bank' | 'split'; id: string }

/** Uscite reali dell'utente: movimenti di banca (solo la propria parte se divisi) + spese divise pagate da altri o in contanti. */
export function spendingItems(doc: HubDoc, meId: string | undefined): SpendItem[] {
  const expenses = new Map(doc.expenses.filter(e => !e.deleted).map(e => [e.id, e]));
  const items: SpendItem[] = [];
  const linked = new Set<string>();
  for (const t of doc.transactions) {
    if (t.deleted || t.kind !== 'expense' || t.amount >= 0) continue;
    let amount = -t.amount;
    const expense = t.expenseId ? expenses.get(t.expenseId) : undefined;
    if (expense && meId) { amount = expenseShares(expense)[meId] ?? 0; linked.add(expense.id); }
    items.push({ date: t.date, category: t.category || 'altro', amount, label: t.description, source: 'bank', id: t.id });
  }
  if (meId) for (const e of expenses.values()) {
    if (linked.has(e.id) || e.transactionId) continue;
    const share = expenseShares(e)[meId] ?? 0;
    if (share > 0) items.push({ date: e.date, category: e.category || 'altro', amount: share, label: e.description, source: 'split', id: e.id });
  }
  return items;
}
export function monthSpending(items: readonly SpendItem[], month: string) {
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const i of items) if (monthKey(i.date) === month) { byCategory[i.category] = (byCategory[i.category] ?? 0) + i.amount; total += i.amount; }
  return { total, byCategory };
}
export function monthIncome(txs: readonly HubTransaction[], month: string) {
  return txs.filter(t => !t.deleted && t.kind === 'income' && monthKey(t.date) === month).reduce((s, t) => s + t.amount, 0);
}
export function cumulativeByDay(items: readonly SpendItem[], month: string) {
  const days = daysInMonth(month), out: number[] = new Array(days).fill(0);
  for (const i of items) if (monthKey(i.date) === month) out[Number(i.date.slice(8, 10)) - 1] += i.amount;
  for (let d = 1; d < days; d++) out[d] += out[d - 1];
  return out;
}

/* ------------------------------------------------------------------ ricorrenti */

export interface Recurring { key: string; label: string; amount: number; category: string; lastDate: string; nextDate: string; months: number }
function merchantKey(description: string) { return rulePattern(description) || normalizeDescription(description).slice(0, 24); }
export function recurringCharges(txs: readonly HubTransaction[], today: string): Recurring[] {
  const from = addMonths(monthKey(today), -4) + '-01';
  const groups = new Map<string, HubTransaction[]>();
  for (const t of txs) {
    if (t.deleted || t.kind !== 'expense' || t.date < from) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const months = new Set(list.map(t => monthKey(t.date)));
    if (months.size < 2 || list.length > months.size + 1) continue;
    const amounts = list.map(t => -t.amount), max = Math.max(...amounts), min = Math.min(...amounts);
    if (min <= 0 || (max - min) / max > 0.15) continue;
    const last = [...list].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    const next = parseDay(last.date); next.setMonth(next.getMonth() + 1);
    out.push({ key, label: last.description.split(' · ')[0].slice(0, 40), amount: -last.amount, category: last.category, lastDate: last.date, nextDate: isoDay(next), months: months.size });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------------ piano risparmio */

export const PLAN_MAX_CUT: Record<HubCategoryType, number> = { fisso: 0, essenziale: 0.10, ricorrente: 0.35, flessibile: 0.45, entrata: 0, giroconto: 0 };
const PLAN_WEIGHT: Record<HubCategoryType, number> = { fisso: 0, essenziale: 0.35, ricorrente: 0.7, flessibile: 1, entrata: 0, giroconto: 0 };
export type PlanLevel = 'facile' | 'realistico' | 'impegnativo' | 'troppo';
export interface PlanRow { category: string; type: HubCategoryType; avg: number; cut: number; cap: number }
export interface PlanResult {
  months: string[]; avgTotal: number; fixedTotal: number; reducible: number; goal: number;
  achieved: number; maxPossible: number; level: PlanLevel; avgCutPct: number; capTotal: number; rows: PlanRow[];
}

/** Mesi completi (fino a 3) prima del mese corrente per cui esistono movimenti. */
export function planMonths(items: readonly SpendItem[], today: string) {
  const current = monthKey(today), present = new Set(items.map(i => monthKey(i.date)));
  const out: string[] = [];
  for (let k = 1; k <= 12 && out.length < 3; k++) { const m = addMonths(current, -k); if (present.has(m)) out.push(m); }
  return out;
}

/**
 * Taglio per ambito: proporzionale alla spesa media, più forte sulle spese flessibili e dove
 * l'ultimo mese supera la media; mai oltre il massimo dell'ambito. Le spese fisse non si toccano.
 */
export function computePlan(items: readonly SpendItem[], goal: number, today: string): PlanResult | null {
  const months = planMonths(items, today);
  if (!months.length) return null;
  const sums: Record<string, number> = {}, last: Record<string, number> = {};
  for (const i of items) {
    const m = monthKey(i.date);
    if (!months.includes(m)) continue;
    sums[i.category] = (sums[i.category] ?? 0) + i.amount;
    if (m === months[0]) last[i.category] = (last[i.category] ?? 0) + i.amount;
  }
  const rows: PlanRow[] = Object.entries(sums).map(([category, sum]) => {
    const avg = Math.round(sum / months.length);
    return { category, type: hubCategory(category).type, avg, cut: 0, cap: avg };
  }).filter(r => r.avg > 0).sort((a, b) => b.avg - a.avg);
  const weights = new Map(rows.map(r => {
    const above = r.avg ? Math.max(0, ((last[r.category] ?? 0) - r.avg) / r.avg) : 0;
    return [r.category, r.avg * PLAN_WEIGHT[r.type] * (1 + Math.min(1, above))];
  }));
  const limit = (r: PlanRow) => Math.floor(r.avg * PLAN_MAX_CUT[r.type]);
  const maxPossible = rows.reduce((s, r) => s + limit(r), 0);
  let remaining = Math.min(goal, maxPossible);
  for (let round = 0; round < 10 && remaining > 0; round++) {
    const open = rows.filter(r => r.cut < limit(r) && (weights.get(r.category) ?? 0) > 0);
    const total = open.reduce((s, r) => s + (weights.get(r.category) ?? 0), 0);
    if (!total) break;
    let given = 0;
    for (const r of open) {
      const share = Math.min(limit(r) - r.cut, Math.round(remaining * (weights.get(r.category) ?? 0) / total));
      r.cut += share; given += share;
    }
    remaining -= given;
    if (given === 0) break;
  }
  if (remaining > 0) for (const r of rows) { const room = limit(r) - r.cut; const take = Math.min(room, remaining); r.cut += take; remaining -= take; if (!remaining) break; }
  for (const r of rows) {
    // Tetti arrotondati all'euro, senza cambiare il risparmio complessivo oltre pochi centesimi.
    r.cap = Math.max(0, Math.round((r.avg - r.cut) / 100) * 100);
    r.cut = r.avg - r.cap;
  }
  const avgTotal = rows.reduce((s, r) => s + r.avg, 0);
  const fixedTotal = rows.filter(r => r.type === 'fisso').reduce((s, r) => s + r.avg, 0);
  const reducible = avgTotal - fixedTotal;
  const achieved = rows.reduce((s, r) => s + r.cut, 0);
  const ratio = reducible ? goal / reducible : 1;
  const level: PlanLevel = goal > maxPossible + 100 ? 'troppo' : ratio <= 0.12 ? 'facile' : ratio <= 0.3 ? 'realistico' : 'impegnativo';
  return { months, avgTotal, fixedTotal, reducible, goal, achieved, maxPossible, level, avgCutPct: reducible ? Math.round(achieved / reducible * 100) : 0, capTotal: avgTotal - achieved, rows };
}

/* ------------------------------------------------------------------ budget del giorno */

export function isDailyCategory(category: string) { const t = hubCategory(category).type; return t === 'essenziale' || t === 'flessibile'; }
export interface DailyBudget { daily: number; spentToday: number; left: number; weekly: number; variableCap: number; variableSpent: number; projectedSaving: number; onTrack: boolean; usedPct: number }

export function dailyBudget(items: readonly SpendItem[], caps: Record<string, number>, avgTotal: number, today: string): DailyBudget {
  const month = monthKey(today), dim = daysInMonth(month), day = Number(today.slice(8, 10));
  let variableCap = 0, otherCap = 0;
  for (const [cat, cap] of Object.entries(caps)) { if (isDailyCategory(cat)) variableCap += cap; else otherCap += cap; }
  let before = 0, spentToday = 0, otherSpent = 0, allSpent = 0;
  for (const i of items) {
    if (monthKey(i.date) !== month) continue;
    allSpent += i.amount;
    if (!isDailyCategory(i.category)) { otherSpent += i.amount; continue; }
    if (i.date < today) before += i.amount; else if (i.date === today) spentToday += i.amount;
  }
  const remainingDays = dim - day + 1;
  const daily = Math.max(0, Math.round((variableCap - before) / remainingDays));
  const variableSpent = before + spentToday;
  // Stima a fine mese: ritmo attuale delle spese di tutti i giorni + fisse/ricorrenti previste.
  const pace = day > 1 ? before / (day - 1) : 0;
  const projected = allSpent + Math.round(pace * (dim - day)) + Math.max(0, otherCap - otherSpent);
  return {
    daily, spentToday, left: daily - spentToday, weekly: Math.round(variableCap / (dim / 7)), variableCap, variableSpent,
    projectedSaving: avgTotal - projected, onTrack: before <= variableCap * (day - 1) / dim + 100, usedPct: daily ? Math.min(100, Math.round(spentToday / daily * 100)) : 100,
  };
}
export function budgetAlerts(items: readonly SpendItem[], caps: Record<string, number>, month: string) {
  const spent = monthSpending(items, month).byCategory;
  return Object.entries(caps).filter(([cat, cap]) => cap > 0 && hubCategory(cat).type !== 'fisso' && (spent[cat] ?? 0) >= cap * 0.8)
    .map(([category, cap]) => ({ category, cap, spent: spent[category] ?? 0, pct: Math.round((spent[category] ?? 0) / cap * 100) }));
}

/* ------------------------------------------------------------------ suggerimenti */

export function planInsights(plan: PlanResult, items: readonly SpendItem[], recurring: readonly Recurring[]) {
  const lastMonth = plan.months[0];
  return plan.rows.filter(r => r.cut >= 500).sort((a, b) => b.cut - a.cut).slice(0, 3).map(r => {
    const label = hubCategory(r.category).label;
    const cut = Math.round(r.cut / 100);
    if (r.type === 'ricorrente') {
      const subs = recurring.filter(x => x.category === r.category).slice(0, 2);
      if (subs.length === 2) return { category: r.category, title: `${label} −${cut} €`, text: `${subs[0].label} e ${subs[1].label} insieme fanno ${((subs[0].amount + subs[1].amount) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })} € al mese: decidi se ti servono entrambi.` };
    }
    const big = items.filter(i => i.category === r.category && monthKey(i.date) === lastMonth && i.amount >= 2000);
    if (big.length >= 3) {
      const avgTicket = big.reduce((s, i) => s + i.amount, 0) / big.length;
      const fewer = Math.max(1, Math.ceil(r.cut / avgTicket));
      return { category: r.category, title: `${label} −${cut} €`, text: `A ${monthName(lastMonth)} ${big.length} uscite sopra i 20 €: con ${fewer} in meno arrivi al tetto.` };
    }
    return { category: r.category, title: `${label} −${cut} €`, text: `In media spendi ${Math.round(r.avg / 100)} € al mese: con un tetto di ${Math.round(r.cap / 100)} € la spesa diventa prevedibile.` };
  });
}

export const SPENDING_CATEGORY_IDS = HUB_SPENDING_CATEGORIES.map(c => c.id);
export type { HubExpense };
