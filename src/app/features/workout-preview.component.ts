import { ExerciseMotionComponent } from "../shared/exercise-motion.component";
import { Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { buildWorkoutPreview } from "../services/workout-preview";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { IconComponent } from "../shared/icon.component";
import { TrainingPlanExercise } from "../models/domain";

@Component({
  standalone: true,
  imports: [
    ExerciseMotionComponent,
    RouterLink,
    ExerciseThumbComponent,
    IconComponent,
  ],
  templateUrl: "./workout-preview.component.html",
  styleUrl: "./workout-preview.component.css",
})
export class WorkoutPreviewComponent {
  readonly s = inject(Store);
  private route = inject(ActivatedRoute);
  private scheduledId = signal("");
  private dayId = signal("");
  private returnTo = signal("");
  readonly preview = computed(() =>
    buildWorkoutPreview(this.s.data(), {
      scheduledId: this.scheduledId(),
      dayId: this.dayId(),
    }),
  );
  readonly backPath = computed(() => {
    const back = this.returnTo();
    if (back === "home") return "/";
    if (back === "piani") return "/piani";
    if (back === "piano" && this.preview().planId)
      return "/piano/" + encodeURIComponent(this.preview().planId!);
    return back === "calendario" || this.scheduledId()
      ? "/calendario"
      : "/piani";
  });
  readonly backParams = computed(() =>
    this.backPath() === "/calendario" && this.preview().date
      ? { date: this.preview().date }
      : this.backPath() === "/piani" && this.preview().planId
        ? {
            plan: this.preview().planId,
            ...(this.preview().week ? { week: this.preview().week } : {}),
          }
        : {},
  );
  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.scheduledId.set(params.get("scheduled") || "");
      this.dayId.set(params.get("day") || "");
      this.returnTo.set(params.get("return") || "");
    });
  }
  date(value: string) {
    const date = new Date(value + "T12:00:00");
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });
  }
  range(min: number | undefined, max: number | undefined) {
    return min === undefined
      ? String(max ?? "—")
      : max === undefined || max === min
        ? String(min)
        : min + "–" + max;
  }
  rest(seconds: number) {
    if (seconds < 60) return seconds.toLocaleString("it-IT") + " s";
    const minutes = Math.floor(seconds / 60),
      remaining = seconds % 60;
    return (
      minutes +
      " min" +
      (remaining ? " " + remaining.toLocaleString("it-IT") + " s" : "")
    );
  }
  hasAdvice(item: Readonly<TrainingPlanExercise>, description?: string) {
    return !!(item.warmupNotes || item.reference || item.notes || description);
  }
}
