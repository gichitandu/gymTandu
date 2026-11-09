import { describe, expect, it } from 'vitest';
import { shiftMonths } from '../src/app/services/statistics';
const shift = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); shiftMonths(d, n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
describe('shiftMonths', () => {
  it('non sfora a fine mese', () => {
    expect(shift('2026-03-31', -1)).toBe('2026-02-28');
    expect(shift('2028-02-29', -12)).toBe('2027-02-28');
    expect(shift('2026-05-15', -3)).toBe('2026-02-15');
  });
});
