import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultExercises} from '../src/app/core/default-catalog';

type Planned={id:string;name:string;group:'petto'|'schiena'|'spalle';equipment:string;plannedAsset:string;status:string;requirements:string[]};
const location=fileURLToPath(new URL('../docs/qa/exercise-artwork-124.json',import.meta.url));
const doc=JSON.parse(readFileSync(location,'utf-8')) as {environment:string;preserveOriginals:boolean;noProductionSync:boolean;counts:Record<string,number>;entries:Planned[]};
const groups:{[key:string]:Planned['group']}={'muscle-0':'petto','muscle-1':'schiena','muscle-2':'spalle'};

describe('catalogo immagini per gli esercizi QA',()=>{
 it('copre tutti e soli gli esercizi di petto, schiena e spalle del catalogo corrente',()=>{
  const originals=defaultExercises.filter(e=>Boolean(groups[e.muscleGroupId]));
  expect(doc.entries.map(e=>e.id).sort()).toEqual(originals.map(e=>e.id).sort());
  expect(new Set(doc.entries.map(e=>e.id)).size).toBe(originals.length);
  expect(doc.counts).toEqual({petto:62,schiena:44,spalle:18,total:124});
  for(const row of originals){
   const entry=doc.entries.find(e=>e.id===row.id)!;
   expect(entry.name).toBe(row.name);
   expect(entry.group).toBe(groups[row.muscleGroupId]);
   expect(entry.equipment).toBe(row.equipment);
   expect(entry.plannedAsset).toBe('public/training/figures/specific/'+row.id+'.webp');
   expect(entry.requirements.length).toBeGreaterThan(0);
  }
 });
 it('mantiene immagini originali e produzione intatte finché gli asset specifici non vengono approvati',()=>{
  expect(doc.environment).toBe('QA_ISOLATO');
  expect(doc.preserveOriginals).toBe(true);
  expect(doc.noProductionSync).toBe(true);
  expect(doc.entries.every(e=>e.status==='DA_GENERARE_E_APPROVARE')).toBe(true);
 });
});
