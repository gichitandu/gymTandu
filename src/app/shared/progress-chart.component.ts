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
import { FormsModule } from "@angular/forms";
import Chart from "chart.js/auto";
import { Store } from "../services/store";
import { Metric, chartSeries } from "../services/statistics";
import { IconComponent } from "./icon.component";
@Component({
  selector: "gt-progress-chart",
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `<div class="filters">
      <label
        >Piano<select [ngModel]="plan()" (ngModelChange)="plan.set($event)">
          <option value="">Tutti i piani</option>
          @for (p of s.data().plans; track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select></label
      >
      @if (metric() !== "weekly") {
        <label
          >Esercizio<select
            [ngModel]="exercise() || defaultId()"
            (ngModelChange)="exercise.set($event);machine.set('')"
          >
            @for (e of s.data().exercises; track e.id) {
              <option [value]="e.id">{{ e.name }}</option>
            }
          </select></label
        >
      }
      @if(metric()!=='weekly'&&s.configurations(exercise()||defaultId()).length){<label>Configurazione macchina<select [ngModel]="machine()" (ngModelChange)="machine.set($event)"><option value="">Tutte le configurazioni</option>@for(config of s.configurations(exercise()||defaultId());track config.key){<option [value]="config.key">{{config.label}}</option>}</select></label>}
      <label
        >Periodo<select
          [ngModel]="months()"
          (ngModelChange)="months.set(+$event)"
        >
          <option value="1">1 mese</option>
          <option value="3">3 mesi</option>
          <option value="6">6 mesi</option>
          <option value="12">1 anno</option>
          <option value="0">Tutto</option>
        </select></label
      ><label
        >Metrica<select
          [ngModel]="metric()"
          (ngModelChange)="metric.set($event)"
        >
          <option value="weight">Peso massimo</option>
          <option value="volume">Volume totale</option>
          <option value="rm">1RM stimato</option>
          <option value="reps">Ripetizioni massime</option>
          <option value="weekly">Volume settimanale</option>
        </select></label
      >
    </div>
    <div
      class="chart-wrap"
      [style.display]="points().length ? 'block' : 'none'"
    >
      <canvas
        #canvas
        role="img"
        [attr.aria-label]="
          'Grafico ' +
          metricLabel() +
          ' con ' +
          points().length +
          ' osservazioni'
        "
      ></canvas>
    </div>
    @if (!points().length) {
      <div class="chart-empty">
        <gt-icon name="chart" /><b>Ogni progresso ha un inizio</b
        ><span
          >Le sessioni completate compariranno qui. Per corpo libero, zavorra e
          assistenza usa peso o ripetizioni.</span
        >
      </div>
    }
<p class="subtle" style="font-size:11px;margin-top:12px">I carichi di macchine o configurazioni diverse possono non essere confrontabili. Usa il filtro quando disponibile.</p><div class="chart-footer">
      <span>{{
        metric() === "rm"
          ? "Stima Epley · non è un massimale testato"
          : metric() === "weekly" || metric() === "volume"
            ? "Solo carichi esterni · serie allenanti completate"
            : "Solo serie allenanti completate"
      }}</span
      ><span
        >{{ points().length }}
        {{ metric() === "weekly" ? "settimane" : "sessioni" }}</span
      >
    </div>`,
})
export class ProgressChartComponent implements AfterViewInit {
  s = inject(Store);
  initialMetric = input<Metric>("weight");
  plan = signal("");
  exercise = signal("");
  months = signal(3);machine=signal("");
  metric = signal<Metric>("weight");
  canvas = viewChild<ElementRef<HTMLCanvasElement>>("canvas");
  private chart?: Chart;
  private mounted = signal(false);
  defaultId = computed(() => this.s.data().exercises[0]?.id || "");
  points = computed(() =>
    chartSeries(
      this.s.data(),
      this.exercise() || this.defaultId(),
      this.plan(),
      this.months(),
      this.metric(),
      this.metric()==='weekly'?undefined:this.machine()||undefined,
    ),
  );
  constructor() {
    effect(() => {
      if (this.mounted()) this.draw();
    });
    effect(() => this.metric.set(this.initialMetric()));
  }
  ngAfterViewInit() {
    this.mounted.set(true);
  }
  metricLabel() {
    return {
      weight: "Peso massimo",
      volume: "Volume totale",
      rm: "1RM stimato",
      reps: "Ripetizioni massime",
      weekly: "Volume settimanale",
    }[this.metric()];
  }
  private draw() {
    const points = this.points();
    const unit = this.metric() === "reps" ? "rip" : this.s.settings().unit;
    const ctx = this.canvas()?.nativeElement;
    if (!ctx) return;
    this.chart?.destroy();
    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: points.map((p) =>
          new Date(p.date + "T12:00:00").toLocaleDateString("it-IT", {
            day: "numeric",
            month: "short",
          }),
        ),
        datasets: [
          {
            label: this.metricLabel(),
            data: points.map((p) =>
              this.metric() === "reps" ? p.value : this.s.weight(p.value),
            ),
            borderColor: "#4c8dff",
            backgroundColor: "#367dff15",
            fill: true,
            tension: 0.3,
            pointRadius: points.length < 20 ? 4 : 2,
            pointHoverRadius: 7,
            pointBackgroundColor: "#0f1724",
            pointBorderWidth: 2,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: "#1a2b45",
            padding: 12,
            callbacks: {
              label: (item) =>
                `${Number(item.raw).toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${unit}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#7e8da4", font: { size: 10 }, maxTicksLimit: 6 },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#26314466" },
            border: { display: false },
            ticks: {
              color: "#7e8da4",
              font: { size: 10 },
              maxTicksLimit: 5,
              callback: (value) => `${value} ${unit}`,
            },
          },
        },
      },
    });
  }
  ngOnDestroy() {
    this.chart?.destroy();
  }
}
