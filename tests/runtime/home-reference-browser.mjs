// Disposable localhost fixture. Synthetic profile and workouts only.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.GYMTRACK_PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://localhost:4173', output = 'docs/qa/home-reference', password = 'fixture-only-test-password';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({executablePath: process.env.GYMTRACK_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const context = await browser.newContext({viewport: {width: 430, height: 932}, deviceScaleFactor: 2, timezoneId: 'Europe/Rome', serviceWorkers: 'block'});
const page = await context.newPage(), errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const mark = name => {results.push(name); console.log('PASS', name);};
const call = async (path, body) => {
  const response = body === undefined ? await context.request.get(origin + '/api/' + path) : await context.request.post(origin + '/api/' + path, {headers: {Origin: origin}, data: body});
  assert(response.ok(), path + ' ' + response.status()); return response.json();
};
const home = async () => {await page.goto(origin + '/#/'); await page.locator('main [data-design-id="home.goals"]').waitFor();};
try {
  await context.request.post(origin + '/api/auth/setup', {headers: {Origin: origin}, data: {password}});
  await call('auth/login', {email: 'giacomotanduo004@gmail.com', password});
  await page.clock.install({time: new Date('2026-11-02T12:00:00+01:00')});
  await home();
  await page.evaluate(async () => {
    let database;
    for (const {name} of await indexedDB.databases()) {
      const candidate = await new Promise(resolve => {const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result);});
      if (candidate.objectStoreNames.contains('workouts')) {database = candidate; break;} candidate.close();
    }
    if (!database) throw Error('Fixture archive missing');
    const transaction = database.transaction(['profiles', 'settings', 'workouts'], 'readwrite');
    const profiles = transaction.objectStore('profiles'), settings = transaction.objectStore('settings');
    const profile = profiles.get('local'), saved = settings.get('local');
    profile.onsuccess = () => profiles.put({...profile.result, name: 'Giacomo Tanduo'});
    saved.onsuccess = () => settings.put({...saved.result, goals: {...saved.result.goals, workoutsPerWeek: 4}});
    for (const [id, date] of [['reference-one', '2026-11-02'], ['reference-two', '2026-11-02'], ['reference-three', '2026-11-02'], ['reference-previous', '2026-10-26']])
      transaction.objectStore('workouts').put({id, date, userId: 'local', planId: 'historical-plan', dayId: 'historical-day', planName: 'Piano di prova', dayName: 'Seduta di prova', status: 'completed', startedAt: date + 'T10:00:00', endedAt: date + 'T10:30:00', duration: 30, notes: 'Synthetic reference fixture'});
    await new Promise((resolve, reject) => {transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);}); database.close();
  });
  await call('preferences', {backgroundColor: '#151225', themeConfig: {palette: 'viola-neon', mode: 'dark'}});
  await page.reload(); await page.locator('main [data-design-id="home.goals"]').waitFor();
  await page.locator('h1').filter({hasText: 'Ciao Giacomo'}).waitFor();
  assert.match(await page.locator('h1').innerText(), /Ciao Giacomo.*👋/);
  assert.match(await page.locator('.today-date').innerText(), /lunedì 2 novembre/i);
  assert.equal(await page.locator('.today-motto').innerText(), 'Ogni giorno, un passo avanti.');
  mark('Reference greeting uses the actual profile name, live Italian date and editable motto');
  const progress = page.getByRole('progressbar');
  assert.equal(await progress.getAttribute('aria-valuenow'), '75');
  assert.equal(await page.locator('.home-goal-copy strong').innerText(), '75%');
  assert.equal(await page.locator('.home-goal-count').innerText(), '3 di 4 allenamenti');
  const ring = await progress.boundingBox(), figure = await page.locator('.home-weekly-overview').boundingBox();
  assert(ring.width >= 240 && Math.abs(ring.width - ring.height) < 2);
  assert(Math.abs(ring.x + ring.width / 2 - figure.x - figure.width / 2) < 2);
  assert(await page.locator('.home-dumbbell').evaluate(image => image.complete && image.naturalWidth === 1672));
  assert(Number(await page.locator('.home-goal-copy strong').evaluate(element => parseFloat(getComputedStyle(element).fontSize))) >= 52);
  mark('Large centered ring shows 75 percent from three actual fixture workouts and a four-session goal');
  assert(await page.locator('.home-main-actions').isVisible());
  assert.equal(await page.locator('.home-shortcuts > a').count(), 3);
  assert.equal(await page.locator('.home-week-days > a').count(), 7);
  assert.equal(await page.locator('.home-mini-stats > a').count(), 3);
  assert(await page.locator('.client-view-toggle').isVisible());
  assert.equal(await page.locator('.home-health-disclosure').getAttribute('open'), null);
  const actions = await page.locator('.home-main-actions').boundingBox(); assert(actions.y > figure.y + figure.height);
  assert.match(await page.locator('[data-design-id="home.stats.workouts"]').innerText(), /4/);
  await page.locator('.home-notifications').click();
  await page.locator('main h1').filter({hasText: 'Impostazioni'}).waitFor();
  await home();
  await page.locator('[data-design-id="home.actions.create"]').click();
  await page.waitForURL(/#\/piani/);
  await home();
  mark('Existing actions, calendar, statistics, client view, wellness and settings links remain below the hero');
  await page.locator('main [data-design-id="home.goals"]').click();
  await page.getByLabel('Allenamenti per settimana', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Allenamenti per settimana', {exact: true}).inputValue(), '4');
  await home(); assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '75');
  mark('The ring still opens the original weekly goal editor without altering saved workouts');
  for (const width of [320, 390, 430, 1100]) {
    await page.setViewportSize({width, height: 932});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow at ' + width);
    const box = await page.getByRole('progressbar').boundingBox(); assert(box.width >= 190);
    const container = await page.locator('.home-weekly-overview').boundingBox();
    assert(Math.abs(box.x + box.width / 2 - container.x - container.width / 2) < 2, 'ring not centered at ' + width);
    await page.screenshot({path: output + '/home-reference-' + width + '.png', fullPage: true});
  }
  mark('Reference opening fits 320, 390, 430 px and desktop while lower sections remain scrollable');
  await page.clock.setSystemTime(new Date('2026-11-03T12:00:00+01:00'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.locator('time[datetime="2026-11-03"]').waitFor();
  assert.match(await page.locator('.today-date').innerText(), /martedì 3 novembre/i);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '75');
  mark('Displayed date refreshes from Monday to Tuesday without a hard-coded reference date');
  await page.setViewportSize({width: 390, height: 932});
  for (const themeConfig of [{palette: 'blu-azzurro', mode: 'dark'}, {palette: 'viola-neon', mode: 'light'}]) {
    await call('preferences', {backgroundColor: themeConfig.mode === 'light' ? '#F0F3FA' : '#040C19', themeConfig});
    await page.reload(); await page.locator('main [data-design-id="home.goals"]').waitFor();
    await page.waitForFunction(config => document.body.dataset.themePalette === config.palette && document.body.classList.contains('custom-light') === (config.mode === 'light'), themeConfig);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '75');
    assert.match(await page.locator('h1').innerText(), /Ciao Giacomo/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: output + '/home-' + themeConfig.palette + '-' + themeConfig.mode + '.png', fullPage: true});
  }
  mark('Existing blue, violet and light-mode preferences keep working with the illustrated hero');
  assert.deepEqual(errors, []); mark('No application JavaScript exceptions');
  console.log(JSON.stringify({passed: results.length, results}, null, 2));
} finally {await browser.close();}
