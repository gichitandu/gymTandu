import { Injectable, signal } from "@angular/core";
import { formatSeconds, remainingSeconds } from "./rest-clock";

export interface ExternalTimerState {
  end: number;
  paused: boolean;
  pausedSeconds: number;
  title: string;
}

interface DocumentPip {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}
type PipVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
};

export function externalTimerSeconds(
  state: ExternalTimerState,
  now = Date.now(),
) {
  return state.paused
    ? Math.max(0, Math.ceil(state.pausedSeconds))
    : remainingSeconds(state.end, now);
}

@Injectable({ providedIn: "root" })
export class ExternalTimerService {
  active = signal(false);
  message = signal("");
  private state?: ExternalTimerState;
  private interval?: ReturnType<typeof setInterval>;
  private pipWindow?: Window;
  private canvas?: HTMLCanvasElement;
  private video?: PipVideo;
  private stream?: MediaStream;
  private baseTitle = "";
  private readonly visible = () => this.tick();

  constructor() {
    if (typeof document !== "undefined") {
      this.baseTitle = document.title;
      document.addEventListener("visibilitychange", this.visible);
    }
  }

  sync(state: ExternalTimerState) {
    if (!state.end && !state.paused) {
      this.stop();
      return;
    }
    this.state = { ...state };
    if (!this.interval) this.interval = setInterval(() => this.tick(), 1000);
    this.tick();
  }

  async open(state: ExternalTimerState) {
    this.sync(state);
    if (!this.state) return;
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.focus();
      this.tick();
      return;
    }
    const pip = (window as Window & { documentPictureInPicture?: DocumentPip })
      .documentPictureInPicture;
    if (pip) {
      try {
        const external = await pip.requestWindow({ width: 320, height: 230 });
        this.pipWindow = external;
        const style = external.document.createElement("style");
        style.textContent =
          "body{margin:0;background:#0b1423;color:#f8fafc;font:16px system-ui;text-align:center;padding:20px;box-sizing:border-box}p{margin:0;color:#b8c5d8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}strong{display:block;font:700 62px system-ui;font-variant-numeric:tabular-nums;margin:8px 0}small{color:#b8c5d8}";
        external.document.head.append(style);
        const label = external.document.createElement("p");
        label.id = "exercise";
        const clock = external.document.createElement("strong");
        clock.id = "countdown";
        clock.setAttribute("role", "timer");
        const status = external.document.createElement("small");
        status.id = "timer-status";
        external.document.body.append(label, clock, status);
        external.document.title = "GymTrack · Recupero";
        external.addEventListener(
          "pagehide",
          () => {
            if (this.pipWindow === external) this.pipWindow = undefined;
            this.active.set(false);
          },
          { once: true },
        );
        this.active.set(true);
        this.message.set(
          "Timer nella finestra flottante. Il tempo si riallinea quando il dispositivo riprende l’app.",
        );
        this.tick();
        return;
      } catch {
        /* Try video PiP without substituting a notification. */
      }
    }
    // Media is created only on an explicit floating-window request.
    if (!this.video && typeof document !== "undefined") this.prepareVideo();
    if (this.video) {
      try {
        await this.video.play();
        if (
          document.pictureInPictureEnabled &&
          this.video.requestPictureInPicture
        ) {
          await this.video.requestPictureInPicture();
        } else if (
          this.video.webkitSupportsPresentationMode?.("picture-in-picture")
        ) {
          this.video.webkitSetPresentationMode?.("picture-in-picture");
        } else {
          throw Error("PiP non disponibile");
        }
        this.active.set(true);
        this.message.set(
          "Timer nella finestra flottante. Il tempo si riallinea quando il dispositivo riprende l’app.",
        );
        this.tick();
        return;
      } catch {
        /* Some phones do not permit a canvas video in PiP. */
      }
    }
    this.releaseVideo();
    this.message.set(
      "Finestra flottante non supportata da questo browser. Usa il timer nell’allenamento.",
    );
  }

  private prepareVideo() {
    const canvas = document.createElement("canvas");
    if (typeof canvas.captureStream !== "function") return;
    try {
      canvas.width = 640;
      canvas.height = 360;
      if (!canvas.getContext("2d")) return;
      const video = document.createElement("video") as PipVideo;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("aria-hidden", "true");
      // Keep a rendered, unobtrusive source for browsers that reject display:none.
      Object.assign(video.style, {
        position: "fixed",
        width: "1px",
        height: "1px",
        opacity: "0.01",
        pointerEvents: "none",
        left: "0",
        bottom: "0",
      });
      this.canvas = canvas;
      this.stream = canvas.captureStream(1);
      video.srcObject = this.stream;
      this.video = video;
      document.body.append(video);
      video.addEventListener("leavepictureinpicture", () =>
        this.active.set(false),
      );
      void video.play().catch(() => {});
      this.drawVideo();
    } catch {
      this.releaseVideo();
    }
  }

  private drawVideo() {
    const state = this.state,
      ctx = this.canvas?.getContext("2d");
    if (!state || !ctx) return;
    const seconds = externalTimerSeconds(state);
    ctx.fillStyle = "#0b1423";
    ctx.fillRect(0, 0, 640, 360);
    ctx.textAlign = "center";
    ctx.fillStyle = "#b8c5d8";
    ctx.font = "26px system-ui";
    ctx.fillText(state.title, 320, 63, 580);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 130px system-ui";
    ctx.fillText(formatSeconds(seconds), 320, 221);
    ctx.fillStyle = "#b8c5d8";
    ctx.font = "27px system-ui";
    ctx.fillText(
      state.paused
        ? "In pausa"
        : seconds
          ? "Recupero · GymTrack"
          : "Recupero terminato",
      320,
      300,
    );
  }

  private tick() {
    const state = this.state;
    if (!state) return;
    const seconds = externalTimerSeconds(state);
    if (typeof document !== "undefined")
      document.title = `${formatSeconds(seconds)} · ${state.paused ? "In pausa" : "Recupero"} · GymTrack`;
    if (this.pipWindow && !this.pipWindow.closed) {
      const doc = this.pipWindow.document;
      const label = doc.getElementById("exercise"),
        clock = doc.getElementById("countdown"),
        status = doc.getElementById("timer-status");
      if (label) label.textContent = state.title;
      if (clock) clock.textContent = formatSeconds(seconds);
      if (status)
        status.textContent = state.paused
          ? "In pausa"
          : seconds
            ? "Recupero in corso"
            : "Recupero terminato";
    }
    this.drawVideo();
    if (!state.paused && seconds === 0) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private releaseVideo() {
    this.video?.pause();
    this.video?.remove();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.video = undefined;
    this.canvas = undefined;
    this.stream = undefined;
  }

  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
    this.state = undefined;
    this.pipWindow?.close();
    this.pipWindow = undefined;
    if (typeof document !== "undefined") {
      if (
        this.video &&
        document.pictureInPictureElement === this.video &&
        document.exitPictureInPicture
      )
        void document.exitPictureInPicture().catch(() => {});
      this.video?.webkitSetPresentationMode?.("inline");
      if (document.title.endsWith("· GymTrack"))
        document.title = this.baseTitle;
    }
    this.releaseVideo();
    this.active.set(false);
    this.message.set("");
  }

  ngOnDestroy() {
    this.stop();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visible);
  }
}
