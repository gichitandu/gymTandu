import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const component = readFileSync(new URL('../src/app/layouts/app.component.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/app/layouts/entry.css', import.meta.url), 'utf8');

it('uses only the canonical GymTrack app logo in both login and welcome views', () => {
  expect(existsSync(new URL('../public/brand/gt-modern-mark.png', import.meta.url))).toBe(true);
  expect(component.match(/src="\/brand\/gt-modern-mark\.png"/g)).toHaveLength(2);
});

it('retains the existing online, local, offline and account-setup controls', () => {
  const existingControls = [
    'id="account-tab"',
    'id="local-tab"',
    'id="account-panel"',
    'id="local-panel"',
    'auth.setup()',
    'auth.offlineAccount()',
    'auth.openLocal(true)',
    'auth.openLocal()',
    'auth.previousAccountArchive()',
    '[(ngModel)]="email"',
    '[(ngModel)]="username"',
    '[(ngModel)]="password"',
    '[(ngModel)]="confirm"',
    '[(ngModel)]="remember"',
    '(ngSubmit)="submit()"',
    '[disabled]="busy()||auth.loading()||loginForm.invalid"',
    '(click)="show.set(!show())"',
    '(click)="help.set(!help())"',
    'this.auth.login(',
  ];
  // Confronto senza spazi: i marcatori non devono dipendere dalla formattazione del template.
  const compactComponent = component.replace(/\s+/g, '');
  for (const marker of existingControls) expect(compactComponent).toContain(marker.replace(/\s+/g, ''));
});

it('styles the login with actual resolved palette tokens and mobile-safe controls', () => {
  for (const marker of [
    'var(--bg)', 'var(--card)', 'var(--text)', 'var(--muted)',
    'var(--accent)', 'var(--accent-text)', 'var(--accent-ink)',
    'var(--theme-button-start', 'var(--theme-button-end',
    'env(safe-area-inset-top)', 'env(safe-area-inset-bottom)',
    '@media (max-width: 760px)', 'prefers-reduced-motion',
  ]) expect(styles).toContain(marker);
  expect(component).toContain('restoreEntryTheme()');
});
