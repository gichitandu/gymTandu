import {WorkoutResumeService} from "../services/workout-resume";
import { AvatarComponent } from "../shared/avatar.component";
import { AuthService } from "../services/auth";
import { Store } from "../services/store";
import { PwaService } from "../services/pwa";
import { Component, effect, inject, ViewEncapsulation } from "@angular/core";
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { IconComponent } from "../shared/icon.component";
@Component({
  selector: "gt-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, AvatarComponent],
  styleUrls: ['./experience.css'],
  encapsulation: ViewEncapsulation.None,
  template: ` <aside class="sidebar">
      <a class="brand" routerLink="/"
        ><img class="app-brand-mark" src="/brand/gt-mark.png" alt=""/>Gym<span>Track</span></a
      ><div class="sidebar-signature" aria-hidden="true"><i></i><i></i><i></i><span>OGNI RIPETIZIONE.<br/>UNA NUOVA VERSIONE DI TE.</span></div><span class="nav-caption">IL TUO SPAZIO</span>
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
      <div class="sidebar-bottom">
        <div class="local-badge">
          <gt-icon name="shield" />
          <div>
            <b>Solo sul tuo dispositivo</b
            ><small>I tuoi dati. Il tuo controllo.</small>
          </div>
          <i></i>
        </div>
        <span class="version">GYMTRACK / IL TUO PROSSIMO LIVELLO</span>
      </div>
    </aside>
    <div class="app-main">
      <header class="topbar">
        <a class="mobile-brand brand" routerLink="/"><img class="app-brand-mark" src="/brand/gt-mark.png" alt=""/>Gym<span>Track</span></a
        ><span class="desktop-only breadcrumb"
          ><i class="brand-coordinate"></i> IL TUO PROSSIMO LIVELLO, OGNI GIORNO.</span
        >
        <div class="topbar-right">
          <a class="header-calendar" routerLink="/calendario" aria-label="Apri calendario"><gt-icon name="calendar"/></a><span class="offline-label"><i></i> Archivio locale</span
          ><a class="avatar" routerLink="/profilo" aria-label="Apri profilo"><gt-avatar [photo]="s.profile().photo" [name]="s.profile().name" /></a>
        </div>
      </header>
      <main>@if(auth.offlineMode()){<p class="local-mode-label">Archivio personale locale · funzioni condivise disabilitate</p>}<router-outlet /></main>
      <div class="secondary-links"><a routerLink="/calendario">Calendario ↗</a><a routerLink="/allenamenti">Storico allenamenti ↗</a><a routerLink="/catalogo">Esercizi ↗</a></div><footer>
        OGNI RIPETIZIONE CONTA. <span>Costruisci il tuo prossimo livello.</span>
      </footer>
    </div>
    <nav class="bottom-nav" aria-label="Navigazione principale">
      @for (item of nav; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="selected"
          [class.training-selected]="item.path==='/piani'&&(router.url.startsWith('/sessione')||router.url.startsWith('/allenamenti'))"
          [routerLinkActiveOptions]="{ exact: true }"
          ><gt-icon [name]="item.icon" /><span>{{ item.label }}</span></a
        >
      }
    </nav>`,
})
export class ShellComponent {
  private resume=inject(WorkoutResumeService);private firstOpen=true;
  constructor(){effect(()=>{if(!this.s.ready()||!this.firstOpen)return;this.firstOpen=false;const w=this.s.draft();if(w&&location.pathname==='/'&&this.resume.read(this.s.archiveKey(),w.id,this.s.data().workoutUi.find(x=>x.id===w.id),this.s.archiveRevision()))void this.router.navigateByUrl('/sessione');});}
  router=inject(Router);
  auth = inject(AuthService);
  s = inject(Store);
  pwa = inject(PwaService);
  nav = [
    {path:'/',label:'Home',icon:'home'},
    {path:'/piani',label:'Allenamenti',icon:'weight'},
    {path:'/alimentazione',label:'Alimentazione',icon:'nutrition'},
    {path:'/progressi',label:'Progressi',icon:'chart'},
    {path:'/profilo',label:'Profilo',icon:'user'},
  ];
  desktopNav=[...this.nav,{path:'/calendario',label:'Calendario',icon:'calendar'},{path:'/allenamenti',label:'Storico',icon:'clock'}];
}
