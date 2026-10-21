// Node CPU verification only. This does not measure Safari or an iPhone.
import vm from 'node:vm';
import {createRequire} from 'node:module';
globalThis.require=createRequire(import.meta.url);
import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile('public/vendor/tf.min.js','utf8');
try { vm.runInThisContext(source,{filename:'tf.min.js'}); } catch(e) { console.error('Runtime:',e.message); process.exit(1); }
try {
await tf.setBackend('cpu');await tf.ready();
const model=await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');
const start=performance.now();const result=tf.tidy(()=>model.predict(tf.zeros([1,224,224,3])));const values=await result.data();
if(values.length!==1000||!values.every(Number.isFinite))throw Error('Unexpected model output');
console.log(JSON.stringify({platform:'Node CPU, not iOS',model:'MobileNet v1 0.25',classes:values.length,milliseconds:Math.round(performance.now()-start),tensorBytes:tf.memory().numBytes}));
result.dispose();model.dispose();

} catch(e) {console.error('Model validation:',e.message);process.exitCode=1;}
