export const PHOTO_MAX_BYTES=500*1024;
export function imageSize(width:number,height:number,max=1280){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>25000000)throw Error('Foto troppo grande o non valida. Scegli una foto più piccola.');
 const ratio=Math.min(1,max/Math.max(width,height));return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
export function encodedDimensions(bytes:Uint8Array):{width:number;height:number}|null {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return {width:v.getUint32(16),height:v.getUint32(20)};
 if(bytes[0]!==255||bytes[1]!==216)return null;
 let p=2;while(p+8<bytes.length){if(bytes[p]!==255)break;const marker=bytes[p+1];if(marker===217||marker===218)break;const length=v.getUint16(p+2);if(length<2)break;if(marker>=192&&marker<=207&&![196,200,204].includes(marker))return {height:v.getUint16(p+5),width:v.getUint16(p+7)};p+=length+2;}
 return null;
}
export async function compressPhoto(file:Blob):Promise<Blob>{
 if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw Error('Scegli una fotografia entro 20 MB. Se HEIC non viene letto, esportala come JPEG da Foto.');
 const dimensions=encodedDimensions(new Uint8Array(await file.slice(0,262144).arrayBuffer()));
 if(dimensions)imageSize(dimensions.width,dimensions.height);
 let source:CanvasImageSource,close=()=>{};
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.decoding='async';img.src=url;
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Foto non leggibile. Prova un’immagine JPEG o PNG dalla galleria.'));});
  const size=imageSize(img.naturalWidth,img.naturalHeight);source=img;
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  try{
   const context=canvas.getContext('2d');if(!context)throw Error('Memoria grafica non disponibile. Puoi salvare il pasto senza foto.');context.fillStyle='#fff';context.fillRect(0,0,size.width,size.height);context.drawImage(source,0,0,size.width,size.height);
   for(const quality of [.8,.65,.5]){
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Compressione non riuscita.')),'image/jpeg',quality));
    if(blob.size<=PHOTO_MAX_BYTES)return blob;
   }
   throw Error('Impossibile ridurre la foto entro 500 KB. Ritagliala in Foto o salva il pasto senza immagine.');
  }finally{close();canvas.width=1;canvas.height=1;}
 }finally{URL.revokeObjectURL(url);}
}
export async function photoPixels(photo:Blob):Promise<Uint8Array>{
 const url=URL.createObjectURL(photo),img=new Image();img.src=url;
 try{
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Foto non leggibile.'));});
  const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Immagine non disponibile.');ctx.drawImage(img,0,0,224,224);
  const rgba=ctx.getImageData(0,0,224,224).data,rgb=new Uint8Array(224*224*3);
  for(let i=0,j=0;i<rgba.length;i+=4){rgb[j++]=rgba[i];rgb[j++]=rgba[i+1];rgb[j++]=rgba[i+2];}
  canvas.width=1;canvas.height=1;return rgb;
 }finally{URL.revokeObjectURL(url);}
}
