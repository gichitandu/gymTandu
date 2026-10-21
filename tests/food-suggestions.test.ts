import { describe, expect, it } from 'vitest';
import { FOODS, foodSuggestions, portion } from '../src/app/services/nutrition';

const ids=(label:string,probability=.8)=>foodSuggestions([{label,probability}]).map(food=>food.id);

describe('food photo proposals',()=>{
 it('matches complete ImageNet classes and their primary names',()=>{
  expect(ids('  Granny   Smith  ')).toEqual(['apple']);
  expect(ids('pizza, pizza pie')).toEqual(['pizza']);
  expect(ids('cucumber, cuke')).toEqual(['cucumber']);
  expect(ids('pineapple, ananas')).toEqual(['pineapple']);
  expect(ids('French loaf')).toEqual(['bread']);
 });

 it('does not turn animals, objects, or similarly named foods into meal ingredients',()=>{
  for(const label of ['triceratops','prairie chicken, prairie grouse, prairie fowl','eggnog',
   'coho, cohoe, coho salmon, blue jack, silver salmon, Oncorhynchus',
   'spaghetti squash','custard apple','hen-of-the-woods, hen of the woods',
   'plate','orange ball','pineapple juice','keyboard, banana']){
   expect(ids(label),label).toEqual([]);
  }
 });

 it('gives prepared dishes their own references instead of plain ingredients',()=>{
  expect(ids('carbonara')).toEqual(['carbonara']);
  expect(ids('bagel, beigel')).toEqual(['bagel']);
  expect(ids('mashed potato')).toEqual(['mashed-potato']);
  expect(ids('guacamole')).toEqual(['guacamole']);
  expect(FOODS.find(food=>food.id==='carbonara')?.fat).toBeGreaterThan(FOODS.find(food=>food.id==='pasta')!.fat);
 });

 it('orders proposals by confidence and keeps each reference once',()=>{
  expect(foodSuggestions([
   {label:'banana',probability:.2},
   {label:'broccoli',probability:.8},
   {label:'banana',probability:.6},
   {label:'pizza, pizza pie',probability:.3},
  ]).map(food=>food.id)).toEqual(['broccoli','banana','pizza']);
 });

 it('discards weak and invalid probabilities',()=>{
  for(const probability of [NaN,Infinity,-Infinity,-1,0,.149,1.01])expect(ids('banana',probability)).toEqual([]);
  expect(ids('banana',.15)).toEqual(['banana']);
  expect(ids('banana',1)).toEqual(['banana']);
 });

 it('retains the existing manual references and values',()=>{
  expect(FOODS[0].id).toBe('banana');
  const expected:Record<string,number>={banana:89,apple:52,orange:47,strawberry:32,broccoli:34,pizza:266,pasta:158,rice:130,chicken:165,egg:143,salmon:208,bread:265,yogurt:61};
  for(const [id,calories] of Object.entries(expected))expect(portion(FOODS.find(food=>food.id===id)!,100).calories,id).toBe(calories);
 });
});
