import { Injectable, signal } from '@angular/core';
import { photoPixels } from './images';
import { feedbackForContext, feedbackSignal } from './feedback';
export interface AiReport {backend:string;model:string;milliseconds:number;loadMs:number;tensorBytes:number;cached:boolean;outputClasses:number}
export interface Prediction {label:string;probability:number}
@Injectable({providedIn:'root'})
export class LocalAiService {
 private feedback=feedbackForContext();
 busy=signal(false);status=signal('Non verificato su questo dispositivo.');report=signal<AiReport|null>(null);error=feedbackSignal('error',this.feedback);
 supported=typeof Worker!=='undefined'&&typeof indexedDB!=='undefined';
 private worker?:Worker;private cancelRun?:()=>void;
 async run(photo?:Blob,allowDownload=false):Promise<Prediction[]> {
  if(this.busy())throw Error('È già in corso una prova.');
  if(!this.supported)throw Error('AI locale non supportata. Inserisci i valori manualmente.');
  const memory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;
  if(memory!==undefined&&memory<2)throw Error('Memoria disponibile limitata. Usa il percorso manuale.');
  if(allowDownload){const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.usage!==undefined&&estimate.quota-estimate.usage<30*1024*1024)throw Error('Spazio insufficiente per il modello. Inserisci i valori manualmente.');}
  this.busy.set(true);this.error.set('');this.status.set('Preparazione della prova locale…');
  try {
   const pixels=photo?await photoPixels(photo):undefined;
   return await new Promise<Prediction[]>((resolve,reject)=>{
    const worker=new Worker('/food-ai-worker.js');this.worker=worker;
    const finish=(error?:Error,predictions:Prediction[]=[])=>{clearTimeout(timer);worker.terminate();this.worker=undefined;this.cancelRun=undefined;error?reject(error):resolve(predictions);};
    const timer=setTimeout(()=>finish(Error('Prova interrotta perché troppo lenta. Puoi continuare con l’inserimento manuale.')),45000);
    this.cancelRun=()=>finish(Error('Prova annullata. Inserimento manuale disponibile.'));
    worker.onmessage=({data})=>{if(data.progress)this.status.set(data.progress);if(data.error)finish(Error(data.error));if(data.done){this.report.set(data.report);this.status.set(`Prova CPU completata: ${data.report.milliseconds} ms. ${data.report.milliseconds>3000?'Lento: consigliato il percorso manuale.':'Conferma sempre l’alimento e i valori.'}`);finish(undefined,data.predictions);}};
    worker.onerror=()=>finish(Error('Il modello non è eseguibile in questo browser. Inserisci i valori manualmente.'));
    worker.postMessage({operation:'classify',allowDownload,pixels:pixels?.buffer},pixels?[pixels.buffer]:[]);
   });
  }catch(e){this.error.set((e as Error).message);this.status.set('Percorso manuale disponibile.');throw e;}
  finally{this.busy.set(false);}
 }
 cancel(){this.cancelRun?.();}
 async remove(){
  if(this.busy())return;
  // Delete only the model's IndexedDB record via TensorFlow, never user data.
  this.busy.set(true);try{await new Promise<void>((resolve,reject)=>{const w=new Worker('/food-ai-worker.js');const timer=setTimeout(()=>{w.terminate();reject(Error('Rimozione non riuscita.'));},10000);w.onmessage=({data})=>{clearTimeout(timer);w.terminate();data.error?reject(Error(data.error)):resolve();};w.onerror=()=>{clearTimeout(timer);w.terminate();reject(Error('Rimozione non disponibile.'));};w.postMessage({operation:'remove'});});this.report.set(null);this.status.set('Modello rimosso. Allenamenti e pasti conservati.');}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);}
 }
}
