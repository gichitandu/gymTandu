/**
 * GT Hub: agenda, spese, Dividi e piano risparmio. È un archivio separato da quello di
 * GymTrack (nessuna tabella dell'allenamento viene toccata). Importi sempre in centesimi.
 * Ogni record ha `updatedAt` e, se eliminato, `deleted` (tombstone) per unire le copie.
 */
export const HUB_DOC_VERSION = 1;

export interface HubRecord { id: string; updatedAt: number; deleted?: boolean }

export type HubEventKind = 'impegno' | 'nota' | 'scadenza';
export type HubRepeat = 'none' | 'weekly' | 'monthly' | 'yearly';
export type HubColor = 'blue' | 'violet' | 'pink' | 'amber' | 'green' | 'red';

export interface HubEvent extends HubRecord {
  kind: HubEventKind; title: string; notes: string;
  date: string; time?: string; durationMinutes?: number;
  repeat: HubRepeat; notify: boolean; notifyOffsets: number[];
  showInCalendar: boolean; color: HubColor; done?: boolean;
}

export interface HubNote extends HubRecord { title: string; body: string; pinned: boolean; date?: string; color: HubColor }

export type HubBank = 'intesa' | 'revolut' | 'mps' | 'altro';
export type HubTxKind = 'expense' | 'income' | 'transfer';
export interface HubTransaction extends HubRecord {
  bank: HubBank; date: string; description: string; amount: number;
  category: string; kind: HubTxKind; hash: string; importId?: string;
  /** Collegamento a una spesa divisa: nelle statistiche conta solo la propria parte. */
  expenseId?: string; manualCategory?: boolean;
}
export interface HubImport extends HubRecord { bank: HubBank; fileName: string; importedAt: string; from: string; to: string; count: number }
export interface HubRule extends HubRecord { pattern: string; category: string }

export interface HubPlan extends HubRecord { goal: number; active: boolean; alert80: boolean; caps: Record<string, number>; basedOn: string[] }

export interface HubPerson extends HubRecord { name: string; color: string; me?: boolean }
export interface HubGroup extends HubRecord { name: string; icon: string; members: string[]; archived?: boolean }
export type HubSplitMode = 'equal' | 'amounts' | 'percent' | 'shares';
export interface HubExpense extends HubRecord {
  groupId: string; description: string; amount: number; paidBy: string; date: string; category: string;
  mode: HubSplitMode; parts: Record<string, number>; transactionId?: string;
}
export interface HubSettlement extends HubRecord { groupId: string; from: string; to: string; amount: number; date: string }

export interface HubBudgetAlert { category: string; label: string; month: string; pct: number; spent: number; cap: number }
export interface HubPrefs extends HubRecord { timezone: string; budgetAlerts?: HubBudgetAlert[] }

/** GT Garage: l'auto e i rifornimenti. I costi restano movimenti del Planner (un'unica fonte). */
export type HubCarFuel = 'benzina' | 'diesel' | 'gpl' | 'metano' | 'ibrida';
export interface HubCarReading { date: string; km: number }
export interface HubCarDeadlines { insurance?: string; tax?: string; inspection?: string; service?: string }
export interface HubCar extends HubRecord {
  name: string; plate?: string; fuel: HubCarFuel; tankLiters: number;
  /** Consumo dichiarato (L/100 km), usato finché non ci sono abbastanza pieni. */
  declaredConsumption?: number;
  readings: HubCarReading[]; deadlines: HubCarDeadlines; photo?: string;
  /** Colore dell'illustrazione quando non c'è una foto. */
  color?: string;
}
export interface HubFuelup extends HubRecord {
  carId: string; date: string; transactionId: string;
  liters?: number; odometer?: number; full: boolean; station?: string;
  /** Il movimento è stato creato dal Garage (spesa in contanti): si elimina insieme al rifornimento. */
  ownTransaction?: boolean;
}

export interface HubDoc {
  version: number;
  events: HubEvent[]; notes: HubNote[];
  transactions: HubTransaction[]; imports: HubImport[]; rules: HubRule[]; plans: HubPlan[];
  people: HubPerson[]; groups: HubGroup[]; expenses: HubExpense[]; settlements: HubSettlement[];
  prefs: HubPrefs[];
  cars: HubCar[]; fuelups: HubFuelup[];
}
export const HUB_COLLECTIONS = ['events', 'notes', 'transactions', 'imports', 'rules', 'plans', 'people', 'groups', 'expenses', 'settlements', 'prefs', 'cars', 'fuelups'] as const;
export type HubCollection = typeof HUB_COLLECTIONS[number];

export function emptyHubDoc(): HubDoc {
  return { version: HUB_DOC_VERSION, events: [], notes: [], transactions: [], imports: [], rules: [], plans: [], people: [], groups: [], expenses: [], settlements: [], prefs: [], cars: [], fuelups: [] };
}

export type HubCategoryType = 'fisso' | 'essenziale' | 'flessibile' | 'ricorrente' | 'entrata' | 'giroconto';
export interface HubCategory { id: string; label: string; icon: string; tone: string; type: HubCategoryType }
export const HUB_CATEGORIES: HubCategory[] = [
  { id: 'casa', label: 'Casa e bollette', icon: 'house', tone: 'b', type: 'fisso' },
  { id: 'spesa', label: 'Spesa alimentare', icon: 'cart', tone: 'g', type: 'essenziale' },
  { id: 'ristoranti', label: 'Ristoranti e bar', icon: 'coffee', tone: 'o', type: 'flessibile' },
  { id: 'trasporti', label: 'Trasporti', icon: 'car', tone: 'y', type: 'flessibile' },
  { id: 'shopping', label: 'Shopping', icon: 'bag', tone: 'c', type: 'flessibile' },
  { id: 'svago', label: 'Svago', icon: 'ticket', tone: 'p', type: 'flessibile' },
  { id: 'salute', label: 'Salute', icon: 'heart', tone: 'r', type: 'essenziale' },
  { id: 'abbonamenti', label: 'Abbonamenti', icon: 'repeat', tone: 'l', type: 'ricorrente' },
  { id: 'palestra', label: 'Palestra e sport', icon: 'weight', tone: 'p', type: 'fisso' },
  { id: 'contanti', label: 'Prelievi', icon: 'wallet', tone: 'n', type: 'flessibile' },
  { id: 'altro', label: 'Altro', icon: 'more', tone: 'n', type: 'flessibile' },
  { id: 'entrate', label: 'Entrate', icon: 'out', tone: 'g', type: 'entrata' },
  { id: 'giroconto', label: 'Giroconto', icon: 'swap', tone: 'b', type: 'giroconto' },
];
export const HUB_DA_SCEGLIERE = '';
export function hubCategory(id: string): HubCategory {
  return HUB_CATEGORIES.find(c => c.id === id) ?? { id: '', label: 'Scegli categoria', icon: 'tag', tone: 'y', type: 'flessibile' };
}
export const HUB_SPENDING_CATEGORIES = HUB_CATEGORIES.filter(c => c.type !== 'entrata' && c.type !== 'giroconto');

export const HUB_BANKS: { id: HubBank; label: string; short: string }[] = [
  { id: 'intesa', label: 'Intesa Sanpaolo', short: 'IS' },
  { id: 'revolut', label: 'Revolut', short: 'R' },
  { id: 'mps', label: 'Monte dei Paschi di Siena', short: 'MPS' },
  { id: 'altro', label: 'Altra banca', short: '€' },
];
export function hubBankLabel(id: HubBank) { return HUB_BANKS.find(b => b.id === id)?.label ?? 'Banca'; }
export function hubBankShort(id: HubBank) { return HUB_BANKS.find(b => b.id === id)?.short ?? '€'; }

export const HUB_COLORS: HubColor[] = ['blue', 'violet', 'pink', 'amber', 'green', 'red'];
export const HUB_PERSON_COLORS = ['#FFC857', '#5CC8F0', '#4FD1A5', '#FF9A62', '#B58CFF', '#FF8DA6', '#7AA2FF', '#F39AC7'];

export function hubId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}
export function pad2(n: number) { return String(n).padStart(2, '0'); }
export function isoDay(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function hubToday(now = new Date()) { return isoDay(now); }
export function parseDay(day: string) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function addDays(day: string, n: number) { const d = parseDay(day); d.setDate(d.getDate() + n); return isoDay(d); }
export function monthKey(day: string) { return day.slice(0, 7); }
export function addMonths(month: string, n: number) { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
export function daysInMonth(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); }
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isoDay(parseDay(value)) === value;
}
export function validTime(value: unknown): value is string { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function weekdayName(day: string) { return WEEKDAYS[parseDay(day).getDay()]; }
export function monthName(month: string) { return MONTHS[Number(month.slice(5, 7)) - 1]; }
export function cap(text: string) { return text ? text[0].toUpperCase() + text.slice(1) : text; }
export function dayLabel(day: string) { const d = parseDay(day); return `${cap(WEEKDAYS[d.getDay()])} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function shortDay(day: string) { const d = parseDay(day); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; }

/** 123456 → "1.234,56" (senza simbolo). */
export function euro(cents: number, opts: { sign?: boolean; decimals?: boolean } = {}) {
  const value = Math.abs(cents) / 100;
  const text = value.toLocaleString('it-IT', { minimumFractionDigits: opts.decimals === false ? 0 : 2, maximumFractionDigits: opts.decimals === false ? 0 : 2 });
  const sign = cents < 0 ? '−' : opts.sign && cents > 0 ? '+' : '';
  return sign + text;
}
export function euroParts(cents: number, sign = false) {
  const text = euro(cents, { sign });
  const comma = text.lastIndexOf(',');
  return { whole: comma < 0 ? text : text.slice(0, comma), dec: comma < 0 ? '00' : text.slice(comma + 1) };
}
/** "34,20" / "34.20" / "1.234,5" → centesimi; null se non valido. */
export function parseEuroInput(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  const text = String(value ?? '').replace(/[€\s]/g, '').trim();
  if (!text) return null;
  const normalized = /,\d{1,2}$/.test(text) ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export function initials(name: string) { return name.trim().split(/\s+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'; }
