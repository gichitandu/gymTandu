// Prepara le risorse Cloudflare (database D1 e bucket R2) in modo idempotente e
// scrive l'ID del database in wrangler.jsonc, solo nella copia di lavoro del runner.
// Richiede CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID nell'ambiente.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DATABASE = 'gymtrack-accounts';
const BUCKET = 'gymtrack-archives';
const PLACEHOLDER = 'REPLACE_WITH_D1_DATABASE_ID';
const wrangler = (...args) => run('npx', ['--yes', 'wrangler@4', ...args], { maxBuffer: 16 * 1024 * 1024 });

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error('Mancano i segreti CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID.');
}

async function findDatabaseId() {
  const { stdout } = await wrangler('d1', 'list', '--json');
  const start = stdout.indexOf('[');
  const list = JSON.parse(start >= 0 ? stdout.slice(start) : stdout);
  const found = list.find(item => item.name === DATABASE);
  return found ? found.uuid || found.database_id || found.id : undefined;
}

let id = await findDatabaseId();
if (!id) {
  console.log(`Creo il database ${DATABASE}…`);
  await wrangler('d1', 'create', DATABASE);
  id = await findDatabaseId();
}
if (!id) throw new Error(`Database ${DATABASE} non trovato dopo la creazione.`);
console.log(`Database ${DATABASE} pronto.`);

try {
  await wrangler('r2', 'bucket', 'create', BUCKET);
  console.log(`Bucket ${BUCKET} creato.`);
} catch (error) {
  const text = `${error.stderr || ''}${error.stdout || ''}${error.message || ''}`;
  if (!/already exists|10004|already own/i.test(text)) {
    throw new Error(`Creazione del bucket ${BUCKET} non riuscita. Verifica che R2 sia attivato nell'account Cloudflare e che la chiave abbia il permesso R2.\n${text}`);
  }
  console.log(`Bucket ${BUCKET} già presente.`);
}

const config = await readFile('wrangler.jsonc', 'utf8');
if (!config.includes(PLACEHOLDER) && !config.includes(id)) throw new Error('wrangler.jsonc non contiene il segnaposto del database.');
await writeFile('wrangler.jsonc', config.replace(PLACEHOLDER, () => id));
console.log('wrangler.jsonc aggiornato per questa esecuzione.');
