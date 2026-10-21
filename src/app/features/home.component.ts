import { BackupReminderComponent } from "../shared/backup-reminder.component";
import { Component, computed, inject } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { Store } from "../services/store";
import { localDate } from "../models/domain";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { RingComponent } from "../shared/ring.component";
@Component({
  standalone: true,
  imports: [
    BackupReminderComponent,
    RouterLink,
    IconComponent,
    StatusComponent,
    RingComponent,
  ],
  templateUrl: "./home.component.html",
})
export class HomeComponent {
  s = inject(Store);
  router = inject(Router);
  today = localDate();
  goals = computed(() => this.s.settings().goals);
  Math = Math;
  firstName = computed(
    () => this.s.profile().name.trim().split(/\s+/)[0] || "atleta",
  );
  todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  totals = computed(() =>
    this.s
      .data()
      .meals.filter((m) => m.date === this.today)
      .reduce(
        (a, m) => ({
          calories: a.calories + m.calories,
          protein: a.protein + m.protein,
          carbs: a.carbs + m.carbs,
          fat: a.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
  );
  nextScheduled = computed(
    () =>
      this.s
        .data()
        .scheduledWorkouts.filter(
          (e) =>
            e.date >= this.today &&
            !this.s.completed().some((w) => w.id === e.workoutId),
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0],
  );
  week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
    return {
      date: localDate(d),
      label: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"][i],
      x: 8 + i * 14,
      y: [74, 40, 20, 13, 20, 40, 74][i],
    };
  });
  weekCount = computed(
    () =>
      this.s
        .completed()
        .filter((w) => this.week.some((day) => day.date === w.date)).length,
  );
  done(date: string) {
    return this.s.completed().some((w) => w.date === date);
  }
  planned(date: string) {
    return this.s
      .data()
      .scheduledWorkouts.some(
        (e) =>
          e.date === date &&
          !this.s.completed().some((w) => w.id === e.workoutId),
      );
  }
  dayAria(date: string) {
    return (
      this.dateLabel(date) +
      ": " +
      (this.done(date)
        ? "allenamento svolto"
        : this.planned(date)
          ? "allenamento programmato"
          : "nessun allenamento")
    );
  }
  dateLabel(date: string) {
    return new Date(date + "T12:00:00").toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  async start(id: string) {
    if (await this.s.start(id)) await this.router.navigateByUrl("/sessione");
  }
  async startEvent(id: string) {
    const e = this.s.data().scheduledWorkouts.find((e) => e.id === id);
    if (e?.date !== this.today) {
      await this.router.navigate(["/calendario"], {
        queryParams: { date: e?.date },
      });
      return;
    }
    if (await this.s.startScheduled(id))
      await this.router.navigateByUrl("/sessione");
  }
}
