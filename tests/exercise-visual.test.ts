import {expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {seed} from '../src/app/core/seed';
import {EXERCISE_ARTWORK_ATLASES,exerciseArtwork,exerciseThumbnail,movementKind} from '../src/app/services/exercise-visual';

const base=seed().exercises[0];
it('keeps all seven exact animation posters and their imported aliases',()=>{
 for(const [name,equipment,kind]of [
  ['Croci ai cavi','Cavi (doppio)','fly'],['Lat machine','Macchina a cavi','lat'],
  ['  FLAT BARBELL BENCH PRESS  ','Barbell','bench'],['Barbell back squat','Barbell','squat'],
  ['Standing dumbbell curls','Dumbbells','curl'],['Lat pulldown','Cable','lat'],
  ['Seated dumbbell shoulder press','Dumbbells','shoulder'],['Croci ai cavi alti','Cavi','fly'],
  ['Alzate laterali con manubri','Manubri','lateral'],
 ])expect(exerciseArtwork({...base,name,equipment})).toBe(`/training/figures/${kind}-v2.png`);
});
it('covers all 253 bundled exercises and all 55 families with local mannequin artwork',()=>{
 const exercises=seed().exercises,visuals=exercises.map(exerciseThumbnail);
 expect(exercises).toHaveLength(253);
 expect(new Set(visuals.map(v=>v.family)).size).toBe(55);
 for(const visual of visuals){
  expect(visual.family).not.toBe('movement');
  expect(visual.source).toMatch(/^\/training\/figures\/.*\.png$/);
  expect(existsSync('public'+visual.source)).toBe(true);
  if(visual.cell!==undefined)expect(visual.cell>=0&&visual.cell<6).toBe(true);
 }
});
it('keeps 48 unique atlas poses in their exact six-cell regions',()=>{
 const families=Object.values(EXERCISE_ARTWORK_ATLASES).flat();
 expect(families).toHaveLength(48);expect(new Set(families).size).toBe(48);
 for(const [atlas,poses]of Object.entries(EXERCISE_ARTWORK_ATLASES)){
  expect(poses).toHaveLength(6);
  const png=readFileSync(`public/training/figures/atlas-${atlas}-v3.png`);
  expect(png.readUInt32BE(16)).toBe(1536);expect(png.readUInt32BE(20)).toBe(1024);
 }
 const legPress=exerciseThumbnail({...base,name:'Leg press'}),incline=exerciseThumbnail({...base,name:'Panca inclinata'});
 expect(legPress).toMatchObject({source:'/training/figures/atlas-legs-v3.png',cell:3,family:'leg-press'});
 expect(incline).toMatchObject({source:'/training/figures/atlas-chest-v3.png',cell:0,family:'bench-incline'});
});
it('shows the new artwork instead of every old source without mutating saved photos or URLs',()=>{
 const image=new Blob(['saved personal photo'],{type:'image/png'});
 for(const thumbnailUrl of ['https://example.com/catalog.png','/custom/exercise.png','data:image/png;base64,AA==','/exercises/bench-press.svg']){
  const exercise={...base,image,thumbnailUrl},visual=exerciseThumbnail(exercise);
  expect(visual.source).toBe('/training/figures/bench-v2.png');expect(visual.illustration).toBe(true);
  expect(exercise.image).toBe(image);expect(exercise.thumbnailUrl).toBe(thumbnailUrl);
 }
});
it('uses neutral mannequin anatomy for unknown exercises without enabling a false animation',()=>{
 const unknown={...base,name:'Esercizio personale XYZ',equipment:'Attrezzo personale'};
 expect(exerciseThumbnail(unknown)).toMatchObject({source:'/training/figures/muscle-front-v2.png',family:'movement'});
 expect(movementKind(unknown)).toBeUndefined();
 for(const name of ['Panca inclinata','Panca declinata','Panca piana presa stretta','Front squat','Squat bulgaro'])expect(movementKind({...base,name})).toBeUndefined();
});
