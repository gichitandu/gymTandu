import { Component, computed, effect, input, signal } from '@angular/core';
@Component({selector:'gt-avatar',standalone:true,template:`@if(url()){<img [src]="url()" [alt]="'Foto profilo di '+name()"/>}@else{<span aria-hidden="true">{{initials()}}</span>}`,styles:[`:host{display:grid;place-items:center;width:100%;height:100%;overflow:hidden;border-radius:inherit}img{width:100%;height:100%;object-fit:cover;display:block}`]})
export class AvatarComponent {
 photo=input<Blob|undefined>();name=input('Atleta');url=signal('');
 initials=computed(()=>{const words=this.name().trim().split(/\s+/).filter(Boolean);return (words.length>1?words[0][0]+words[words.length-1][0]:(words[0]||'Atleta').slice(0,2)).toUpperCase();});
 constructor(){effect(cleanup=>{const photo=this.photo();if(!photo){this.url.set('');return;}const url=URL.createObjectURL(photo);this.url.set(url);cleanup(()=>URL.revokeObjectURL(url));});}
}
