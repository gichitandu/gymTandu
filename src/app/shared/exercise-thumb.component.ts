import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { Exercise } from "../models/domain";
import { IconComponent } from "./icon.component";
import { exerciseThumbnail } from "../services/exercise-visual";
@Component({
  selector: "gt-exercise-thumb",
  standalone: true,
  imports: [IconComponent],
  template: `@if(exercise()){
 @if(visual().cell!==undefined&&!failed()){
  <svg class="mannequin-artwork" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="label()"><svg x="0" y="0" width="512" height="512" [attr.viewBox]="viewBox()" overflow="hidden"><image [attr.href]="visible()?visual().source:null" x="0" y="0" width="1536" height="1024" (error)="failed.set(true)"/></svg></svg>
 }@else{
  <img [src]="failed()?neutral:visual().source" [alt]="label()" loading="lazy" (error)="failed.set(true)"/>
 }
}@else{<gt-icon name="weight"/>}`,
  styles: [
    `:host{width:var(--thumb-width,60px);height:var(--thumb-height,50px);border-radius:9px;display:grid;place-items:center;overflow:hidden;background:#050918;flex-shrink:0;color:var(--accent-text,#4dafff)}img,.mannequin-artwork{width:100%;height:100%;object-fit:contain;display:block;overflow:hidden}`,
  ],
})
export class ExerciseThumbComponent implements AfterViewInit {
  private element = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;
  visible = signal(false);
  exercise = input<Exercise>();
  failed = signal(false);
  neutral = "/training/figures/muscle-front-v2.png";
  visual = computed(() => exerciseThumbnail(this.exercise()));
  label = computed(
    () =>
      `${this.failed() || this.visual().family === "movement" ? "Anatomia di riferimento" : "Illustrazione della famiglia di movimento"}: ${this.exercise()?.name || ""}`,
  );
  viewBox = computed(() => {
    const cell = this.visual().cell ?? 0;
    return `${(cell % 3) * 512} ${Math.floor(cell / 3) * 512} 512 512`;
  });
  ngAfterViewInit() {
    if (typeof IntersectionObserver === "undefined") {
      this.visible.set(true);
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.visible.set(true);
          this.observer?.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    this.observer.observe(this.element.nativeElement);
  }
  ngOnDestroy() {
    this.observer?.disconnect();
  }
  constructor() {
    effect(() => {
      this.visual();
      this.failed.set(false);
    });
  }
}
