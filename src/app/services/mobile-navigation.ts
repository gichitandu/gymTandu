import { Injectable, inject, signal } from "@angular/core";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from "@angular/router";

export function routePath(url: string) {
  return url.split(/[?#]/, 1)[0] || "/";
}
export function canResumeAtHome(url: string, resolved: boolean) {
  return resolved && routePath(url) === "/";
}

/** Scroll changes belong to completed route transitions, never to input focus. */
@Injectable({ providedIn: "root" })
export class MobileNavigationService {
  private router = inject(Router);
  readonly resolved = signal(this.router.navigated);
  readonly url = signal(this.router.url || "/");
  private currentId = this.router.lastSuccessfulNavigation()?.id ?? 0;
  private positions = new Map<number, [number, number]>();
  private pending: { id: number; restoredId?: number } | undefined;
  private frames = new Set<number>();
  private priorRestoration = window.history?.scrollRestoration;
  private subscription = this.router.events.subscribe((event) => {
    if (event instanceof NavigationStart) {
      this.cancelScroll();
      this.positions.set(this.currentId, [
        window.scrollX || 0,
        window.scrollY || 0,
      ]);
      this.pending = {
        id: event.id,
        restoredId:
          event.navigationTrigger === "popstate"
            ? event.restoredState?.navigationId
            : undefined,
      };
    } else if (event instanceof NavigationEnd) {
      const previous = this.url(),
        pending = this.pending;
      this.currentId = event.id;
      this.url.set(event.urlAfterRedirects);
      this.resolved.set(true);
      this.pending = undefined;
      // A query change may select a panel or update a filter in the active form.
      // Keep its field and scroll position in place.
      if (
        !pending ||
        pending.id !== event.id ||
        routePath(previous) === routePath(event.urlAfterRedirects)
      )
        return;
      const target =
        pending.restoredId === undefined
          ? [0, 0]
          : this.positions.get(pending.restoredId) || [0, 0];
      this.scheduleScroll(target[0], target[1], event.id);
    } else if (
      event instanceof NavigationCancel ||
      event instanceof NavigationError
    ) {
      if (this.pending && this.pending.id !== event.id) return;
      this.pending = undefined;
      this.cancelScroll();
    }
  });

  constructor() {
    if (window.history && "scrollRestoration" in window.history)
      window.history.scrollRestoration = "manual";
  }

  private scheduleScroll(left: number, top: number, navigationId: number) {
    // Wait for the new route's view to render; a second frame avoids moving the
    // outgoing form while Angular is replacing it.
    const first = requestAnimationFrame(() => {
      this.frames.delete(first);
      const second = requestAnimationFrame(() => {
        this.frames.delete(second);
        if (this.currentId !== navigationId || this.editing()) return;
        window.scrollTo({ left, top, behavior: "instant" });
      });
      this.frames.add(second);
    });
    this.frames.add(first);
  }
  private editing() {
    const focused = document.activeElement as HTMLElement | null;
    return (
      !!focused &&
      focused.isConnected !== false &&
      (/^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName) ||
        focused.isContentEditable)
    );
  }
  private cancelScroll() {
    for (const frame of this.frames) cancelAnimationFrame(frame);
    this.frames.clear();
  }
  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.cancelScroll();
    if (window.history && this.priorRestoration)
      window.history.scrollRestoration = this.priorRestoration;
  }
}
