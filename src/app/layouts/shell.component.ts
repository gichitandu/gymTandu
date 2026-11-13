import {BOTTOM_NAV_ITEMS, BottomNavigationComponent, NUTRITION_NAV_ITEM, navigationDesignId, navigationSection} from '../shared/bottom-navigation.component';
import {DataStatusComponent} from '../shared/data-status.component';
import {DesignPageDirective, DESIGN_DIRECTIVES} from '../design/design-directives';
import {AppFeaturesService} from '../services/app-features';
import { WorkoutClockComponent } from '../shared/workout-clock.component';
import {WorkoutResumeService} from "../services/workout-resume";
import { AvatarComponent } from "../shared/avatar.component";
import { AuthService } from "../services/auth";
import { Store } from "../services/store";
import { PwaService } from "../services/pwa";
import { Component, computed, effect, inject, ViewEncapsulation } from "@angular/core";
import { Router, RouterLink, RouterOutlet } from "@angular/router";
import { IconComponent } from "../shared/icon.component";
import { ArchiveRecoveryComponent } from "../shared/archive-recovery.component";
import { ArchiveSyncService } from "../services/archive-sync";
import { canResumeAtHome, MobileNavigationService } from "../services/mobile-navigation";
import { AppSwitcherService, HubLaunchService } from '../hub/hub-access';
import { AppSwitcherComponent } from '../hub/app-switcher.component';
import { AppsMarkComponent } from '../shared/profile-link.component';
import { InstallAppComponent } from '../shared/install-app.component';
@Component({
  selector: "gt-shell",
  host: {class: "design-v2 photo-controls", "[class.reference-pages]":"referencePage()"},
  standalone: true,
  hostDirectives: [DesignPageDirective],
  imports: [...DESIGN_DIRECTIVES,BottomNavigationComponent,DataStatusComponent,WorkoutClockComponent,RouterLink, RouterOutlet, IconComponent, AvatarComponent, ArchiveRecoveryComponent, AppSwitcherComponent, AppsMarkComponent, InstallAppComponent],
  styleUrls: ['./experience.css'],
  encapsulation: ViewEncapsulation.None,
  template: ` <gt-workout-clock/><aside class="sidebar">
      <a class="brand" routerLink="/"
        ><img class="app-brand-mark" src="/brand/gt-header-mark.svg" alt="" width="36" height="36"/>Gym<span>Track</span></a
      >
      <nav>
        @for (item of desktopNav(); track item.path) {
          <a
            [gtDesign]="navigationDesignId(item.path)"
            [routerLink]="item.path"
            [class.selected]="isSection(item.path)"
            ><gt-icon [name]="item.icon" [gtDesignIcon]="navigationDesignId(item.path)" /><span [gtDesignLabel]="navigationDesignId(item.path)" [gtDesignLabelDefault]="item.label">{{ item.label }}</span></a
          >
        }
      </nav>
    </aside>
    <div class="app-main">
      @if(!router.url.startsWith('/sessione')){<header class="topbar">
        <a class="mobile-brand brand" routerLink="/"><img class="app-brand-mark" src="/brand/gt-header-mark.svg" alt="" width="36" height="36"/>Gym<span>Track</span></a
        >        <div class="topbar-right"><gt-data-status class="header-data-status"/><gt-install-app variant="compact"/>
          @if(switcher.available()){<button type="button" class="su-iconbtn su-apps topbar-apps" (click)="switcher.open.set(true)" aria-haspopup="dialog" aria-label="Le tue app" title="Le tue app"><gt-apps-mark/></button>}<a class="avatar" routerLink="/profilo" aria-label="Apri profilo"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name" /></a>
        </div>
      </header>}
      <main [class.session-main]="router.url.startsWith('/sessione')">@if(s.ready()){@if(router.url.startsWith('/sessione')){<gt-data-status/>}@if(referencePage()&&(pwa.updateReady()||pwa.releases.updateReady())){<gt-data-status class="reference-update-status"/>}@if(auth.offlineMode()){<p class="local-mode-label">Archivio personale locale · funzioni condivise disabilitate</p>}<router-outlet />@if(referencePage()){<gt-data-status class="reference-page-status"/>}@if(router.url.split('?')[0]==='/profilo'&&auth.canManageBackups()){<gt-archive-recovery/>}}@else{<section class="card archive-opening" role="status" aria-live="polite"><h1>Apertura del tuo archivio</h1><p>Sto caricando i dati salvati su questo dispositivo…</p>@if(s.error()){<p class="notice">{{s.error()}}</p>}</section>}</main>
    </div>
    @if(!(router.url.startsWith('/sessione')&&s.draft())){<gt-bottom-navigation [items]="nav()"/>}<gt-app-switcher/>`,
})
export class ShellComponent {
  navigationDesignId = navigationDesignId;
  private resume=inject(WorkoutResumeService);
  private navigation=inject(MobileNavigationService);
  private launch=inject(HubLaunchService);
  readonly switcher=inject(AppSwitcherService);
  constructor(){effect(()=>{if(!this.s.ready()||!this.navigation.resolved()||!this.launch.claimFirstOpen(this.s.archiveKey()))return;const w=this.s.draft();if(w&&canResumeAtHome(this.navigation.url(),this.navigation.resolved())&&this.resume.read(this.s.archiveKey(),w.id,this.s.data().workoutUi.find(x=>x.id===w.id),this.s.archiveRevision())){void this.router.navigateByUrl('/sessione');return;}
    // Super Admin: dopo l'accesso scelta tra GymTrack e GT Hub (o l'ultima app usata).
    const target=canResumeAtHome(this.navigation.url(),this.navigation.resolved())&&!w?this.launch.startTarget():null;if(target)void this.router.navigateByUrl(target);});effect(()=>{if(this.features?.ready()&&!this.features.nutritionEnabled()&&this.router.url.split('?')[0]==='/alimentazione')void this.router.navigateByUrl('/');});}
  router=inject(Router);
  referencePage(){return ['/','/piani','/progressi','/catalogo','/calendario','/allenamenti','/alimentazione'].includes(this.navigation.url().split('?')[0]);}
  auth = inject(AuthService);
  features=inject(AppFeaturesService,{optional:true});
  s = inject(Store);
  pwa = inject(PwaService);
  cloud = inject(ArchiveSyncService);
  backupStatus(){return ({local:'Archivio sul dispositivo',syncing:'Copia server in corso',saved:'Copia server aggiornata',offline:'Copia server in attesa della rete',conflict:'Copie da verificare'})[this.cloud.status()];}
  /** Barra in basso: Oggi · Schede · Calendario · Progressi (+ Pasti se attiva). Profilo e impostazioni si aprono dall’ingranaggio in alto. */
  readonly nav=computed(()=>this.features?.nutritionEnabled()?[...BOTTOM_NAV_ITEMS,NUTRITION_NAV_ITEM]:BOTTOM_NAV_ITEMS);
  readonly desktopNav=computed(()=>[...this.nav(),{path:'/profilo',label:'Profilo',icon:'user'}]);
  isSection(path:string){return navigationSection(this.navigation.url())===path;}
}
