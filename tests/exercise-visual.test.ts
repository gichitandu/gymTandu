import {expect,it} from 'vitest';
import {seed} from '../src/app/core/seed';
import {exerciseArtwork,exerciseThumbnail,movementKind} from '../src/app/services/exercise-visual';

const base=seed().exercises[0];
it('keeps a poster for every previously supported animation with descriptive equipment labels',()=>{
 for(const [name,equipment,kind]of [['Croci ai cavi','Cavi (doppio)','fly'],['Lat machine','Macchina a cavi','lat']]){
  const exercise={...base,name,equipment};
  expect(movementKind(exercise)).toBe(kind);
  expect(exerciseArtwork(exercise)).toBe(`/training/figures/${kind}-v2.png`);
 }
});
it('uses static posters for exact imported aliases without enabling an animation',()=>{
 const aliases=[
  ['  FLAT BARBELL BENCH PRESS  ','Barbell','bench'],
  ['Barbell back squat','Barbell','squat'],
  ['Standing dumbbell curls','Dumbbells','curl'],
  ['Lat pulldown','Cable','lat'],
  ['Seated dumbbell shoulder press','Dumbbells','shoulder'],
  ['Croci ai cavi alti','Cavi','fly'],
  ['Alzate laterali con manubri','Manubri','lateral'],
 ];
 for(const [name,equipment,kind]of aliases){
  const exercise={...base,name,equipment};
  expect(exerciseArtwork(exercise)).toBe(`/training/figures/${kind}-v2.png`);
  expect(movementKind(exercise)).toBeUndefined();
 }
});
it('keeps distinct equipment, grips, incline and load modes on their existing fallback',()=>{
 for(const name of ['Panca inclinata','Panca declinata','Panca piana presa stretta','Panca piana con manubri (0°)','Front squat','Squat bulgaro'])expect(exerciseArtwork({...base,name})).toBeUndefined();
 for(const equipment of ['Macchina','Smith machine','Manubri'])expect(exerciseArtwork({...base,equipment})).toBeUndefined();
 expect(exerciseArtwork({...base,loadMode:'bodyweight'})).toBeUndefined();
 expect(exerciseArtwork({...base,name:'Lat machine presa stretta',equipment:'Cavi'})).toBeUndefined();
 expect(exerciseArtwork({...base,name:'Alzate laterali al cavo',equipment:'Cavi'})).toBeUndefined();
});
it('preserves uploaded photos and explicit catalog URLs while upgrading only the matching bundled SVG',()=>{
 const image=new Blob(['photo'],{type:'image/png'});
 expect(exerciseThumbnail({...base,image,thumbnailUrl:'https://example.com/catalog.png'})).toEqual({source:image,illustration:false});
 for(const thumbnailUrl of ['https://example.com/catalog.png','https://example.com/exercises/bench-press.svg','/custom/exercise.png','data:image/png;base64,AA==','/exercises/bench-incline.svg'])expect(exerciseThumbnail({...base,thumbnailUrl})).toEqual({source:thumbnailUrl,illustration:false});
 expect(exerciseThumbnail({...base,thumbnailUrl:'/exercises/bench-press.svg'})).toEqual({source:'/training/figures/bench-v2.png',illustration:true});
 const unsupported={...base,name:'Panca inclinata',thumbnailUrl:'/exercises/bench-incline.svg'};
 expect(exerciseThumbnail(unsupported)).toEqual({source:unsupported.thumbnailUrl,illustration:true});
});
