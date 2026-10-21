import {Component,input,output} from '@angular/core';
export type ExerciseScope='all'|'favorites'|'recent';
@Component({selector:'gt-exercise-scope',standalone:true,template:`<div class="segmented" role="group" aria-label="Il tuo catalogo"><button type="button" [class.active]="value()==='all'" [attr.aria-pressed]="value()==='all'" (click)="choose.emit('all')">Tutti</button><button type="button" [class.active]="value()==='favorites'" [attr.aria-pressed]="value()==='favorites'" (click)="choose.emit('favorites')">★ Preferiti</button><button type="button" [class.active]="value()==='recent'" [attr.aria-pressed]="value()==='recent'" (click)="choose.emit('recent')">Recenti</button></div>`})
export class ExerciseScopeComponent{value=input<ExerciseScope>('all');choose=output<ExerciseScope>();}
