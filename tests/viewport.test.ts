import '@angular/compiler';
import { afterEach, expect, it, vi } from 'vitest';
import { focusScrollDelta, viewportGeometry, ViewportService } from '../src/app/services/viewport';

let service: ViewportService | undefined;
afterEach(() => {service?.ngOnDestroy();service=undefined;vi.useRealTimers();vi.unstubAllGlobals();});

function browser() {
  vi.useFakeTimers();
  const styles=new Map<string,string>(),classes=new Set<string>();
  const viewport=Object.assign(new EventTarget(),{height:800,offsetTop:0,scale:1});
  const win=Object.assign(new EventTarget(),{innerHeight:800,innerWidth:390,visualViewport:viewport,scrollBy:vi.fn()});
  const doc=Object.assign(new EventTarget(),{
    activeElement:null as unknown,
    documentElement:{clientHeight:800,style:{setProperty:(key:string,value:string)=>styles.set(key,value)}},
    body:{classList:{toggle:(name:string,on:boolean)=>on?classes.add(name):classes.delete(name)}},
    querySelector:()=>null,
  });
  vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
  service=new ViewportService();
  return {viewport,win,doc,styles,classes};
}

function input(top:number,bottom:number,closest:Record<string,unknown>={}) {
  return {tagName:'INPUT',type:'number',disabled:false,readOnly:false,
    getBoundingClientRect:()=>({top,bottom,left:20,right:120}),closest:(selector:string)=>closest[selector]||null};
}

it('detects both overlaying and resizing keyboards without treating pinch zoom as a keyboard',()=>{
  expect(viewportGeometry(800,340,40,800,true)).toEqual({top:40,height:340,bottom:380,keyboardOpen:true,keyboardInset:420});
  expect(viewportGeometry(450,450,0,800,true)).toEqual({top:0,height:450,bottom:450,keyboardOpen:true,keyboardInset:0});
  expect(viewportGeometry(800,340,40,800,false).keyboardOpen).toBe(false);
  expect(viewportGeometry(800,340,40,800,true,2).keyboardOpen).toBe(false);
  expect(viewportGeometry(800,730,0,800,true).keyboardOpen).toBe(false);
});

it('scrolls only the distance needed to uncover a focused field',()=>{
  expect(focusScrollDelta(80,130,40,340,20)).toBe(0);
  expect(focusScrollDelta(300,360,40,340,20)).toBe(40);
  expect(focusScrollDelta(20,70,40,340,20)).toBe(-40);
  expect(focusScrollDelta(100,600,40,340,20)).toBe(40);
  expect(focusScrollDelta(50,100,40,340,20)).toBe(0);
  expect(focusScrollDelta(280,335,40,340,20)).toBe(0);
});

it('tracks Safari visual viewport pan and reveals the field above the keyboard without reacting to every user scroll',async()=>{
  const b=browser();b.doc.activeElement=input(700,748);b.doc.dispatchEvent(new Event('focusin'));
  b.viewport.height=340;b.viewport.offsetTop=20;b.viewport.dispatchEvent(new Event('resize'));
  expect(b.classes.has('keyboard-open')).toBe(true);
  expect(b.classes.has('form-input-focused')).toBe(true);
  expect(b.styles.get('--visible-height')).toBe('340px');
  expect(b.styles.get('--visible-top')).toBe('20px');
  expect(b.styles.get('--keyboard-inset')).toBe('440px');
  await vi.advanceTimersByTimeAsync(60);
  expect(b.win.scrollBy).toHaveBeenCalledWith({top:408,behavior:'auto'});
  await vi.advanceTimersByTimeAsync(400);
  expect(b.win.scrollBy).toHaveBeenCalledTimes(1);
  b.win.scrollBy.mockClear();
  b.viewport.offsetTop=50;b.viewport.dispatchEvent(new Event('scroll'));
  expect(b.styles.get('--visible-top')).toBe('50px');expect(b.win.scrollBy).not.toHaveBeenCalled();
});

it('scrolls the dialog rather than the document when editing a field inside a modal',async()=>{
  const b=browser();
  const modal={scrollTop:0,getBoundingClientRect:()=>({top:60,bottom:350})};
  b.doc.activeElement=input(320,368,{'.modal':modal});b.viewport.height=350;
  b.doc.dispatchEvent(new Event('focusin'));await vi.advanceTimersByTimeAsync(60);
  expect(modal.scrollTop).toBe(38);expect(b.win.scrollBy).not.toHaveBeenCalled();
});

it('keeps horizontally scrolled workout table inputs within their own container',async()=>{
  const b=browser();
  const table={scrollLeft:0,getBoundingClientRect:()=>({left:10,right:300})};
  b.doc.activeElement={...input(100,148,{'.table-wrap':table}),getBoundingClientRect:()=>({top:100,bottom:148,left:330,right:410})};
  b.doc.dispatchEvent(new Event('focusin'));await vi.advanceTimersByTimeAsync(60);
  expect(table.scrollLeft).toBe(118);expect(b.win.scrollBy).not.toHaveBeenCalled();
});

it('restores normal navigation on blur and removes listeners on destruction',async()=>{
  const b=browser();b.doc.activeElement=input(100,148);b.viewport.height=340;
  b.doc.dispatchEvent(new Event('focusin'));expect(b.classes.has('keyboard-open')).toBe(true);
  b.doc.activeElement=null;b.doc.dispatchEvent(new Event('focusout'));await vi.advanceTimersByTimeAsync(200);
  expect(b.classes.has('keyboard-open')).toBe(true);
  b.viewport.height=800;b.viewport.dispatchEvent(new Event('resize'));
  expect(b.classes.has('keyboard-open')).toBe(false);expect(b.classes.has('form-input-focused')).toBe(false);
  service!.ngOnDestroy();service=undefined;
  b.viewport.height=600;b.viewport.dispatchEvent(new Event('resize'));
  expect(b.styles.get('--visible-height')).toBe('800px');
});

it('keeps the editing layout and scroll range between fields while iOS briefly focuses body',async()=>{
  const b=browser();b.viewport.height=340;
  b.doc.activeElement=input(80,135);b.doc.dispatchEvent(new Event('focusin'));
  await vi.advanceTimersByTimeAsync(60);
  expect(b.win.scrollBy).not.toHaveBeenCalled();
  const space=b.styles.get('--keyboard-scroll-space');
  b.doc.activeElement=null;b.doc.dispatchEvent(new Event('focusout'));
  await vi.advanceTimersByTimeAsync(120);
  b.viewport.offsetTop=30;b.viewport.dispatchEvent(new Event('scroll'));
  expect(b.classes.has('form-input-focused')).toBe(true);
  expect(b.classes.has('keyboard-open')).toBe(true);
  expect(b.styles.get('--form-scroll-top')).toBe('20px');
  expect(b.styles.get('--keyboard-scroll-space')).toBe(space);
  b.doc.activeElement=input(40,100);b.doc.dispatchEvent(new Event('focusin'));
  await vi.advanceTimersByTimeAsync(500);
  expect(b.classes.has('form-input-focused')).toBe(true);
  expect(b.styles.get('--keyboard-scroll-space')).toBe(space);
  expect(b.win.scrollBy).not.toHaveBeenCalled();
});

it('keeps keyboard spacing stable during viewport pan, animation and field transitions',async()=>{
  const b=browser();b.viewport.height=340;b.viewport.offsetTop=20;
  b.doc.activeElement=input(80,135);b.doc.dispatchEvent(new Event('focusin'));
  expect(b.styles.get('--keyboard-scroll-space')).toBe('460px');
  b.viewport.height=360;b.viewport.offsetTop=60;b.viewport.dispatchEvent(new Event('resize'));
  expect(b.styles.get('--keyboard-inset')).toBe('380px');
  expect(b.styles.get('--keyboard-scroll-space')).toBe('460px');
  b.viewport.height=800;b.viewport.offsetTop=0;b.viewport.dispatchEvent(new Event('resize'));
  expect(b.styles.get('--keyboard-scroll-space')).toBe('460px');
  b.doc.activeElement=null;b.doc.dispatchEvent(new Event('focusout'));
  await vi.advanceTimersByTimeAsync(200);
  expect(b.styles.get('--keyboard-scroll-space')).toBe('0px');
  expect(b.classes.has('form-input-focused')).toBe(false);
});

it('does not scroll a newly selected readable field upwards or let an old focus timer move it',async()=>{
  const b=browser();b.viewport.height=340;b.viewport.offsetTop=40;
  b.doc.activeElement=input(500,560);b.doc.dispatchEvent(new Event('focusin'));
  await vi.advanceTimersByTimeAsync(30);
  b.doc.activeElement=null;b.doc.dispatchEvent(new Event('focusout'));
  b.doc.activeElement=input(50,110);b.doc.dispatchEvent(new Event('focusin'));
  await vi.advanceTimersByTimeAsync(600);
  expect(b.win.scrollBy).not.toHaveBeenCalled();
});

it('does not move the layout or scroll when a native date picker receives focus',async()=>{
  const b=browser();b.doc.activeElement={...input(700,748),type:'date'};b.doc.dispatchEvent(new Event('focusin'));
  b.viewport.height=340;b.viewport.dispatchEvent(new Event('resize'));await vi.advanceTimersByTimeAsync(100);
  expect(b.classes.has('form-input-focused')).toBe(false);expect(b.classes.has('keyboard-open')).toBe(false);expect(b.win.scrollBy).not.toHaveBeenCalled();
});
it('does not rewrite viewport CSS on repeated scroll events with unchanged geometry',()=>{
  const b=browser();const write=vi.spyOn(b.doc.documentElement.style,'setProperty');
  for(let index=0;index<5;index++)b.viewport.dispatchEvent(new Event('scroll'));
  expect(write).not.toHaveBeenCalled();
});

it('reveals fields above the persistent recovery dock while the keyboard is open',async()=>{
  const b=browser();b.viewport.height=340;
  Object.assign(b.doc,{querySelector:(selector:string)=>selector==='.workout-clock'?{getBoundingClientRect:()=>({top:260,height:72})}:null});
  b.doc.activeElement=input(250,300);b.doc.dispatchEvent(new Event('focusin'));
  await vi.advanceTimersByTimeAsync(60);
  expect(b.win.scrollBy).toHaveBeenCalledWith({top:60,behavior:'auto'});
});
