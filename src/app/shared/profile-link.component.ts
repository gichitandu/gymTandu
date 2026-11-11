import {Component,inject} from '@angular/core';
import {RouterLink} from '@angular/router';
import {IconComponent} from './icon.component';
import {AppSwitcherService} from '../hub/hub-access';

/** Icona «Le tue app»: quattro tessere nei colori di GymTrack, GT Hub, GT Garage e del menu. */
@Component({selector:'gt-apps-mark',standalone:true,template:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2.4" class="a"/><rect x="13" y="3" width="8" height="8" rx="2.4" class="b"/><rect x="3" y="13" width="8" height="8" rx="2.4" class="c"/><rect x="13" y="13" width="8" height="8" rx="2.4" class="d"/></svg>`,
 styles:[`:host{display:block;width:22px;height:22px}svg{display:block;width:100%;height:100%}.a{fill:var(--accent,#f39ac7)}.b{fill:#8f7cff}.c{fill:#4fd1a5}.d{fill:color-mix(in srgb,var(--text,#fff) 38%,transparent)}`]})
export class AppsMarkComponent {}

/** In alto a destra in ogni sezione, affiancati: ingranaggio per Profilo e impostazioni e, per chi ha più app, «Le tue app». */
@Component({selector:'gt-profile-link',standalone:true,imports:[RouterLink,IconComponent,AppsMarkComponent],template:`<span class="pl"><a class="su-iconbtn su-settings" routerLink="/profilo" aria-label="Profilo e impostazioni" title="Profilo e impostazioni"><gt-icon name="settings"/></a>@if(switcher.available()){<button type="button" class="su-iconbtn su-apps" (click)="switcher.open.set(true)" aria-haspopup="dialog" aria-label="Le tue app" title="Le tue app"><gt-apps-mark/></button>}</span>`,styles:[`:host{display:contents}.pl{display:inline-flex;align-items:center;gap:6px;flex:none}`]})
export class ProfileLinkComponent {readonly switcher=inject(AppSwitcherService);}
