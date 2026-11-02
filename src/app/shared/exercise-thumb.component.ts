import { Component, computed, effect, input, signal } from '@angular/core';
import { Exercise } from '../models/domain';
import { IconComponent } from './icon.component';
import {exerciseArtwork} from '../services/exercise-visual';
import { exerciseIllustration } from '../services/exercise-illustration';
@Component({selector:'gt-exercise-thumb',standalone:true,imports:[IconComponent],template:`@if(exercise()){<img [src]="failed()?illustration():url()" [alt]="(failed()||!exercise()?.image&&!exercise()?.thumbnailUrl?'Illustrazione del movimento: ':'Immagine: ')+exercise()?.name" loading="lazy" referrerpolicy="no-referrer" (error)="failed.set(true)"/>}@else{<gt-icon name="weight"/>}`,styles:[`:host{width:var(--thumb-width,60px);height:var(--thumb-height,50px);border-radius:9px;display:grid;place-items:center;overflow:hidden;background:var(--raised,#10293e);flex-shrink:0;color:var(--accent-text,#4dafff)}img{width:100%;height:100%;object-fit:contain;display:block}`]})
export class ExerciseThumbComponent {
 exercise=input<Exercise>();url=signal('');failed=signal(false);
 // Unrelated set saves replace exercise records, but not the image source.
 private source=computed(()=>{const exercise=this.exercise();return exercise?.image||exercise?.thumbnailUrl||exerciseArtwork(exercise)||exerciseIllustration(exercise);});
 illustration(){return exerciseIllustration(this.exercise());}
 constructor(){effect(cleanup=>{const source=this.source();this.failed.set(false);if(typeof source==='string')this.url.set(source);else{const url=URL.createObjectURL(source);this.url.set(url);cleanup(()=>URL.revokeObjectURL(url));}});}
}
