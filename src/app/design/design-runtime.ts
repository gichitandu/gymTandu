import {
  Injectable,
  InjectionToken,
  Signal,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { AuthService } from "../services/auth";
import {
  DEFAULT_DESIGN,
  DesignConfig,
  designPageForPath,
  validDesign,
} from "../../../shared/design-system.js";

export interface PublishedDesign {
  revision: number;
  config: DesignConfig;
  updatedAt: number | null;
  studioEnabled?: boolean;
}
export interface DesignDraft {
  config: DesignConfig;
  baseRevision: number;
  version: number;
  updatedAt: number;
}
export interface SavedDesignPreset {
  id: string;
  name: string;
  config: DesignConfig;
  version: number;
  updatedAt: number;
}
export interface DesignHistory {
  revision: number;
  actorId: string;
  actorName: string;
  createdAt: number;
  kind: string;
  sourceRevision: number | null;
  checksum: string;
  changes: { path: string; before: unknown; after: unknown }[];
}
export interface DesignStudioState {
  published: PublishedDesign;
  draft: DesignDraft | null;
  presets: SavedDesignPreset[];
  history: DesignHistory[];
}
export interface DesignContext {
  config: Signal<DesignConfig>;
}
export const DESIGN_CONTEXT = new InjectionToken<DesignContext>(
  "Isolated Design Studio preview",
);
export const canUseDesignStudio = (
  auth: Pick<AuthService, "user" | "uiRole" | "offlineMode">,
) =>
  auth.user()?.role === "SuperAdmin" &&
  auth.uiRole() === "SuperAdmin" &&
  !auth.offlineMode();

@Injectable({ providedIn: "root" })
export class DesignRuntime {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly published = signal<PublishedDesign>({
    revision: 0,
    config: structuredClone(DEFAULT_DESIGN),
    updatedAt: null,
  });
  readonly config = computed(() => this.published().config);
  readonly editorAvailable = signal(true);
  readonly canManage = computed(
    () => canUseDesignStudio(this.auth) && this.editorAvailable(),
  );
  readonly page = signal(designPageForPath(this.router.url));
  private epoch = 0;
  private disposed = false;
  private account = "";
  private fetching = false;
  private routeSubscription = this.router.events.subscribe((event) => {
    if (event instanceof NavigationEnd)
      this.page.set(designPageForPath(event.urlAfterRedirects));
  });
  private online = () => void this.refresh();
  private visibility = () => {
    if (document.visibilityState === "visible") void this.refresh();
  };
  private interval: ReturnType<typeof setInterval>;
  constructor() {
    effect(() => {
      const id = this.auth.user()?.id || "",
        offline = this.auth.offlineMode();
      this.epoch++;
      this.fetching = false;
      if (id !== this.account) {
        this.account = id;
        this.published.set({
          revision: 0,
          config: structuredClone(DEFAULT_DESIGN),
          updatedAt: null,
        });
        if (id && id !== "device-local")
          try {
            const cache = JSON.parse(
              localStorage.getItem(this.cacheKey(id)) || "null",
            );
            if (this.validPublished(cache)) this.published.set(cache);
          } catch {
            /* Invalid cache falls back to existing appearance. */
          }
      }
      if (id && !offline) void this.refresh();
    });
    window.addEventListener("online", this.online);
    document.addEventListener("visibilitychange", this.visibility);
    this.interval = setInterval(() => {
      if (document.visibilityState === "visible") void this.refresh();
    }, 60000);
  }
  private cacheKey(id: string) {
    return "gymtrack-design-published-v1:" + id;
  }
  private validPublished(value: unknown): value is PublishedDesign {
    const v = value as PublishedDesign;
    return (
      !!v &&
      Number.isSafeInteger(v.revision) &&
      v.revision >= 0 &&
      validDesign(v.config)
    );
  }
  acceptPublished(value: PublishedDesign) {
    if (
      !this.validPublished(value) ||
      value.revision < this.published().revision
    )
      return;
    if (typeof value.studioEnabled === "boolean")
      this.editorAvailable.set(value.studioEnabled);
    this.published.set(structuredClone(value));
    const id = this.auth.user()?.id;
    if (id && id !== "device-local")
      try {
        localStorage.setItem(this.cacheKey(id), JSON.stringify(value));
      } catch {
        /* Publishing is already durable on the server. */
      }
  }
  async refresh() {
    const id = this.auth.user()?.id,
      epoch = this.epoch;
    if (
      !id ||
      id === "device-local" ||
      this.auth.offlineMode() ||
      !navigator.onLine ||
      this.fetching ||
      this.disposed
    )
      return;
    this.fetching = true;
    try {
      const value = await this.auth.request("design/published");
      if (epoch === this.epoch && id === this.auth.user()?.id && !this.disposed)
        this.acceptPublished(value);
    } catch {
      /* Existing controls keep the last valid published appearance, including offline. */
    } finally {
      if (epoch === this.epoch) this.fetching = false;
    }
  }
  ngOnDestroy() {
    this.disposed = true;
    this.epoch++;
    clearInterval(this.interval);
    this.routeSubscription.unsubscribe();
    window.removeEventListener("online", this.online);
    document.removeEventListener("visibilitychange", this.visibility);
  }
}
