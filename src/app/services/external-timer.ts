import { Injectable, signal } from '@angular/core';
import { formatSeconds, remainingSeconds } from './rest-clock';

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

export function externalTimerSeconds(state: ExternalTimerState, now = Date.now()) {
  return state.paused ? Math.max(0, Math.ceil(state.pausedSeconds)) : remainingSeconds(state.end, now);
}

// An absolute finish time stays truthful even if the phone suspends JavaScript.
export function externalTimerNotification(state: ExternalTimerState, now = Date.now()) {
  if (state.paused) return `In pausa · ${formatSeconds(externalTimerSeconds(state, now))}. ${state.title}`;
  if (externalTimerSeconds(state, now) === 0) return `Recupero terminato. ${state.title}`;
  const end = new Date(state.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `Fine recupero alle ${end}. ${state.title}`;
}

@Injectable({ providedIn: 'root' })
export class ExternalTimerService {
  active = signal(false);
  message = signal('');
  private state?: ExternalTimerState;
  private interval?: ReturnType<typeof setInterval>;
  private pipWindow?: Window;
  private canvas?: HTMLCanvasElement;
  private video?: PipVideo;
  private stream?: MediaStream;
  private registration?: ServiceWorkerRegistration;
  private notification?: Notification;
  private notifications = false;
  private automatic = true;
  private permissionGranted = false;
  private notificationSetup?: Promise<void>;
  private notificationEpoch = 0;
  private deliverySequence = 0;
  private lastNotification = '';
  private finished = false;
  private baseTitle = '';
  private readonly visible = () => this.tick();

  constructor() {
    if (typeof document !== 'undefined') {
      this.baseTitle = document.title;
      document.addEventListener('visibilitychange', this.visible);
    }
  }

  setAutomaticEnabled(enabled: boolean) {
    if (this.automatic && !enabled) this.stop();
    this.automatic = enabled;
  }

  /** Call directly from a user click, before any save awaits, as iOS requires. */
  async requestAutomaticPermission() {
    if (!this.notificationSupported()) {
      this.message.set('Su iPhone le notifiche richiedono GymTrack aggiunta alla schermata Home. La tendina con conto alla rovescia e Pausa/Riprendi richiede un’app iOS nativa.');
      return;
    }
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      this.permissionGranted = permission === 'granted';
      if (!this.permissionGranted) {
        this.message.set('Per gli avvisi fuori app consenti le notifiche di GymTrack nelle impostazioni dell’iPhone.');
        return;
      }
      this.message.set('Notifiche consentite: i prossimi recuperi mostreranno l’ora di fine. Pausa e ripresa restano disponibili nell’app.');
      if (this.automatic && this.state) await this.enableNotifications(false);
    } catch {
      this.message.set('Non posso attivare le notifiche qui. Apri GymTrack dalla schermata Home e riprova.');
    }
  }

  private notificationSupported() { return typeof window !== 'undefined' && 'Notification' in window; }

  sync(state: ExternalTimerState, automatic = this.automatic) {
    this.setAutomaticEnabled(automatic);
    if (!state.end && !state.paused) {
      this.stop();
      return;
    }
    const changed = !this.state || state.end !== this.state.end || state.paused !== this.state.paused ||
      state.pausedSeconds !== this.state.pausedSeconds || state.title !== this.state.title;
    this.state = { ...state };
    if (changed) this.finished = false;
    if (!this.interval) this.interval = setInterval(() => this.tick(), 1000);
    this.tick();
    if (changed && this.notifications) void this.showNotification();
    // Previously granted permission applies to every new recovery. A stop or
    // skip clears only the old notification, never the user's permission.
    if (this.automatic && !this.notifications && this.notificationSupported() && Notification.permission!=='denied' &&
      (this.permissionGranted || Notification.permission === 'granted')) void this.enableNotifications(false);
  }

  async open(state: ExternalTimerState) {
    this.sync(state);
    if (!this.state) return;
    if (this.pipWindow && !this.pipWindow.closed) {
      this.pipWindow.focus();
      this.tick();
      return;
    }
    const pip = (window as Window & { documentPictureInPicture?: DocumentPip }).documentPictureInPicture;
    if (pip) {
      try {
        const external = await pip.requestWindow({ width: 320, height: 230 });
        this.pipWindow = external;
        const style = external.document.createElement('style');
        style.textContent = 'body{margin:0;background:#0b1423;color:#f8fafc;font:16px system-ui;text-align:center;padding:20px;box-sizing:border-box}p{margin:0;color:#b8c5d8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}strong{display:block;font:700 62px system-ui;font-variant-numeric:tabular-nums;margin:8px 0}small{color:#b8c5d8}';
        external.document.head.append(style);
        const label = external.document.createElement('p');
        label.id = 'exercise';
        const clock = external.document.createElement('strong');
        clock.id = 'countdown';
        clock.setAttribute('role', 'timer');
        const status = external.document.createElement('small');
        status.id = 'timer-status';
        external.document.body.append(label, clock, status);
        external.document.title = 'GymTrack · Recupero';
        external.addEventListener('pagehide', () => {
          if (this.pipWindow === external) this.pipWindow = undefined;
          this.active.set(this.notifications);
        }, { once: true });
        this.active.set(true);
        this.message.set('Timer nella finestra flottante. Il tempo si riallinea quando il dispositivo riprende l’app.');
        this.tick();
        return;
      } catch { /* Try video PiP without substituting a notification. */ }
    }
    // Media is created only on an explicit floating-window request.
    if (!this.video && typeof document !== 'undefined') this.prepareVideo();
    if (this.video) {
      try {
        await this.video.play();
        if (document.pictureInPictureEnabled && this.video.requestPictureInPicture) {
          await this.video.requestPictureInPicture();
        } else if (this.video.webkitSupportsPresentationMode?.('picture-in-picture')) {
          this.video.webkitSetPresentationMode?.('picture-in-picture');
        } else {
          throw Error('PiP non disponibile');
        }
        this.active.set(true);
        this.message.set('Timer nella finestra flottante. Il tempo si riallinea quando il dispositivo riprende l’app.');
        this.tick();
        return;
      } catch { /* Some phones do not permit a canvas video in PiP. */ }
    }
    this.releaseVideo();
    this.message.set('Questo browser non offre una finestra timer. Su iPhone il cronometro nel Centro Notifiche richiede un’app iOS con Live Activities: le notifiche web mostrano solo un avviso statico. Il timer resta disponibile nell’allenamento.');
  }

  private prepareVideo() {
    const canvas = document.createElement('canvas');
    if (typeof canvas.captureStream !== 'function') return;
    try {
      canvas.width = 640;
      canvas.height = 360;
      if (!canvas.getContext('2d')) return;
      const video = document.createElement('video') as PipVideo;
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('aria-hidden', 'true');
      // Keep a rendered, unobtrusive source for browsers that reject display:none.
      Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: '0', bottom: '0' });
      this.canvas = canvas;
      this.stream = canvas.captureStream(1);
      video.srcObject = this.stream;
      this.video = video;
      document.body.append(video);
      video.addEventListener('leavepictureinpicture', () => this.active.set(this.notifications));
      void video.play().catch(() => {});
      this.drawVideo();
    } catch { this.releaseVideo(); }
  }

  private drawVideo() {
    const state = this.state, ctx = this.canvas?.getContext('2d');
    if (!state || !ctx) return;
    const seconds = externalTimerSeconds(state);
    ctx.fillStyle = '#0b1423';
    ctx.fillRect(0, 0, 640, 360);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b8c5d8';
    ctx.font = '26px system-ui';
    ctx.fillText(state.title, 320, 63, 580);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 130px system-ui';
    ctx.fillText(formatSeconds(seconds), 320, 221);
    ctx.fillStyle = '#b8c5d8';
    ctx.font = '27px system-ui';
    ctx.fillText(state.paused ? 'In pausa' : seconds ? 'Recupero · GymTrack' : 'Recupero terminato', 320, 300);
  }

  private tick() {
    const state = this.state;
    if (!state) return;
    const seconds = externalTimerSeconds(state);
    if (typeof document !== 'undefined') document.title = `${formatSeconds(seconds)} · ${state.paused ? 'In pausa' : 'Recupero'} · GymTrack`;
    if (this.pipWindow && !this.pipWindow.closed) {
      const doc = this.pipWindow.document;
      const label = doc.getElementById('exercise'), clock = doc.getElementById('countdown'), status = doc.getElementById('timer-status');
      if (label) label.textContent = state.title;
      if (clock) clock.textContent = formatSeconds(seconds);
      if (status) status.textContent = state.paused ? 'In pausa' : seconds ? 'Recupero in corso' : 'Recupero terminato';
    }
    this.drawVideo();
    if (!state.paused && seconds === 0 && !this.finished) {
      this.finished = true;
      if (this.notifications) void this.showNotification();
    }
    if (!state.paused && seconds === 0) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async enableNotifications(prompt = true) {
    if (this.notificationSetup) return this.notificationSetup;
    const epoch = this.notificationEpoch;
    const setup = this.setupNotifications(prompt, epoch);
    this.notificationSetup = setup;
    try { await setup; }
    finally { if (this.notificationSetup === setup) this.notificationSetup = undefined; }
  }

  private async setupNotifications(prompt: boolean, epoch: number) {
    if (!('Notification' in window)) {
      this.message.set('Questo browser non consente un timer flottante né notifiche. Il recupero resta salvato e si riallinea al rientro. Su iPhone prova GymTrack installata nella schermata Home per le notifiche.');
      return;
    }
    try {
      if (!prompt && !this.permissionGranted && Notification.permission !== 'granted') return;
      const permission = Notification.permission==='denied'?'denied':this.permissionGranted ? 'granted' : Notification.permission === 'default' && prompt ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') {
        this.message.set('Timer flottante non disponibile. Per vedere l’ora di fine fuori dall’app, abilita le notifiche di GymTrack nelle impostazioni del browser.');
        return;
      }
      this.permissionGranted = true;
      const registration = await navigator.serviceWorker?.getRegistration();
      if (epoch !== this.notificationEpoch || !this.state) return;
      this.registration = registration;
      this.notifications = true;
      if (!await this.showNotification()) return;
      this.active.set(true);
      this.message.set('Notifica con l’ora di fine attiva. Su iPhone Pausa/Riprendi nella tendina richiede un’app iOS nativa; l’avviso finale può arrivare al rientro se il telefono sospende l’app.');
    } catch {
      this.notifications = false;
      this.active.set(false);
      this.message.set('Notifica non disponibile in questo browser. Su iPhone apri GymTrack dalla schermata Home e consenti le notifiche. Il recupero resta salvato.');
    }
  }

  private async showNotification() {
    if (!this.state || !this.notifications) return false;
    const epoch=this.notificationEpoch,delivery=++this.deliverySequence;
    const body = externalTimerNotification(this.state);
    if (body === this.lastNotification) return true;
    const options: NotificationOptions = {
      body, tag: 'gymtrack-rest-timer', icon: '/icons/icon-192.png',
      data: { gymtrackTimerDelivery: delivery, onActionClick: { default: { operation: 'focusLastFocusedOrOpen', url: '/#/sessione' } } },
    };
    try {
      if (this.registration) await this.registration.showNotification('GymTrack · Recupero', options);
      else {
        this.notification?.close();
        this.notification = new Notification('GymTrack · Recupero', options);
        this.notification.onclick = () => { window.focus(); this.notification?.close(); };
      }
      if(epoch!==this.notificationEpoch){
        if(this.registration)void this.registration.getNotifications({tag:'gymtrack-rest-timer'}).then(items=>items.filter(item=>item.data?.gymtrackTimerDelivery===delivery).forEach(item=>item.close())).catch(()=>{});
        return false;
      }
      this.lastNotification = body;
      return true;
    } catch {
      this.notifications = false;
      this.active.set(!!this.pipWindow);
      this.message.set('Il dispositivo non ha mostrato la notifica. Il recupero resta salvato e si riallinea al rientro.');
      return false;
    }
  }

  private releaseVideo() {
    this.video?.pause();
    this.video?.remove();
    this.stream?.getTracks().forEach(track => track.stop());
    this.video = undefined;
    this.canvas = undefined;
    this.stream = undefined;
  }

  stop() {
    this.notificationEpoch++;
    this.notificationSetup = undefined;
    clearInterval(this.interval);
    this.interval = undefined;
    this.state = undefined;
    this.finished = false;
    this.pipWindow?.close();
    this.pipWindow = undefined;
    if (typeof document !== 'undefined') {
      if (this.video && document.pictureInPictureElement === this.video && document.exitPictureInPicture) void document.exitPictureInPicture().catch(() => {});
      this.video?.webkitSetPresentationMode?.('inline');
      if (document.title.endsWith('· GymTrack')) document.title = this.baseTitle;
    }
    this.releaseVideo();
    this.notification?.close();
    this.notification = undefined;
    const endedDelivery=this.deliverySequence;
    if (this.registration) void this.registration.getNotifications({ tag: 'gymtrack-rest-timer' }).then(items => items.filter(item=>typeof item.data?.gymtrackTimerDelivery!=='number'||item.data.gymtrackTimerDelivery<=endedDelivery).forEach(item => item.close())).catch(() => {});
    this.notifications = false;
    this.lastNotification = '';
    this.active.set(false);
    this.message.set('');
  }

  ngOnDestroy() {
    this.stop();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visible);
  }
}
