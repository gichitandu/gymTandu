import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { Exercise } from "../models/domain";
import { movementKind } from "../services/exercise-visual";
import { exerciseMotionFrames } from "../services/exercise-motion-frames";
import { ExerciseThumbComponent } from "./exercise-thumb.component";

let motionPanelCount = 0;
type MotionView = "image" | "sequence" | "3d";

@Component({
  selector: "gt-exercise-motion",
  standalone: true,
  imports: [ExerciseThumbComponent],
  styleUrl: "./exercise-motion.component.css",
  template: `
@if(frames();as animation){
 <button type="button" class="ghost motion-opener" (click)="toggleOpen()" [attr.aria-expanded]="open()" [attr.aria-controls]="panelId">{{open()?'Chiudi dimostrazione':'▷ Immagine e sequenza animata'}}</button>
 @if(open()){
  <section class="photo-motion-stage" [id]="panelId" [attr.aria-label]="'Tecnica di '+animation.title">
   <nav class="photo-motion-tabs" aria-label="Tipo di dimostrazione">
    <button type="button" [class.selected]="view()==='image'" [attr.aria-pressed]="view()==='image'" (click)="chooseView('image')">Immagine</button>
    <button type="button" [class.selected]="view()==='sequence'" [attr.aria-pressed]="view()==='sequence'" (click)="chooseView('sequence')">Sequenza animata</button>
    <button type="button" [class.selected]="view()==='3d'" [attr.aria-pressed]="view()==='3d'" (click)="chooseView('3d')">Vista 3D</button>
   </nav>
   @if(view()==='image'){
    <div class="photo-motion-still"><gt-exercise-thumb [exercise]="exercise()"/><span class="photo-motion-badge">ILLUSTRAZIONE</span></div>
    <p class="photo-motion-intro">Guarda la posizione, poi apri la sequenza per seguire le fasi del movimento.</p>
   }
   @if(view()==='sequence'){
    <div class="photo-motion-visual" [attr.data-motion-frame]="frame()">
     @if(!framesFailed()){
      <svg class="photo-motion-frames" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="animation.title+' · '+currentPhase().label"><svg x="0" y="0" width="512" height="512" [attr.viewBox]="frameBox()" overflow="hidden"><image [attr.href]="animation.source" x="0" y="0" width="1536" height="1024" (load)="framesLoaded.set(true)" (error)="framesError()"/></svg></svg>
     }@else{<gt-exercise-thumb [exercise]="exercise()"/>}
     <span class="photo-motion-badge">SEQUENZA PER FASI</span>
     @if(!framesLoaded()&&!framesFailed()){<p class="photo-motion-loading" role="status">Caricamento della sequenza…</p>}
    </div>
    @if(framesFailed()){
     <div class="photo-motion-error" role="status"><p>La sequenza non è disponibile. L’immagine resta consultabile.</p><button type="button" (click)="retryFrames()">Riprova</button></div>
    }@else{
     <div class="photo-motion-caption"><span>FASE {{frame()+1}} DI {{animation.frames}}</span><h3>{{currentPhase().label}}</h3><p>{{currentPhase().cue}}</p></div>
     <div class="photo-motion-controls">
      <button type="button" class="photo-motion-step" (click)="step(-1)" aria-label="Fotogramma precedente">‹</button>
      <button type="button" class="photo-motion-play" (click)="togglePlay()" [disabled]="!framesLoaded()" [attr.aria-pressed]="playing()">{{playing()?'Ⅱ Pausa':'▶ Riproduci'}}</button>
      <button type="button" class="photo-motion-step" (click)="step(1)" aria-label="Fotogramma successivo">›</button>
      <button type="button" class="photo-motion-speed" (click)="cycleSpeed()" [attr.aria-label]="'Velocità '+speedLabel()+'. Cambia velocità'">{{speedLabel()}}</button>
     </div>
     <label class="photo-motion-timeline"><span>Posizione nel movimento</span><input type="range" min="0" [max]="animation.frames-1" step="1" [value]="frame()" (input)="scrub($event)" [attr.aria-valuetext]="currentPhase().label" aria-label="Posizione nel movimento"/></label>
     <div class="photo-motion-steps" aria-label="Scegli una fase">@for(phase of animation.phases;track $index){<button type="button" (click)="seek($index)" [class.current]="frame()===$index" [attr.aria-current]="frame()===$index?'step':null" [attr.aria-label]="'Fase '+($index+1)+': '+phase.label">{{$index+1}}</button>}</div>
    }
   }
   @if(view()==='3d'){
    <section #spatialStage class="spatial-stage motion-stage" data-autoplay="false" data-view="motion">
     <div class="movement-visual"><div class="movement-canvas"></div><span class="motion-badge">MODELLO 3D · TRASCINA PER RUOTARE</span><button type="button" data-motion-reset aria-label="Reimposta visuale">↺</button><span class="motion-loading" role="status">{{issue()||'Preparazione del modello…'}}</span></div>
     @if(issue()){<div class="photo-motion-error" role="status"><p>{{issue()}}</p><button type="button" (click)="retry3d()">Riprova</button></div>}
     <div class="motion-controls"><button type="button" data-motion-play aria-label="Riproduci o metti in pausa il modello">▶ Riproduci</button><span data-motion-label>Modello in pausa</span><button type="button" data-motion-speed aria-label="Velocità di riproduzione del modello">1×</button></div>
     <label class="motion-scrub"><span class="sr-only">Posizione del modello nel movimento</span><input data-motion-scrub type="range" min="0" max="100" value="0" aria-label="Posizione del modello nel movimento"/></label>
     <div class="motion-phases"><button type="button" data-motion-phase="0">Inizio</button><button type="button" data-motion-phase=".5">Fase centrale</button><button type="button" data-motion-phase=".9">Ritorno</button></div>
    </section>
   }
   <p class="photo-motion-note">Dimostrazione illustrativa della tecnica. Segui anche le indicazioni della tua scheda e la configurazione dell’attrezzo.</p>
  </section>
 }
}
`,
})
export class ExerciseMotionComponent implements AfterViewInit {
  exercise = input<Exercise>();
  showSequence = input(false);
  frames = computed(() => exerciseMotionFrames(this.exercise()));
  kind = computed(() => movementKind(this.exercise()));
  open = signal(false);
  view = signal<MotionView>("image");
  frame = signal(0);
  playing = signal(false);
  speed = signal(1);
  framesLoaded = signal(false);
  framesFailed = signal(false);
  issue = signal("");
  readonly panelId = "exercise-motion-" + ++motionPanelCount;
  private host = inject(ElementRef<HTMLElement>);
  private inViewport = signal(true);
  private pageVisible = signal(
    typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  private observer?: IntersectionObserver;
  private media =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
  private retryVersion = signal(0);
  private animationKey = computed(() => {
    const frames = this.frames();
    return frames ? `${this.exercise()?.id || ""}|${frames.source}` : "";
  });
  spatialStage = viewChild<ElementRef<HTMLElement>>("spatialStage");
  currentPhase = computed(
    () =>
      this.frames()?.phases[this.frame()] || {
        label: "Posizione iniziale",
        cue: "",
      },
  );
  frameBox = computed(
    () =>
      `${(this.frame() % 3) * 512} ${Math.floor(this.frame() / 3) * 512} 512 512`,
  );
  speedLabel = computed(() => String(this.speed()).replace(".", ",") + "×");
  private visibilityChanged = () => {
    this.pageVisible.set(document.visibilityState !== "hidden");
    if (!this.pageVisible()) this.pause();
  };
  private motionPreferenceChanged = () => {
    this.pause();
    this.retryVersion.update((version) => version + 1);
  };
  constructor() {
    effect(() => {
      this.animationKey();
      this.pause();
      this.frame.set(0);
      this.framesLoaded.set(false);
      this.framesFailed.set(false);
      this.view.set("image");
    });
    effect(() => {
      if (this.showSequence() && this.animationKey()) {
        this.pause();
        this.open.set(true);
        this.view.set("sequence");
      }
    });
    effect(() => {
      if (!this.open() || !this.inViewport() || !this.pageVisible())
        this.pause();
    });
    effect((cleanup) => {
      const animation = this.frames(),
        playing = this.playing(),
        speed = this.speed();
      if (
        !animation ||
        !playing ||
        !this.open() ||
        this.view() !== "sequence" ||
        !this.inViewport() ||
        !this.pageVisible()
      )
        return;
      let handle = 0,
        last: number | undefined,
        elapsed = 0;
      const interval = Math.max(
        1,
        animation.durationMs / animation.frames / speed,
      );
      const tick = (time: number) => {
        if (last !== undefined) elapsed += Math.min(1000, time - last);
        last = time;
        if (elapsed >= interval) {
          const steps = Math.floor(elapsed / interval);
          elapsed %= interval;
          this.frame.update((frame) => (frame + steps) % animation.frames);
        }
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
      cleanup(() => cancelAnimationFrame(handle));
    });
    effect((cleanup) => {
      const element = this.spatialStage()?.nativeElement,
        type = this.kind();
      this.retryVersion();
      if (
        !element ||
        !type ||
        this.view() !== "3d" ||
        !this.open() ||
        !this.inViewport() ||
        !this.pageVisible()
      )
        return;
      let cancelled = false,
        dispose: (() => void) | undefined;
      cleanup(() => {
        cancelled = true;
        dispose?.();
      });
      const url = "/training/movement.js";
      this.issue.set("");
      void import(/* @vite-ignore */ url)
        .then(
          (module: {
            mountMovement: (stage: HTMLElement, type: string) => () => void;
          }) => {
            if (cancelled) return;
            dispose = module.mountMovement(element, type);
            element.dataset["view"] = "motion";
          },
        )
        .catch(() => {
          if (!cancelled) {
            this.issue.set(
              "Modello non disponibile. Puoi consultare l’immagine e la sequenza.",
            );
            element.dataset["failed"] = "true";
          }
        });
    });
  }
  ngAfterViewInit() {
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visibilityChanged);
    this.media?.addEventListener?.("change", this.motionPreferenceChanged);
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((entry) => entry.isIntersecting);
          this.inViewport.set(visible);
          if (!visible) this.pause();
        },
        { threshold: 0 },
      );
      this.observer.observe(this.host.nativeElement);
    }
  }
  toggleOpen() {
    this.pause();
    this.open.update((open) => !open);
    if (!this.open()) this.view.set("image");
  }
  chooseView(view: MotionView) {
    this.pause();
    this.view.set(view);
  }
  pause() {
    this.playing.set(false);
  }
  togglePlay() {
    if (
      !this.framesLoaded() ||
      this.framesFailed() ||
      !this.inViewport() ||
      !this.pageVisible()
    )
      return;
    this.playing.update((playing) => !playing);
  }
  seek(frame: number) {
    this.pause();
    const max = (this.frames()?.frames || 1) - 1;
    this.frame.set(Math.max(0, Math.min(max, Math.round(frame))));
  }
  step(delta: number) {
    const count = this.frames()?.frames || 1;
    this.seek((this.frame() + delta + count) % count);
  }
  scrub(event: Event) {
    this.seek(Number((event.target as HTMLInputElement).value));
  }
  cycleSpeed() {
    this.speed.update((speed) => (speed === 0.5 ? 1 : speed === 1 ? 1.5 : 0.5));
  }
  framesError() {
    this.pause();
    this.framesFailed.set(true);
    this.framesLoaded.set(false);
  }
  retryFrames() {
    this.pause();
    this.framesLoaded.set(false);
    this.framesFailed.set(false);
  }
  retry3d() {
    this.retryVersion.update((version) => version + 1);
  }
  ngOnDestroy() {
    this.pause();
    this.observer?.disconnect();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.media?.removeEventListener?.("change", this.motionPreferenceChanged);
  }
}
