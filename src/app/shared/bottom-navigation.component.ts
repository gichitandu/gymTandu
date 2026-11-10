import { Component, inject, input } from "@angular/core";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { filter, map } from "rxjs";
import { IconComponent } from "./icon.component";
import { DesignControlDirective } from "../design/design-directives";
import { DesignIconDirective } from "../design/design-directives";
import { DESIGN_CONTEXT, DesignRuntime } from "../design/design-runtime";
import { resolveDesignLabel } from "../../../shared/design-system.js";
export interface BottomNavItem {
  path: string;
  label: string;
  mobileLabel?: string;
  icon: string;
}
export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { path: "/", label: "Oggi", icon: "home" },
  { path: "/piani", label: "Schede", icon: "weight" },
  { path: "/calendario", label: "Calendario", icon: "calendar" },
  { path: "/progressi", label: "Progressi", icon: "chart" },
];
/** Voce opzionale: compare solo se la sezione Pasti è attiva. */
export const NUTRITION_NAV_ITEM: BottomNavItem = { path: "/alimentazione", label: "Pasti", icon: "nutrition" };
/** Sezione della barra a cui appartiene una pagina: le pagine interne evidenziano la loro sezione. */
export function navigationSection(url: string): string {
  const path = (url || "/").split(/[?#]/, 1)[0] || "/";
  if (/^\/(piani|piano\/|anteprima-allenamento|importa-excel|catalogo|esercizio\/|sessione)/.test(path)) return "/piani";
  if (/^\/(calendario|allenamenti|riepilogo\/|recupera-allenamenti)/.test(path)) return "/calendario";
  if (/^\/(progressi|analisi|focus-muscolare|recupero|sonno|riposo)/.test(path)) return "/progressi";
  if (/^\/alimentazione/.test(path)) return "/alimentazione";
  if (/^\/(profilo|utenti|design-studio)/.test(path)) return "/profilo";
  return path === "/" ? "/" : "";
}
export const navigationDesignId = (path: string) => ({
  "/": "navigation.home", "/piani": "navigation.training",
  "/progressi": "navigation.progress", "/profilo": "navigation.profile",
} as Record<string, string>)[path] || "";
@Component({
  selector: "gt-bottom-navigation",
  standalone: true,
  imports: [
    RouterLink,
    IconComponent,
    DesignControlDirective,
    DesignIconDirective,
  ],
  styles: [":host{display:contents}"],
  template: ` <nav
    class="bottom-nav"
    [class.calendar-navigation]="activeUrl().split('?')[0] === '/calendario'"
    aria-label="Navigazione principale"
    [style.grid-template-columns]="
      'repeat(' + items().length + ',minmax(0,1fr))'
    "
  >
    @for (item of items(); track item.path) {
      <a
        [gtDesign]="navigationDesignId(item.path)"
        [routerLink]="item.path"
        [class.selected]="isActive(item)"
        [attr.aria-current]="isActive(item) ? 'page' : null"
        [attr.aria-label]="label(item)"
        ><gt-icon [name]="item.icon" [gtDesignIcon]="navigationDesignId(item.path)" /><span>{{ label(item) }}</span></a
      >
    }
  </nav>`,
})
export class BottomNavigationComponent {
  private router = inject(Router);
  private runtime = inject(DesignRuntime);
  private context = inject(DESIGN_CONTEXT, { optional: true });
  items = input<BottomNavItem[]>(BOTTOM_NAV_ITEMS);
  previewPath = input("");
  /** URL corrente come signal: la barra si aggiorna a ogni navigazione anche senza zone.js. */
  private routeUrl = toSignal(this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(event => event.urlAfterRedirects)), { initialValue: this.router.url || "/" });
  activeUrl() {
    return this.previewPath() || this.routeUrl();
  }
  navigationDesignId = navigationDesignId;
  isActive(item: BottomNavItem) {
    return navigationSection(this.activeUrl()) === item.path;
  }
  label(item: BottomNavItem) {
    return resolveDesignLabel(this.context?.config() || this.runtime.config(),
      navigationDesignId(item.path), item.mobileLabel || item.label);
  }
}
