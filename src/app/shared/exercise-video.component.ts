import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { A11yModule } from '@angular/cdk/a11y';
import { Exercise } from '../models/domain';
import { techniqueVideoFor } from '../services/technique-videos';
@Component({selector:'gt-exercise-video',standalone:true,imports:[A11yModule],template:`
@if(technique()||exercise()?.videoUrl) {<button class="video-button ghost" type="button" (click)="opened.set(true)">▷ Video dimostrativo</button>}
@if(opened() && exercise();as e) {
<div class="modal-backdrop" (click)="backdrop($event)"><section class="modal video-modal" role="dialog" aria-modal="true" [attr.aria-labelledby]="'video-'+e.id" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="opened.set(false)">
<div class="modal-head"><h2 [id]="'video-'+e.id">{{e.name}}</h2><button type="button" aria-label="Chiudi video" (click)="opened.set(false)">×</button></div>
@if(technique();as t) {<video class="technique-video" controls playsinline preload="metadata" [poster]="t.poster" [attr.aria-label]="'Video tecnico: '+e.name"><source [src]="t.video" type="video/mp4"><track kind="subtitles" srclang="it" label="Italiano" [src]="t.subtitles"></video>
<p class="subtle" style="margin-top:14px">Animazione schematica 3D, senza audio. Le ampiezze sono indicative: adatta carico e movimento al tuo livello.</p>}
@if(embed()) {<iframe [src]="embed()" [title]="'Video dimostrativo: '+e.name" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>}
@if(e.videoUrl) {<p class="subtle" style="margin-top:14px">{{e.videoTitle||e.name}} {{e.videoChannel ? ' · '+e.videoChannel:''}}</p>}
<p class="subtle" style="margin-top:8px">{{e.description}}</p>
<div class="actions">@if(e.videoUrl) {<a class="button primary" [href]="e.videoUrl" target="_blank" rel="noopener noreferrer">Apri il video originale ↗</a>}<button (click)="opened.set(false)">Chiudi</button></div>
</section></div>}
`})
export class ExerciseVideoComponent {
 exercise=input<Exercise>();opened=signal(false);technique=computed(()=>techniqueVideoFor(this.exercise()));private sanitizer=inject(DomSanitizer);
 embed=computed(()=>{const value=this.exercise()?.videoUrl;if(!value)return null;try{const u=new URL(value);const id=u.hostname==='youtu.be'?u.pathname.slice(1):['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname)?u.searchParams.get('v'):null;return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?this.sanitizer.bypassSecurityTrustResourceUrl('https://www.youtube-nocookie.com/embed/'+id):null;}catch{return null;}});
 backdrop(e:MouseEvent){if(e.currentTarget===e.target)this.opened.set(false);}
}
