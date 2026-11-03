import { Directive, ElementRef, effect, inject, input } from "@angular/core";
import {
  DESIGN_CONTROLS,
  designStyles,
  resolveDesign,
  resolvePageDesign,
} from "../../../shared/design-system.js";
import { IconComponent } from "../shared/icon.component";
import { DESIGN_CONTEXT, DesignRuntime } from "./design-runtime";

/** Restores the exact previous inline styles, including their original priority. */
export class DesignStyleTarget {
  private originals = new Map<string, { value: string; priority: string }>();
  constructor(private style: CSSStyleDeclaration) {}
  apply(values: Record<string, string>) {
    for (const key of [...this.originals.keys()])
      if (!(key in values)) {
        this.restore(key);
        this.originals.delete(key);
      }
    for (const [key, value] of Object.entries(values)) {
      if (!this.originals.has(key))
        this.originals.set(key, {
          value: this.style.getPropertyValue(key),
          priority: this.style.getPropertyPriority(key),
        });
      this.style.setProperty(key, value, "important");
    }
  }
  private restore(key: string) {
    const original = this.originals.get(key)!;
    if (original.value)
      this.style.setProperty(key, original.value, original.priority);
    else this.style.removeProperty(key);
  }
  clear() {
    for (const key of this.originals.keys()) this.restore(key);
    this.originals.clear();
  }
}

@Directive({ selector: "[gtDesign]", standalone: true })
export class DesignControlDirective {
  gtDesign = input.required<string>();
  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private runtime = inject(DesignRuntime);
  private context = inject(DESIGN_CONTEXT, { optional: true });
  private target = new DesignStyleTarget(this.element.style);
  constructor() {
    effect(() => {
      const id = this.gtDesign(),
        entry = DESIGN_CONTROLS.find((c) => c.id === id),
        config = this.context?.config() || this.runtime.config();
      if (!entry) {
        this.target.clear();
        return;
      }
      this.element.dataset["designId"] = id;
      const styles = designStyles(
        resolveDesign(config, entry.page, id),
        entry.kind,
      );
      this.element.classList.toggle(
        "gt-designed",
        Object.keys(styles).length > 0,
      );
      this.element.toggleAttribute("data-design-foreground", !!styles["color"]);
      this.target.apply(styles);
    });
  }
  ngOnDestroy() {
    this.target.clear();
  }
}

@Directive({ selector: "[gtDesignPage]", standalone: true })
export class DesignPageDirective {
  gtDesignPage = input("");
  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private runtime = inject(DesignRuntime);
  private context = inject(DESIGN_CONTEXT, { optional: true });
  private target = new DesignStyleTarget(this.element.style);
  constructor() {
    effect(() => {
      const config = this.context?.config() || this.runtime.config(),
        page = this.gtDesignPage() || this.runtime.page();
      this.target.apply(designStyles(resolvePageDesign(config, page), "page"));
      this.element.classList.toggle(
        "gt-design-active",
        config.enabled &&
          (config.presetId !== "app_default" ||
            Object.keys(config.global).length > 0 ||
            Object.keys(config.pages[page as keyof typeof config.pages] || {})
              .length > 0),
      );
    });
  }
  ngOnDestroy() {
    this.target.clear();
  }
}

// Static decorative labels only: dynamic values, feedback and binding are never changed.
@Directive({ selector: "[gtDesignLabel]", standalone: true })
export class DesignLabelDirective {
  gtDesignLabel = input.required<string>();
  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private runtime = inject(DesignRuntime);
  private context = inject(DESIGN_CONTEXT, { optional: true });
  constructor() {
    effect(() => {
      const id = this.gtDesignLabel(),
        entry = DESIGN_CONTROLS.find((c) => c.id === id),
        config = this.context?.config() || this.runtime.config();
      if (entry?.label)
        this.element.textContent = config.enabled
          ? config.instances[id]?.label || entry.label
          : entry.label;
    });
  }
}

@Directive({ selector: "gt-icon[gtDesignIcon]", standalone: true })
export class DesignIconDirective {
  gtDesignIcon = input.required<string>();
  private icon = inject(IconComponent);
  private runtime = inject(DesignRuntime);
  private context = inject(DESIGN_CONTEXT, { optional: true });
  constructor() {
    effect(() => {
      const id = this.gtDesignIcon(),
        config = this.context?.config() || this.runtime.config();
      this.icon.designName.set(
        config.enabled ? config.instances[id]?.icon || "" : "",
      );
    });
  }
  ngOnDestroy() {
    this.icon.designName.set("");
  }
}

export const DESIGN_DIRECTIVES = [
  DesignControlDirective,
  DesignLabelDirective,
  DesignIconDirective,
] as const;
