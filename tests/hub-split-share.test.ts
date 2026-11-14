import { describe, expect, it } from 'vitest';
import { euroInputText, HubExpense, parseEuroInput } from '../src/app/hub/hub-model';
import { computeShares, splitProblem } from '../src/app/hub/hub-split';
import { expenseShareText, shareSummary } from '../src/app/hub/hub-share';

const names: Record<string, string> = { me: 'Giacomo', a: 'Marco', b: 'Luca' };
const name = (id: string) => names[id] ?? id;

describe('importi scritti a mano (Dividi)', () => {
  it('legge i formati italiani senza perdere centesimi', () => {
    expect(parseEuroInput('34,20')).toBe(3420);
    expect(parseEuroInput('34,2')).toBe(3420);
    expect(parseEuroInput('34.20')).toBe(3420);
    expect(parseEuroInput('0,29')).toBe(29);
    expect(parseEuroInput('1.234,56')).toBe(123456);
    expect(parseEuroInput('1.234')).toBe(123400);
    expect(parseEuroInput('1234,5')).toBe(123450);
    expect(parseEuroInput('12,')).toBe(1200);
    expect(parseEuroInput(',50')).toBe(50);
    expect(parseEuroInput('0.123')).toBe(12);
    expect(parseEuroInput('€ 48,60')).toBe(4860);
  });
  it('rifiuta testo non valido', () => {
    expect(parseEuroInput('')).toBeNull();
    expect(parseEuroInput('abc')).toBeNull();
    expect(parseEuroInput('1,2,3')).toBeNull();
    expect(parseEuroInput(',')).toBeNull();
  });
  it('il testo per il campo si rilegge identico', () => {
    for (const cents of [1, 29, 1250, 123456]) expect(parseEuroInput(euroInputText(cents))).toBe(cents);
    expect(euroInputText(123456)).toBe('1234,56');
  });
});

describe('quote esatte', () => {
  it('importi diversi: segnala sia la cifra mancante sia quella in eccesso', () => {
    expect(splitProblem(5000, 'amounts', { me: 2000, a: 2000 })).toContain('Mancano 10,00');
    expect(splitProblem(5000, 'amounts', { me: 3000, a: 2500 })).toContain('5,00 € in più');
    expect(splitProblem(5000, 'amounts', { me: 3000, a: 2000 })).toBe('');
  });
  it('divide in parti uguali senza resto', () => {
    const shares = computeShares(10000, 'equal', { me: 1, a: 1, b: 1 });
    expect(Object.values(shares).reduce((s, v) => s + v, 0)).toBe(10000);
  });
});

describe('testi da condividere', () => {
  const expense: HubExpense = { id: 'e1', updatedAt: 1, groupId: 'g', description: 'Cena pizzeria', amount: 4860, paidBy: 'a', date: '2026-11-14', category: 'altro', mode: 'equal', parts: { me: 1, a: 1, b: 1 } };
  it('una spesa riporta descrizione, importo esatto e quota di ognuno', () => {
    const text = expenseShareText(expense, 'Calcetto', name);
    expect(text).toContain('Cena pizzeria — 48,60 €');
    expect(text).toContain('pagato da Marco');
    expect(text).toContain('• Giacomo: 16,20 €');
    expect(text).toContain('Luca deve 16,20 € a Marco');
    expect(text).not.toContain('Marco deve');
  });
  it('il riepilogo del gruppo elenca le spese oltre ai saldi', () => {
    const text = shareSummary('Calcetto', [{ from: 'me', to: 'a', amount: 1620 }], name, [expense]);
    expect(text).toContain('Cena pizzeria: 48,60 € (pagato da Marco)');
    expect(text).toContain('Totale: 48,60 €');
    expect(text).toContain('Giacomo deve 16,20 € a Marco');
  });
});
