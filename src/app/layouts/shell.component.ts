import {DataStatusComponent} from '../shared/data-status.component';
import {AppFeaturesService} from '../services/app-features';
import { WorkoutClockComponent } from '../shared/workout-clock.component';
import {WorkoutResumeService} from "../services/workout-resume";
import { AvatarComponent } from "../shared/avatar.component";
import { AuthService } from "../services/auth";
import { Store } from "../services/store";
import { PwaService } from "../services/pwa";
import { Component, effect, inject, ViewEncapsulation } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { IconComponent } from "../shared/icon.component";
import { ArchiveRecoveryComponent } from "../shared/archive-recovery.component";
import { ArchiveSyncService } from "../services/archive-sync";
import { canResumeAtHome, MobileNavigationService } from "../services/mobile-navigation";
@Component({
  selector: "gt-shell",
  standalone: true,
  imports: [DataStatusComponent,WorkoutClockComponent,RouterLink, RouterLinkActive, RouterOutlet, IconComponent, AvatarComponent, ArchiveRecoveryComponent],
  styleUrls: ['./experience.css'],
  encapsulation: ViewEncapsulation.None,
  template: ` <gt-workout-clock/><aside class="sidebar">
      <a class="brand" routerLink="/"
        ><img class="app-brand-mark" src="/brand/gt-mark.png" alt=""/>Gym<span>Track</span></a
      >
      <nav>
        @for (item of desktopNav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="selected"
            [routerLinkActiveOptions]="{ exact: true }"
            ><gt-icon [name]="item.icon" /><span>{{ item.label }}</span></a
          >
        }
      </nav>
    </aside>
    <div class="app-main">
      @if(!router.url.startsWith('/sessione')){<header class="topbar">
        <a class="mobile-brand brand" routerLink="/"><img class="app-brand-mark" src="/brand/gt-mark.png" alt=""/>Gym<span>Track</span></a
        >        <div class="topbar-right">
          <a class="avatar" routerLink="/profilo" aria-label="Apri profilo"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name" /></a>
        </div>
      </header>}
      <main [class.session-main]="router.url.startsWith('/sessione')">@if(s.ready()){<gt-data-status/>@if(auth.offlineMode()){<p class="local-mode-label">Archivio personale locale · funzioni condivise disabilitate</p>}<router-outlet />@if(router.url.split('?')[0]==='/profilo'&&auth.canManageBackups()){<gt-archive-recovery/>}}@else{<section class="card archive-opening" role="status" aria-live="polite"><h1>Apertura del tuo archivio</h1><p>Sto caricando i dati salvati su questo dispositivo…</p>@if(s.error()){<p class="notice">{{s.error()}}</p>}</section>}</main>
    </div>
    <nav class="bottom-nav" [class.calendar-navigation]="router.url.split('?')[0]==='/calendario'" aria-label="Navigazione principale" [style.grid-template-columns]="'repeat('+nav.length+',minmax(0,1fr))'">
      @for (item of nav; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="selected"
          [class.training-selected]="item.path==='/piani'&&(router.url.startsWith('/sessione')||router.url.startsWith('/allenamenti'))"
          [routerLinkActiveOptions]="{ exact: true }"
          [attr.aria-label]="item.label"
          ><gt-icon [name]="item.icon" /><span>{{ item.mobileLabel || item.label }}</span></a
        >
      }
    </nav>`,
})
export class ShellComponent {
  private resume=inject(WorkoutResumeService);private firstOpen=true;
  private navigation=inject(MobileNavigationService);
  constructor(){effect(()=>{if(!this.s.ready()||!this.firstOpen||!this.navigation.resolved())return;this.firstOpen=false;const w=this.s.draft();if(w&&canResumeAtHome(this.navigation.url(),this.navigation.resolved())&&this.resume.read(this.s.archiveKey(),w.id,this.s.data().workoutUi.find(x=>x.id===w.id),this.s.archiveRevision()))void this.router.navigateByUrl('/sessione');});effect(()=>{if(this.features?.ready()&&!this.features.nutritionEnabled()&&this.router.url.split('?')[0]==='/alimentazione')void this.router.navigateByUrl('/');});}
  router=inject(Router);
  auth = inject(AuthService);
  features=inject(AppFeaturesService,{optional:true});
  s = inject(Store);
  pwa = inject(PwaService);
  cloud = inject(ArchiveSyncService);
  backupStatus(){return ({local:'Archivio sul dispositivo',syncing:'Copia server in corso',saved:'Copia server aggiornata',offline:'Copia server in attesa della rete',conflict:'Copie da verificare'})[this.cloud.status()];}
  private navItems: {path:string;label:string;mobileLabel?:string;icon:string}[] = [
    {path:'/',label:'Home',icon:'home'},
    {path:'/piani',label:'Allenamenti',mobileLabel:'Allenati',icon:'weight'},
    {path:'/alimentazione',label:'Alimentazione',mobileLabel:'Pasti',icon:'nutrition'},
    {path:'/progressi',label:'Progressi',icon:'chart'},
    {path:'/profilo',label:'Profilo',icon:'user'},
  ];
  get nav(){const items=this.navItems.filter(item=>item.path!=='/alimentazione'||this.features?.nutritionEnabled());if(this.router.url.split('?')[0]==='/calendario')items.splice(2,0,{path:'/calendario',label:'Calendario',icon:'calendar'});return items;}
  get desktopNav(){return [...this.nav.filter(item=>item.path!=='/calendario'),{path:'/calendario',label:'Calendario',icon:'calendar'},{path:'/allenamenti',label:'Storico',icon:'clock'},{path:'/recupero',label:'Recovery',icon:'moon'},{path:'/focus-muscolare',label:'Focus muscolare',icon:'activity'}];}
}
