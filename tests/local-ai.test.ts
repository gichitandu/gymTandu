import '@angular/compiler';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalAiService } from '../src/app/services/local-ai';
import * as images from '../src/app/services/images';

class DeviceWorker {
 static all: DeviceWorker[] = [];
 onmessage?: (event: { data: unknown }) => void;
 onerror?: () => void;
 onmessageerror?: () => void;
 postMessage = vi.fn();
 terminate = vi.fn();
 constructor(public url: string) { DeviceWorker.all.push(this); }
 emit(data: unknown) { this.onmessage?.({ data }); }
}
let ai: LocalAiService;
const report = { backend: 'CPU', model: 'MobileNet', milliseconds: 25, loadMs: 2, tensorBytes: 100, cached: false, outputClasses: 1000 };
const pixels = () => new Uint8Array(224 * 224 * 3);
beforeEach(() => {
 vi.useFakeTimers();DeviceWorker.all=[];
 vi.stubGlobal('Worker', DeviceWorker);
 vi.stubGlobal('indexedDB', undefined);
 vi.spyOn(images, 'photoPixels').mockResolvedValue(pixels());
 ai = new LocalAiService();
});
afterEach(() => { ai.cancel();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals(); });

it('analyzes a first photo without preparation or IndexedDB and permits same-origin model loading', async () => {
 expect(ai.supported).toBe(true);
 const task=ai.run(new Blob(['photo']));await Promise.resolve();
 expect(DeviceWorker.all[0].postMessage.mock.calls[0][0]).toMatchObject({operation:'classify',allowDownload:true});
 DeviceWorker.all[0].emit({progress:'Riconoscimento…'});expect(ai.status()).toBe('Riconoscimento…');
 DeviceWorker.all[0].emit({done:true,report,predictions:[{label:'banana',probability:.9}]});
 expect(await task).toEqual([{label:'banana',probability:.9}]);expect(ai.busy()).toBe(false);expect(ai.error()).toBe('');
 expect(DeviceWorker.all[0].terminate).toHaveBeenCalledOnce();
});

it('cancels while decoding and ignores the old photo after another analysis begins', async () => {
 let resolve!: (value: Uint8Array) => void;
 vi.mocked(images.photoPixels).mockImplementationOnce((_photo,signal)=>{
  expect(signal).toBeInstanceOf(AbortSignal);
  return new Promise(done=>resolve=done);
 });
 const old=ai.run(new Blob(['old photo']));const rejected=expect(old).rejects.toMatchObject({name:'AbortError'});
 const signal=vi.mocked(images.photoPixels).mock.calls[0][1]!;
 ai.cancel();await rejected;
 expect(signal.aborted).toBe(true);expect(ai.busy()).toBe(false);expect(ai.error()).toBe('');
 const current=ai.run();
 expect(DeviceWorker.all).toHaveLength(1);
 resolve(pixels());await Promise.resolve();
 expect(DeviceWorker.all).toHaveLength(1);expect(ai.busy()).toBe(true);
 DeviceWorker.all[0].emit({done:true,report,predictions:[]});await current;
 expect(ai.status()).toContain('Modello pronto');expect(ai.error()).toBe('');
});

it('bounds a stalled photo decode and allows a retry', async () => {
 vi.mocked(images.photoPixels).mockImplementationOnce(()=>new Promise(()=>{}));
 const task=ai.run(new Blob(['photo']));const rejected=expect(task).rejects.toThrow('troppo tempo');
 await vi.advanceTimersByTimeAsync(60000);await rejected;
 expect(ai.busy()).toBe(false);expect(DeviceWorker.all).toHaveLength(0);
 const retry=ai.run();DeviceWorker.all[0].emit({done:true,report,predictions:[]});await retry;
 expect(ai.busy()).toBe(false);
});

it('prevents duplicate starts immediately, handles worker failure, and releases busy state', async () => {
 const task=ai.run(new Blob(['photo']));const rejected=expect(task).rejects.toThrow('non si è avviato');
 await expect(ai.run()).rejects.toThrow('già in corso');
 await Promise.resolve();DeviceWorker.all[0].onerror?.();await rejected;
 expect(ai.busy()).toBe(false);expect(DeviceWorker.all[0].terminate).toHaveBeenCalledOnce();
 expect(DeviceWorker.all).toHaveLength(1);
});

it('shows optional cache warnings without rejecting a successful recognition', async () => {
 const task=ai.run(new Blob(['photo']));await Promise.resolve();
 DeviceWorker.all[0].emit({done:true,report:{...report,warning:'Cache non disponibile'},predictions:[{label:'pizza',probability:.8}]});
 expect(await task).toEqual([{label:'pizza',probability:.8}]);expect(ai.status()).toBe('Cache non disponibile');expect(ai.error()).toBe('');
});
