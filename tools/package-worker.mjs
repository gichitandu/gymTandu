import { readFile,writeFile,mkdir,cp,readdir,rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { embedInstallIcons } from './embed-install-icons.mjs';
const root='dist/gymtrack/browser';
await embedInstallIcons(root);
// Calendar relay is a separate public Worker; use the public HTTP front door.
const runtimeFlags=['nodejs_compat','global_fetch_strictly_public'];
const workerSource=await readFile('worker/index.js','utf8');
const approvedPaletteSource=await readFile('shared/approved-palettes.js','utf8');
const designPresetsSource=await readFile('shared/design-presets.js','utf8');
const designSystemSource=(await readFile('shared/design-system.js','utf8')).replace(/import\s*\{\s*FACTORY_PRESETS\s*\}\s*from\s*['"]\.\/design-presets\.js['"];?/,'').replace(/export\s*\{\s*FACTORY_PRESETS\s*\};?/,'').replace(/import\s*\{[^}]+\}\s*from\s*['"]\.\/approved-palettes\.js['"];?/,'').replace(/export\s*\{\s*APPROVED_DESIGN_PRESETS\s*\};?/,'');
const designApiSource=(await readFile('worker/design-studio.js','utf8')).replace(/import\s*\{[^}]+\}\s*from\s*['"]\.\.\/shared\/design-system\.js['"];?/,'');
const pushSource=(await readFile('worker/push.js','utf8')).replace("import {calendarRuntimeEnv,calendarRelay,calendarProjection} from './calendar.js';",'');
const calendarSource=await readFile('worker/calendar.js','utf8');
const archiveSource=(await readFile('worker/archive.js','utf8')).replace("import {validateImportedProgramOverlaps} from './program-imports.js';",'').replace(/import\s*\{[^}]+\}\s*from\s*['"]\.\.\/shared\/approved-palettes\.js['"];?/,'');
const programSource=await readFile('worker/program-imports.js','utf8');
const serverCatalogSource=await readFile('worker/default-catalog.js','utf8');
const manifest=JSON.parse(await readFile(root+'/ngsw.json','utf8'));
for(const url of ['/index.html','/manifest.webmanifest'])manifest.hashTable[url]=createHash('sha1').update(await readFile(root+url)).digest('hex');
// The legacy URLs become a storage-preserving migration worker. A fresh app
// uses a new registration URL and a separately retained Angular offline engine.
const workerPath=root+'/ngsw-worker.js',enginePath=root+'/gymtrack-offline-engine-v3.js';
let angularWorker=await readFile(workerPath,'utf8');
if(angularWorker.includes("importScripts('/gymtrack-worker-migration.js')"))angularWorker=await readFile(enginePath,'utf8');
angularWorker=angularWorker.replace(/\n(?:\/\/ GymTrack device recovery [a-f0-9]+\n)?importScripts\('\/gymtrack-session-recovery.js'\);\n/g,'');
if(!angularWorker.includes('ngsw:')||!angularWorker.includes('skipWaiting')||angularWorker.includes("importScripts('/gymtrack-worker-migration.js')"))throw Error('Real Angular offline engine not available. Rebuild before packaging.');
await writeFile(enginePath,angularWorker);
const migrationVersion=createHash('sha256').update(workerSource).update(await readFile(root+'/gymtrack-worker-migration.js')).update(await readFile(root+'/gymtrack-app-worker-v3.js')).digest('hex').slice(0,16);
const legacyWorker="// GymTrack legacy registration migration "+migrationVersion+"\nimportScripts('/gymtrack-worker-migration.js');\n";
await writeFile(workerPath,legacyWorker);await writeFile(root+'/gymtrack-sw.js',legacyWorker);
const appGroup=manifest.assetGroups.find(group=>group.name==='app');
for(const url of ['/ngsw-worker.js','/gymtrack-sw.js','/gymtrack-offline-engine-v3.js','/gymtrack-app-worker-v3.js','/gymtrack-worker-migration.js']){
 manifest.hashTable[url]=createHash('sha1').update(await readFile(root+url)).digest('hex');
 if(!appGroup.urls.includes(url))appGroup.urls.push(url);
}
// An offline check lists this version's prefetched resources, without account data.
const offlinePath='/offline-check.json';
const offlineDescriptor=JSON.stringify({files:appGroup.urls.filter(url=>url!=='/app-build.json'&&url!==offlinePath).sort()});
await writeFile(root+offlinePath,offlineDescriptor);
manifest.hashTable[offlinePath]=createHash('sha1').update(offlineDescriptor).digest('hex');
if(!appGroup.urls.includes(offlinePath))appGroup.urls.push(offlinePath);
// Derive a stable version from the shipped assets and server behavior. Ignore
// our own generated descriptor so packaging the same build twice is stable.
delete manifest.hashTable['/app-build.json'];
const buildId=createHash('sha256').update(JSON.stringify(Object.entries(manifest.hashTable).sort())).update(JSON.stringify(runtimeFlags)).update(workerSource).update(pushSource).update(calendarSource).update(archiveSource).update(programSource).update(serverCatalogSource).update(designPresetsSource).update(designSystemSource).update(designApiSource).update(approvedPaletteSource).digest('hex');
const buildDescriptor=JSON.stringify({buildId});
await writeFile(root+'/app-build.json',buildDescriptor);
manifest.appData={...(manifest.appData||{}),buildId};
manifest.hashTable['/app-build.json']=createHash('sha1').update(buildDescriptor).digest('hex');
if(!appGroup.urls.includes('/app-build.json'))appGroup.urls.push('/app-build.json');
await writeFile(root+'/ngsw.json',JSON.stringify(manifest,null,2));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const assets={};
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await scan(file);else if(!file.endsWith('.map'))assets['/'+path.relative(root,file).replaceAll('\\','/')]={type:types[path.extname(file)]||'application/octet-stream',body:(await readFile(file)).toString('base64')};}}
await scan(root);
await rm('dist/server',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const bundledServer=approvedPaletteSource.replaceAll('export ','')+'\n'+workerSource.replace("/* __APP_BUILD_ID__ */ 'development'",JSON.stringify(buildId)).replace("import { APPROVED_THEME_IDS } from '../shared/approved-palettes.js';",'').replace("import { designStudioApi } from './design-studio.js';",[designPresetsSource,designSystemSource,designApiSource].map(source=>source.replaceAll('export ','')).join('\n')).replace("import { defaultExercises, defaultGroups } from './default-catalog.js';",serverCatalogSource.replaceAll('export const','const')).replace("import { archiveApi } from './archive.js';",archiveSource.replaceAll('export ','')).replace("import { calendarApi, calendarPublish, calendarConfigure } from './calendar.js';",calendarSource.replaceAll('export ','')).replace("import { pushReminderApi } from './push.js';",pushSource.replaceAll('export ','')).replace("import {excelImportsApi,appFeaturesApi} from './program-imports.js';",programSource.replaceAll('export ','')).replace('/* __ASSETS__ */ {}',JSON.stringify(assets));
// Preserve the existing Sites package and prepare a separate asset-free API bundle.
// This file is NOT deployable until authentication and archive migration pass QA.
await writeFile('dist/server/index.js',bundledServer);
await writeFile('dist/server/api-only.js',bundledServer.replace(JSON.stringify(assets),'{}'));
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'gymtrack',main:'index.js',compatibility_date:'2026-10-15',compatibility_flags:runtimeFlags,d1_databases:[{binding:'DB',database_name:'gymtrack-accounts',database_id:'DB',migrations_dir:'../drizzle'}],r2_buckets:[{binding:'BUCKET',bucket_name:'gymtrack-archives'}]},null,2));
console.log('Worker packaged with',Object.keys(assets).length,'assets, D1 migrations and build',buildId.slice(0,12));
