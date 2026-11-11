import {Component,inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {IconComponent} from './icon.component';
import {AvatarComponent} from './avatar.component';
import {Store} from '../services/store';
import {AppSwitcherService} from '../hub/hub-access';

/** In alto a destra in ogni sezione: ingranaggio per Profilo e impostazioni e, per chi ha più app, la foto profilo che apre il cambio app. */
@Component({selector:'gt-profile-link',standalone:true,imports:[RouterLink,IconComponent,AvatarComponent],template:`<a class="su-iconbtn su-settings" routerLink="/profilo" aria-label="Profilo e impostazioni" title="Profilo e impostazioni"><gt-icon name="settings"/></a>@if(switcher.available()){<button type="button" class="su-iconbtn su-apps" (click)="switcher.open.set(true)" aria-haspopup="dialog" aria-label="Cambia app" title="Cambia app"><gt-avatar [photo]="store.profile().photo" [name]="store.profile().name"/></button>}`,styles:[`:host{display:contents}.su-apps{border-radius:50%!important;overflow:hidden;padding:2px;font-weight:800;font-size:14px;border-color:color-mix(in srgb,var(--accent) 55%,transparent)}.su-apps gt-avatar{border-radius:50%}`]})
export class ProfileLinkComponent {readonly switcher=inject(AppSwitcherService);readonly store=inject(Store);}
