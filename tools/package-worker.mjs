import { readFile,writeFile,mkdir,cp,readdir,rm } from 'node:fs/promises';
import path from 'node:path';
const root='dist/gymtrack/browser';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.txt':'text/plain'};
const assets={};
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await scan(file);else if(!file.endsWith('.map'))assets['/'+path.relative(root,file).replaceAll('\\','/')]={type:types[path.extname(file)]||'application/octet-stream',body:(await readFile(file)).toString('base64')};}}
await scan(root);
await rm('dist/server',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',(await readFile('worker/index.js','utf8')).replace("import { defaultExercises, defaultGroups } from './default-catalog.js';", (await readFile('worker/default-catalog.js','utf8')).replaceAll('export const','const')).replace('/* __ASSETS__ */ {}',JSON.stringify(assets)));
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'gymtrack',main:'index.js',compatibility_date:'2026-10-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'gymtrack-accounts',database_id:'DB',migrations_dir:'../drizzle'}]},null,2));
console.log('Worker packaged with',Object.keys(assets).length,'assets and D1 migrations.');
