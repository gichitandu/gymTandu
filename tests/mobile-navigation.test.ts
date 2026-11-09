import "@angular/compiler";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationStart,
  Router,
} from "@angular/router";
import { Subject } from "rxjs";
import { afterEach, expect, it, vi } from "vitest";
import {
  canResumeAtHome,
  MobileNavigationService,
} from "../src/app/services/mobile-navigation";

let injector: EnvironmentInjector | undefined;
afterEach(() => {
  injector?.destroy();
  injector = undefined;
  vi.unstubAllGlobals();
});

function browser(url = "/", navigated = true, initialId = 1) {
  const events = new Subject<unknown>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const win = {
    history: { scrollRestoration: "auto" },
    scrollX: 0,
    scrollY: 0,
    scrollTo: vi.fn((position: ScrollToOptions) => {
      win.scrollX = position.left || 0;
      win.scrollY = position.top || 0;
    }),
  };
  const doc = { activeElement: null as unknown };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  injector = createEnvironmentInjector(
    [
      {
        provide: Router,
        useValue: {
          events: events.asObservable(),
          url,
          navigated,
          lastSuccessfulNavigation: () =>
            navigated ? { id: initialId } : null,
        },
      },
      MobileNavigationService,
    ],
    null as unknown as EnvironmentInjector,
  );
  const service = injector.get(MobileNavigationService);
  const paint = () => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(0);
  };
  const complete = (id: number, destination: string, restoredId?: number) => {
    events.next(
      new NavigationStart(
        id,
        destination,
        restoredId === undefined ? "imperative" : "popstate",
        restoredId === undefined ? null : { navigationId: restoredId },
      ),
    );
    events.next(new NavigationEnd(id, destination, destination));
  };
  return { service, win, doc, events, paint, complete, frames };
}

it("waits for the resolved hash route before deciding to resume a workout and respects deep links", () => {
  const b = browser("/", false);
  expect(canResumeAtHome(b.service.url(), b.service.resolved())).toBe(false);
  b.complete(1, "/profilo?section=backup");
  expect(b.service.resolved()).toBe(true);
  expect(canResumeAtHome(b.service.url(), b.service.resolved())).toBe(false);
  expect(canResumeAtHome("/alimentazione", true)).toBe(false);
  expect(canResumeAtHome("/?from=home", true)).toBe(true);
});

it("opens a different section at the top after its view renders rather than moving the outgoing form", () => {
  const b = browser();
  b.win.scrollY = 860;
  b.complete(2, "/piani");
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  b.paint();
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  b.paint();
  expect(b.win.scrollTo).toHaveBeenCalledExactlyOnceWith({
    left: 0,
    top: 0,
    behavior: "instant",
  });
});

it("restores the previous history entry on Back and does not reuse another section scroll position", () => {
  const b = browser("/piani", true, 2);
  b.win.scrollY = 640;
  b.complete(3, "/alimentazione");
  b.paint();
  b.paint();
  expect(b.win.scrollY).toBe(0);
  b.win.scrollY = 180;
  b.complete(4, "/piani", 2);
  b.paint();
  b.paint();
  expect(b.win.scrollY).toBe(640);
  b.complete(5, "/progressi");
  b.paint();
  b.paint();
  expect(b.win.scrollY).toBe(0);
});

it("keeps a form in place when changing only its query parameters or focusing one of its fields", () => {
  const b = browser("/profilo?section=settings");
  b.win.scrollY = 400;
  b.doc.activeElement = { tagName: "INPUT", isConnected: true };
  b.complete(2, "/profilo?section=goals");
  b.paint();
  b.paint();
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  expect(b.win.scrollY).toBe(400);
});

it("leaves a newly focused field to the keyboard viewport handler and cancels obsolete scroll work", () => {
  const b = browser();
  b.complete(2, "/piani");
  b.paint();
  b.doc.activeElement = { tagName: "INPUT", isConnected: true };
  b.paint();
  expect(b.win.scrollTo).not.toHaveBeenCalled();
  b.doc.activeElement = null;
  b.complete(3, "/alimentazione");
  b.events.next(new NavigationStart(4, "/profilo"));
  b.events.next(new NavigationCancel(4, "/profilo", "Draft validation failed"));
  b.paint();
  b.paint();
  expect(b.win.scrollTo).not.toHaveBeenCalled();
});

it("restores native history behavior and cancels pending callbacks on destruction", () => {
  const b = browser();
  expect(b.win.history.scrollRestoration).toBe("manual");
  b.complete(2, "/piani");
  injector!.destroy();
  injector = undefined;
  expect(b.win.history.scrollRestoration).toBe("auto");
  expect(b.frames.size).toBe(0);
  b.paint();
  b.paint();
  expect(b.win.scrollTo).not.toHaveBeenCalled();
});
