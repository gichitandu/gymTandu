import { Component, effect, input, signal } from '@angular/core';
import { Exercise } from '../models/domain';
import { IconComponent } from './icon.component';
@Component({selector:'gt-exercise-thumb',standalone:true,imports:[IconComponent],template:`@if(url()&&!failed()){<img [src]="url()" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="failed.set(true)"/>}@else{<gt-icon name="weight"/>}`,styles:[`:host{width:var(--thumb-width,60px);height:var(--thumb-height,50px);border-radius:9px;display:grid;place-items:center;overflow:hidden;background:#10293e;flex-shrink:0;color:#4dafff}img{width:100%;height:100%;object-fit:cover;display:block}`]})
export class ExerciseThumbComponent {exercise=input<Exercise>();url=signal('');failed=signal(false);constructor(){effect(cleanup=>{const e=this.exercise();this.failed.set(false);if(e?.image){const url=URL.createObjectURL(e.image);this.url.set(url);cleanup(()=>URL.revokeObjectURL(url));}else this.url.set(e?.thumbnailUrl||'');});}}
