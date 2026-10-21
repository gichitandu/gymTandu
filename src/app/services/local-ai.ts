import { Injectable, signal } from '@angular/core';
import { photoPixels } from './images';
import { feedbackForContext, feedbackSignal } from './feedback';
export interface AiReport {backend:string;model:string;milliseconds:number;loadMs:number;tensorBytes:number;cached:boolean;outputClasses:number;warning?:string}
export interface Prediction {label:string;probability:number}

@Injectable({providedIn:'root'})
export class LocalAiService {
 private feedback=feedbackForContext();
 busy=signal(false);
 status=signal('Pronta per analizzare una foto sul dispositivo.');
 report=signal<AiReport|null>(null);
 error=feedbackSignal('error',this.feedback);
 // IndexedDB is only an optional model cache, not a prerequisite for inference.
 supported=typeof Worker!=='undefined';
 private cancelRun?:()=>void;

 async run(photo?:Blob,allowDownload=true):Promise<Prediction[]> {
  if(this.busy())throw Error('È già in corso un’analisi.');
  if(!this.supported)throw Error('AI locale non supportata. Inserisci gli alimenti manualmente.');
  this.busy.set(true);this.error.set('');
  this.status.set(photo?'Preparazione della foto…':'Preparazione del modello…');
  const controller=new AbortController();
  return new Promise<Prediction[]>((resolve,reject)=>{
   let worker:Worker|undefined,settled=false;
   const finish=(error?:Error,predictions:Prediction[]=[])=>{
    if(settled)return;
    settled=true;clearTimeout(timer);controller.abort();worker?.terminate();
    if(this.cancelRun===cancel)this.cancelRun=undefined;
    this.busy.set(false);
    if(error){
     if(error.name==='AbortError')this.status.set('Analisi annullata.');
     else {this.error.set(error.message);this.status.set('Puoi riprovare o inserire gli alimenti manualmente.');}
     reject(error);
    }else resolve(predictions);
   };
   const cancel=()=>finish(new DOMException('Analisi annullata.','AbortError'));
   this.cancelRun=cancel;
   // Includes image decoding and worker startup, not only the final inference.
   const timer=setTimeout(()=>finish(Error('L’analisi sta impiegando troppo tempo. Riprova con una foto più chiara o inserisci gli alimenti manualmente.')),60000);
   void (async()=>{
    try {
     const pixels=photo?await photoPixels(photo,controller.signal):undefined;
     if(settled)return;
     worker=new Worker('/food-ai-worker.js');
     worker.onmessage=({data})=>{
      if(settled)return;
      if(!data||typeof data!=='object'){finish(Error('Risposta AI non valida. Riprova con la foto.'));return;}
      if(data.progress)this.status.set(data.progress);
      if(data.error){finish(Error(data.error));return;}
      if(data.done){
       if(!data.report||!Array.isArray(data.predictions)){finish(Error('Risposta AI non valida. Riprova con la foto.'));return;}
       this.report.set(data.report);
       this.status.set(data.report.warning||(photo?'Analisi completata. Scegli e conferma gli alimenti proposti.':'Modello pronto: puoi analizzare una foto.'));
       finish(undefined,data.predictions);
      }
     };
     worker.onerror=()=>finish(Error('Il motore AI non si è avviato. Riapri l’app e riprova; puoi comunque inserire gli alimenti manualmente.'));
     worker.onmessageerror=()=>finish(Error('Foto non trasferita al motore AI. Scegli di nuovo la foto e riprova.'));
     worker.postMessage({operation:photo?'classify':'prepare',allowDownload,pixels:pixels?.buffer},pixels?[pixels.buffer]:[]);
    }catch(error){finish(error instanceof Error?error:Error('Analisi non riuscita. Riprova.'));}
   })();
  });
 }

 cancel(){this.cancelRun?.();}

 async remove(){
  if(this.busy())return;
  // Delete only TensorFlow's model record, never GymTrack's user archives.
  this.busy.set(true);this.error.set('');
  try {
   await new Promise<void>((resolve,reject)=>{
    const worker=new Worker('/food-ai-worker.js');let settled=false;
    const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve();};
    const timer=setTimeout(()=>finish(Error('Rimozione non riuscita.')),10000);
    worker.onmessage=({data})=>{if(data.error)finish(Error(data.error));else if(data.done)finish();};
    worker.onerror=()=>finish(Error('Rimozione non disponibile.'));
    worker.onmessageerror=()=>finish(Error('Rimozione non disponibile.'));
    worker.postMessage({operation:'remove'});
   });
   this.report.set(null);this.status.set('Cache del modello rimossa. Allenamenti e pasti conservati. Potrai analizzare altre foto.');
  }catch(error){this.error.set((error as Error).message);}
  finally{this.busy.set(false);}
 }
}
