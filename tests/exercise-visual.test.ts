import {expect,it} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {seed} from '../src/app/core/seed';
import {EXERCISE_ARTWORK_ATLASES,EXERCISE_SPECIFIC_ARTWORK,exerciseArtwork,exerciseThumbnail,movementKind} from '../src/app/services/exercise-visual';

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
  expect(visual.source).toMatch(/^\/training\/figures\/.*\.(?:png|webp)$/);
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
  expect(visual.source).toBe('/training/figures/generated/bench-flat-barbell.webp');expect(visual.illustration).toBe(true);
  expect(exercise.image).toBe(image);expect(exercise.thumbnailUrl).toBe(thumbnailUrl);
 }
});
it('uses neutral mannequin anatomy for unknown exercises without enabling a false animation',()=>{
 const unknown={...base,name:'Esercizio personale XYZ',equipment:'Attrezzo personale'};
 expect(exerciseThumbnail(unknown)).toMatchObject({source:'/training/figures/muscle-front-v2.png',family:'movement'});
 expect(movementKind(unknown)).toBeUndefined();
 for(const name of ['Panca inclinata','Panca declinata','Panca piana presa stretta','Front squat','Squat bulgaro'])expect(movementKind({...base,name})).toBeUndefined();
});

it('loads an individual generated WebP for every exact catalog exercise',()=>{
 const exercises=seed().exercises;
 expect(Object.keys(EXERCISE_SPECIFIC_ARTWORK)).toHaveLength(253);
 expect(new Set(exercises.map(e=>e.id))).toEqual(new Set(Object.keys(EXERCISE_SPECIFIC_ARTWORK)));
 for(const [id,artwork] of Object.entries(EXERCISE_SPECIFIC_ARTWORK)){
  const exercise=exercises.find(e=>e.id===id);
  expect(exercise,id).toBeDefined();
  expect(exercise?.name).toBe(artwork.name);
  expect(exercise?.equipment).toBe(artwork.equipment);
  const visual=exerciseThumbnail(exercise);
  expect(visual.source).toBe('/training/figures/generated/'+artwork.file+'.webp');
  expect(visual.illustration).toBe(true);
  expect(visual.cell).toBeUndefined();
  const location='public'+visual.source;
  expect(existsSync(location)).toBe(true);
  const bytes=readFileSync(location);
  expect(bytes.subarray(0,4).toString('ascii')).toBe('RIFF');
  expect(bytes.subarray(8,12).toString('ascii')).toBe('WEBP');
  expect(bytes.length).toBeGreaterThan(2000);
  const renamed={...exercise!,name:exercise!.name+' variante personalizzata'};
  const renamedVisual=exerciseThumbnail(renamed);
  expect(renamedVisual.source).not.toBe(visual.source);
  expect(exerciseThumbnail({...exercise!,equipment:'Attrezzo personale'}).source).not.toBe(visual.source);
  expect(exerciseThumbnail({...exercise!,id:'custom-'+id}).source).not.toBe(visual.source);
 }
});
it('retains family artwork for imported and renamed variants outside the catalog',()=>{
 for(const e of seed().exercises){
  const v=exerciseThumbnail({...e,id:'imported-'+e.id});
  expect(v.source,e.name).toMatch(/^\/training\/figures\/(?:atlas-[^/]+-v3\.png|[^/]+-v2\.png)$/);
  expect(existsSync('public'+v.source),e.name).toBe(true);
 }
});
it('has 253 distinct image URLs and image contents, with no atlas cell reused for the catalog',()=>{
 const visuals=seed().exercises.map(exerciseThumbnail);
 expect(new Set(visuals.map(v=>v.source)).size).toBe(253);
 expect(visuals.every(v=>v.cell===undefined)).toBe(true);
 const hashes=visuals.map(v=>createHash('sha256').update(readFileSync('public'+v.source)).digest('hex'));
 expect(new Set(hashes).size).toBe(253);
});
it('keeps the ten previously published image URLs while adding 243 optimized catalog images',()=>{
 const exercises=seed().exercises;
 const originals=exercises.filter(e=>!EXERCISE_SPECIFIC_ARTWORK[e.id].file.startsWith('catalog-v1/'));
 expect(originals).toHaveLength(10);
 expect(exerciseArtwork(exercises.find(e=>e.id==='variant-db-bench-30'))).toBe('/training/figures/generated/bench-incline-dumbbells-30.webp');
 const added=exercises.filter(e=>EXERCISE_SPECIFIC_ARTWORK[e.id].file.startsWith('catalog-v1/'));
 expect(added).toHaveLength(243);
 for(const e of added){
  const bytes=readFileSync('public'+exerciseArtwork(e));
  // ImageMagick exports simple lossy VP8 WebP; width/height follow the frame marker.
  expect(bytes.subarray(12,16).toString('ascii'),e.name).toBe('VP8 ');
  expect(bytes.subarray(23,26).toString('hex'),e.name).toBe('9d012a');
  expect(bytes.readUInt16LE(26)&0x3fff,e.name).toBe(512);
  expect(bytes.readUInt16LE(28)&0x3fff,e.name).toBe(512);
  expect(bytes.length,e.name).toBeLessThan(100_000);
 }
});
