import { describe, expect, it } from 'vitest';
import {
  categorize, computePlan, dailyBudget, detectStatement, detectTransfers, normalizeStatement, parseCsv,
  parseStatementAmount, parseStatementDate, recurringCharges, rulePattern, spendingItems, SpendItem, withHashes,
} from '../src/app/hub/hub-finance';
import { emptyHubDoc, HubTransaction } from '../src/app/hub/hub-model';
import { computeShares, groupBalances, simplifyDebts, splitProblem } from '../src/app/hub/hub-split';
import { eventOccurrences } from '../src/app/hub/hub-calendar';

const tx = (id: string, bank: HubTransaction['bank'], date: string, amount: number, description: string, category = 'altro'): HubTransaction =>
  ({ id, updatedAt: 1, bank, date, amount, description, category, kind: amount < 0 ? 'expense' : 'income', hash: id });

describe('lettura estratti conto', () => {
  it('riconosce un CSV Revolut e scarta movimenti stornati, in sospeso e in altra valuta', () => {
    const csv = 'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n'
      + 'CARD_PAYMENT,Current,2026-11-09 12:40:01,2026-11-10 08:00:00,Pizzeria Da Gino,-54.00,0.00,EUR,COMPLETED,100\n'
      + 'TOPUP,Current,2026-11-07 10:00:00,2026-11-07 10:00:01,Payment from Intesa,200.00,0.00,EUR,COMPLETED,154\n'
      + 'CARD_PAYMENT,Current,2026-11-08 10:00:00,,Bar,-3.00,0.00,EUR,PENDING,151\n'
      + 'CARD_PAYMENT,Current,2026-11-06 10:00:00,2026-11-06 10:00:00,Shop,-3.00,0.00,EUR,REVERTED,151\n'
      + 'CARD_PAYMENT,Current,2026-11-05 10:00:00,2026-11-05 10:00:00,London cafe,-4.50,0.20,GBP,COMPLETED,151\n'
      + 'CARD_PAYMENT,Current,2026-11-04 10:00:00,2026-11-04 10:00:00,Spotify,-10.99,0.50,EUR,COMPLETED,151\n';
    const rows = parseCsv(csv);
    const layout = detectStatement(rows, 'altro')!;
    expect(layout.bank).toBe('revolut');
    const parsed = normalizeStatement(rows, layout);
    expect(parsed.pending).toBe(1);
    expect(parsed.foreign).toBe(1);
    expect(parsed.rows.map(r => [r.date, r.amount])).toEqual([['2026-11-10', -5400], ['2026-11-07', 20000], ['2026-11-04', -1149]]);
    expect(parsed.rows[1].transfer).toBe(true);
  });

  it('legge un export in stile Intesa con righe di intestazione e colonne addebiti/accrediti', () => {
    const rows: unknown[][] = [
      ['Intesa Sanpaolo - Lista movimenti'], ['Conto corrente'], [],
      ['Data contabile', 'Data valuta', 'Descrizione', 'Accrediti', 'Addebiti'],
      ['11/11/2026', '11/11/2026', 'PAGAMENTO POS ESSELUNGA MILANO', '', '68,40'],
      ['10/11/2026', '10/11/2026', 'ACCREDITO STIPENDIO', '1.950,00', ''],
      [new Date(Date.UTC(2026, 10, 9)), '', 'ADDEBITO SDD ENEL ENERGIA', '', '-78,40'],
    ];
    const layout = detectStatement(rows, 'altro')!;
    expect(layout.bank).toBe('intesa');
    expect(layout.headerRow).toBe(3);
    expect(normalizeStatement(rows, layout).rows.map(r => [r.date, r.amount])).toEqual([['2026-11-11', -6840], ['2026-11-10', 195000], ['2026-11-09', -7840]]);
  });

  it('usa la banca scelta quando il file non la indica e accetta un CSV con punto e virgola (es. MPS)', () => {
    const rows = parseCsv('Data;Descrizione;Importo\n05/11/2026;"PRELIEVO ATM; SIENA";-50,00\n04/11/2026;ADDEBITO SDD TIM;-29,90\n');
    const layout = detectStatement(rows, 'mps')!;
    expect(layout.bank).toBe('mps');
    expect(normalizeStatement(rows, layout).rows[0]).toMatchObject({ description: 'PRELIEVO ATM; SIENA', amount: -5000 });
  });

  it('interpreta date e importi nei formati comuni', () => {
    expect(parseStatementDate('5/1/26')).toBe('2026-01-05');
    expect(parseStatementDate('2026-02-30')).toBeNull();
    expect(parseStatementDate(46337)).toBe('2026-11-11');
    expect(parseStatementAmount('1.234,56')).toBe(123456);
    expect(parseStatementAmount('-1,234.56')).toBe(-123456);
    expect(parseStatementAmount('34,20-')).toBe(-3420);
    expect(parseStatementAmount('(12,00)')).toBe(-1200);
    expect(parseStatementAmount('€ 5')).toBe(500);
    expect(parseStatementAmount('abc')).toBeNull();
  });

  it('dà hash diversi a movimenti identici nello stesso giorno', () => {
    const row = { date: '2026-11-01', description: 'Caffè', amount: -120, transfer: false };
    const hashed = withHashes('intesa', [row, row]);
    expect(new Set(hashed.map(h => h.hash)).size).toBe(2);
  });
  it('riconosce come già importati i movimenti di un Excel reimportato o con periodo sovrapposto', () => {
    const oct = [
      { date: '2026-10-30', description: 'PAGAMENTO POS ESSELUNGA', amount: -2350, transfer: false },
      { date: '2026-10-31', description: 'Caffè', amount: -120, transfer: false },
      { date: '2026-10-31', description: 'Caffè', amount: -120, transfer: false },
    ];
    const imported = new Set(withHashes('intesa', oct).map(h => h.hash));
    // Stesso file importato di nuovo: tutto già presente.
    expect(withHashes('intesa', oct).every(h => imported.has(h.hash))).toBe(true);
    // File successivo che riparte dal 31 ottobre (spazi e maiuscole diversi): nuovo solo il movimento di novembre.
    const next = [
      { date: '2026-10-31', description: '  caffè ', amount: -120, transfer: false },
      { date: '2026-10-31', description: 'CAFFÈ', amount: -120, transfer: false },
      { date: '2026-11-01', description: 'Caffè', amount: -120, transfer: false },
    ];
    expect(withHashes('intesa', next).map(h => imported.has(h.hash))).toEqual([true, true, false]);
    // Lo stesso movimento su un'altra banca non è un duplicato.
    expect(withHashes('revolut', oct).some(h => imported.has(h.hash))).toBe(false);
  });
});

describe('categorie e giroconti', () => {
  it('assegna categorie predefinite e rispetta le regole utente', () => {
    expect(categorize('PAGAMENTO POS ESSELUNGA MILANO', -100, [])).toBe('spesa');
    expect(categorize('ACCREDITO STIPENDIO NOVEMBRE', 100, [])).toBe('entrate');
    expect(categorize('PRELIEVO ATM', -5000, [])).toBe('contanti');
    expect(categorize('Netflix.com', -1399, [])).toBe('abbonamenti');
    expect(categorize('BOTTEGA ROSSI', -1000, [{ id: 'r', updatedAt: 1, pattern: 'bottega rossi', category: 'ristoranti' }])).toBe('ristoranti');
    expect(rulePattern('PAGAMENTO POS ESSELUNGA MILANO 1234')).toBe('esselunga milano');
  });

  it('riconosce un giroconto tra due banche entro 3 giorni', () => {
    const list = [tx('a', 'mps', '2026-11-07', -20000, 'BONIFICO A REVOLUT'), tx('b', 'revolut', '2026-11-08', 20000, 'Payment from Giacomo'), tx('c', 'mps', '2026-11-07', -20000, 'AFFITTO')];
    expect([...detectTransfers(list)].sort()).toEqual(['a', 'b']);
  });

  it('trova i pagamenti ricorrenti con importo stabile', () => {
    const list = [tx('1', 'revolut', '2026-09-04', -1099, 'Spotify'), tx('2', 'revolut', '2026-10-04', -1099, 'Spotify'), tx('3', 'revolut', '2026-10-05', -3500, 'Bar'), tx('4', 'revolut', '2026-11-05', -900, 'Bar')];
    const rec = recurringCharges(list, '2026-11-11');
    expect(rec.map(r => [r.label, r.nextDate])).toEqual([['Spotify', '2026-11-04']]);
  });
});

describe('spese effettive con Dividi', () => {
  it('conta solo la propria parte delle spese divise', () => {
    const doc = emptyHubDoc();
    doc.transactions.push({ ...tx('t', 'intesa', '2026-11-11', -6840, 'ESSELUNGA', 'spesa'), expenseId: 'e' });
    doc.expenses.push({ id: 'e', updatedAt: 1, groupId: 'g', description: 'Spesa', amount: 6840, paidBy: 'me', date: '2026-11-11', category: 'spesa', mode: 'equal', parts: { me: 1, m: 1, l: 1 }, transactionId: 't' });
    doc.expenses.push({ id: 'f', updatedAt: 1, groupId: 'g', description: 'Luce', amount: 9000, paidBy: 'm', date: '2026-11-08', category: 'casa', mode: 'equal', parts: { me: 1, m: 1, l: 1 } });
    expect(spendingItems(doc, 'me').map(i => [i.id, i.amount])).toEqual([['t', 2280], ['f', 3000]]);
  });
});

describe('piano risparmio e budget del giorno', () => {
  const items: SpendItem[] = [];
  const push = (month: string, category: string, amount: number) => items.push({ date: month + '-10', category, amount, label: category, source: 'bank', id: month + category + items.length });
  for (const m of ['2026-08', '2026-09', '2026-10']) {
    push(m, 'casa', 43000); push(m, 'spesa', 38000); push(m, 'ristoranti', 21000); push(m, 'shopping', 16000); push(m, 'abbonamenti', 7800);
  }
  it('raggiunge l’obiettivo senza toccare le spese fisse e senza superare i limiti', () => {
    const plan = computePlan(items, 20000, '2026-11-11')!;
    expect(plan.months).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(plan.achieved).toBeGreaterThanOrEqual(19900);
    expect(plan.rows.find(r => r.category === 'casa')!.cut).toBe(0);
    const spesa = plan.rows.find(r => r.category === 'spesa')!;
    expect(spesa.cut).toBeLessThanOrEqual(3800 + 100);
    expect(plan.level).toBe('realistico');
  });
  it('segnala un obiettivo fuori portata', () => {
    const plan = computePlan(items, 80000, '2026-11-11')!;
    expect(plan.level).toBe('troppo');
    expect(plan.achieved).toBeLessThan(80000);
  });
  it('calcola il budget del giorno sulle spese di tutti i giorni', () => {
    const month = [{ date: '2026-11-01', category: 'casa', amount: 43000, label: '', source: 'bank', id: 'a' }, { date: '2026-11-05', category: 'spesa', amount: 10000, label: '', source: 'bank', id: 'b' }, { date: '2026-11-11', category: 'ristoranti', amount: 1500, label: '', source: 'bank', id: 'c' }] as SpendItem[];
    const b = dailyBudget(month, { casa: 43000, spesa: 34000, ristoranti: 12000 }, 120000, '2026-11-11');
    expect(b.daily).toBe(Math.round((46000 - 10000) / 20));
    expect(b.left).toBe(b.daily - 1500);
  });
});

describe('Dividi', () => {
  it('divide in parti uguali senza perdere centesimi', () => {
    expect(computeShares(1000, 'equal', { a: 1, b: 1, c: 1 })).toEqual({ a: 334, b: 333, c: 333 });
    expect(computeShares(10000, 'percent', { a: 70, b: 30 })).toEqual({ a: 7000, b: 3000 });
    expect(computeShares(9000, 'shares', { a: 2, b: 1 })).toEqual({ a: 6000, b: 3000 });
    expect(splitProblem(1000, 'amounts', { a: 500, b: 400 })).toContain('Mancano');
  });
  it('semplifica i debiti del gruppo', () => {
    const e = (id: string, amount: number, paidBy: string) => ({ id, updatedAt: 1, groupId: 'g', description: id, amount, paidBy, date: '2026-11-01', category: 'casa', mode: 'equal' as const, parts: { t: 1, m: 1, l: 1 } });
    const balances = groupBalances([e('1', 6840, 't'), e('2', 9000, 'm'), e('3', 3000, 'l'), e('4', 3720, 't')], []);
    expect(simplifyDebts(balances)).toEqual([{ from: 'l', to: 't', amount: 3040 }, { from: 'l', to: 'm', amount: 1480 }]);
    const settled = groupBalances([e('1', 6840, 't'), e('2', 9000, 'm'), e('3', 3000, 'l'), e('4', 3720, 't')], [{ id: 's', updatedAt: 1, groupId: 'g', from: 'l', to: 't', amount: 3040, date: '2026-11-12' }]);
    expect(simplifyDebts(settled)).toEqual([{ from: 'l', to: 'm', amount: 1480 }]);
  });
});

describe('ripetizioni del calendario', () => {
  it('gestisce fine mese e anni bisestili', () => {
    expect(eventOccurrences({ date: '2026-01-31', repeat: 'monthly' }, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(eventOccurrences({ date: '2024-02-29', repeat: 'yearly' }, '2025-01-01', '2028-12-31')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(eventOccurrences({ date: '2026-11-11', repeat: 'weekly' }, '2026-11-12', '2026-11-30')).toEqual(['2026-11-18', '2026-11-25']);
  });
});

describe('piano risparmio modificato per ambito', () => {
  const day = (m: string, d: string) => `2026-${m}-${d}`;
  const items = ['08', '09', '10'].flatMap(m => [
    { id: 'r' + m, date: day(m, '05'), category: 'ristoranti', amount: 20000, label: 'r', source: 'bank' as const },
    { id: 's' + m, date: day(m, '06'), category: 'shopping', amount: 20000, label: 's', source: 'bank' as const },
    { id: 'a' + m, date: day(m, '07'), category: 'casa', amount: 60000, label: 'a', source: 'bank' as const },
  ]);
  it('sposta il risparmio sugli altri ambiti quando uno è bloccato o scelto a mano', () => {
    const auto = computePlan(items, 10000, '2026-11-11')!;
    const lock = computePlan(items, 10000, '2026-11-11', { shopping: 0 })!;
    expect(lock.rows.find(r => r.category === 'shopping')).toMatchObject({ cut: 0, cap: 20000, manual: true });
    expect(lock.rows.find(r => r.category === 'ristoranti')!.cut).toBe(9000);  // massimo automatico 45%
    expect(lock.achieved).toBeLessThan(auto.achieved);
    const more = computePlan(items, 10000, '2026-11-11', { shopping: 8000 })!;
    expect(more.rows.find(r => r.category === 'shopping')!.cut).toBe(8000);
    expect(more.rows.find(r => r.category === 'ristoranti')!.cut).toBe(2000);
    expect(more.achieved).toBe(10000);
    // Una scelta oltre la media viene limitata e le spese fisse restano intatte.
    const capped = computePlan(items, 10000, '2026-11-11', { shopping: 99999, casa: 5000 })!;
    expect(capped.rows.find(r => r.category === 'shopping')).toMatchObject({ cut: 20000, cap: 0 });
    const casa = capped.rows.find(r => r.category === 'casa')!;
    expect(casa.cut).toBe(0);
    expect(casa.manual).toBeUndefined();
  });
  it('non produce mai tagli negativi per via degli arrotondamenti', () => {
    const odd = ['08', '09', '10'].map(m => ({ id: 'x' + m, date: day(m, '05'), category: 'abbonamenti', amount: 151, label: 'x', source: 'bank' as const }));
    const plan = computePlan(odd, 0, '2026-11-11')!;
    expect(plan.rows.every(r => r.cut >= 0 && r.cap <= r.avg)).toBe(true);
  });
});
