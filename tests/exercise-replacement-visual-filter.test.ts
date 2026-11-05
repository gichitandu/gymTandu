import {describe, expect, it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {replacementCandidates} from '../src/app/services/replacement-candidates';
import {exerciseThumbnail} from '../src/app/services/exercise-visual';

describe('visual exercise replacement filters',()=>{
 const data=seed(),original=data.exercises.find(e=>e.id==='exercise-0')!;

 it('offers the entire active exercise catalog rather than cutting off after 120 entries',()=>{
  const result=replacementCandidates(data.exercises,original,'');
  expect(result.length).toBe(data.exercises.filter(e=>e.active&&e.id!==original.id).length);
  expect(result.length).toBeGreaterThan(120);
  expect(result.some(e=>e.id===original.id)).toBe(false);
  expect(result.some(e=>e.muscleGroupId==='muscle-1')).toBe(true);
  expect(result.every(e=>e.active)).toBe(true);
 });

 it('applies a muscle-group filter and a normalized search together',()=>{
  const groupOnly=replacementCandidates(data.exercises,original,'','muscle-1');
  expect(groupOnly.length).toBeGreaterThan(0);
  expect(groupOnly.every(e=>e.muscleGroupId==='muscle-1')).toBe(true);
  const withName=replacementCandidates(data.exercises,original,'presa supina','muscle-1');
  expect(withName.length).toBeGreaterThan(0);
  expect(withName.every(e=>e.muscleGroupId==='muscle-1')).toBe(true);
  expect(withName.every(e=>e.name.toLowerCase().includes('presa supina'))).toBe(true);
  expect(replacementCandidates(data.exercises,original,'lat machine','muscle-0')).toHaveLength(0);
 });

 it('keeps same-muscle results first and never includes disabled or original exercises',()=>{
  const source=data.exercises.find(e=>e.id==='exercise-4')!;
  const all=replacementCandidates(data.exercises,source,'');
  expect(all[0].muscleGroupId).toBe(source.muscleGroupId);
  expect(all.find(e=>e.id===source.id)).toBeUndefined();
  const inactive={...data.exercises[0],id:'inactive-only',name:'Specialissimo',active:false};
  expect(replacementCandidates([...data.exercises,inactive],source,'specialissimo')).toHaveLength(0);
 });

 it('every selectable candidate has an existing local exercise thumbnail or atlas',()=>{
  for(const exercise of replacementCandidates(data.exercises,original,'')){
   const art=exerciseThumbnail(exercise);
   expect(art.source).toMatch(/^\/training\/figures\/.*\.(?:png|webp)$/);
   expect(art.illustration).toBe(true);
   expect(art.cell===undefined||(art.cell>=0&&art.cell<6)).toBe(true);
  }
 });

 it('does not mutate the catalog or settings when filtering',()=>{
  const originalData=JSON.stringify(data);
  for(const group of ['', 'muscle-0', 'muscle-1', 'muscle-2','missing']){
   replacementCandidates(data.exercises,original,'Panca',group);
  }
  expect(JSON.stringify(data)).toEqual(originalData);
 });
});
