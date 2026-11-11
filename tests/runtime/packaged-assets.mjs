// Exercise the actual packaged static handler, including internal decompression.
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import worker from '../../dist/server/index.js';
const root='dist/gymtrack/browser',files=[];
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(!file.endsWith('.map')&&!file.replaceAll('\\','/').includes('/training/videos/'))files.push(file); // video tecnici: solo Workers Static Assets, non nel bundle Sites
}}
await scan(root);
const call=(url,method='GET')=>worker.fetch(new Request('https://packaged-assets.test'+url,{method,headers:{'Accept-Encoding':'identity'}}),{},{});
for(const file of files){
 const url='/'+path.relative(root,file).replaceAll('\\','/'),response=await call(url);
 assert.equal(response.status,200,url);
 assert(Buffer.from(await response.arrayBuffer()).equals(await readFile(file)),url+' must preserve original bytes');
 assert.equal(response.headers.get('content-encoding'),null,url+' must not expose internal compression');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff',url);
}
assert.equal(files.filter(file=>file.includes('/training/figures/generated/')&&file.endsWith('.webp')).length,253);
for(const url of ['/', '/index.html', '/app-build.json', '/ngsw.json', '/icons/gt-modern-192.png']){
 const get=await call(url),head=await call(url,'HEAD');
 assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));
 assert.equal(head.headers.get('cache-control'),get.headers.get('cache-control'));
}
assert.equal((await call('/missing-static-file')).status,404);
assert.equal((await call('/index.html','POST')).status,405);
const bytes=(await stat('dist/server/index.js')).size;assert(bytes<=63*1024*1024);
console.log(`PASS packaged Worker: ${files.length} static resources (253 exercise images) match original bytes; GET/HEAD, cache headers and 63 MiB budget verified (${bytes} bytes).`);
