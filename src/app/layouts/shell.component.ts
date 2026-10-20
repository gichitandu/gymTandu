import { AuthService } from "../services/auth";
import { Store } from "../services/store";
import { PwaService } from "../services/pwa";
import { Component, inject } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { IconComponent } from "../shared/icon.component";
@Component({
  selector: "gt-shell",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  template: ` <aside class="sidebar">
      <a class="brand" routerLink="/"
        ><span class="brand-icon"><gt-icon name="weight" /></span>Gym<span
          >Track</span
        ><i></i></a
      ><span class="nav-caption">IL TUO SPAZIO</span>
      <nav>
        @for (item of nav; track item.path) {
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
        <a class="mobile-brand brand" routerLink="/">Gym<span>Track</span></a
        ><span class="desktop-only breadcrumb"
          >IL TUO DIARIO DI ALLENAMENTO</span
        >
        <div class="topbar-right">
          <span class="offline-label"><i></i> Archivio locale</span
          ><a class="avatar" routerLink="/profilo" aria-label="Apri profilo">{{
            s.profile().name.slice(0, 2).toUpperCase()
          }}</a>
        </div>
      </header>
      <main><router-outlet /></main>
      <footer>
        OGNI RIPETIZIONE CONTA. <span>Costruisci il tuo prossimo livello.</span>
      </footer>
    </div>
    <nav class="bottom-nav">
      @for (item of nav; track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="selected"
          [routerLinkActiveOptions]="{ exact: true }"
          ><gt-icon [name]="item.icon" /><span>{{ item.label }}</span></a
        >
      }
    </nav>`,
})
export class ShellComponent {
  auth = inject(AuthService);
  s = inject(Store);
  pwa = inject(PwaService);
  nav = [
    { path: "/", label: "Home", icon: "home" },
    { path: "/piani", label: "Piani", icon: "plans" },
    { path: "/allenamenti", label: "Allenamenti", icon: "weight" },
    { path: "/progressi", label: "Progressi", icon: "chart" },
    { path: "/profilo", label: "Profilo", icon: "user" },
  ];
}
