import { Component, effect, input, signal } from '@angular/core';
@Component({selector:'gt-avatar',standalone:true,template:`@if(url()){<img [src]="url()" [alt]="'Foto profilo di '+name()"/>}@else{<span aria-hidden="true">{{name().slice(0,2).toUpperCase()}}</span>}`,styles:[`:host{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;border-radius:inherit}img{width:100%;height:100%;object-fit:cover;display:block}`]})
export class AvatarComponent {
 photo=input<Blob|undefined>();name=input('Atleta');url=signal('');
 constructor(){effect(cleanup=>{const photo=this.photo();if(!photo){this.url.set('');return;}const url=URL.createObjectURL(photo);this.url.set(url);cleanup(()=>URL.revokeObjectURL(url));});}
}
