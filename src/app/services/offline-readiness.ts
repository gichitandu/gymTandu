export interface OfflineResources {ready:boolean;found:number;total:number;message:string}
export async function inspectOfflineResources(storage:CacheStorage,origin:string,expectedScript?:string):Promise<OfflineResources>{
 const names=(await storage.keys()).filter(n=>n.startsWith('ngsw:')&&n.includes(':assets:')).reverse();
 let best:OfflineResources={ready:false,found:0,total:0,message:'Apri online e attendi il download dell’app.'};
 for(const name of names){
  const cache=await storage.open(name),descriptor=await cache.match(new URL('/offline-check.json',origin).href);
  if(!descriptor?.ok)continue;
  let files:unknown;try{files=(await descriptor.json()).files;}catch{continue;}
  if(!Array.isArray(files)||!files.length||files.length>2000||files.some(f=>typeof f!=='string'||!f.startsWith('/')||f.startsWith('//')))continue;
  if(expectedScript&&!files.includes(expectedScript))continue;
  let found=0;for(const file of files)if((await cache.match(new URL(file,origin).href))?.ok)found++;
  const result={ready:found===files.length,found,total:files.length,message:found===files.length?'Risorse dell’app scaricate.':`${found} / ${files.length} risorse scaricate.`};
  if(result.ready)return result;if(found>best.found)best=result;
 }
 return best;
}
export async function probeOfflineStorage(factory:IDBFactory):Promise<boolean>{
 return new Promise(resolve=>{
  let done=false,db:IDBDatabase|undefined;const finish=(ok:boolean)=>{if(done)return;done=true;clearTimeout(timer);db?.close();resolve(ok);};
  const timer=setTimeout(()=>finish(false),5000);
  try{
   const open=factory.open('gymtrack-offline-check-v1',1);
   open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('probe'))open.result.createObjectStore('probe');};
   open.onerror=open.onblocked=()=>finish(false);
   open.onsuccess=()=>{db=open.result;if(done){db.close();return;}const tx=db.transaction('probe','readwrite'),table=tx.objectStore('probe');table.put(1,'check');table.delete('check');tx.oncomplete=()=>finish(true);tx.onerror=tx.onabort=()=>finish(false);};
  }catch{finish(false);}
 });
}
