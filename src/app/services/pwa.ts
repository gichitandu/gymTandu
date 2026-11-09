import {
  inspectOfflineResources,
  probeOfflineStorage,
} from "./offline-readiness";
import { Injectable, inject, signal } from "@angular/core";
import { SwUpdate } from "@angular/service-worker";
import { Subscription } from "rxjs";
import { Store } from "./store";
import { ArchiveSyncService } from "./archive-sync";
import { AppActivationUncertainError, AppReleaseService } from "./app-release";
import { FormDraftService } from "./form-drafts";
import { feedbackForContext, feedbackSignal } from "./feedback";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export interface AppUpdateEvent extends Event {
  waitUntil(save: Promise<boolean | void>): void;
}
@Injectable({ providedIn: "root" })
export class PwaService {
  event = signal<InstallEvent | undefined>(undefined);
  installed = signal(
    matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  online = signal(navigator.onLine);
  offlineReady = signal(false);
  updateReady = signal(false);
  updating = signal(false);
  storage = signal("Non ancora misurato");
  persisted = signal<boolean | null>(null);
  offlineChecking = signal(false);
  offlineMessage = signal("Risorse offline da verificare.");
  offlineWritable = signal(false);
  async checkOffline() {
    if (this.offlineChecking()) return;
    this.offlineChecking.set(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const script = Array.from(document.scripts || [])
        .map((s) => new URL(s.src, location.href).pathname)
        .find((path) => /^\/main-[^/]+\.js$/.test(path));
      const [resources, writable] = await Promise.race([
        Promise.all([
          inspectOfflineResources(caches, location.origin, script),
          probeOfflineStorage(indexedDB),
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Timeout")), 12000);
        }),
      ]);
      this.offlineWritable.set(writable);
      this.offlineReady.set(resources.ready && writable && this.store.ready());
      this.offlineMessage.set(
        !writable
          ? "Salvataggio locale non verificato. Riprova."
          : resources.message,
      );
    } catch {
      this.offlineReady.set(false);
      this.offlineMessage.set(
        "Verifica non disponibile: apri online e riprova.",
      );
    } finally {
      clearTimeout(timer);
      this.offlineChecking.set(false);
    }
  }
  readonly updateNotice = signal("");
  updateError = feedbackSignal("error", feedbackForContext());
  private updates = inject(SwUpdate);
  private store = inject(Store);
  private cloud = inject(ArchiveSyncService, { optional: true });
  private drafts = inject(FormDraftService, { optional: true });
  readonly releases = inject(AppReleaseService);
  private subscriptions: Subscription[] = [];
  private autoTimer: ReturnType<typeof setTimeout> | undefined;
  private attemptedBuild = "";
  private destroyed = false;
  private onOnline = () => {
    this.online.set(true);
    this.attemptedBuild = "";
    void this.releases.check();
  };
  private onOffline = () => this.online.set(false);
  private onInstall = (event: Event) => {
    event.preventDefault();
    this.event.set(event as InstallEvent);
  };
  private onInstalled = () => {
    this.installed.set(true);
    this.event.set(undefined);
  };
  private onVisibility = () => {
    if (document.visibilityState === "visible") {
      this.online.set(navigator.onLine);
      this.attemptedBuild = "";
      void this.measureStorage();
      void this.tryAutoReload();
    }
  };
  constructor() {
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("beforeinstallprompt", this.onInstall);
    window.addEventListener("appinstalled", this.onInstalled);
    this.subscriptions.push(
      this.updates.versionUpdates.subscribe((event) => {
        if (event.type === "VERSION_READY") {
          void this.checkOffline();
          this.updateReady.set(true);
          queueMicrotask(() => void this.tryAutoReload());
        }
      }),
    );
    this.subscriptions.push(
      this.releases.checked.subscribe(() => {
        void this.checkOffline();
        this.updateReady.set(this.releases.updateReady());
        this.attemptedBuild = "";
        void this.tryAutoReload();
      }),
    );
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready
        .then(() => {
          void this.checkOffline();
        })
        .catch(() => {});
    document.addEventListener("visibilitychange", this.onVisibility);
    this.updateReady.set(this.releases.updateReady());
    queueMicrotask(() => void this.tryAutoReload());
    void this.measureStorage();
    void this.requestPersistence();
  }
  async measureStorage() {
    try {
      const e = await navigator.storage?.estimate?.();
      this.storage.set(
        e?.usage !== undefined && e.quota
          ? `${(e.usage / 1048576).toFixed(1)} MB usati su ${(e.quota / 1048576).toFixed(0)} MB disponibili al sito`
          : "Misura dello spazio non disponibile in questo Safari",
      );
      this.persisted.set((await navigator.storage?.persisted?.()) ?? null);
    } catch {
      this.storage.set("Misura dello spazio non disponibile");
    }
  }
  async install() {
    const event = this.event();
    if (event) {
      await event.prompt();
      await event.userChoice;
      this.event.set(undefined);
    }
  }
  async requestPersistence() {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted()))
        this.persisted.set(await navigator.storage.persist());
    } catch {
      /* The archive remains available even when this browser cannot grant persistence. */
    }
  }
  private async waitForLocalWrites() {
    let pending;
    do {
      pending = this.store.settled();
      if ((await pending) === false)
        throw Error(
          "L’ultimo salvataggio sul dispositivo non è riuscito. Riprova prima di aggiornare.",
        );
    } while (pending !== this.store.settled());
    if (this.store.conflicted?.())
      throw Error(
        "Archivio locale modificato da un’altra finestra. Verifica i salvataggi prima di continuare.",
      );
  }
  async prepareExit(reason: "update" | "logout" = "update"): Promise<boolean> {
    this.updateError.set("");
    this.updateNotice.set("");
    if (reason === "logout") {
      // Logout never depends on backup, sync, validation, or a save acknowledgement.
      // Give automatic local saves a short opportunity to finish, then exit anyway.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const save = Promise.resolve()
        .then(async () => {
          if (this.drafts) await this.drafts.flushAll();
          await this.store.settled();
        })
        .catch(() => {});
      try {
        await Promise.race([
          save,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      return true;
    }
    try {
      if (!this.store.ready())
        throw Error("Attendi l’apertura dell’archivio prima di continuare.");
      const saves: Promise<boolean | void>[] = [];
      const event = Object.assign(new Event("gymtrack:before-update"), {
        waitUntil: (save: Promise<boolean | void>) => {
          saves.push(save);
        },
      });
      window.dispatchEvent(event);
      if (this.drafts) saves.push(this.drafts.flushAll());
      if ((await Promise.all(saves)).some((result) => result === false))
        throw Error("Salva o correggi i dati del modulo prima di continuare.");
      await this.waitForLocalWrites();
      // A save accepted while waiting may have cleared or revised its form draft.
      // Persist that final state as well before revoking the cookie or reloading.
      if (this.drafts && !(await this.drafts.flushAll()))
        throw Error("Bozza non salvata. Resta nell’app e riprova.");
      await this.waitForLocalWrites();
      await this.store.createRecoveryCheckpoint?.("before-update");
      if (this.cloud?.currentScope?.() && navigator.onLine !== false) {
        if (!(await this.cloud.checkpointForUpdate()))
          throw Error(this.syncBlockReason());
        await this.waitForLocalWrites();
      }
      this.updateNotice.set(
        "Copia di sicurezza verificata. Allenamenti, progressi e bozze sono conservati.",
      );
      return true;
    } catch (error) {
      this.updateError.set(
        "Aggiornamento sospeso: " +
          (error instanceof Error
            ? error.message
            : "Salvataggio non riuscito. I dati presenti sono conservati."),
      );
      return false;
    }
  }
  /** Spiega perché la copia protetta non è confermata, senza saltare il controllo. */
  private syncBlockReason() {
    const status = this.cloud?.status?.(),
      detail = this.cloud?.message?.();
    const base =
      status === "conflict"
        ? "La copia sul server e quella su questo telefono non coincidono."
        : status === "offline"
          ? "Il server non è raggiungibile."
          : status === "syncing"
            ? "La sincronizzazione è ancora in corso."
            : "La copia protetta sul server non è ancora confermata.";
    const server = this.cloud?.lastErrorMessage?.();
    return (
      base +
      (status === "conflict" && detail ? " " + detail : "") +
      (server ? " Risposta del server: " + server : "") +
      " Gli allenamenti restano salvati su questa icona. Controlla la sincronizzazione nel Profilo e riprova."
    );
  }
  private scheduleAuto() {
    clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => {
      this.autoTimer = undefined;
      void this.tryAutoReload();
    }, 30000);
  }
  private async tryAutoReload() {
    if (this.destroyed || !this.releases.autoUpdateReady() || this.updating())
      return;
    const target = this.releases.downloadedBuild()!;
    if (this.attemptedBuild === target) return;
    const active = document.activeElement as HTMLElement | null;
    if (
      !this.store.ready() ||
      this.store.busy?.() ||
      this.store.draft?.() ||
      document.visibilityState === "hidden" ||
      active?.matches?.('input,textarea,select,[contenteditable="true"]')
    ) {
      this.scheduleAuto();
      return;
    }
    this.attemptedBuild = target;
    await this.reload(true);
  }
  async reload(automatic = false) {
    if (this.updating()) return;
    this.updating.set(true);
    const root = document.querySelector?.("app-root") as HTMLElement | null;
    const priorInert = root?.inert;
    let reloading = false;
    try {
      if (
        automatic &&
        (this.store.draft?.() || !this.releases.autoUpdateReady())
      )
        return;
      // Freeze before the snapshot: typing while the server copy is pending must
      // not create a newer draft between the last flush and the page reload.
      if (root) root.inert = true;
      if (!(await this.prepareExit("update"))) {
        if (automatic) this.updateError.set("");
        return;
      }
      if (automatic && this.store.draft?.()) {
        this.scheduleAuto();
        return;
      }
      const activated = await this.releases.activateReady(
        automatic
          ? this.releases.policy()?.requestedBuildId || undefined
          : undefined,
      );
      if (automatic && !activated) return;
      reloading = true;
      location.reload();
    } catch (error) {
      if (error instanceof AppActivationUncertainError) {
        reloading = true;
        location.reload();
      } else
        this.updateError.set(
          "Aggiornamento sospeso: " +
            (error instanceof Error
              ? error.message
              : "Nuova versione non pronta. Riprova."),
        );
    } finally {
      if (root && !reloading) root.inert = priorInert || false;
      this.updating.set(false);
    }
  }
  async finishLogoutUpdate(): Promise<void> {
    // The exit is already durable and the cookie revoked or marked pending.
    // A new document adopts the newest downloaded worker version; do not keep
    // the signed-out screen inert while downloading/checking over the network.
    location.reload();
  }

  ngOnDestroy() {
    this.destroyed = true;
    clearTimeout(this.autoTimer);
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("beforeinstallprompt", this.onInstall);
    window.removeEventListener("appinstalled", this.onInstalled);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
