import { Component, computed, effect, input, signal } from '@angular/core';
import { Exercise } from '../models/domain';
import { IconComponent } from './icon.component';
import {exerciseArtwork,exerciseThumbnail} from '../services/exercise-visual';
import { exerciseIllustration } from '../services/exercise-illustration';
@Component({selector:'gt-exercise-thumb',standalone:true,imports:[IconComponent],template:`@if(exercise()){<img [src]="failed()?(fallbackFailed()?illustration():fallback()):url()" [alt]="(failed()||visual().illustration?'Illustrazione del movimento: ':'Immagine: ')+exercise()?.name" loading="lazy" referrerpolicy="no-referrer" (error)="imageFailed()"/>}@else{<gt-icon name="weight"/>}`,styles:[`:host{width:var(--thumb-width,60px);height:var(--thumb-height,50px);border-radius:9px;display:grid;place-items:center;overflow:hidden;background:var(--raised,#10293e);flex-shrink:0;color:var(--accent-text,#4dafff)}img{width:100%;height:100%;object-fit:contain;display:block}`]})
export class ExerciseThumbComponent {
 exercise=input<Exercise>();url=signal('');failed=signal(false);fallbackFailed=signal(false);
 visual=computed(()=>exerciseThumbnail(this.exercise()));
 // Unrelated set saves replace exercise records, but not the image source.
 private source=computed(()=>this.visual().source);
 illustration(){return exerciseIllustration(this.exercise());}
 fallback(){return exerciseArtwork(this.exercise())||this.illustration();}
 imageFailed(){if(this.failed())this.fallbackFailed.set(true);else{this.fallbackFailed.set(this.url()===this.fallback());this.failed.set(true);}}
 constructor(){effect(cleanup=>{const source=this.source();this.failed.set(false);this.fallbackFailed.set(false);if(typeof source==='string')this.url.set(source);else{const url=URL.createObjectURL(source);this.url.set(url);cleanup(()=>URL.revokeObjectURL(url));}});}
}
