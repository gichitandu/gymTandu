import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { compressPhoto, photoPixels } from '../src/app/services/images';

let mode: 'load'|'error'|'hang', images: MockImage[], canvases: MockCanvas[];
let context: {fillStyle:string;fillRect:ReturnType<typeof vi.fn>;drawImage:ReturnType<typeof vi.fn>;getImageData:ReturnType<typeof vi.fn>};
class MockImage {
  naturalWidth=400;naturalHeight=200;decoding='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  private value='';
  constructor(){images.push(this);}
  set src(value:string){this.value=value;if(!value)return;if(mode==='load')this.onload?.();if(mode==='error')this.onerror?.();}
  get src(){return this.value;}
}
class MockCanvas {
  width=0;height=0;
  getContext=vi.fn(()=>context);
  toBlob=vi.fn((callback:(value:Blob|null)=>void)=>callback(new Blob(['compressed'],{type:'image/jpeg'})));
  constructor(){canvases.push(this);}
}
beforeEach(()=>{
  mode='load';images=[];canvases=[];
  const pixels=new Uint8ClampedArray(224*224*4);pixels.set([20,40,60,255]);
  context={fillStyle:'',fillRect:vi.fn(),drawImage:vi.fn(),getImageData:vi.fn(()=>({data:pixels}))};
  vi.stubGlobal('Image',MockImage);
  vi.stubGlobal('document',{createElement:vi.fn(()=>new MockCanvas())});
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:photo-input-test');
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('handles immediately decoded photos and center-crops them without changing their aspect ratio',async()=>{
  const rgb=await photoPixels(new Blob(['photo'],{type:'image/jpeg'}));
  expect(rgb).toHaveLength(224*224*3);expect([...rgb.slice(0,3)]).toEqual([20,40,60]);
  expect(context.fillStyle).toBe('#fff');expect(context.fillRect).toHaveBeenCalledWith(0,0,224,224);
  expect(context.drawImage).toHaveBeenCalledWith(images[0],100,0,200,200,0,0,224,224);
  expect(canvases[0].width).toBe(1);expect(canvases[0].height).toBe(1);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-input-test');expect(images[0].src).toBe('');
});

it('accepts photos from providers that omit their MIME type and compresses them locally',async()=>{
  const photo=await compressPhoto(new Blob(['photo without MIME']));
  expect(photo.type).toBe('image/jpeg');expect(photo.size).toBeLessThanOrEqual(500*1024);
  expect(context.drawImage).toHaveBeenCalledWith(images[0],0,0,400,200);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it('reports unreadable HEIC photos and releases the decoded source instead of staying in loading',async()=>{
  mode='error';
  await expect(photoPixels(new Blob(['unsupported'],{type:'image/heic'}))).rejects.toThrow('HEIC');
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(canvases).toHaveLength(0);
});

it('bounds an image decoder that never completes',async()=>{
  vi.useFakeTimers();mode='hang';
  const loading=photoPixels(new Blob(['photo'],{type:'image/jpeg'}));
  const checked=expect(loading).rejects.toThrow('troppo tempo');
  await vi.advanceTimersByTimeAsync(15000);await checked;
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(images[0].onload).toBeNull();expect(images[0].src).toBe('');
});

it('cancels during photo decoding and cleans up the pending load',async()=>{
  mode='hang';const controller=new AbortController();
  const loading=photoPixels(new Blob(['photo']),controller.signal);
  const checked=expect(loading).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await checked;
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);expect(images[0].src).toBe('');
});

it('does not allocate an image for an already canceled analysis',async()=>{
  const controller=new AbortController();controller.abort();
  await expect(photoPixels(new Blob(['photo']),controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(URL.createObjectURL).not.toHaveBeenCalled();expect(images).toHaveLength(0);
});

it('releases image and canvas memory when pixel extraction fails',async()=>{
  context.getImageData.mockImplementation(()=>{throw new Error('readback failed');});
  await expect(photoPixels(new Blob(['photo']))).rejects.toThrow('readback failed');
  expect(canvases[0].width).toBe(1);expect(canvases[0].height).toBe(1);expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it('rejects oversized original photos before allocating a decoder',async()=>{
  const png=new Uint8Array(24);png.set([137,80,78,71]);const header=new DataView(png.buffer);header.setUint32(16,8064);header.setUint32(20,6048);
  await expect(compressPhoto(new Blob([png],{type:'image/png'}))).rejects.toThrow('12 MP');
  expect(images).toHaveLength(0);expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('bounds a stalled JPEG encoder and releases the photo source',async()=>{
  vi.useFakeTimers();
  // Inject an encoder that never returns its callback, as on a resource-starved device.
  vi.mocked(document.createElement).mockImplementation(()=>{const canvas=new MockCanvas();canvas.toBlob=vi.fn();return canvas as unknown as HTMLCanvasElement;});
  const loading=compressPhoto(new Blob(['photo'],{type:'image/jpeg'}));
  const checked=expect(loading).rejects.toThrow('Compressione della foto troppo lenta');
  await vi.waitFor(()=>expect(canvases).toHaveLength(1));
  await vi.advanceTimersByTimeAsync(10000);await checked;
  expect(canvases[0].width).toBe(1);expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});
