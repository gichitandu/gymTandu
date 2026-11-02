import {Component,ElementRef,computed,effect,input,signal,viewChild} from '@angular/core';
import {Exercise} from '../models/domain';
import {movementKind,exerciseArtwork} from '../services/exercise-visual';
@Component({selector:'gt-exercise-motion',standalone:true,template:`
@if(kind()){
<button type="button" class="ghost motion-opener" (click)="open.set(!open())" [attr.aria-expanded]="open()">{{open()?'Chiudi dimostrazione':'▷ Tecnica e movimento animato'}}</button>
@if(open()){
<section #stage class="motion-stage" [attr.data-movement]="kind()" data-autoplay="false" data-view="illustration">
 <div class="motion-view-tabs"><button type="button" data-motion-view="illustration" class="selected">Illustrazione</button><button type="button" data-motion-view="motion">Movimento animato</button></div>
 <div class="movement-visual"><img class="movement-poster" [src]="artwork()" [alt]="exercise()?.name+' · illustrazione'"/><div class="movement-canvas"></div><span class="motion-badge">Dimostrazione del movimento</span><button type="button" data-motion-reset aria-label="Reimposta visuale">↺</button><span class="motion-loading" role="status">{{issue()||'Preparazione movimento…'}}</span></div>
 <div class="motion-controls"><button type="button" data-motion-play aria-label="Riproduci o metti in pausa il movimento">▶ Riproduci</button><span data-motion-label>Movimento guidato</span><button type="button" data-motion-speed aria-label="Velocità di riproduzione">1×</button></div>
 <label class="motion-scrub"><span class="sr-only">Posizione nel movimento</span><input data-motion-scrub type="range" min="0" max="100" value="0" aria-label="Posizione nel movimento"/></label>
 <div class="motion-phases"><button type="button" data-motion-phase="0">Inizio</button><button type="button" data-motion-phase=".5">Fase centrale</button><button type="button" data-motion-phase=".9">Ritorno</button><small>Trascina per ruotare</small></div>
</section><p class="subtle motion-note">Dimostrazione illustrativa. Leggi anche le indicazioni della scheda e la configurazione dell’attrezzo.</p>
}}
`})
export class ExerciseMotionComponent {
 exercise=input<Exercise>();kind=computed(()=>movementKind(this.exercise()));artwork=computed(()=>exerciseArtwork(this.exercise()));open=signal(false);issue=signal('');stage=viewChild<ElementRef<HTMLElement>>('stage');
 constructor(){effect(cleanup=>{const element=this.stage()?.nativeElement,type=this.kind();if(!element||!type)return;let cancelled=false,dispose:(()=>void)|undefined;cleanup(()=>{cancelled=true;dispose?.();});const url='/training/movement.js';this.issue.set('');void import(/* @vite-ignore */ url).then((module:{mountMovement:(stage:HTMLElement,type:string)=>(()=>void)})=>{if(!cancelled)dispose=module.mountMovement(element,type);}).catch(()=>{if(!cancelled){this.issue.set('Animazione indisponibile. Riprova con una connessione attiva.');element.dataset['failed']='true';}});});}
}
