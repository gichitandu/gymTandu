import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source=readFileSync(new URL('../public/food-ai-worker.js',import.meta.url),'utf8');
const labelContext:any={self:{}};
runInNewContext(readFileSync(new URL('../public/vendor/imagenet-labels.js',import.meta.url),'utf8'),labelContext);
const labels:Record<string,string>=labelContext.self.IMAGENET_LABELS;
const bananaIndex=Number(Object.keys(labels).find(index=>labels[index]==='banana'));
const probabilities=()=>{const values=Array(Object.keys(labels).length).fill(.2/(Object.keys(labels).length-1));values[bananaIndex]=.8;return values;};
const modelKey='indexeddb://gymtrack-mobilenet-v1-025';
function engine(options:{cache?:'missing'|'invalid'|'valid';saveError?:boolean;offline?:boolean;removeMissing?:boolean}={}){
 const messages:any[]=[];
 const output=(values:number[])=>({data:async()=>values,dispose:vi.fn()});
 const prediction=output(probabilities());
 const bundled={predict:vi.fn(()=>prediction),save:options.saveError?vi.fn().mockRejectedValue(Error('QuotaExceededError')):vi.fn().mockResolvedValue(undefined),dispose:vi.fn()};
 const cached={predict:vi.fn(()=>{const values=probabilities();if(options.cache==='invalid')values[0]=NaN;return output(values);}),dispose:vi.fn()};
 const tensor:any={toFloat:()=>tensor,div:()=>tensor,sub:()=>tensor,expandDims:()=>tensor};
 const tf={
  loadLayersModel:vi.fn(async(url:string)=>{if(url===modelKey){if(!options.cache||options.cache==='missing')throw Error('No model');return cached;}if(options.offline)throw Error('Offline');return bundled;}),
  setBackend:vi.fn().mockResolvedValue(undefined),ready:vi.fn().mockResolvedValue(undefined),
  tidy:(fn:()=>unknown)=>fn(),tensor3d:()=>tensor,memory:()=>({numBytes:100}),disposeVariables:vi.fn(),
  io:{listModels:vi.fn().mockResolvedValue(options.removeMissing?{}:{[modelKey]:{}}),removeModel:vi.fn().mockResolvedValue(undefined)},
 };
 const self:any={};
 runInNewContext(source,{self,tf,IMAGENET_LABELS:labels,Uint8Array,performance,importScripts:vi.fn(),postMessage:(data:unknown)=>messages.push(data)});
 const run=async(data:any={})=>{await self.onmessage({data:{operation:'classify',pixels:new Uint8Array(224*224*3).buffer,...data}});return messages.at(-1);};
 return {run,messages,tf,bundled,cached};
}
it('recognizes from bundled same-origin weights on first use even when model cache cannot be saved',async()=>{
 const e=engine({saveError:true});const result=await e.run();
 expect(result.done).toBe(true);expect(result.predictions[0]).toEqual({label:'banana',probability:.8});
 expect(e.tf.loadLayersModel.mock.calls.map(call=>call[0])).toEqual([modelKey,'/vendor/food-model/model.json']);
 expect(result.report.warning).toContain('non è stato salvato');expect(result.report.cached).toBe(false);
 expect(e.bundled.dispose).toHaveBeenCalledOnce();
});
it('replaces a corrupt cached model with bundled weights and finishes the current photo',async()=>{
 const e=engine({cache:'invalid'});const result=await e.run();
 expect(result.done).toBe(true);expect(result.predictions[0].label).toBe('banana');expect(result.report.cached).toBe(false);
 expect(e.cached.dispose).toHaveBeenCalledOnce();expect(e.bundled.save).toHaveBeenCalledOnce();
});
it('uses an existing cached model without a network model load',async()=>{
 const e=engine({cache:'valid'});const result=await e.run({allowDownload:false});
 expect(result.done).toBe(true);expect(result.report.cached).toBe(true);expect(e.tf.loadLayersModel).toHaveBeenCalledOnce();
});
it('reports offline first-use failure without returning invented predictions',async()=>{
 const e=engine({offline:true});const result=await e.run();
 expect(result.error).toContain('internet');expect(result.predictions).toBeUndefined();
});
it('prepares the model without classifying a fabricated black image',async()=>{
 const e=engine();const result=await e.run({operation:'prepare',pixels:undefined});
 expect(result.done).toBe(true);expect(result.predictions).toEqual([]);expect(e.bundled.predict).not.toHaveBeenCalled();
});
it('rejects invalid photos before loading the model and removes an absent cache idempotently',async()=>{
 const e=engine({removeMissing:true});expect((await e.run({pixels:new ArrayBuffer(2)})).error).toContain('Foto non leggibile');
 expect(e.tf.loadLayersModel).not.toHaveBeenCalled();expect((await e.run({operation:'remove'})).removed).toBe(true);
 expect(e.tf.io.removeModel).not.toHaveBeenCalled();
});
