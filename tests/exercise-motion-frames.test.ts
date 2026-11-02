import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {seed} from '../src/app/core/seed';
import {exerciseMotionFrames} from '../src/app/services/exercise-motion-frames';
const base=seed().exercises[0];
const supported=[['Panca piana','Bilanciere','bench'],['Squat con bilanciere','Bilanciere','squat'],['Curl con manubri','Manubri','curl'],['Lat machine','Macchina','lat'],['Spinte con manubri','Manubri','shoulder'],['Croci ai cavi','Cavi','fly'],['Alzate laterali','Manubri','lateral']];
it('ships exactly six described exercise positions for each of the seven supported movements',()=>{
 for(const [name,equipment,kind]of supported){
  const motion=exerciseMotionFrames({...base,name,equipment})!;
  expect(motion.kind).toBe(kind);expect(motion.source).toBe(`/training/motion/${kind}-frames-v1.png`);
  expect(motion.columns).toBe(3);expect(motion.rows).toBe(2);expect(motion.frames).toBe(6);
  expect(motion.durationMs).toBeGreaterThanOrEqual(3000);expect(motion.phases).toHaveLength(6);
  for(const phase of motion.phases){expect(phase.label.length).toBeGreaterThan(0);expect(phase.cue.length).toBeGreaterThan(20);}
  const png=readFileSync('public'+motion.source);expect(png.readUInt32BE(16)).toBe(1536);expect(png.readUInt32BE(20)).toBe(1024);
 }
});
it('does not attach a sequence for a different incline, equipment, grip or load mode',()=>{
 for(const name of ['Panca inclinata','Panca declinata','Panca piana presa stretta','Panca piana con manubri (0°)','Squat bulgaro','Front squat','Esercizio personale'])expect(exerciseMotionFrames({...base,name})).toBeUndefined();
 for(const equipment of ['Manubri','Macchina','Smith machine'])expect(exerciseMotionFrames({...base,equipment})).toBeUndefined();
 for(const loadMode of ['bodyweight','weighted-bodyweight','assisted'] as const)expect(exerciseMotionFrames({...base,loadMode})).toBeUndefined();
 expect(exerciseMotionFrames(undefined)).toBeUndefined();
});
it('supports descriptive cable-machine labels without mutating saved exercises',()=>{
 const exercise={...base,name:'Lat machine',equipment:'Macchina a cavi',thumbnailUrl:'https://example.com/photo.png'},before=structuredClone(exercise);
 expect(exerciseMotionFrames(exercise)?.kind).toBe('lat');expect(exercise).toEqual(before);
});

it('recognizes equivalent imported names, equipment aliases and repeated spaces',()=>{
 for(const [name,equipment,kind]of [
  ['  Panca   piana bilanciere  ','  Bilanciere  ','bench'],
  ['Flat barbell bench press','Barbell','bench'],
  ['Barbell back squat','Barbell','squat'],
  ['Curl  con manubri  in piedi','Manubri','curl'],
  ['Standing dumbbell curls','Dumbbells','curl'],
  ['Lat pulldown','Cable','lat'],
  ['Lat machine','Cavo','lat'],
  ['Cable fly','Cavo','fly'],
  ['Lat machine presa larga','Macchina a cavi','lat'],
  ['Seated dumbbell shoulder press','Dumbbells','shoulder'],
  ['Croci ai cavi alti','Cavi (doppio)','fly'],
  ['Cable crossover','Cable','fly'],
  ['Alzate laterali con manubri','Manubri','lateral'],
 ])expect(exerciseMotionFrames({...base,name,equipment})?.kind).toBe(kind);
});
it('keeps unsupported imported variations out of the frame player',()=>{
 for(const [name,equipment]of [
  ['Incline barbell bench press','Barbell'],['Hammer curl','Dumbbells'],
  ['Seated dumbbell curls','Dumbbells'],['Lat machine presa stretta','Cavi'],
  ['Alzate laterali al cavo','Cavi'],['Croci ai cavi bassi','Cavi'],
  ['Arnold press','Manubri'],['Front squat','Barbell'],
 ])expect(exerciseMotionFrames({...base,name,equipment})).toBeUndefined();
});
