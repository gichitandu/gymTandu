import { Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { TodayService } from "../services/today";
import { localDate } from "../models/domain";
import {
  buildPlanStatistics,
  PlanExerciseStatistics,
  PlanSessionStatistics,
} from "../services/plan-statistics";
import { DataChartComponent } from "../shared/data-chart.component";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DataChartComponent,
    IconComponent,
    StatusComponent,
  ],
  templateUrl: "./plan-dashboard.component.html",
  styleUrl: "./plan-dashboard.component.css",
})
export class PlanDashboardComponent {
  s = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private todayClock = inject(TodayService, { optional: true });
  id = signal("");
  finishOpen = signal(false);
  finishing = signal(false);
  cancelFuture = true;
  exerciseMetric: "weight" | "reps" = "weight";
  plan = computed(() =>
    this.s.data().plans.find((plan) => plan.id === this.id()),
  );
  stats = computed(() =>
    buildPlanStatistics(
      this.s.data(),
      this.id(),
      this.todayClock?.date() || localDate(),
    ),
  );
  title = computed(
    () =>
      this.plan()?.name ||
      this.stats().workouts[0]?.planName ||
      "Piano non disponibile",
  );
  volumePoints = computed(() =>
    this.stats()
      .byWeek.filter((row) => row.volumeSetCount > 0)
      .map((row) => ({ label: row.label, value: this.s.weight(row.volume) })),
  );
  attendancePoints = computed(() =>
    this.stats().byWeek.map((row) => ({
      label: row.label,
      value: row.completedCount,
    })),
  );
  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.id.set(params.get("id") || ""));
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.finishOpen.set(params.get("finish") === "1"));
  }
  choosePlan(id: string) {
    if (id) void this.router.navigate(["/piano", id]);
  }
  date(value: string) {
    const date = new Date(value.slice(0, 10) + "T12:00:00");
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("it-IT", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  }
  duration(minutes: number | null) {
    if (minutes === null) return "—";
    const rounded = Math.round(minutes);
    if (rounded < 60) return rounded + " min";
    const hours = Math.floor(rounded / 60),
      rest = rounded % 60;
    return hours + " h" + (rest ? " " + rest + " min" : "");
  }
  status(row: PlanSessionStatistics) {
    return {
      completed: "Concluso",
      draft: "In corso",
      planned: "Programmato",
      missed: "Non svolto",
      cancelled: "Annullato",
    }[row.status];
  }
  weightLabel(row: PlanExerciseStatistics) {
    return row.mode === "weighted-bodyweight"
      ? "Zavorra massima"
      : row.mode === "assisted"
        ? "Assistenza registrata"
        : "Carico massimo";
  }
  exercisePoints(row: PlanExerciseStatistics) {
    const weights = this.exerciseMetric === "weight" && row.maxWeight !== null;
    return row.history.map((point) => ({
      label: this.date(point.date),
      value: weights ? this.s.weight(point.maxWeight!) : point.maxReps,
    }));
  }
  exerciseUnit(row: PlanExerciseStatistics) {
    return this.exerciseMetric === "weight" && row.maxWeight !== null
      ? this.s.settings().unit
      : "rip.";
  }
  async finish() {
    if (this.finishing() || !this.plan() || this.stats().draftCount) return;
    this.finishing.set(true);
    try {
      if (await this.s.finishPlan(this.id(), this.cancelFuture)) {
        this.finishOpen.set(false);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { finish: null },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      }
    } finally {
      this.finishing.set(false);
    }
  }
}
