import {Exercise} from '../models/domain';
import {exerciseIllustration} from './exercise-illustration';
export type MovementKind='bench'|'squat'|'curl'|'lat'|'shoulder'|'fly'|'lateral';
/** Strict variants: never demonstrate a different machine, grip or incline. */
export function movementKind(exercise:Exercise|undefined):MovementKind|undefined {
 if(!exercise||exercise.loadMode!=='external')return;
 const name=exercise.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(),equipment=exercise.equipment.toLowerCase();
 if(/^(panca piana|panca piana con bilanciere)$/.test(name)&&equipment==='bilanciere')return 'bench';
 if(/^(squat|back squat|squat con bilanciere)$/.test(name)&&equipment==='bilanciere')return 'squat';
 if(/^(curl con manubri|curl manubri|curl con manubri in piedi)$/.test(name)&&equipment==='manubri')return 'curl';
 if(name==='lat machine'&&/macchina|cavi/.test(equipment))return 'lat';
 if(/^(shoulder press|spinte con manubri|shoulder press con manubri)$/.test(name)&&equipment==='manubri')return 'shoulder';
 if(name==='croci ai cavi'&&/cavi/.test(equipment))return 'fly';
 if(name==='alzate laterali'&&equipment==='manubri')return 'lateral';
 return;
}
/** Static posters accept exact naming aliases, independently of animated technique. */
function artworkKind(exercise:Exercise|undefined):MovementKind|undefined {
 if(!exercise||exercise.loadMode!=='external')return;
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
 const name=normalize(exercise.name),equipment=normalize(exercise.equipment);
 const barbell=/^(bilanciere|barbell)$/.test(equipment),dumbbells=/^(manubri|dumbbells?)$/.test(equipment),cables=/^(cavi?|macchina|cables?|machine|lat machine)$/.test(equipment);
 if(barbell&&/^(panca piana(?: con bilanciere| bilanciere)?|(?:flat )?(?:barbell )?bench press)$/.test(name))return 'bench';
 if(barbell&&/^(squat(?: con bilanciere| bilanciere)?|(?:barbell )?back squat|barbell squat)$/.test(name))return 'squat';
 if(dumbbells&&/^(curl (?:con )?manubri(?: in piedi)?|(?:standing )?dumbbell curls?)$/.test(name))return 'curl';
 if(cables&&/^(lat machine|lat pulldown|lat pull-down|wide grip lat pulldown)$/.test(name))return 'lat';
 if(dumbbells&&/^(shoulder press(?: con manubri)?|spinte con manubri|spinte spalle con manubri|lento avanti con manubri|distensioni sopra la testa con manubri|(?:seated )?dumbbell shoulder press)$/.test(name))return 'shoulder';
 if(cables&&/^(croci ai cavi|croci ai cavi alti|cable fly(?:es)?|cable crossover)$/.test(name))return 'fly';
 if(dumbbells&&/^(alzate laterali(?: con manubri)?|(?:standing )?dumbbell lateral raises?)$/.test(name))return 'lateral';
 return;
}
/** One illustration per movement family, shared across every training screen. */
export interface ExerciseVisual {source:string;illustration:true;family:string;cell?:number}
export const EXERCISE_ARTWORK_ATLASES:Readonly<Record<string,readonly string[]>>={
 chest:['bench-incline','bench-decline','bench-fly','chest-press','push-up','dip'],
 back:['pull-up','bent-row','seated-row','pullover','cable-pullover','back-extension'],
 shoulders:['front-raise','reverse-fly','face-pull','upright-row','shrug','external-rotation'],
 arms:['preacher-curl','overhead-triceps','french-press','triceps-kickback','triceps-pushdown','wrist-curl'],
 legs:['deadlift','lunge','step-up','leg-press','leg-extension','leg-curl'],
 lower:['leg-curl-seated','hip-thrust','glute-kickback','abductor','adductor','calf-raise'],
 core:['plank','side-plank','crunch','leg-raise','cable-crunch','russian-twist'],
 extras:['calf-seated','calf-press','bench-dip','ab-wheel','bird-dog','dead-bug'],
};
const individual:Readonly<Record<string,MovementKind>>={'bench-press':'bench','squat':'squat','biceps-curl':'curl','lat-pulldown':'lat','shoulder-press':'shoulder','cable-fly':'fly','lateral-raise':'lateral'};

/** Uploaded photos and catalog URLs remain in the archive; the app now shows mannequins everywhere. */
export function exerciseThumbnail(exercise:Exercise|undefined):ExerciseVisual {
 const exact=movementKind(exercise)||artworkKind(exercise);
 const family=exerciseIllustration(exercise).split('/').pop()!.replace(/\.svg$/,'');
 const single=exact||individual[family];
 if(single)return {source:'/training/figures/'+single+'-v2.png',illustration:true,family};
 for(const [atlas,families]of Object.entries(EXERCISE_ARTWORK_ATLASES)){
  const cell=families.indexOf(family);
  if(cell!==-1)return {source:'/training/figures/atlas-'+atlas+'-v3.png',illustration:true,family,cell};
 }
 // Unknown personal exercises get neutral anatomy, never an unrelated exercise pose.
 return {source:'/training/figures/muscle-front-v2.png',illustration:true,family:'movement'};
}
export function exerciseArtwork(exercise:Exercise|undefined){return exerciseThumbnail(exercise).source;}
