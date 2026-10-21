export const PHOTO_MAX_BYTES=500*1024;
export function imageSize(width:number,height:number,max=1280){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>25000000||!Number.isFinite(max)||max<=0)throw Error('Foto troppo grande o non valida. Per una foto ad alta risoluzione scegli una copia ridotta o scatta a 12 MP.');
 const ratio=Math.min(1,max/Math.max(width,height));return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
export function encodedDimensions(bytes:Uint8Array):{width:number;height:number}|null {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return {width:v.getUint32(16),height:v.getUint32(20)};
 if(bytes[0]!==255||bytes[1]!==216)return null;
 let p=2;while(p+8<bytes.length){if(bytes[p]!==255)break;const marker=bytes[p+1];if(marker===217||marker===218)break;const length=v.getUint16(p+2);if(length<2)break;if(marker>=192&&marker<=207&&![196,200,204].includes(marker))return {height:v.getUint16(p+5),width:v.getUint16(p+7)};p+=length+2;}
 return null;
}
function photoAbort(){return new DOMException('Analisi della foto annullata.','AbortError');}
async function decodePhoto(photo:Blob,signal?:AbortSignal):Promise<{image:HTMLImageElement;release:()=>void}>{
 if(signal?.aborted)throw photoAbort();
 const url=URL.createObjectURL(photo),image=new Image();
 const release=()=>{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);};
 try{
  image.decoding='async';
  await new Promise<void>((resolve,reject)=>{
   let settled=false;
   const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);image.onload=null;image.onerror=null;error?reject(error):resolve();};
   const abort=()=>finish(photoAbort());
   const timer=setTimeout(()=>finish(Error('La lettura della foto sta impiegando troppo tempo. Prova una foto JPEG più piccola.')),15000);
   image.onload=()=>finish();
   image.onerror=()=>finish(Error('Foto non leggibile. Prova un’immagine JPEG o PNG dalla galleria. Se è HEIC, esportala come JPEG da Foto.'));
   signal?.addEventListener('abort',abort,{once:true});
   // Handlers must be ready before assigning src: a cached Blob can load immediately.
   image.src=url;
  });
  imageSize(image.naturalWidth,image.naturalHeight);
  return {image,release};
 }catch(error){release();throw error;}
}
function encodePhoto(canvas:HTMLCanvasElement,quality:number):Promise<Blob>{
 return new Promise<Blob>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Compressione della foto troppo lenta. Prova una foto più piccola.')),10000);
  try{canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(Error('Compressione non riuscita.'));},'image/jpeg',quality);}
  catch(error){clearTimeout(timer);reject(error);}
 });
}
export async function compressPhoto(file:Blob):Promise<Blob>{
 // Some iPhone photo providers omit MIME metadata; the image decoder still validates those files.
 if((file.type&&!file.type.startsWith('image/'))||!file.size||file.size>20*1024*1024)throw Error('Scegli una fotografia entro 20 MB. Se HEIC non viene letto, esportala come JPEG da Foto.');
 const dimensions=encodedDimensions(new Uint8Array(await file.slice(0,262144).arrayBuffer()));
 if(dimensions)imageSize(dimensions.width,dimensions.height);
 const {image,release}=await decodePhoto(file);
 const canvas=document.createElement('canvas');
 try{
  const size=imageSize(image.naturalWidth,image.naturalHeight);canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');if(!context)throw Error('Memoria grafica non disponibile. Puoi salvare il pasto senza foto.');context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);context.drawImage(image,0,0,size.width,size.height);
  for(const quality of [.8,.65,.5]){const blob=await encodePhoto(canvas,quality);if(blob.size<=PHOTO_MAX_BYTES)return blob;}
  throw Error('Impossibile ridurre la foto entro 500 KB. Ritagliala in Foto o salva il pasto senza immagine.');
 }finally{release();canvas.width=1;canvas.height=1;}
}
export async function photoPixels(photo:Blob,signal?:AbortSignal):Promise<Uint8Array>{
 const {image,release}=await decodePhoto(photo,signal);
 const canvas=document.createElement('canvas');
 try{
  if(signal?.aborted)throw photoAbort();
  canvas.width=224;canvas.height=224;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Immagine non disponibile.');
  // Match the model's centered square crop without stretching the meal or transparent pixels.
  const side=Math.min(image.naturalWidth,image.naturalHeight),x=(image.naturalWidth-side)/2,y=(image.naturalHeight-side)/2;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,224,224);ctx.drawImage(image,x,y,side,side,0,0,224,224);
  const rgba=ctx.getImageData(0,0,224,224).data,rgb=new Uint8Array(224*224*3);
  for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  return rgb;
 }finally{release();canvas.width=1;canvas.height=1;}
}
