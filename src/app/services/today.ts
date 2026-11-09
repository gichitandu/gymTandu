import { DestroyRef, Injectable, inject, signal } from "@angular/core";
import { localDate } from "../models/domain";

@Injectable({ providedIn: "root" })
export class TodayService {
  readonly date = signal(localDate());
  private timer?: ReturnType<typeof setTimeout>;
  constructor() {
    const visible = () => {
      if (document.visibilityState !== "hidden") this.refresh();
    };
    const resume = () => this.refresh();
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", visible);
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", resume);
      window.addEventListener("focus", resume);
    }
    this.schedule();
    inject(DestroyRef, { optional: true })?.onDestroy(() => {
      clearTimeout(this.timer);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visible);
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", resume);
        window.removeEventListener("focus", resume);
      }
    });
  }
  refresh() {
    this.date.set(localDate());
    this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    const now = new Date(),
      midnight = new Date(now);
    midnight.setHours(24, 0, 0, 50);
    // Recheck clock and timezone changes, as well as the exact local midnight.
    this.timer = setTimeout(
      () => this.refresh(),
      Math.min(60000, Math.max(50, midnight.getTime() - now.getTime())),
    );
  }
}
