import { afterEach, expect, it, vi } from 'vitest';
import { vwApi, vwDetectForm, vwNewest, vwScheduled, vwSync, vwUnzipJson, vwValues } from '../worker/vw.js';

// Portale Volkswagen simulato: pagine e risposte sintetiche con la struttura descritta dalle
// integrazioni open source. Nessuna credenziale o dato reale.
const ID = 'https://identity.vwgroup.io', PORTAL = 'https://eu-data-act.drivesomethinggreater.com';
const VIN = 'WVWZZZCDZMW000001', EMAIL = 'pilota@example.test', PASSWORD = 'password-di-prova';
const superAdmin = { id: 'owner', role: 'SuperAdmin' };

afterEach(() => { vi.restoreAllMocks(); });

function bucket() {
  const objects = new Map<string, string>();
  return { objects, get: async (key: string) => objects.has(key) ? { text: async () => objects.get(key)! } : null, put: async (key: string, value: string) => { objects.set(key, value); return {}; } };
}
const env = (extra: Record<string, unknown> = {}) => ({ VW_ID_EMAIL: EMAIL, VW_ID_PASSWORD: PASSWORD, BUCKET: bucket(), ...extra });

async function zip(name: string, json: unknown) {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const file = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + file.length), lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true); lv.setUint16(26, file.length, true); local.set(file, 30);
  const central = new Uint8Array(46 + file.length), cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, file.length, true); cv.setUint32(42, 0, true); central.set(file, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer), offset = local.length + data.length;
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + central.length + end.length);
  out.set(local, 0); out.set(data, local.length); out.set(central, offset); out.set(end, offset + central.length);
  return out;
}
const point = (key: string, dataFieldName: string, value: string, timestampUtc = '2026-11-11T18:40:00.000Z') => ({ key, dataFieldName, value, timestampUtc });
const dataset = (fuel = '62') => ({ vin: VIN, Data: [
  point('k1', 'fuel_level_current_level', fuel), point('k2', 'cruising_range_primary_engine', '410'), point('k3', 'mileage', '45300'),
  point('k4', 'long_term_data_average_fuel_consumption', '58'), point('k5', 'maintenance_interval__time_until_inspection', '-120'),
  point('k6', 'maintenance_interval_distance_until_inspection', '-8000'), point('k7', 'maintenance_interval__time_until_oil_change', '-60'),
  point('k8', 'car_captured_time', '2026-11-11T18:41:00.000Z'), point('k9', 'outside_temperature', '2850'),
] });

/** Simula identity.vwgroup.io e il portale; registra le chiamate. */
function fakeVw(options: { wrongPassword?: boolean; files?: { name: string; createdOn: string }[]; data?: unknown } = {}) {
  const calls: string[] = [];
  let expire = false;
  const files = options.files ?? [{ name: `20261111194500_${VIN}.zip`, createdOn: '2026-11-11T19:45:00Z' }, { name: `20261111200000_${VIN}_no_content_found.zip`, createdOn: '2026-11-11T20:00:00Z' }];
  const html = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers: { 'Content-Type': 'text/html', ...headers } });
  const redirect = (location: string, status = 302, cookie?: string) => new Response(null, { status, headers: { Location: location, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  const identifierPage = `<html><form method="post" action="/signin-service/v1/client/login/identifier"><input type="hidden" name="_csrf" value="c1"/><input type="hidden" name="relayState" value="r1"/><input type="hidden" name="hmac" value="h1"/><input type="email" name="email" value=""/></form></html>`;
  const passwordPage = (error = '') => `<html><script>window._IDK = { templateModel: {"hmac":"h2","relayState":"r1","postAction":"login/authenticate","template":"loginAuthenticate","emailPasswordForm":{"email":"${EMAIL}"}${error ? `,"error":"${error}"` : ''}}, csrf_token: 'c2' };</script><form method="post" id="emailPasswordForm"><input type="password" name="password"/></form></html>`;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init: any = {}) => {
    const url = new URL(String(input)), headers = new Headers(init.headers), cookie = headers.get('cookie') || '', method = init.method || 'GET';
    calls.push(`${method} ${url.host}${url.pathname}`);
    expect(headers.get('user-agent')).toBe('gymtrack-gt-garage/1.0');
    expect(init.redirect).toBe('manual');
    if (url.origin === ID && url.pathname === '/oidc/v1/authorize') {
      expect(url.searchParams.get('state')).toBe('it__it__VOLKSWAGEN_PASSENGER_CARS');
      return redirect(`${ID}/signin-service/v1/signin/client?relayState=r1`, 302, 'SESSION=s1; Path=/; Secure; HttpOnly');
    }
    if (url.origin === ID && url.pathname === '/signin-service/v1/signin/client') { expect(cookie).toContain('SESSION=s1'); return html(identifierPage); }
    if (url.origin === ID && url.pathname === '/signin-service/v1/client/login/identifier') {
      const body = new URLSearchParams(init.body); expect(Object.fromEntries(body)).toEqual({ _csrf: 'c1', relayState: 'r1', hmac: 'h1', email: EMAIL });
      return redirect(`${ID}/signin-service/v1/client/login/authenticate?relayState=r1`, 303);
    }
    if (url.origin === ID && url.pathname === '/signin-service/v1/client/login/authenticate' && method === 'GET') return html(passwordPage());
    if (url.origin === ID && url.pathname === '/signin-service/v1/client/login/authenticate') {
      expect(url.search).toBe('');
      const body = Object.fromEntries(new URLSearchParams(init.body));
      expect(body).toMatchObject({ _csrf: 'c2', relayState: 'r1', hmac: 'h2', email: EMAIL });
      if (options.wrongPassword || body.password !== PASSWORD) return html(passwordPage('Credenziali non valide'));
      return redirect(`${ID}/oidc/v1/oauth/sso?clientId=x`, 302);
    }
    if (url.origin === ID && url.pathname === '/oidc/v1/oauth/sso') return redirect(`${PORTAL}/services/callbacklogin?code=abc&state=it__it__VOLKSWAGEN_PASSENGER_CARS`);
    if (url.origin === PORTAL && url.pathname === '/services/callbacklogin') return redirect('/it/it/home.html', 302, 'access_token=AT1; Path=/; Secure; HttpOnly; Max-Age=3600');
    if (url.origin === PORTAL && url.pathname.startsWith('/proxy_api/')) {
      if (!cookie.includes('access_token=AT1')) return new Response('{}', { status: 401 });
      if (url.pathname === '/proxy_api/consent/me/vehicles') return Response.json({ vehicles: [{ vin: VIN, modelName: 'Golf' }] });
      if (url.pathname === `/proxy_api/euda-apim/datarequest/vehicles/${VIN}/metadata/partial`) return Response.json({ Identifier: 'req-1' });
      if (url.pathname === `/proxy_api/euda-apim/datadelivery/vehicles/${VIN}/req-1/list`) {
        expect(headers.get('type')).toBe('partial');
        if (expire) { expire = false; return new Response('{}', { status: 401 }); }
        return Response.json(files);
      }
      if (url.pathname === `/proxy_api/euda-apim/datadelivery/vehicles/${VIN}/req-1/download`) {
        expect(headers.get('filename')).toBe(files.filter(f => !f.name.endsWith('_no_content_found.zip')).at(-1)!.name);
        return new Response(await zip('dati.json', options.data ?? dataset()), { headers: { 'Content-Type': 'application/zip' } });
      }
    }
    throw new Error('Richiesta inattesa: ' + url.href);
  });
  return { calls, spy, expireNext: () => { expire = true; }, logins: () => calls.filter(c => c.endsWith('/oidc/v1/authorize')).length, downloads: () => calls.filter(c => c.endsWith('/download')).length };
}

it('accede con il Volkswagen ID, legge il pacchetto più recente con dati e salva la sessione', async () => {
  const vw = fakeVw(), e = env(), now = Date.parse('2026-11-11T20:05:00Z');
  const status = await vwSync(e, { now });
  expect(status).toEqual({ configured: true, state: 'ok', message: '', checkedAt: now, updatedAt: now, capturedAt: Date.parse('2026-11-11T18:41:00Z'), vehicle: '…0001',
    values: { fuelPct: 62, rangeKm: 410, odometerKm: 45300, consumption: 5.8, inspectionDays: 120, inspectionKm: 8000, oilDays: 60 } });
  expect(vw.calls.filter(c => c.startsWith('GET eu-data-act') && !c.includes('proxy_api'))).toEqual(['GET eu-data-act.drivesomethinggreater.com/services/callbacklogin']);
  const session = JSON.parse(e.BUCKET.objects.get('garage/vw-session.json')!);
  expect(session).toMatchObject({ account: EMAIL, vin: VIN, identifier: 'req-1', lastFile: `20261111194500_${VIN}.zip` });
  expect(session.cookies.some((c: any) => c.name === 'access_token' && c.value === 'AT1')).toBe(true);
  expect(JSON.stringify(status)).not.toContain('AT1');
});

it('al controllo successivo riusa la sessione e non riscarica lo stesso pacchetto', async () => {
  const vw = fakeVw(), e = env(), now = Date.parse('2026-11-11T20:05:00Z');
  await vwSync(e, { now });
  await vwSync(e, { now: now + 31 * 60000 });
  expect(vw.logins()).toBe(1);
  expect(vw.downloads()).toBe(1);
  // Prima della pausa di 15 minuti il controllo programmato non chiama il portale.
  const before = vw.calls.length; await vwSync(e, { now: now + 31 * 60000 + 60000 }); expect(vw.calls.length).toBe(before);
});

it('se la sessione salvata è scaduta rifà l’accesso una sola volta e continua', async () => {
  const vw = fakeVw(), e = env(), now = Date.parse('2026-11-11T20:05:00Z');
  await vwSync(e, { now });
  vw.expireNext();
  const status = await vwSync(e, { now: now + 31 * 60000 });
  expect(status.state).toBe('ok');
  expect(vw.logins()).toBe(2);
});

it('con password errata si ferma per 6 ore senza riprovare a ogni controllo', async () => {
  const vw = fakeVw({ wrongPassword: true }), e = env(), now = Date.parse('2026-11-11T20:05:00Z');
  const status = await vwSync(e, { now });
  expect(status).toMatchObject({ state: 'auth', message: 'Credenziali non valide' });
  expect(vw.calls.filter(c => c.startsWith('POST') && c.endsWith('/authenticate'))).toHaveLength(1);
  const before = vw.calls.length;
  await vwSync(e, { now: now + 5 * 3600000 });
  expect(vw.calls.length).toBe(before);
  await vwSync(e, { now: now + 6 * 3600000 + 1 });
  expect(vw.logins()).toBe(2);
});

it('senza pacchetti con dati resta in attesa e conserva gli ultimi valori', async () => {
  fakeVw({ files: [{ name: `20261111200000_${VIN}_no_content_found.zip`, createdOn: '2026-11-11T20:00:00Z' }] });
  const status = await vwSync(env(), { now: Date.parse('2026-11-11T20:05:00Z') });
  expect(status).toMatchObject({ state: 'waiting', values: null });
  expect(status.message).toContain('non ha ancora inviato dati');
});

it('senza segreti non chiama il portale e l’API è solo per il Super Admin', async () => {
  const spy = vi.spyOn(globalThis, 'fetch');
  const off = { BUCKET: bucket() };
  await vwScheduled(off);
  expect(await vwSync(off)).toMatchObject({ configured: false, state: 'off' });
  expect(spy).not.toHaveBeenCalled();
  const get = new Request('https://gymtrack.test/api/hub/vw');
  expect((await vwApi(get, off, null)).status).toBe(401);
  expect((await vwApi(get, off, { id: 'c', role: 'User' })).status).toBe(403);
  expect(await (await vwApi(get, off, superAdmin)).json()).toMatchObject({ configured: false, state: 'off' });
});

it('l’aggiornamento manuale non parte più di una volta ogni 3 minuti e non espone i cookie', async () => {
  const vw = fakeVw(), e = env();
  const sync = () => vwApi(new Request('https://gymtrack.test/api/hub/vw/sync', { method: 'POST' }), e, superAdmin);
  const first = await (await sync()).json() as any;
  expect(first.state).toBe('ok');
  await sync();
  expect(vw.logins()).toBe(1);
  const read = await (await vwApi(new Request('https://gymtrack.test/api/hub/vw'), e, superAdmin)).text();
  expect(read).not.toContain('AT1');
  expect(read).not.toContain(VIN);
});

it('legge i valori dei pacchetti piatti e annidati, con conversione delle miglia', async () => {
  const nested = vwValues({ Data: [point('a', 'mileage.value', '1000', '2026-11-10T10:00:00Z'), point('b', 'mileage.value', '1010', '2026-11-10T10:00:00Z'), point('c', 'mileage.value', '900', '2026-11-09T10:00:00Z'), point('d', 'mileage.unit', 'MILES'), point('e', 'tank_current_level', '40')] });
  expect(nested.values).toMatchObject({ odometerKm: 1625, fuelPct: 40, rangeKm: null });
  expect(nested.capturedAt).toBe(Date.parse('2026-11-11T18:40:00.000Z'));
  expect(await vwUnzipJson((await zip('a.json', { ok: 1 })).buffer)).toEqual({ ok: 1 });
  expect(vwNewest([{ name: 'x_no_content_found.zip', createdOn: '2026-11-11T20:00:00Z' }, { name: '20261111190000_A.zip' }, { name: '20261111194500_B.zip' }]).newest?.name).toBe('20261111194500_B.zip');
});

it('non scambia una pagina di registrazione per il modulo di accesso', () => {
  expect(vwDetectForm(`${ID}/signin-service/v1/client/register`, '<form action="register"><input name="email"/><input name="password"/></form>')).toBeNull();
  expect(vwDetectForm(`${ID}/u/login?state=x`, '<form method="post"><input name="username"/><input name="password"/></form>')).toMatchObject({ postUrl: `${ID}/u/login?state=x`, identifiers: ['username'], asksPassword: true });
});
