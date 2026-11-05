import {Exercise} from '../models/domain';
import {exerciseIllustration} from './exercise-illustration';
import {CATALOG_EXERCISE_ARTWORK} from './exercise-artwork-catalog';
export type MovementKind='bench'|'squat'|'curl'|'lat'|'shoulder'|'fly'|'lateral';
/** Strict variants: never demonstrate a different machine, grip or incline. */
export function movementKind(exercise:Exercise|undefined):MovementKind|undefined {
 if(!exercise||exercise.loadMode!=='external')return;
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
 const name=normalize(exercise.name),equipment=normalize(exercise.equipment);
 const barbell=/^(bilanciere|barbell)$/.test(equipment),dumbbells=/^(manubri|dumbbells?)$/.test(equipment);
 const cable=/\b(cav[oi]|cables?)\b/.test(equipment),machine=/\b(macchina|machine)\b/.test(equipment);
 if(barbell&&/^(panca piana(?: con bilanciere| bilanciere)?|(?:flat )?(?:barbell )?bench press)$/.test(name))return 'bench';
 if(barbell&&/^(squat(?: con bilanciere| bilanciere)?|(?:barbell )?back squat|barbell squat)$/.test(name))return 'squat';
 if(dumbbells&&/^(curl (?:con )?manubri(?: in piedi)?|(?:standing )?dumbbell curls?)$/.test(name))return 'curl';
 if((cable||machine||equipment==='lat machine')&&/^(lat machine(?: presa larga)?|lat pulldown|lat pull-down|lat pull down|wide grip lat pulldown)$/.test(name))return 'lat';
 if(dumbbells&&/^(shoulder press(?: con manubri)?|spinte con manubri|spinte spalle con manubri|lento avanti con manubri|distensioni sopra la testa con manubri|(?:seated )?dumbbell shoulder press)$/.test(name))return 'shoulder';
 if(cable&&/^(croci ai cavi(?: alti)?|cable fly(?:es)?|cable crossover)$/.test(name))return 'fly';
 if(dumbbells&&/^(alzate laterali(?: con manubri)?|(?:standing )?dumbbell lateral raises?)$/.test(name))return 'lateral';
 return;
}
/** Static posters accept exact naming aliases, independently of animated technique. */
function artworkKind(exercise:Exercise|undefined):MovementKind|undefined {
 if(!exercise||exercise.loadMode!=='external')return;
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
 const name=normalize(exercise.name),equipment=normalize(exercise.equipment);
 const barbell=/^(bilanciere|barbell)$/.test(equipment),dumbbells=/^(manubri|dumbbells?)$/.test(equipment),cables=/^(cav[oi]|macchina|cables?|machine|lat machine)$/.test(equipment);
 if(barbell&&/^(panca piana(?: con bilanciere| bilanciere)?|(?:flat )?(?:barbell )?bench press)$/.test(name))return 'bench';
 if(barbell&&/^(squat(?: con bilanciere| bilanciere)?|(?:barbell )?back squat|barbell squat)$/.test(name))return 'squat';
 if(dumbbells&&/^(curl (?:con )?manubri(?: in piedi)?|(?:standing )?dumbbell curls?)$/.test(name))return 'curl';
 if(cables&&/^(lat machine|lat pulldown|lat pull-down|wide grip lat pulldown)$/.test(name))return 'lat';
 if(dumbbells&&/^(shoulder press(?: con manubri)?|spinte con manubri|spinte spalle con manubri|lento avanti con manubri|distensioni sopra la testa con manubri|(?:seated )?dumbbell shoulder press)$/.test(name))return 'shoulder';
 if(cables&&/^(croci ai cavi|croci ai cavi alti|cable fly(?:es)?|cable crossover)$/.test(name))return 'fly';
 if(dumbbells&&/^(alzate laterali(?: con manubri)?|(?:standing )?dumbbell lateral raises?)$/.test(name))return 'lateral';
 return;
}
/** Catalog artwork and safe family fallbacks, shared across every training screen. */
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

/**
 * Individual artwork for all 253 bundled exercises, including the first ten
 * approved images at their original URLs.
 * The (id, name, equipment) guard prevents a renamed/custom exercise from
 * silently receiving an illustration for a different movement or machine.
 * Existing original PNG/atlas assets remain unchanged and are the fallback.
 */
export const EXERCISE_SPECIFIC_ARTWORK: Readonly<Record<string, Readonly<{name:string;equipment:string;file:string}>>> = {
 'exercise-0': {name:'Panca piana',equipment:'Bilanciere',file:'bench-flat-barbell'},
 'variant-db-bench-30': {name:'Panca inclinata con manubri a 30°',equipment:'Manubri',file:'bench-incline-dumbbells-30'},
 'library-barbell_decline_barbell_bench_press': {name:'Panca declinata',equipment:'Bilanciere',file:'bench-decline-barbell'},
 'exercise-2': {name:'Croci ai cavi',equipment:'Cavi',file:'cable-fly'},
 'variant-lat-pronated-wide': {name:'Lat machine presa prona larga',equipment:'Cavi',file:'lat-wide-pronated'},
 'variant-row-neutral': {name:'Pulley presa neutra stretta',equipment:'Cavi',file:'seated-row-neutral-narrow'},
 'library-barbell_landmine_t_bar_row': {name:'T-bar row',equipment:'Bilanciere',file:'tbar-row-supported'},
 'exercise-8': {name:'Shoulder press',equipment:'Manubri',file:'shoulder-press-dumbbells'},
 'exercise-9': {name:'Alzate laterali',equipment:'Manubri',file:'lateral-raise-dumbbells'},
 'library-machine_reverse_machine_flyes': {name:'Reverse fly alla macchina',equipment:'Macchina',file:'reverse-machine-fly'},
 ...CATALOG_EXERCISE_ARTWORK,
};

/** Uploaded photos and catalog URLs remain in the archive; the app now shows mannequins everywhere. */
export function exerciseThumbnail(exercise:Exercise|undefined):ExerciseVisual {
 const specific=exercise&&EXERCISE_SPECIFIC_ARTWORK[exercise.id];
 if(specific&&exercise!.name===specific.name&&exercise!.equipment===specific.equipment){
  const family=exerciseIllustration(exercise).split('/').pop()!.replace(/\.svg$/,'');
  return {source:'/training/figures/generated/'+specific.file+'.webp',illustration:true,family};
 }
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
