import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const full=readFileSync('dist/server/index.js','utf8');
const apiOnly=readFileSync('dist/server/api-only.js','utf8');
assert.ok(full.includes('const assets ='), 'Sites worker assets missing');
assert.ok(apiOnly.includes('const assets = {}'), 'API worker must have an empty asset map');
assert.ok(apiOnly.includes("if(path.startsWith('/api/'))"), 'API routes missing');
assert.ok(apiOnly.includes('export default'), 'Worker entry point missing');
assert.ok(apiOnly.length<full.length/2, 'API-only bundle still embeds frontend assets');
assert.ok(!apiOnly.includes('data:image/png;base64,'), 'Unexpected embedded image');
const gz=gzipSync(apiOnly).byteLength;
console.log('QA API-only Worker:',(statSync('dist/server/api-only.js').size/1048576).toFixed(2),'MiB raw,',(gz/1048576).toFixed(2),'MiB gzip');
assert.ok(gz<3*1024*1024, 'Candidate exceeds 3 MiB compressed; review Workers Free limits');
// Packaging checks do not imply deploy readiness. Identity, storage and origin
// protection must pass the independent blocking migration gate.
