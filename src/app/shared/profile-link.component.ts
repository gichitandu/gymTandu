import {Component,inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {Store} from '../services/store';
import {AvatarComponent} from './avatar.component';

/** La tua foto in alto a destra: apre il Profilo (non è più una voce della barra in basso). */
@Component({selector:'gt-profile-link',standalone:true,imports:[RouterLink,AvatarComponent],template:`<a class="su-avatar" routerLink="/profilo" aria-label="Apri il profilo e le impostazioni"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name"/></a>`,styles:[`:host{display:contents}`]})
export class ProfileLinkComponent { s=inject(Store); }
