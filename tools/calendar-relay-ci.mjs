// Prepara l'aggiornamento del servizio calendario/notifiche (calendar-relay) da GitHub Actions.
// Non crea né cancella dati: trova il database esistente, controlla che le chiavi siano già
// presenti su Cloudflare e scrive una configurazione temporanea per wrangler (non salvata nel repo).
import {spawnSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'calendar-relay');
const NAME = 'gymtrack-calendar';

// Fuori dalla cartella del servizio: wrangler.jsonc del repo contiene ancora il segnaposto del database.
function wrangler(args) {
  const result = spawnSync('npx', ['--yes', 'wrangler@4', ...args], {cwd: os.tmpdir(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: {...process.env, WRANGLER_SEND_METRICS: 'false'}});
  if (result.error || result.status !== 0) throw Error(`Passaggio non riuscito: wrangler ${args.slice(0, 2).join(' ')}. ${(result.stderr || '').split('\n').filter(Boolean).slice(-3).join(' ')}`);
  return result.stdout;
}
function jsonOut(text) {
  const start = text.search(/[[{]/);
  if (start < 0) throw Error('Risposta di Cloudflare non leggibile.');
  return JSON.parse(text.slice(start));
}

async function main() {
  const databases = jsonOut(wrangler(['d1', 'list', '--json']));
  const database = (Array.isArray(databases) ? databases : databases.result ?? []).find(d => d.name === NAME);
  if (!database || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(database.uuid || '')) {
    throw Error(`Database ${NAME} non trovato su questo account Cloudflare. Il servizio calendario va prima creato con la procedura iniziale (calendar-relay/README.md); questo flusso aggiorna soltanto.`);
  }
  let secrets;
  try { secrets = jsonOut(wrangler(['secret', 'list', '--name', NAME, '--format=json'])); }
  catch { throw Error(`Worker ${NAME} non trovato su questo account Cloudflare: controlla che CLOUDFLARE_ACCOUNT_ID sia lo stesso account del calendario.`); }
  const names = new Set((Array.isArray(secrets) ? secrets : []).map(s => s.name));
  for (const required of ['CALENDAR_RELAY_SECRET', 'PUSH_VAPID_PRIVATE_JWK']) {
    if (!names.has(required)) throw Error(`Manca la chiave ${required} sul Worker ${NAME}. Questo flusso non genera chiavi: usa la procedura push in calendar-relay/ISTRUZIONI-PUSH.txt.`);
  }
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  if (config.name !== NAME) throw Error('Nome del Worker inatteso in calendar-relay/wrangler.jsonc.');
  config.d1_databases = [{binding: 'DB', database_name: NAME, database_id: database.uuid}];
  // Stesse impostazioni della procedura di aggiornamento push: controllo ogni minuto e invii solo verso indirizzi pubblici.
  config.triggers = {...config.triggers, crons: ['* * * * *']};
  config.vars = {...config.vars, PUSH_SCHEDULER_ENABLED: 'true'};
  config.compatibility_flags = [...new Set([...(config.compatibility_flags || []), 'global_fetch_strictly_public'])];
  await writeFile(path.join(root, 'wrangler.ci.jsonc'), JSON.stringify(config, null, 2) + '\n');
  console.log(`Database ${NAME} trovato, chiavi presenti: configurazione pronta.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
