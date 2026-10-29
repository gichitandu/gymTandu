import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {parseWorkoutExcel,readWorkoutWorkbook} from '../src/app/services/excel-parser';

const original='tests/fixtures/excel/original-format-namespaced.xlsx';
const model='tests/fixtures/excel/model-gt1-empty.xlsx';
const example='tests/fixtures/excel/model-gt1-example.xlsx';
async function file(path:string){return new File([await readFile(path)],path.split('/').at(-1)!,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
async function changed(edit:(book:ExcelJS.Workbook)=>void,path=example){const book=await readWorkoutWorkbook(new Uint8Array(await readFile(path)));edit(book);return new File([await book.xlsx.writeBuffer()],'modified.xlsx');}
function totals(program:Awaited<ReturnType<typeof parseWorkoutExcel>>){return{sessions:program.sessions.length,prescriptions:program.sessions.reduce((n,s)=>n+s.exercises.length,0),sets:program.sessions.reduce((n,s)=>n+s.exercises.reduce((sum,e)=>sum+e.sets,0),0)};}

it.each([original,example])('imports the complete approved workbook %s without inventing performed workouts',async path=>{
 const parsed=await parseWorkoutExcel(await file(path),'2026-11-02');expect(totals(parsed)).toEqual({sessions:32,prescriptions:208,sets:536});expect(parsed.weeks).toBe(8);expect(parsed.startDate).toBe('2026-11-02');expect(parsed.endDate).toBe('2026-12-25');expect(parsed.fileHash).toMatch(/^[a-f0-9]{64}$/);
 const hash=await crypto.subtle.digest('SHA-256',await readFile(path));expect(parsed.fileHash).toBe([...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join(''));
 expect(parsed.sessions[0].exercises[0]).toMatchObject({name:'Panca piana bilanciere',sets:2,repsMin:6,repsMax:8,rest:180,rirMin:3,rirMax:3});
 const last=parsed.sessions.at(-1)!;expect(last.exercises.find(e=>e.name==='Calf raise')?.sets).toBe(4);expect(parsed.sessions.some(s=>'completed' in s||'workoutId' in s)).toBe(false);
});
it('reads the exact downloadable production example after guide metadata updates',async()=>{
 const path='public/templates/Esempio_GymTrack_8_Settimane.xlsx',bytes=new Uint8Array(await readFile(path));
 const parsed=await parseWorkoutExcel(await file(path),'2026-11-02');expect(totals(parsed)).toEqual({sessions:32,prescriptions:208,sets:536});
 const hash=await crypto.subtle.digest('SHA-256',bytes);expect(parsed.fileHash).toBe([...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join(''));
 const book=await readWorkoutWorkbook(bytes);expect(JSON.stringify(book.getWorksheet('PROGRAMMA')!.getCell('A5').note)).toContain('ID univoco');expect(book.getWorksheet('PROGRAMMA')!.getTables()).toHaveLength(1);
 await expect(parseWorkoutExcel(await file('public/templates/Modello_GymTrack_Da_Compilare.xlsx'),'2026-11-02')).rejects.toThrow('PIANO!B4');
});
it('keeps original starting guides and uncertain repetitions as text on every week',async()=>{
 const parsed=await parseWorkoutExcel(await file(original),'2026-11-02');
 const bench=parsed.sessions[0].exercises[0];expect(bench.warmupNotes).toContain('35kg×6');expect(bench.reference).toContain('55kg');
 const incline=parsed.sessions[0].exercises.find(e=>e.name==='Panca inclinata manubri')!;expect(incline.reference).toContain('6-7');expect(incline.loadUnit).toBe('Per manubrio');
 const rower=parsed.sessions[0].exercises.find(e=>e.name==='Rematore petto supportato')!;expect(rower.loadUnit).toBe('Da verificare');
 expect(parsed.sessions.find(s=>s.week===8&&s.weekday===1)!.exercises[0].reference).toContain('55kg');expect(parsed.warnings.some(w=>w.includes('più di 3 serie'))).toBe(true);
});
it('rejects the actual empty downloadable model until the user fills required data',async()=>{
 await expect(parseWorkoutExcel(await file(model),'2026-11-02')).rejects.toThrow('PIANO!B4');
});
it('requires a valid Monday before even reading the file',async()=>{
 const f=await file(example),read=vi.spyOn(f,'arrayBuffer');
 await expect(parseWorkoutExcel(f,'')).rejects.toThrow('data di inizio');await expect(parseWorkoutExcel(f,'2026-02-30')).rejects.toThrow('data di inizio');await expect(parseWorkoutExcel(f,'2026-11-03')).rejects.toThrow('lunedì');expect(read).not.toHaveBeenCalled();
});
it('preserves weekdays across the European daylight saving transition',async()=>{
 const parsed=await parseWorkoutExcel(await file(example),'2027-03-22');expect(parsed.sessions.slice(0,5).map(s=>s.date)).toEqual(['2027-03-22','2027-03-23','2027-03-25','2027-03-26','2027-03-29']);expect(parsed.sessions.every(s=>new Date(s.date+'T12:00:00Z').getUTCDay()===s.weekday)).toBe(true);
});
it('does not execute even a cached formula supplied as an exercise target',async()=>{
 const f=await changed(book=>{book.getWorksheet('PROGRAMMA')!.getCell('F6').value={formula:'2+1',result:3};});await expect(parseWorkoutExcel(f,'2026-11-02')).rejects.toThrow('non una formula');
});
it('rejects conflicting weekly overrides rather than choosing whichever row comes last',async()=>{
 const f=await changed(book=>{const s=book.getWorksheet('VARIAZIONI')!;s.getCell('A7').value=1;s.getCell('B7').value=2;s.getCell('E7').value=3;});await expect(parseWorkoutExcel(f,'2026-11-02')).rejects.toThrow(/VARIAZIONI!riga 7: regola incompatibile/);
});
it('applies global, workout and exercise overrides in specificity order with inherited values',async()=>{
 const f=await changed(book=>{const s=book.getWorksheet('VARIAZIONI')!;for(const [row,id,sets] of [[7,'',3],[8,'EX001',4]] as const){s.getCell(row,1).value=1;s.getCell(row,2).value=1;s.getCell(row,3).value='Petto e schiena A';s.getCell(row,4).value=id;s.getCell(row,5).value=sets;}});
 const parsed=await parseWorkoutExcel(f,'2026-11-02');expect(parsed.sessions[0].exercises[0]).toMatchObject({sets:4,rirMin:3,rirMax:3});expect(parsed.sessions[0].exercises[1].sets).toBe(3);expect(parsed.sessions[1].exercises[0].sets).toBe(2);
});
it('rejects an unknown variation ID and same-day workouts in the source file',async()=>{
 const unknown=await changed(book=>{book.getWorksheet('VARIAZIONI')!.getCell('D6').value='missing';});await expect(parseWorkoutExcel(unknown,'2026-11-02')).rejects.toThrow('assente da PROGRAMMA');
 const duplicate=await changed(book=>{const s=book.getWorksheet('PROGRAMMA')!;for(let row=12;row<=18;row++)s.getCell(row,3).value='Lunedì';});await expect(parseWorkoutExcel(duplicate,'2026-11-02')).rejects.toThrow('due allenamenti');
});
it('rejects invalid repetition ranges and partially missing original weeks',async()=>{
 const ranges=await changed(book=>{book.getWorksheet('PROGRAMMA')!.getCell('H6').value=1;});await expect(parseWorkoutExcel(ranges,'2026-11-02')).rejects.toThrow('inferiore al minimo');
 const incomplete=await changed(book=>{const s=book.getWorksheet('Lun - Petto Schiena')!;for(let row=48;row<=53;row++)for(let col=1;col<=9;col++)s.getCell(row,col).value=null;},original);await expect(parseWorkoutExcel(incomplete,'2026-11-02')).rejects.toThrow('settimana 8 mancante');
});
it('rejects forged, oversized and macro-named input before XLSX parsing',async()=>{
 await expect(parseWorkoutExcel(new File(['bad'],'bad.xlsx'),'2026-11-02')).rejects.toThrow('leggibile');
 await expect(parseWorkoutExcel(new File(['not-a-macro'],'bad.xlsm'),'2026-11-02')).rejects.toThrow('.xlsx');
 const oversized={name:'big.xlsx',size:11*1024*1024,arrayBuffer:vi.fn()} as unknown as File;await expect(parseWorkoutExcel(oversized,'2026-11-02')).rejects.toThrow('10 MB');expect(oversized.arrayBuffer).not.toHaveBeenCalled();
});
it('rejects an inflated ZIP entry before allocating workbook structures',async()=>{
 const bytes=new Uint8Array(await readFile(example)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let central=-1;
 for(let i=0;i<bytes.length-4;i++)if(view.getUint32(i,true)===0x02014b50){central=i;break;}
 expect(central).toBeGreaterThan(0);view.setUint32(central+24,40*1024*1024,true);
 await expect(parseWorkoutExcel(new File([bytes],'inflated.xlsx'),'2026-11-02')).rejects.toThrow('contenuto del file Excel è troppo grande');
});
