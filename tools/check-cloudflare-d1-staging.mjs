#!/usr/bin/env node
// Read-only gate for Cloudflare Free / D1-only migration.
// Intentionally fails until the backend is safe to publish independently of Sites.
import {readFile,stat} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const [server,archive,packager]=await Promise.all([
  read('worker/index.js'),read('worker/archive.js'),read('tools/package-worker.mjs')
]);
const checks=[
  ['Identità server indipendente da Sites',!server.includes("request.headers.get('oai-authenticated-user-id')")],
  ['Archivio persistente senza R2',!archive.includes('env.BUCKET')],
  ['Pacchetto Worker senza binding R2',!packager.includes('r2_buckets:')],
  ['Nessun ID D1 segnaposto nel pacchetto',!packager.includes("database_id:'DB'")],
];
try{
  const file='dist/server/index.js';
  const size=(await stat(file)).size;
  // 3 MiB compressed is the Workers Free upload limit; raw size alone is not conclusive.
  console.log('Worker generato:',(size/1024/1024).toFixed(2),'MiB non compressi; verificare anche dimensione gzip e limiti Cloudflare.');
}catch{console.log('Build non presente: eseguire npm run build per la verifica dimensioni.');}
let failed=false;
for(const [label,ok] of checks){console.log((ok?'PASS':'BLOCK')+' '+label);if(!ok)failed=true;}
if(failed){console.error('STOP: staging Cloudflare non pubblicabile in sicurezza. Nessun deploy eseguito.');process.exitCode=1;}
else console.log('Controlli statici superati; richiedere comunque test multiutente, sicurezza, quote e approvazione prima del deploy.');
