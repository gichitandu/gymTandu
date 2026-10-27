import { readFile,writeFile,mkdir,cp,readdir,rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root='dist/gymtrack/browser';
const workerSource=await readFile('worker/index.js','utf8');
const calendarSource=await readFile('worker/calendar.js','utf8');
const archiveSource=await readFile('worker/archive.js','utf8');
const serverCatalogSource=await readFile('worker/default-catalog.js','utf8');
const manifest=JSON.parse(await readFile(root+'/ngsw.json','utf8'));
// Derive a stable version from the shipped assets and server behavior. Ignore
// our own generated descriptor so packaging the same build twice is stable.
delete manifest.hashTable['/app-build.json'];
const buildId=createHash('sha256').update(JSON.stringify(Object.entries(manifest.hashTable).sort())).update(workerSource).update(calendarSource).update(archiveSource).update(serverCatalogSource).digest('hex');
const buildDescriptor=JSON.stringify({buildId});
await writeFile(root+'/app-build.json',buildDescriptor);
manifest.appData={...(manifest.appData||{}),buildId};
manifest.hashTable['/app-build.json']=createHash('sha1').update(buildDescriptor).digest('hex');
const appGroup=manifest.assetGroups.find(group=>group.name==='app');
if(!appGroup.urls.includes('/app-build.json'))appGroup.urls.push('/app-build.json');
await writeFile(root+'/ngsw.json',JSON.stringify(manifest,null,2));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain'};
const assets={};
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await scan(file);else if(!file.endsWith('.map'))assets['/'+path.relative(root,file).replaceAll('\\','/')]={type:types[path.extname(file)]||'application/octet-stream',body:(await readFile(file)).toString('base64')};}}
await scan(root);
await rm('dist/server',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',workerSource.replace("/* __APP_BUILD_ID__ */ 'development'",JSON.stringify(buildId)).replace("import { defaultExercises, defaultGroups } from './default-catalog.js';",serverCatalogSource.replaceAll('export const','const')).replace("import { archiveApi } from './archive.js';",archiveSource.replaceAll('export ','')).replace("import { calendarApi, calendarPublish } from './calendar.js';",calendarSource.replaceAll('export ','')).replace('/* __ASSETS__ */ {}',JSON.stringify(assets)));
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'gymtrack',main:'index.js',compatibility_date:'2026-10-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'gymtrack-accounts',database_id:'DB',migrations_dir:'../drizzle'}],r2_buckets:[{binding:'BUCKET',bucket_name:'gymtrack-archives'}]},null,2));
console.log('Worker packaged with',Object.keys(assets).length,'assets, D1 migrations and build',buildId.slice(0,12));
