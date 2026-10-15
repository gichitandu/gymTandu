import { Injectable, signal } from "@angular/core";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
@Injectable({ providedIn: "root" })
export class PwaService {
  event = signal<InstallEvent | undefined>(undefined);
  installed = signal(matchMedia("(display-mode: standalone)").matches);
  constructor() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.event.set(e as InstallEvent);
    });
    window.addEventListener("appinstalled", () => {
      this.installed.set(true);
      this.event.set(undefined);
    });
  }
  async install() {
    const e = this.event();
    if (e) {
      await e.prompt();
      await e.userChoice;
      this.event.set(undefined);
    }
  }
}
