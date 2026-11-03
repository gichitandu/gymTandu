// Loopback fixture only; no production login, preferences or archive writes.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { DESIGN_CONTROLS } from '../../shared/design-system.js';
const { chromium } = await import(process.env.GYMTRACK_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.GYMTRACK_QA_OUTPUT || 'docs/qa/gt-logo-labels-weekly';
await mkdir(output, { recursive: true });
const origin = 'http://localhost:4173', password = 'fixture-only-test-password';
const browser = await chromium.launch({executablePath: process.env.GYMTRACK_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const context = await browser.newContext({viewport: {width: 430, height: 932}, deviceScaleFactor: 2, serviceWorkers: 'block'});
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const mark = name => { results.push(name); console.log('PASS', name); };
const call = async (path, body) => {
  const response = body === undefined ? await context.request.get(origin + '/api/' + path) : await context.request.post(origin + '/api/' + path, {headers: {Origin: origin}, data: body});
  assert(response.ok(), path + ' ' + response.status() + ': ' + await response.text());
  return response.json();
};
const waitHome = async () => page.locator('main [data-design-id="home.goals"]').waitFor();
const preview = id => page.locator('gt-design-preview [data-design-id="' + id + '"]');
const confirm = async label => page.locator('dialog[open]').getByRole('button', {name: label, exact: true}).click();
const selectText = async (pageId, id) => {
  await page.locator('.studio-tree select').selectOption(pageId);
  assert(DESIGN_CONTROLS.some(control => control.id === id && control.label));
  await page.locator('.studio-control[data-control-id="' + id + '"]').click();
};
const changeText = async (pageId, id, value) => {
  await selectText(pageId, id);
  await page.getByLabel('Testo visualizzato', {exact: true}).fill(value);
  await page.getByLabel('Testo visualizzato', {exact: true}).press('Tab');
};
const archive = () => page.evaluate(async () => {
  let database;
  for (const {name} of await indexedDB.databases()) {
    const candidate = await new Promise((resolve, reject) => {const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
    if (candidate.objectStoreNames.contains('workouts')) { database = candidate; break; } candidate.close();
  }
  if (!database) throw Error('Fixture archive database missing');
  try {
    // The existing catalog/cloud refresh updates the revision counter on load.
    // Compare all personal data, excluding only that concurrency bookkeeping.
    const names = [...database.objectStoreNames].filter(name => name !== 'archiveMeta'), transaction = database.transaction(names, 'readonly');
    return await Promise.all(names.map(table => new Promise((resolve, reject) => {const request = transaction.objectStore(table).getAll(); request.onsuccess = () => resolve([table, request.result]); request.onerror = () => reject(request.error);}))).then(Object.fromEntries);
  } finally { database.close(); }
});
try {
  await context.request.post(origin + '/api/auth/setup', {headers: {Origin: origin}, data: {password}});
  await call('auth/login', {email: 'giacomotanduo004@gmail.com', password});
  await page.goto(origin + '/#/'); await waitHome();
  assert.equal(await page.locator('.home-weekly-progress strong').innerText(), '—');
  assert.equal(await page.locator('.home-health-disclosure').getAttribute('open'), null);
  const top = await page.locator('.home-weekly-overview').boundingBox(), actions = await page.locator('.home-main-actions').boundingBox();
  assert(top.y < actions.y && top.y < 180);
  mark('Weekly goal is visible at the top of Home, outside the closed wellness panel');
  await page.locator('main [data-design-id="home.goals"]').click();
  await page.getByLabel('Allenamenti per settimana', {exact: true}).fill('3');
  await page.getByRole('button', {name: 'Salva obiettivi', exact: true}).click();
  await page.getByText('Obiettivi salvati.', {exact: true}).waitFor();
  await page.goto(origin + '/#/'); await waitHome();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  // Synthetic historical sessions belong only to this disposable loopback database.
  await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    let database;
    for (const entry of databases) {
      const candidate = await new Promise(resolve => {const request = indexedDB.open(entry.name); request.onsuccess = () => resolve(request.result);});
      if (candidate.objectStoreNames.contains('workouts')) {database = candidate; break;} candidate.close();
    }
    if (!database) throw Error('Workout fixture database missing');
    const local = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const today = new Date(), old = new Date(today); old.setDate(old.getDate() - 8);
    const transaction = database.transaction(['workouts'], 'readwrite'), store = transaction.objectStore('workouts');
    for (const [id, date] of [['qa-current-a', local(today)], ['qa-current-b', local(today)], ['qa-previous-week', local(old)]])
      store.put({id, date, status: 'completed', userId: 'local', planId: 'qa-history', dayId: 'qa-day', planName: 'Piano storico di prova', dayName: 'Seduta di prova', startedAt: date + 'T12:00:00', endedAt: date + 'T12:30:00', duration: 30, notes: 'Disposable QA fixture'});
    await new Promise((resolve, reject) => {transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);}); database.close();
  });
  await page.reload(); await waitHome();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '67');
  assert.match(await page.locator('.home-goal-copy').innerText(), /2 di 3 allenamenti/);
  assert.match(await page.locator('[data-design-id="home.stats.workouts"]').innerText(), /3/);
  const before = await archive();
  mark('Saved goal and real completed-session archive restore 67 percent, excluding previous weeks');
  await page.screenshot({path: output + '/home-weekly-goal-mobile.png', fullPage: true});
  const actual = await context.newPage(); actual.on('pageerror', error => errors.push(error.message));
  await actual.goto(origin + '/#/'); await actual.locator('main h1').waitFor();
  await page.goto(origin + '/#/design-studio'); await page.locator('.studio-properties').waitFor();
  await page.getByRole('button', {name: 'Testi e scritte', exact: true}).click();
  await changeText('home', 'home.title', 'Il mio spazio');
  await preview('home.title').filter({hasText: 'Il mio spazio'}).waitFor({state: 'attached'});
  assert.match(await actual.locator('main h1').innerText(), /^Ciao Atleta/);
  assert.equal((await call('design/studio')).published.config.instances['home.title'], undefined);
  mark('Dedicated text editor previews Home renaming without changing the published app');
  await changeText('home', 'home.subtitle', 'Una seduta alla volta');
  await changeText('home', 'home.actions.schedule', 'Organizza la settimana');
  await changeText('navigation', 'navigation.home', 'Inizio');
  await page.locator('gt-design-preview .bottom-nav a').filter({hasText: 'Inizio'}).waitFor({state: 'attached'});
  await changeText('profile', 'profile.title', 'Il mio profilo');
  await changeText('progress', 'progress.title', 'I miei risultati');
  await page.getByRole('button', {name: 'Salva bozza', exact: true}).click();
  await page.getByRole('status').filter({hasText: 'Bozza privata salvata sul server'}).waitFor();
  await page.reload(); await page.locator('.studio-properties').waitFor();
  await page.getByRole('button', {name: 'Testi e scritte', exact: true}).click();
  await selectText('home', 'home.title');
  assert.equal(await page.getByLabel('Testo visualizzato', {exact: true}).inputValue(), 'Il mio spazio');
  mark('Editable titles, subtitles, actions and independent navigation names survive draft reload');
  await page.setViewportSize({width: 1600, height: 1100});
  await page.screenshot({path: output + '/editable-labels-studio-desktop.png', fullPage: true});
  await page.getByRole('button', {name: 'Pubblica', exact: true}).click(); await confirm('Pubblica per tutti');
  await page.getByRole('status').filter({hasText: 'Tema pubblicato.'}).waitFor();
  await actual.reload();
  await actual.locator('main h1').filter({hasText: 'Il mio spazio'}).waitFor();
  assert.equal(await actual.locator('.today-motto').innerText(), 'Una seduta alla volta');
  const navHome = actual.locator('.bottom-nav [data-design-id="navigation.home"]');
  assert.equal(await navHome.getAttribute('aria-label'), 'Inizio');
  assert.match(await navHome.getAttribute('href'), /#\/$/);
  const schedule = actual.locator('[data-design-id="home.actions.schedule"]');
  assert.match(await schedule.innerText(), /Organizza la settimana/); assert.match(await schedule.getAttribute('href'), /calendario/);
  await actual.locator('.bottom-nav [data-design-id="navigation.profile"]').click();
  await actual.locator('main h1').filter({hasText: 'Il mio profilo'}).waitFor();
  await actual.locator('[data-design-id="profile.settings"]').click();
  await actual.locator('main h1').filter({hasText: 'Impostazioni'}).waitFor();
  assert.equal(await actual.locator('main h1').innerText(), 'Impostazioni');
  await actual.locator('.bottom-nav [data-design-id="navigation.progress"]').click();
  await actual.locator('main h1').filter({hasText: 'I miei risultati'}).waitFor();
  await actual.locator('.bottom-nav [data-design-id="navigation.home"]').click();
  assert.equal(await actual.getByRole('progressbar').getAttribute('aria-valuenow'), '67');
  mark('Published copy survives reload and original navigation, goal and profile subpanels continue to work');
  await actual.close();
  await page.goto(origin + '/#/'); await waitHome();
  assert.deepEqual(await archive(), before);
  mark('Text publication leaves every personal archive table, workout and saved goal unchanged');
  await page.setViewportSize({width: 1600, height: 1100});
  await page.locator('.sidebar [data-design-id="navigation.home"]').filter({hasText: 'Inizio'}).waitFor();
  assert.equal(await page.locator('.sidebar [data-design-id="navigation.training"]').innerText(), 'Allenamenti');
  await page.screenshot({path: output + '/custom-labels-desktop.png', fullPage: true});
  mark('Desktop and mobile share renamed navigation and retain their original fallback labels');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({width, height: 932});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow at ' + width);
    assert(await page.getByRole('progressbar').isVisible());
  }
  await page.screenshot({path: output + '/custom-labels-mobile.png', fullPage: true});
  await page.goto(origin + '/#/design-studio'); await page.locator('.studio-properties').waitFor();
  await page.getByRole('button', {name: 'Testi e scritte', exact: true}).click();
  await selectText('home', 'home.title');
  await page.getByRole('button', {name: 'Ripristina testo originale', exact: true}).click();
  await preview('home.title').filter({hasText: 'Ciao Atleta'}).waitFor({state: 'attached'});
  assert.equal((await call('design/studio')).published.config.instances['home.title'].label, 'Il mio spazio');
  await page.getByRole('button', {name: 'Annulla', exact: true}).click(); await confirm('Scarta bozza');
  await page.getByRole('status').filter({hasText: 'Bozza rimossa'}).waitFor();
  mark('Mobile layouts fit 320–430 px; restoring and cancelling copy keep the published labels intact');
  await page.getByRole('button', {name: 'Testi e scritte', exact: true}).click();
  await changeText('home', 'home.title', 'W'.repeat(60));
  await changeText('navigation', 'navigation.home', 'W'.repeat(60));
  await page.getByRole('button', {name: 'Mostra anteprima live', exact: true}).click();
  assert(await page.locator('.preview-phone').evaluate(element => element.scrollWidth <= element.clientWidth), 'long labels overflow preview');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'long labels overflow editor');
  await page.getByRole('button', {name: 'Annulla', exact: true}).click(); await confirm('Scarta bozza');
  await page.getByRole('status').filter({hasText: 'Bozza rimossa'}).waitFor();
  mark('Sixty-character titles and navigation names wrap safely without changing published labels');
  for (const [url, size] of [['/brand/gt-modern-mark.png', 512], ['/icons/gt-modern-192.png', 192], ['/icons/gt-modern-512.png', 512], ['/icons/gt-modern-180.png', 180]]) {
    const response = await context.request.get(origin + url); assert(response.ok());
    const bytes = await response.body(); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
  const manifest = await (await context.request.get(origin + '/manifest.webmanifest')).json();
  assert.equal(manifest.id, './'); assert.equal(manifest.icons[0].src, 'icons/gt-modern-192.png');
  const guest = await browser.newContext({viewport: {width: 430, height: 932}, serviceWorkers: 'block'}), entry = await guest.newPage();
  await entry.goto(origin + '/#/');
  const logo = entry.locator('.entry-brand img[src="/brand/gt-modern-mark.png"]'); await logo.waitFor();
  assert(await logo.evaluate(image => image.complete && image.naturalWidth === 512));
  await entry.screenshot({path: output + '/new-gt-logo-entry.png', fullPage: true}); await guest.close();
  mark('New GT logo is served in login, favicon, Apple and maskable PWA sizes while PWA identity stays stable');
  assert.deepEqual(errors, []); mark('No application JavaScript exceptions');
  console.log(JSON.stringify({passed: results.length, results}, null, 2));
} finally { await browser.close(); }
