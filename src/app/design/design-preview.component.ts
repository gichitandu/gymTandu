import { BottomNavigationComponent } from "../shared/bottom-navigation.component";
import { NgComponentOutlet } from "@angular/common";
import {
  Component,
  ElementRef,
  Type,
  afterRenderEffect,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import {
  DesignConfig,
  DEFAULT_DESIGN,
  DESIGN_CONTROLS,
} from "../../../shared/design-system.js";
import { FormDraftService } from "../services/form-drafts";
import { DESIGN_CONTEXT } from "./design-runtime";
import { DesignPageDirective } from "./design-directives";

@Component({
  selector: "gt-design-preview",
  standalone: true,
  imports: [NgComponentOutlet, DesignPageDirective, BottomNavigationComponent],
  // The original components read the original Store, but cannot register/edit form drafts.
  providers: [
    {
      provide: DESIGN_CONTEXT,
      useFactory: () => ({
        config: signal<DesignConfig>(structuredClone(DEFAULT_DESIGN)),
      }),
    },
    { provide: FormDraftService, useValue: null },
  ],
  template: `<div
      class="preview-phone"
      [gtDesignPage]="page()"
      aria-label="Anteprima live, interazioni disabilitate"
    >
      <div class="preview-status" aria-hidden="true">
        <span>GT</span><span>Anteprima live</span><span>●</span>
      </div>
      <div class="preview-readonly" inert>
        @if (component(); as screen) {
          <ng-container *ngComponentOutlet="screen" />
        } @else {
          <p>Caricamento anteprima…</p>
        }
        <gt-bottom-navigation [previewPath]="previewPath()" />
      </div>
    </div>
    <p class="preview-caption">Componenti reali · anteprima di sola lettura</p>
    @if (missing()) {
      <p class="preview-caption">{{ missing() }}</p>
    }`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .preview-phone {
        position: relative;
        isolation: isolate;
        width: 100%;
        max-width: 410px;
        margin: auto;
        min-height: 560px;
        max-height: 760px;
        overflow: auto;
        border: 1px solid #416479;
        border-radius: 30px;
        background: var(--bg, #040c19);
        color: var(--text, #f4faff);
        box-shadow: 0 20px 60px #0005;
        padding: 18px 16px;
        scrollbar-width: thin;
        box-sizing: border-box;
      }
      .preview-status {
        display: flex;
        justify-content: space-between;
        font: 11px system-ui;
        color: var(--muted, #9bb6ca);
        margin: 0 4px 24px;
        letter-spacing: 0.04em;
      }
      .preview-readonly {
        pointer-events: none;
        user-select: none;
      }
      .preview-caption {
        color: #a6bdcc;
        font: 12px/1.6 system-ui;
        text-align: center;
        margin: 12px 0 0;
      }
      :host ::ng-deep [data-design-selected="true"] {
        outline: 2px dashed #00d9ff !important;
        outline-offset: 3px !important;
      }
      :host ::ng-deep .preview-phone .bottom-nav {
        position: relative !important;
        display: grid !important;
        inset: auto !important;
        width: 100% !important;
        margin-top: 24px;
        padding: 10px 4px !important;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border-radius: 15px;
        background: var(--card);
        z-index: auto;
        transform: none !important;
      }
      :host ::ng-deep .preview-phone .bottom-nav a {
        min-width: 0;
        font-size: 10px;
        min-height: 56px;
      }
      :host ::ng-deep .preview-phone .bottom-nav a > gt-icon {
        padding: 4px !important;
      }
      :host ::ng-deep .preview-phone h1 {
        font-size: 24px;
      }
      :host ::ng-deep .preview-phone .profile-dashboard {
        margin-top: 16px;
      }
    `,
  ],
})
export class DesignPreviewComponent {
  config = input.required<DesignConfig>();
  page = input("home");
  selected = input("");
  copyMode = input(false);
  component = signal<Type<unknown> | null>(null);
  missing = signal("");
  private context = inject(DESIGN_CONTEXT) as {
    config: ReturnType<typeof signal<DesignConfig>>;
  };
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private generation = 0;
  private outlet = viewChild(NgComponentOutlet);
  constructor() {
    effect(() => this.context.config.set(this.config()));
    effect(() => {
      const page = this.page(),
        generation = ++this.generation;
      this.component.set(null);
      void this.screen(page).then((component) => {
        if (generation === this.generation) this.component.set(component);
      });
    });
    afterRenderEffect(() => {
      const selected = this.selected();
      this.page();
      this.component();
      this.config();
      // Open only transient presentation panels, never action handlers or drafts.
      const instance = this.outlet()?.componentInstance as {
        hub?: ReturnType<typeof signal<string>>;
        panel?: ReturnType<typeof signal<string>>;
      } | null;
      if (instance?.hub) {
        const hub =
          selected.startsWith("training.tabs.") ||
          (this.copyMode() && ["training.title", "training.subtitle"].includes(selected)) ||
          selected === "training.plans" ||
          selected === "training.newPlan"
            ? "plans"
            : "today";
        if (instance.hub() !== hub) instance.hub.set(hub);
      }
      if (instance?.panel) {
        const panel =
          selected === "profile.glowSlider"
            ? "theme"
            : ["profile.theme", "profile.logout"].includes(selected)
              ? "settings"
              : "overview";
        if (instance.panel() !== panel) instance.panel.set(panel);
      }
      for (const [selector, open] of [
        [
          ".home-health-disclosure",
          selected.startsWith("home.health."),
        ],
        [".progress-exercise-details", selected === "progress.exerciseChart"],
        [
          ".progress-overview-details",
          ["progress.weeklyChart", "progress.sessionsBadge"].includes(selected),
        ],
      ] as const) {
        const details =
          this.element.nativeElement.querySelector<HTMLDetailsElement>(
            selector,
          );
        if (details && details.open !== open) details.open = open;
      }
      const elements =
        this.element.nativeElement.querySelectorAll<HTMLElement>(
          "[data-design-id]",
        );
      let found = false;
      for (const element of elements) {
        const active = element.dataset["designId"] === selected;
        element.dataset["designSelected"] = String(active);
        found ||= active;
      }
      this.missing.set(
        selected && !found && DESIGN_CONTROLS.some((c) => c.id === selected)
          ? "Questo controllo compare solo nel relativo stato della pagina. Le proprietà restano modificabili."
          : "",
      );
    });
  }
  previewPath() {
    return (
      (
        {
          home: "/",
          training: "/piani",
          history: "/allenamenti",
          progress: "/progressi",
          profile: "/profilo",
        } as Record<string, string>
      )[this.page()] || "/"
    );
  }
  private async screen(page: string): Promise<Type<unknown>> {
    switch (page) {
      case "training":
        return (await import("../features/plans.component")).PlansComponent;
      case "history":
        return (await import("../features/workouts.component"))
          .WorkoutsComponent;
      case "progress":
        return (await import("../features/progress.component"))
          .ProgressComponent;
      case "profile":
        return (await import("../features/profile.component")).ProfileComponent;
      default:
        return (await import("../features/home.component")).HomeComponent;
    }
  }
  ngOnDestroy() {
    this.generation++;
  }
}
