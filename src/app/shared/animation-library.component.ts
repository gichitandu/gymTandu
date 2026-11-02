import {Component,computed,signal} from '@angular/core';
import type {Exercise} from '../models/domain';
import {ExerciseMotionComponent} from './exercise-motion.component';
import {IconComponent} from './icon.component';

let libraryCount=0;
const reference=(id:string,name:string,equipment:string,muscle:string):Exercise=>({
 id:'animation-reference-'+id,name,equipment,muscleGroupId:'reference-'+muscle,secondaryMuscleIds:[],
 description:'',tags:[],active:true,createdAt:'2026-11-02T00:00:00.000Z',loadMode:'external',
});
/** Read-only demonstration references; these never enter the personal archive. */
const demonstrations=[
 {id:'bench',label:'Panca piana con bilanciere',exercise:reference('bench','Panca piana','Bilanciere','chest')},
 {id:'squat',label:'Squat con bilanciere',exercise:reference('squat','Squat','Bilanciere','legs')},
 {id:'curl',label:'Curl con manubri',exercise:reference('curl','Curl con manubri','Manubri','arms')},
 {id:'lat',label:'Lat machine',exercise:reference('lat','Lat machine','Cavi','back')},
 {id:'shoulder',label:'Spinte con manubri sopra la testa',exercise:reference('shoulder','Shoulder press','Manubri','shoulders')},
 {id:'fly',label:'Croci ai cavi',exercise:reference('fly','Croci ai cavi','Cavi','chest')},
 {id:'lateral',label:'Alzate laterali con manubri',exercise:reference('lateral','Alzate laterali','Manubri','shoulders')},
] as const;

@Component({
 selector:'gt-animation-library',standalone:true,imports:[ExerciseMotionComponent,IconComponent],
 styleUrl:'./animation-library.component.css',
 template:`<button type="button" class="animation-library-toggle" (click)="open.set(!open())" [attr.aria-expanded]="open()" [attr.aria-controls]="panelId">
  <span class="animation-library-play"><gt-icon name="play"/></span>
  <span class="animation-library-copy"><strong>Animazioni guidate</strong><small>Tecnica, una fase alla volta</small></span>
  <span class="animation-library-count" aria-label="7 movimenti disponibili">{{demonstrations.length}}</span>
  <gt-icon class="animation-library-chevron" name="back" [class.expanded]="open()"/>
 </button>
 @if(open()){
  <section class="animation-library-panel" [id]="panelId" aria-label="Libreria delle animazioni guidate">
   <p class="animation-library-intro">Scegli il movimento per guardare la sequenza e le singole fasi.</p>
   <label [for]="panelId+'-movement'">Movimento<select [id]="panelId+'-movement'" [value]="selectedId()" (change)="select($event)">@for(item of demonstrations;track item.id){<option [value]="item.id">{{item.label}}</option>}</select></label>
   <gt-exercise-motion [exercise]="selected().exercise" [showSequence]="true"/>
   <p class="animation-library-note">Le sette dimostrazioni restano disponibili anche quando il tuo catalogo usa nomi diversi.</p>
  </section>
 }`,
})
export class AnimationLibraryComponent {
 readonly demonstrations=demonstrations;
 readonly panelId='animation-library-'+(++libraryCount);
 open=signal(false);selectedId=signal<string>('bench');
 selected=computed(()=>demonstrations.find(item=>item.id===this.selectedId())||demonstrations[0]);
 select(event:Event){const id=(event.target as HTMLSelectElement).value;if(demonstrations.some(item=>item.id===id))this.selectedId.set(id);}
}
