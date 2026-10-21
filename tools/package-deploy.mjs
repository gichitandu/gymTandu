import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Hosted migrations must remain at the artifact root, alongside the Worker.
// dist/drizzle is also kept for Wrangler's path relative to dist/server.
const output = path.resolve(process.argv[2] || '../gymtrack-deploy.tar.gz');
const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
await Promise.all([
  access('.openai/hosting.json'),
  access('dist/server/index.js'),
  access('dist/server/wrangler.json'),
  ...journal.entries.map(entry => access(`drizzle/${entry.tag}.sql`)),
]);
await run('tar', ['-czf', output, '.openai/hosting.json', 'drizzle', 'dist']);
const files = (await run('tar', ['-tzf', output], { encoding: 'utf8' })).stdout.split('\n');
for (const entry of journal.entries) {
  if (!files.includes(`drizzle/${entry.tag}.sql`)) throw new Error(`Missing migration ${entry.tag}`);
}
console.log(`Deployment archive ready: ${output} (${journal.entries.length} migrations).`);
