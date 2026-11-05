import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defaultExercises} from '../src/app/core/default-catalog';

type Pending={id:string;name:string;equipment:string;muscleGroupId:string;file:string;status:string;tags:string[];loadMode:string};
const manifest=JSON.parse(readFileSync(fileURLToPath(new URL('../docs/qa/exercise-artwork-remaining-243.json',import.meta.url)),'utf8')) as {
  sourceCommit:string;environment:string;preexistingCount:number;totalCatalog:number;remainingCount:number;originalAssetsPreserved:boolean;publicationGate:string;
  pending:Pending[];
};
const alreadyMapped=[
  'exercise-0','variant-db-bench-30','library-barbell_decline_barbell_bench_press',
  'exercise-2','variant-lat-pronated-wide','variant-row-neutral',
  'library-barbell_landmine_t_bar_row','exercise-8','exercise-9',
  'library-machine_reverse_machine_flyes',
];

describe('QA: inventoried remaining training artwork',()=>{
  it('tracks every catalog exercise exactly once across already mapped and pending',()=>{
    expect(manifest.totalCatalog).toBe(defaultExercises.length);
    expect(manifest.preexistingCount).toBe(alreadyMapped.length);
    expect(manifest.remainingCount).toBe(manifest.pending.length);
    expect(manifest.pending.length).toBe(243);
    const existing=new Set(alreadyMapped),pending=new Set(manifest.pending.map(x=>x.id));
    expect(pending.size).toBe(manifest.pending.length);
    for(const id of existing)expect(pending.has(id)).toBe(false);
    expect([...existing,...pending].sort()).toEqual(defaultExercises.map(x=>x.id).sort());
  });
  it('preserves exercise names and equipment to prevent attaching unrelated visual assets',()=>{
    const dictionary=new Map(defaultExercises.map(x=>[x.id,x]));
    for(const e of manifest.pending){
      const actual=dictionary.get(e.id);
      expect(actual).toBeDefined();
      expect(e.name).toBe(actual!.name);
      expect(e.equipment).toBe(actual!.equipment);
      expect(e.muscleGroupId).toBe(actual!.muscleGroupId);
      expect(e.loadMode).toBe(actual!.loadMode);
      expect(e.status).toBe('TODO_GENERATE_AND_VALIDATE');
      expect(e.file).toBe('public/training/figures/specific/'+e.id+'.webp');
    }
  });
  it('is staging-only and requires verified production deployment before release',()=>{
    expect(manifest.environment).toBe('qa/gymtrack-isolato');
    expect(manifest.originalAssetsPreserved).toBe(true);
    expect(manifest.publicationGate).toContain('Do not merge to main or deploy');
  });
});
