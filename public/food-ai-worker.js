// Optional CPU inference. No WebGPU, camera data uploads or paid inference APIs.
importScripts('/vendor/tf.min.js','/vendor/imagenet-labels.js');
const MODEL='indexeddb://gymtrack-mobilenet-v1-025';
const MODEL_URL='https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json';
self.onmessage=async({data})=>{
 let model;
 try {
  await tf.setBackend('cpu');await tf.ready();
  if(data.operation==='remove'){await tf.io.removeModel(MODEL);postMessage({done:true,removed:true});return;}
  const loading=performance.now();let cached=true;
  try {model=await tf.loadLayersModel(MODEL);}catch{
   if(!data.allowDownload)throw Error('Modello non salvato su questo dispositivo. Preparalo online oppure usa l’inserimento manuale.');
   cached=false;postMessage({progress:'Download del modello gratuito…'});
   model=await tf.loadLayersModel(MODEL_URL);await model.save(MODEL);
  }
  const loadMs=Math.round(performance.now()-loading);
  const pixels=data.pixels?new Uint8Array(data.pixels):new Uint8Array(224*224*3);
  async function infer(){const output=tf.tidy(()=>model.predict(tf.tensor3d(pixels,[224,224,3],'int32').toFloat().div(127.5).sub(1).expandDims()));try{return Array.from(await output.data());}finally{output.dispose();}}
  await infer();const start=performance.now(),values=await infer(),milliseconds=Math.round(performance.now()-start);
  const predictions=values.map((probability,index)=>({label:IMAGENET_LABELS[index]||String(index),probability})).sort((a,b)=>b.probability-a.probability).slice(0,5);
  postMessage({done:true,predictions,report:{backend:'CPU',model:'MobileNet v1 0.25',milliseconds,loadMs,tensorBytes:tf.memory().numBytes,cached,outputClasses:values.length}});
 } catch(e){postMessage({error:e.message||'Modello non supportato. Usa l’inserimento manuale.'});}
 finally{model?.dispose();tf.disposeVariables();}
};
