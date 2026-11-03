import { Component, inject, input } from "@angular/core";
import { Router, RouterLink, RouterLinkActive } from "@angular/router";
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
  { path: "/", label: "Home", icon: "home" },
  {
    path: "/piani",
    label: "Allenamenti",
    mobileLabel: "Allenati",
    icon: "weight",
  },
  { path: "/progressi", label: "Progressi", icon: "chart" },
  { path: "/profilo", label: "Profilo", icon: "user" },
];
export const navigationDesignId = (path: string) => ({
  "/": "navigation.home", "/piani": "navigation.training",
  "/progressi": "navigation.progress", "/profilo": "navigation.profile",
} as Record<string, string>)[path] || "";
@Component({
  selector: "gt-bottom-navigation",
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
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
        routerLinkActive="selected"
        [class.training-selected]="
          item.path === '/piani' &&
          (activeUrl().startsWith('/sessione') ||
            activeUrl().startsWith('/allenamenti'))
        "
        [routerLinkActiveOptions]="{ exact: true }"
        [class.selected]="
          previewPath()
            ? previewPath() === item.path
            : activeUrl().split('?')[0] === item.path
        "
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
  activeUrl() {
    return this.previewPath() || this.router.url;
  }
  navigationDesignId = navigationDesignId;
  label(item: BottomNavItem) {
    return resolveDesignLabel(this.context?.config() || this.runtime.config(),
      navigationDesignId(item.path), item.mobileLabel || item.label);
  }
}
