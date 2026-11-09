import { AppFeaturesService } from "../services/app-features";
import { CalendarSubscriptionComponent } from "../shared/calendar-subscription.component";
import { DateFieldComponent } from "../shared/date-field.component";
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { confirmationForContext } from "../services/confirmation";
import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
} from "@angular/core";
import { TodayService } from "../services/today";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { A11yModule } from "@angular/cdk/a11y";
import { Store } from "../services/store";
import {
  CalendarEventKind,
  localDate,
  ScheduledWorkout,
  uid,
} from "../models/domain";
import {
  CalendarView,
  calendarDays,
  calendarActivity,
  DayActivity,
  moveDate,
  movePeriod,
  parseLocalDate,
  weeklyDates,
} from "../services/calendar";
import {
  CalendarAgendaItem,
  calendarAgendaByDate,
  calendarAgendaStats,
  calendarPlanScope,
  calendarKindIcon,
  calendarKindLabel,
  calendarStatusLabel,
  formatCalendarDuration,
} from "../services/calendar-agenda";
import {
  WorkoutResumeService,
  validWorkoutUi,
} from "../services/workout-resume";
import { formatSeconds, remainingSeconds } from "../services/rest-clock";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";

type AgendaFilter =
  "all" | "planned" | "completed" | "partial" | "rest" | "other";
type FormMode = "create" | "edit" | "move" | "duplicate";
@Component({
  standalone: true,
  imports: [
    CalendarSubscriptionComponent,
    DateFieldComponent,
    ExerciseThumbComponent,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    A11yModule,
    IconComponent,
    StatusComponent,
  ],
  templateUrl: "./calendar.component.html",
  styleUrl: "./calendar.component.css",
})
export class CalendarComponent {
  private confirmation = confirmationForContext();
  readonly s = inject(Store);
  readonly router = inject(Router);
  readonly features = inject(AppFeaturesService, { optional: true });
  private resume = inject(WorkoutResumeService, { optional: true });
  private host = inject<ElementRef<HTMLElement>>(ElementRef, {
    optional: true,
  });
  private todayClock = inject(TodayService, { optional: true });
  private scrollKey = "";
  private frame: number | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private destroyed = false;
  private clock = signal(Date.now());
  get today() {
    return this.todayClock?.date() || localDate();
  }
  private lastToday = this.today;
  private followsToday = true;
  readonly view = signal<CalendarView>("week");
  readonly selected = signal(this.today);
  readonly weekdays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  readonly kindOptions: {
    value: CalendarEventKind;
    label: string;
    icon: string;
  }[] = (
    ["workout", "cardio", "mobility", "rest", "other"] as CalendarEventKind[]
  ).map((value) => ({
    value,
    label: calendarKindLabel(value),
    icon: calendarKindIcon(value),
  }));
  readonly dates = computed(() => {
    const dates = calendarDays(this.selected(), this.view());
    if (this.view() !== "month") return dates;
    const month = this.selected().slice(0, 7);
    while (
      dates.length > 28 &&
      dates.slice(-7).every((date) => date.slice(0, 7) !== month)
    )
      dates.splice(-7);
    return dates;
  });
  readonly periodDates = computed(() =>
    this.view() === "month"
      ? this.dates().filter(
          (date) => date.slice(0, 7) === this.selected().slice(0, 7),
        )
      : this.dates(),
  );
  // Index the archive once per change, not once per cell or clock tick.
  /** Di default il calendario mostra solo il piano attivo (più le attività senza piano); "Tutti i piani" mostra anche gli altri. */
  readonly planScope = signal<"active" | "all">("active");
  readonly orphanCount = computed(() => this.s.orphanPlannedEvents().length);
  async removeOrphans() {
    const count = this.orphanCount();
    if (!count || this.actionBusy()) return;
    if (
      !(await this.confirmation.ask({
        title: "Eliminare le sedute senza piano?",
        confirmLabel: "Elimina sedute",
        tone: "danger",
        detail:
          count === 1
            ? "1 seduta in programma"
            : count + " sedute in programma",
        message:
          "Queste sedute in programma appartengono a piani già eliminati. Verranno tolte dal calendario; gli allenamenti già registrati restano nello storico.",
      }))
    )
      return;
    this.actionBusy.set(true);
    try {
      await this.s.removeOrphanPlannedEvents();
    } finally {
      this.actionBusy.set(false);
    }
  }
  private agendaByDate = computed(() =>
    calendarAgendaByDate(
      calendarPlanScope(
        this.s.data(),
        this.planScope() === "active" ? this.s.activePlan()?.id : undefined,
      ),
    ),
  );
  readonly agendaItems = computed(
    () => this.agendaByDate().get(this.selected()) || [],
  );
  readonly filter = signal<AgendaFilter>("all");
  readonly kindFilter = signal<"all" | CalendarEventKind>("all");
  readonly visibleAgenda = computed(() =>
    this.agendaItems().filter((item) => this.passes(item)),
  );
  private selectedItemId = signal("");
  readonly selectedItem = computed<CalendarAgendaItem | undefined>(
    () =>
      this.visibleAgenda().find((item) => item.id === this.selectedItemId()) ||
      this.visibleAgenda()[0],
  );
  readonly summary = computed(() =>
    calendarAgendaStats(
      this.periodDates().flatMap((date) => this.agendaByDate().get(date) || []),
    ),
  );
  readonly dayStats = computed(() => calendarAgendaStats(this.agendaItems()));
  readonly moreOpen = signal(false);
  readonly actionBusy = signal(false);
  // Interface state of the redesigned calendar: filters sheet, add menu and contextual dock.
  readonly filtersOpen = signal(false);
  readonly addOpen = signal(false);
  readonly stateOptions: {
    value: AgendaFilter;
    label: string;
    state: string;
  }[] = [
    { value: "all", label: "Tutto", state: "all" },
    { value: "completed", label: "Completato", state: "completed" },
    { value: "planned", label: "In programma", state: "planned" },
    { value: "partial", label: "Parziale", state: "partial" },
    { value: "rest", label: "Riposo", state: "rest" },
    { value: "other", label: "Altro", state: "other" },
  ];
  readonly addOptions: {
    kind: CalendarEventKind;
    label: string;
    icon: string;
  }[] = [
    { kind: "workout", label: "Allenamento", icon: "weight" },
    { kind: "cardio", label: "Attività", icon: "activity" },
    { kind: "rest", label: "Riposo", icon: "moon" },
  ];
  readonly filtersActive = computed(
    () =>
      this.filter() !== "all" ||
      this.kindFilter() !== "all" ||
      this.planScope() !== "active",
  );
  readonly weekStrip = computed(() => calendarDays(this.selected(), "week"));
  private explicitSelection = computed(
    () =>
      !!this.selectedItemId() &&
      this.visibleAgenda().some((item) => item.id === this.selectedItemId()),
  );
  readonly dockVisible = computed(
    () =>
      !!this.selectedItem() &&
      (this.view() === "day" || this.explicitSelection()),
  );
  private minute = computed(() => Math.floor(this.clock() / 60000));
  /** Hour grid for the day view: items with a time become blocks, the others stay in a plain list. */
  readonly timeline = computed(() => {
    const items = this.visibleAgenda(),
      timed = items.filter((item) => !!item.time),
      untimed = items.filter((item) => !item.time);
    const minutes = (value: string) =>
      Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    if (!timed.length)
      return {
        untimed,
        hours: [] as { label: string; top: number }[],
        blocks: [] as {
          item: CalendarAgendaItem;
          top: number;
          height: number;
          lane: number;
          lanes: number;
        }[],
        height: 0,
        now: null as { top: number; label: string } | null,
      };
    const stamp = this.minute() * 60000,
      clock = new Date(stamp),
      nowMinutes =
        this.selected() === this.today
          ? clock.getHours() * 60 + clock.getMinutes()
          : -1;
    const spans = timed.map((item) => {
      const start = minutes(item.time!);
      return {
        item,
        start,
        end: start + Math.max(item.durationMinutes || 0, 58),
      };
    });
    let first = Math.min(...spans.map((span) => span.start)),
      last = Math.max(...spans.map((span) => span.end));
    if (
      nowMinutes >= 0 &&
      nowMinutes >= first - 180 &&
      nowMinutes <= last + 180
    ) {
      first = Math.min(first, nowMinutes);
      last = Math.max(last, nowMinutes);
    }
    let startHour = Math.max(0, Math.floor(first / 60) - 1),
      endHour = Math.min(24, Math.ceil(last / 60) + 1);
    while (endHour - startHour < 5) {
      if (endHour < 24) endHour++;
      else if (startHour > 0) startHour--;
      else break;
    }
    const perMinute = 1.1,
      origin = startHour * 60;
    const blocks: {
      item: CalendarAgendaItem;
      top: number;
      height: number;
      lane: number;
      lanes: number;
    }[] = [];
    let cluster: typeof blocks = [],
      laneEnds: number[] = [],
      clusterEnd = -1;
    const flush = () => {
      for (const block of cluster) block.lanes = laneEnds.length || 1;
      cluster = [];
      laneEnds = [];
    };
    for (const span of spans) {
      if (span.start >= clusterEnd) flush();
      let lane = laneEnds.findIndex((end) => end <= span.start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = span.end;
      clusterEnd = Math.max(clusterEnd, span.end);
      const block = {
        item: span.item,
        top: (span.start - origin) * perMinute,
        height: Math.max(64, (span.item.durationMinutes || 0) * perMinute),
        lane,
        lanes: 1,
      };
      cluster.push(block);
      blocks.push(block);
    }
    flush();
    const hours = Array.from(
      { length: endHour - startHour + 1 },
      (_, index) => ({
        label: String(startHour + index).padStart(2, "0") + ":00",
        top: index * 60 * perMinute,
      }),
    );
    const now =
      nowMinutes >= origin && nowMinutes <= endHour * 60
        ? {
            top: (nowMinutes - origin) * perMinute,
            label:
              String(clock.getHours()).padStart(2, "0") +
              ":" +
              String(clock.getMinutes()).padStart(2, "0"),
          }
        : null;
    return {
      untimed,
      hours,
      blocks,
      height: (endHour - startHour) * 60 * perMinute,
      now,
    };
  });
  /** Month grid cells with the information needed for ring colour and streak joins. */
  readonly monthCells = computed(() => {
    const dates = this.dates(),
      month = this.selected().slice(0, 7);
    const states = dates.map((date) =>
      date.slice(0, 7) === month ? this.dayState(date) : "out",
    );
    return dates.map((date, index) => ({
      date,
      state: states[index],
      out: states[index] === "out",
      joinLeft:
        states[index] === "completed" &&
        index % 7 > 0 &&
        states[index - 1] === "completed",
      joinRight:
        states[index] === "completed" &&
        index % 7 < 6 &&
        states[index + 1] === "completed",
      extra: (this.agendaByDate().get(date) || []).some(
        (item) => item.kind !== "workout" && item.kind !== "rest",
      ),
    }));
  });
  readonly durationText = formatCalendarDuration;
  readonly modal = signal(false);
  readonly saving = signal(false);
  readonly formMode = signal<FormMode>("create");
  editing = "";
  kind: CalendarEventKind = "workout";
  eventDate = this.today;
  eventTime = "";
  activityTitle = "";
  dayId = "";
  notes = "";
  repeatCount = 1;
  durationMinutes: number | null = null;
  estimatedCalories: number | null = null;
  private formId = "";
  private formVersion = 0;
  readonly availableDays = computed(() =>
    this.s
      .data()
      .days.filter((day) =>
        this.s
          .data()
          .plans.some(
            (plan) =>
              plan.id === day.planId && !plan.archived && !plan.completedAt,
          ),
      ),
  );
  readonly availablePlans = computed(() =>
    this.s
      .data()
      .plans.filter(
        (plan) =>
          !plan.archived &&
          !plan.completedAt &&
          this.availableDays().some((day) => day.planId === plan.id),
      ),
  );
  // Retain the existing public selectors used by date links and old archives.
  readonly activity = computed(() => calendarActivity(this.s.data()));
  readonly emptyActivity: DayActivity = {
    planned: 0,
    completed: 0,
    meals: 0,
    calories: 0,
  };
  readonly events = computed(() =>
    this.s
      .data()
      .scheduledWorkouts.filter((event) => event.date === this.selected()),
  );
  readonly completed = computed(() =>
    this.s
      .completed()
      .filter(
        (workout) =>
          workout.date === this.selected() &&
          !this.events().some((event) => event.workoutId === workout.id),
      ),
  );
  readonly visibleEvents = computed(() =>
    this.visibleAgenda().flatMap((item) => (item.event ? [item.event] : [])),
  );
  readonly visibleCompleted = computed(() =>
    this.visibleAgenda().flatMap((item) =>
      item.workout && !item.event && item.workout.status === "completed"
        ? [item.workout]
        : [],
    ),
  );
  readonly completedCount = computed(() => this.dayStats().completed);
  readonly periodStats = computed(() => ({
    planned: this.summary().planned + this.summary().partial,
    completed: this.summary().completed,
    active: this.periodDates().filter((date) =>
      (this.agendaByDate().get(date) || []).some(
        (item) => item.kind !== "rest" && item.status !== "missed",
      ),
    ).length,
  }));
  readonly target = computed(() =>
    this.view() === "week"
      ? this.s.settings().goals?.workoutsPerWeek
      : undefined,
  );
  readonly scoreProgress = computed(() => {
    const goal = this.target() || this.summary().total;
    return goal ? Math.min(100, (this.summary().completed / goal) * 100) : 0;
  });
  readonly upcoming = computed(() =>
    this.view() === "day"
      ? []
      : this.s
          .data()
          .scheduledWorkouts.filter(
            (event) =>
              this.periodDates().includes(event.date) &&
              event.date !== this.selected() &&
              !this.ended(event) &&
              !event.done &&
              this.linked(event)?.status !== "completed",
          )
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              (a.time || "99:99").localeCompare(b.time || "99:99"),
          )
          .slice(0, 4),
  );
  constructor() {
    const date = inject(ActivatedRoute).snapshot.queryParamMap.get("date");
    if (date) this.choose(date);
    if (this.todayClock)
      effect(() => {
        const today = this.today,
          previous = this.lastToday;
        this.lastToday = today;
        if (today !== previous && this.followsToday && !this.modal())
          this.choose(today);
      });
  }
  ngOnInit() {
    this.timer = setInterval(() => this.clock.set(Date.now()), 1000);
  }
  ngAfterViewChecked() {
    const key = this.view() + this.selected();
    if (!this.host || key === this.scrollKey) return;
    this.scrollKey = key;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const rail =
          this.host?.nativeElement.querySelector<HTMLElement>(
            "[data-week-rail]",
          ),
        active = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (rail && active && rail.scrollWidth > rail.clientWidth)
        rail.scrollTo({
          left: Math.max(
            0,
            active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2,
          ),
          behavior: "auto",
        });
    });
  }
  ngOnDestroy() {
    this.destroyed = true;
    this.formVersion++;
    clearInterval(this.timer);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }
  day(date: string) {
    return this.activity().get(date) || this.emptyActivity;
  }
  label(date: string) {
    return parseLocalDate(date).toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  shortLabel(date: string) {
    return parseLocalDate(date).toLocaleDateString("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  weekday(date: string) {
    return parseLocalDate(date)
      .toLocaleDateString("it-IT", { weekday: "short" })
      .replace(".", "");
  }
  monthLabel() {
    return parseLocalDate(this.selected()).toLocaleDateString("it-IT", {
      month: "long",
      year: "numeric",
    });
  }
  periodLabel() {
    const dates = this.dates();
    if (this.view() === "day") return this.label(this.selected());
    if (this.view() === "month") return this.monthLabel();
    const first = parseLocalDate(dates[0]),
      last = parseLocalDate(dates[6]);
    return first.getMonth() === last.getMonth()
      ? `${first.getDate()}–${last.getDate()} ${last.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}`
      : `${first.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(first.getFullYear() !== last.getFullYear() ? { year: "numeric" as const } : {}) })} – ${last.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  periodTitle() {
    return this.view() === "week"
      ? "La tua settimana"
      : this.view() === "month"
        ? "Il tuo mese"
        : "Il tuo giorno";
  }
  dayHint(date: string) {
    const stats = calendarAgendaStats(this.agendaByDate().get(date) || []);
    return stats.completed
      ? `${stats.completed} svolti`
      : stats.partial
        ? "In corso"
        : stats.planned
          ? `${stats.planned} in programma`
          : stats.rest
            ? "Riposo"
            : "Libero";
  }
  dayAria(date: string) {
    const stats = calendarAgendaStats(this.agendaByDate().get(date) || []);
    return `${this.label(date)}, ${stats.planned} in programma, ${stats.completed} completati, ${stats.partial} in corso, ${stats.rest} riposi${date === this.today ? ", oggi" : ""}`;
  }
  dateHas(date: string, value: string) {
    return (this.agendaByDate().get(date) || []).some(
      (item) => item.status === value || item.kind === value,
    );
  }
  dateMarkers(date: string) {
    const items = this.agendaByDate().get(date) || [],
      seen = new Set<string>();
    return [...items]
      .sort(
        (a, b) =>
          [
            "completed",
            "partial",
            "planned",
            "rest",
            "other",
            "missed",
          ].indexOf(a.status) -
          [
            "completed",
            "partial",
            "planned",
            "rest",
            "other",
            "missed",
          ].indexOf(b.status),
      )
      .filter((item) => {
        const key = item.status + item.kind;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((item) => ({
        icon:
          item.status === "completed"
            ? "check"
            : item.status === "partial"
              ? "clock"
              : calendarKindIcon(item.kind),
        label:
          calendarStatusLabel(item.status) +
          " · " +
          calendarKindLabel(item.kind),
        status: item.status,
        kind: item.kind,
      }));
  }
  move(direction: number) {
    this.followsToday = false;
    this.selected.set(movePeriod(this.selected(), this.view(), direction));
    this.resetSelection();
  }
  passes(item: CalendarAgendaItem) {
    return (
      (this.kindFilter() === "all" || item.kind === this.kindFilter()) &&
      (this.filter() === "all" || this.filter() === "planned"
        ? this.filter() === "all" ||
          item.status === "planned" ||
          item.status === "other"
        : item.status === this.filter())
    );
  }
  visibleFor(date: string) {
    return (this.agendaByDate().get(date) || []).filter((item) =>
      this.passes(item),
    );
  }
  /** Overall state of a day, used for the month rings, the day strip and the week bars. */
  dayState(date: string) {
    const stats = calendarAgendaStats(this.agendaByDate().get(date) || []);
    return stats.partial
      ? "partial"
      : stats.planned
        ? stats.completed
          ? "partial"
          : "planned"
        : stats.completed
          ? "completed"
          : stats.rest
            ? "rest"
            : "";
  }
  dayBarHeight(date: string) {
    const stats = calendarAgendaStats(this.agendaByDate().get(date) || []);
    return this.dayState(date)
      ? Math.max(10, Math.min(44, ((stats.durationMinutes || 45) / 75) * 44))
      : 5;
  }
  headTitle() {
    const date = parseLocalDate(this.selected());
    if (this.view() === "day")
      return date.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
      });
    if (this.view() === "month")
      return date.toLocaleDateString("it-IT", { month: "long" });
    const dates = this.dates(),
      first = parseLocalDate(dates[0]),
      last = parseLocalDate(dates[6]);
    return first.getMonth() === last.getMonth()
      ? `${first.getDate()} – ${last.getDate()}`
      : `${first.getDate()} ${first.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")} – ${last.getDate()} ${last.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}`;
  }
  headSub() {
    const date = parseLocalDate(this.selected());
    if (this.view() === "day")
      return date.toLocaleDateString("it-IT", { month: "long" });
    if (this.view() === "month") return String(date.getFullYear());
    const dates = this.dates(),
      first = parseLocalDate(dates[0]),
      last = parseLocalDate(dates[6]);
    return first.getMonth() === last.getMonth()
      ? last.toLocaleDateString("it-IT", { month: "long" })
      : String(last.getFullYear());
  }
  navSummary() {
    const stats = this.view() === "day" ? this.dayStats() : this.summary();
    const parts = [
      `${stats.completed} ${stats.completed === 1 ? "completata" : "completate"}`,
    ];
    if (stats.partial) parts.push(`${stats.partial} in corso`);
    if (stats.planned)
      parts.push(
        `${stats.planned} ${stats.planned === 1 ? "prevista" : "previste"}`,
      );
    return stats.total || stats.rest ? parts.join(" · ") : "Nessuna attività";
  }
  weekGoalText() {
    const target = this.target();
    if (!target)
      return `${this.summary().completed} di ${this.summary().total} attività completate`;
    const left = target - this.summary().completed;
    return left > 0
      ? `Ancora ${left} ${left === 1 ? "allenamento" : "allenamenti"} per chiudere la settimana`
      : "Obiettivo raggiunto: ottimo lavoro";
  }
  isSelected(item: CalendarAgendaItem) {
    return this.dockVisible() && this.selectedItem()?.id === item.id;
  }
  visibleCount() {
    return this.view() === "day"
      ? this.visibleAgenda().length
      : this.periodDates().reduce(
          (total, date) => total + this.visibleFor(date).length,
          0,
        );
  }
  hiddenByFilters(date: string) {
    return (
      !!(this.agendaByDate().get(date) || []).length &&
      !this.visibleFor(date).length
    );
  }
  openAdd(kind: CalendarEventKind) {
    this.addOpen.set(false);
    this.open();
    this.kind = kind;
    this.formKindChanged();
  }
  closeSheets() {
    this.filtersOpen.set(false);
    this.addOpen.set(false);
  }
  pickItem(item: CalendarAgendaItem) {
    if (item.date !== this.selected()) this.choose(item.date);
    this.selectedItemId.set(item.id);
    this.moreOpen.set(false);
  }
  resetFilters() {
    this.filter.set("all");
    this.kindFilter.set("all");
    this.planScope.set("active");
    this.resetSelection();
  }
  choose(date: string) {
    try {
      parseLocalDate(date);
      this.followsToday = date === this.today;
      this.selected.set(date);
      this.resetSelection();
    } catch {}
  }
  tomorrow() {
    this.choose(moveDate(this.today, 1));
  }
  private resetSelection() {
    this.selectedItemId.set("");
    this.moreOpen.set(false);
  }
  selectFilter(value: AgendaFilter) {
    this.filter.set(value);
    this.resetSelection();
  }
  selectItem(item: CalendarAgendaItem) {
    this.selectedItemId.set(item.id);
    this.moreOpen.set(false);
  }
  linked(event: ScheduledWorkout) {
    return this.s
      .data()
      .workouts.find((workout) => workout.id === event.workoutId);
  }
  ended(event: ScheduledWorkout) {
    return (
      (event.kind || "workout") === "workout" &&
      !this.linked(event) &&
      !!this.s.data().plans.find((plan) => plan.id === event.planId)
        ?.completedAt
    );
  }
  available(event: ScheduledWorkout) {
    return (
      (event.kind || "workout") !== "workout" ||
      !!this.linked(event) ||
      this.availableDays().some((day) => day.id === event.dayId)
    );
  }
  planName(id: string) {
    return this.s.data().plans.find((plan) => plan.id === id)?.name || "";
  }
  daySummary(id: string) {
    const exercises = this.s.planExercises(id);
    return exercises.length
      ? `${exercises.length} esercizi · ${exercises.reduce((n, exercise) => n + exercise.sets, 0)} serie`
      : "Programmazione salvata";
  }
  muscles(id: string) {
    return [
      ...new Set(
        this.s
          .planExercises(id)
          .map((exercise) =>
            this.s.muscle(
              this.s.exercise(exercise.exerciseId)?.muscleGroupId || "",
            ),
          )
          .filter(Boolean),
      ),
    ].join(" · ");
  }
  itemTime(item: CalendarAgendaItem) {
    return item.time || "";
  }
  itemIcon(item: CalendarAgendaItem) {
    return calendarKindIcon(item.kind);
  }
  itemStatus(item: CalendarAgendaItem) {
    return calendarStatusLabel(item.status);
  }
  itemDetails(item: CalendarAgendaItem) {
    if (item.kind !== "workout")
      return item.durationMinutes
        ? formatCalendarDuration(item.durationMinutes)
        : calendarKindLabel(item.kind);
    const exercises = item.workout
      ? this.s.workoutExercises(item.workout.id).length
      : this.s.planExercises(item.event?.dayId || "").length;
    return exercises
      ? `${exercises} esercizi · ${item.totalSets} serie`
      : "Programmazione salvata";
  }
  itemMuscles(item: CalendarAgendaItem) {
    return item.kind === "workout"
      ? this.muscles(item.workout?.dayId || item.event?.dayId || "")
      : "";
  }
  itemExercise(item: CalendarAgendaItem) {
    if (item.kind !== "workout") return undefined;
    const id = item.workout
      ? this.s.workoutExercises(item.workout.id)[0]?.exerciseId
      : this.s.planExercises(item.event?.dayId || "")[0]?.exerciseId;
    return id ? this.s.exercise(id) : undefined;
  }
  itemCanStart(item: CalendarAgendaItem) {
    return (
      item.kind === "workout" &&
      item.status !== "completed" &&
      item.status !== "missed" &&
      (!!item.workout || (!!item.event && this.available(item.event)))
    );
  }
  itemActionLabel(item: CalendarAgendaItem) {
    return item.status === "partial"
      ? "Riprendi allenamento"
      : item.date < this.today
        ? "Registra allenamento passato"
        : "Inizia allenamento";
  }
  canDuplicate(item = this.selectedItem()) {
    if (!item) return false;
    if (item.kind !== "workout") return true;
    const dayId = item.workout?.dayId || item.event?.dayId,
      planId = item.workout?.planId || item.event?.planId;
    return (
      this.availableDays().some((day) => day.id === dayId) &&
      !this.s.data().plans.find((plan) => plan.id === planId)?.program
    );
  }
  canMove(item = this.selectedItem()) {
    return (
      !!item?.event &&
      !item.event.workoutId &&
      !item.workout &&
      !item.event.done &&
      this.available(item.event)
    );
  }
  canRemove(item = this.selectedItem()) {
    if (item?.workout)
      return (
        item.workout.status !== "completed" ||
        this.s.settings().allowCompletedWorkoutDeletion === true
      );
    return !!item?.event && !item.event.done;
  }
  repeatPreview() {
    try {
      return weeklyDates(this.eventDate, Number(this.repeatCount))
        .map((date) => this.shortLabel(date))
        .join(" · ");
    } catch {
      return "";
    }
  }
  formTitle() {
    return this.formMode() === "move"
      ? "Sposta attività"
      : this.formMode() === "duplicate"
        ? "Duplica attività"
        : this.formMode() === "edit"
          ? "Modifica attività"
          : "Aggiungi al calendario";
  }
  formKindChanged() {
    if (this.kind === "rest") this.estimatedCalories = null;
  }
  private fillForm(event?: ScheduledWorkout) {
    this.kind = event?.kind || "workout";
    this.eventDate = event?.date || this.selected();
    this.eventTime = event?.time || "";
    this.activityTitle = event?.dayName || "";
    this.dayId =
      event?.dayId || this.s.nextDay()?.id || this.availableDays()[0]?.id || "";
    this.notes = event?.notes || "";
    this.repeatCount = 1;
    this.durationMinutes = event?.durationMinutes ?? null;
    this.estimatedCalories = event?.estimatedCalories ?? null;
  }
  open(event?: ScheduledWorkout) {
    if (event && (event.workoutId || event.done)) {
      this.s.error.set(
        "Un’attività già avviata o completata mantiene la sua programmazione.",
      );
      return;
    }
    this.formVersion++;
    this.formId = event?.id || uid();
    this.s.error.set("");
    this.editing = event?.id || "";
    this.formMode.set(event ? "edit" : "create");
    this.fillForm(event);
    this.moreOpen.set(false);
    this.modal.set(true);
  }
  editSelected() {
    const item = this.selectedItem();
    if (this.canMove(item) && item?.event) this.open(item.event);
    else
      this.s.error.set(
        "Questa attività si può consultare senza modificarne i dati registrati.",
      );
  }
  quickDuplicate() {
    const item = this.selectedItem();
    if (!item || !this.canDuplicate(item)) return;
    const source = item.event || {
      id: "",
      date: item.date,
      planId: item.workout!.planId,
      dayId: item.workout!.dayId,
      planName: item.planName,
      dayName: item.title,
      notes: item.notes,
    };
    this.open();
    this.fillForm(source);
    this.formMode.set("duplicate");
    this.editing = "";
    this.formId = uid();
    this.eventDate = moveDate(item.date, 7);
  }
  quickMove() {
    const item = this.selectedItem();
    if (!item?.event || !this.canMove(item)) return;
    this.open(item.event);
    this.formMode.set("move");
  }
  async quickRemove() {
    const item = this.selectedItem();
    if (!item || !this.canRemove(item) || this.actionBusy()) return;
    if (!item.workout) {
      if (item.event) await this.remove(item.event);
      return;
    }
    this.actionBusy.set(true);
    const archive = this.s.archiveKey();
    try {
      if (
        !(await this.confirmation.ask({
          title: "Eliminare questo allenamento?",
          message:
            item.title +
            " · " +
            item.date.split("-").reverse().join("/") +
            ". La sessione, tutte le sue serie e la relativa voce nel calendario saranno eliminate definitivamente. Statistiche e record saranno ricalcolati. Il piano e gli altri allenamenti restano conservati.",
          confirmLabel: "Elimina allenamento",
          tone: "danger",
        }))
      )
        return;
      if (
        !this.destroyed &&
        archive === this.s.archiveKey() &&
        (await this.s.deleteWorkout(item.workout.id, {
          confirmedCompleted: true,
        }))
      ) {
        this.selectedItemId.set("");
        this.moreOpen.set(false);
      }
    } finally {
      this.actionBusy.set(false);
    }
  }
  close() {
    this.formVersion++;
    this.modal.set(false);
  }
  backdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.close();
  }
  async save() {
    if (this.saving() || !this.modal()) return;
    this.saving.set(true);
    const version = this.formVersion,
      archive = this.s.archiveKey(),
      snapshot = {
        id: (this.formId ||= this.editing || uid()),
        mode: this.formMode(),
        date: this.eventDate,
        time: this.eventTime.trim() || undefined,
        dayId: this.dayId,
        kind: this.kind,
        title: this.activityTitle,
        notes: this.notes,
        repeat: Number(this.repeatCount),
        durationMinutes:
          this.durationMinutes === null
            ? undefined
            : Number(this.durationMinutes),
        estimatedCalories:
          this.estimatedCalories === null
            ? undefined
            : Number(this.estimatedCalories),
      };
    try {
      const saved =
        snapshot.mode === "move"
          ? await this.s.moveCalendarEvent(
              snapshot.id,
              snapshot.date,
              snapshot.time || "",
            )
          : snapshot.kind === "workout"
            ? await this.s.scheduleWorkout(
                snapshot.date,
                snapshot.dayId,
                snapshot.notes,
                snapshot.id,
                snapshot.repeat,
                {
                  time: snapshot.time,
                  durationMinutes: snapshot.durationMinutes,
                  estimatedCalories: snapshot.estimatedCalories,
                },
              )
            : await this.s.scheduleCalendarActivity(
                {
                  id: snapshot.id,
                  date: snapshot.date,
                  kind: snapshot.kind,
                  title: snapshot.title,
                  notes: snapshot.notes,
                  time: snapshot.time,
                  durationMinutes: snapshot.durationMinutes,
                  estimatedCalories: snapshot.estimatedCalories,
                },
                snapshot.repeat,
              );
      if (
        saved &&
        !this.destroyed &&
        version === this.formVersion &&
        archive === this.s.archiveKey()
      ) {
        this.choose(snapshot.date);
        this.filter.set("all");
        this.kindFilter.set("all");
        this.close();
      }
    } catch (error) {
      if (
        !this.destroyed &&
        version === this.formVersion &&
        archive === this.s.archiveKey()
      )
        this.s.error.set(
          error instanceof Error
            ? error.message
            : "Programmazione non salvata. Riprova.",
        );
    } finally {
      this.saving.set(false);
    }
  }
  async duplicate(event: ScheduledWorkout) {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    const version = this.formVersion,
      archive = this.s.archiveKey(),
      date = moveDate(event.date, 7),
      options = {
        time: event.time,
        durationMinutes: event.durationMinutes,
        estimatedCalories: event.estimatedCalories,
      };
    try {
      const saved =
        (event.kind || "workout") === "workout"
          ? await this.s.scheduleWorkout(
              date,
              event.dayId,
              event.notes,
              uid(),
              1,
              options,
            )
          : await this.s.scheduleCalendarActivity({
              id: uid(),
              date,
              kind: event.kind as Exclude<CalendarEventKind, "workout">,
              title: event.dayName,
              notes: event.notes,
              ...options,
            });
      if (
        this.destroyed ||
        version !== this.formVersion ||
        archive !== this.s.archiveKey()
      )
        return;
      if (saved) {
        this.choose(date);
        this.filter.set("all");
        this.kindFilter.set("all");
      } else {
        this.open();
        this.fillForm(event);
        this.formMode.set("duplicate");
        this.eventDate = date;
      }
    } finally {
      this.actionBusy.set(false);
    }
  }
  async start(event: ScheduledWorkout) {
    if (this.actionBusy() || (event.kind || "workout") !== "workout") return;
    this.actionBusy.set(true);
    const archive = this.s.archiveKey();
    try {
      if (
        event.date > this.today &&
        !(await this.confirmation.ask(
          "Iniziare ora questo allenamento? La sessione verrà registrata nella data di oggi.",
        ))
      )
        return;
      if (this.destroyed || archive !== this.s.archiveKey()) return;
      const date =
        this.linked(event)?.status === "draft" || event.date > this.today
          ? undefined
          : event.date;
      if (
        (await this.s.startScheduled(event.id, date)) &&
        !this.destroyed &&
        archive === this.s.archiveKey()
      )
        await this.router.navigateByUrl("/sessione");
    } finally {
      this.actionBusy.set(false);
    }
  }
  async startItem(item: CalendarAgendaItem) {
    if (!this.itemCanStart(item)) return;
    if (item.event) await this.start(item.event);
    else if (item.workout?.status === "draft")
      await this.router.navigateByUrl("/sessione");
  }
  async viewItem(item: CalendarAgendaItem) {
    if (item.workout?.status === "completed")
      await this.router.navigateByUrl(
        "/allenamenti?workout=" + encodeURIComponent(item.workout.id),
      );
    else if (item.event && item.kind === "workout")
      await this.router.navigateByUrl(
        "/anteprima-allenamento?scheduled=" +
          encodeURIComponent(item.event.id) +
          "&return=calendario",
      );
    else if (item.workout) await this.router.navigateByUrl("/sessione");
    else {
      this.selectItem(item);
      this.view.set("day");
    }
  }
  async toggleItem(item: CalendarAgendaItem) {
    if (
      this.actionBusy() ||
      !item.event ||
      item.kind === "workout" ||
      item.kind === "rest"
    )
      return;
    this.actionBusy.set(true);
    try {
      await this.s.toggleCalendarActivity(item.event.id);
    } finally {
      this.actionBusy.set(false);
    }
  }
  async remove(event: ScheduledWorkout) {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    const archive = this.s.archiveKey();
    try {
      if (
        !(await this.confirmation.ask({
          title: "Rimuovere dal calendario?",
          message:
            "La voce sarà rimossa dal calendario. Le sessioni e le serie registrate restano nel tuo archivio.",
          confirmLabel: "Rimuovi",
          tone: "danger",
        }))
      )
        return;
      if (!this.destroyed && archive === this.s.archiveKey())
        await this.s.removeCalendarEvent(event.id);
    } finally {
      this.actionBusy.set(false);
    }
  }
  private restState(item: CalendarAgendaItem) {
    if (item.workout?.status !== "draft") return undefined;
    const state = this.s
      .data()
      .workoutUi.find((ui) => ui.id === item.workout!.id);
    return this.resume
      ? this.resume.read(
          this.s.archiveKey(),
          item.workout.id,
          state,
          this.s.archiveRevision(),
        )
      : validWorkoutUi(state)
        ? state
        : undefined;
  }
  restFor(item: CalendarAgendaItem) {
    const state = this.restState(item);
    if (!state || !state.restTotal || (!state.paused && !state.restEnd))
      return null;
    const remaining = state.paused
      ? state.pausedSeconds
      : remainingSeconds(state.restEnd, this.clock());
    return { time: formatSeconds(remaining), paused: state.paused };
  }
  async openRest(item: CalendarAgendaItem) {
    const state = this.restState(item);
    if (!state || !item.workout || !this.restFor(item)) return;
    this.resume?.write(
      this.s.archiveKey(),
      { ...state, step: "rest", updatedAt: new Date().toISOString() },
      this.s.archiveRevision(),
    );
    await this.router.navigateByUrl("/sessione");
  }
}
