import { Component, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { AvatarComponent } from '../shared/avatar.component';
import { Store } from '../services/store';
import { MobileNavigationService } from '../services/mobile-navigation';
import { AppSwitcherService, HUB_APPS, HubApp, HubLaunchService } from './hub-access';

/** Dentro GymTrack: l'icona del profilo apre questo foglio per passare a un'altra app o al profilo. */
@Component({
  selector: 'gt-app-switcher', standalone: true, imports: [IconComponent, AvatarComponent],
  template: `@if(switcher.open()&&switcher.available()){<div class="su-sheet-backdrop" (click)="close()"></div>
<section class="su-sheet as" role="dialog" aria-modal="true" aria-labelledby="app-switcher-title">
  <header class="su-sheet-head"><div><h2 id="app-switcher-title">Le tue app</h2><p>Passa da un'app all'altra quando vuoi.</p></div><button type="button" class="su-iconbtn" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></header>
  <div class="as-list">
    @for(app of apps;track app.id){<button type="button" class="as-row" [class.cur]="app.id==='gymtrack'" (click)="go(app.id,app.path)">
      @if(app.id==='gymtrack'){<img src="/brand/gt-modern-mark.png" alt=""/>}@else{<img [src]="app.id==='auto'?'/brand/gt-garage-mark.svg':'/brand/gt-hub-mark.svg'" alt=""/>}
      <span class="as-tx"><strong>{{app.name}}</strong><small>{{app.text}}</small></span><gt-icon [name]="app.id==='gymtrack'?'check':'chevron-right'"/>
    </button>}
  </div>
  <button type="button" class="as-row as-profile" (click)="go('gymtrack','/profilo')"><span class="as-av"><gt-avatar [photo]="store.profile().photo" [name]="store.profile().name"/></span><span class="as-tx"><strong>Profilo e impostazioni</strong><small>{{store.profile().name||'Il tuo account'}}</small></span><gt-icon name="chevron-right"/></button>
</section>}`,
  styles: [`.as{padding:18px 16px calc(18px + var(--safe-bottom,0px))}
.as-list{display:grid;gap:8px;margin-top:14px}
.as-row{display:flex;align-items:center;gap:13px;width:100%;min-height:68px;padding:11px 13px;border-radius:20px;border:1px solid color-mix(in srgb,var(--text) 10%,transparent);background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--text);font:inherit;text-align:left;cursor:pointer;box-shadow:none}
.as-row.cur{border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
.as-row img,.as-mk,.as-av{flex:none;width:46px;height:46px;border-radius:14px}
.as-mk{display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#b3a6ff,#6e6bff 60%,#5b8cff)}.as-mk.car{color:#06281c;background:linear-gradient(140deg,#8ff0c0,#37c98b 60%,#1f9d7a)}.as-mk gt-icon{width:24px;height:24px}
.as-av{border-radius:50%;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--text) 10%,transparent);font-weight:800}
.as-tx{flex:1;min-width:0}.as-tx strong{display:block;font-size:16px;font-weight:750;letter-spacing:-.3px}.as-tx small{display:block;margin-top:2px;font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-row>gt-icon{flex:none;width:18px;height:18px;color:var(--muted)}.as-row.cur>gt-icon{color:var(--accent-text,var(--accent))}
.as-profile{margin-top:14px}`],
})
export class AppSwitcherComponent {
  readonly switcher = inject(AppSwitcherService);
  readonly store = inject(Store);
  private launch = inject(HubLaunchService);
  private router = inject(Router);
  private navigation = inject(MobileNavigationService);
  readonly apps = HUB_APPS;
  constructor() {
    // Il foglio si chiude quando cambia pagina (anche con il tasto indietro).
    effect(() => { this.navigation.url(); untracked(() => this.close()); });
  }
  close() { this.switcher.open.set(false); }
  go(app: HubApp, path: string) {
    this.close();
    if (app !== 'gymtrack') this.launch.remember(app);
    void this.router.navigateByUrl(path);
  }
}
