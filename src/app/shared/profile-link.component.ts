import {Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {IconComponent} from './icon.component';

/** Ingranaggio in alto a destra in ogni sezione: apre Profilo e impostazioni (non sono una voce della barra in basso). */
@Component({selector:'gt-profile-link',standalone:true,imports:[RouterLink,IconComponent],template:`<a class="su-iconbtn su-settings" routerLink="/profilo" aria-label="Profilo e impostazioni" title="Profilo e impostazioni"><gt-icon name="settings"/></a>`,styles:[`:host{display:contents}`]})
export class ProfileLinkComponent {}
