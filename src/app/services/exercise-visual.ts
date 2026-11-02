import {Exercise} from '../models/domain';
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
export function exerciseArtwork(exercise:Exercise|undefined){const type=movementKind(exercise);return type?'/training/figures/'+type+'-v2.png':undefined;}
