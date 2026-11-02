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
export function exerciseArtwork(exercise:Exercise|undefined){const type=movementKind(exercise)||artworkKind(exercise);return type?'/training/figures/'+type+'-v2.png':undefined;}

/** Explicit photos and URLs win; only our exact standard SVG is replaceable. */
export function exerciseThumbnail(exercise:Exercise|undefined):{source:string|Blob;illustration:boolean} {
 if(exercise?.image)return {source:exercise.image,illustration:false};
 const fallback=exerciseIllustration(exercise),thumbnail=exercise?.thumbnailUrl;
 if(thumbnail&&thumbnail!==fallback)return {source:thumbnail,illustration:false};
 return {source:exerciseArtwork(exercise)||thumbnail||fallback,illustration:true};
}
