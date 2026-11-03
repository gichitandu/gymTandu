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
import { TodayService } from "../services/today";
import { localDate } from "../models/domain";
import { IconComponent } from "./icon.component";
import { ExerciseFilterComponent } from "./exercise-filter.component";
@Component({
  selector: "gt-progress-chart",
  standalone: true,
  imports: [FormsModule, IconComponent, ExerciseFilterComponent],
  template: `@if(showFilters()){<div class="filters">
      <label
        >Piano<select [ngModel]="plan()" (ngModelChange)="plan.set($event)">
          <option value="">Tutti i piani</option>
          @for (p of s.data().plans; track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select></label
      >
      @if (metric() !== "weekly") {
        <gt-exercise-filter [exercises]="s.data().exercises" [value]="exercise() || defaultId()"
          (choose)="exercise.set($event);machine.set('')" />
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
    </div>}
    <div
      class="chart-wrap"
      [class.compact]="compact()"
      [style.height.px]="compact()?200:null"
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
      <div class="chart-empty" [class.compact]="compact()">
        <gt-icon name="chart" /><b>Ogni progresso ha un inizio</b
        ><span
          >Le sessioni completate compariranno qui. Per corpo libero, zavorra e
          assistenza usa peso o ripetizioni.</span
        >
      </div>
    }
@if(!compact()){<p class="subtle" style="font-size:11px;margin-top:12px">I carichi di macchine o configurazioni diverse possono non essere confrontabili. Usa il filtro quando disponibile.</p><div class="chart-footer">
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
    </div>}`,
  styles:[`:host{display:block;min-width:0}.chart-wrap.compact{height:200px;position:relative}.chart-empty.compact{min-height:150px;padding:24px 12px}.chart-empty.compact b{font-size:15px}.chart-empty.compact span{font-size:11px;line-height:1.6}`],
})
export class ProgressChartComponent implements AfterViewInit {
  s = inject(Store);
  initialMetric = input<Metric>("weight");
  showFilters = input(true);
  planFilter = input<string|undefined>(undefined);
  monthsFilter = input<number|undefined>(undefined);
  daysFilter = input<number|undefined>(undefined);
  compact = input(false);
  plan = signal("");
  exercise = signal("");
  months = signal(3);machine=signal("");
  metric = signal<Metric>("weight");
  canvas = viewChild<ElementRef<HTMLCanvasElement>>("canvas");
  private chart?: Chart;
  private themeObserver?: MutationObserver;
  private themeSignature = "";
  private mounted = signal(false);
  private clock = inject(TodayService, {optional:true});
  defaultId = computed(() => this.s.data().exercises[0]?.id || "");
  points = computed(() =>
    chartSeries(
      this.s.data(),
      this.exercise() || this.defaultId(),
      this.plan(),
      this.months(),
      this.metric(),
      this.metric()==='weekly'?undefined:this.machine()||undefined,
      {today:this.clock?.date() ?? localDate(), days:this.daysFilter()},
    ),
  );
  constructor() {
    effect(() => {
      if (this.mounted()) this.draw();
    });
    effect(() => this.metric.set(this.initialMetric()));
    effect(() => {const plan=this.planFilter();if(plan!==undefined)this.plan.set(plan);});
    effect(() => {const months=this.monthsFilter();if(months!==undefined&&Number.isFinite(months)&&months>=0)this.months.set(months);});
  }
  ngAfterViewInit() {
    this.mounted.set(true);
    // Canvas colors are resolved once by Chart.js, so repaint when theme tokens change.
    if (typeof MutationObserver !== "undefined") {
      this.themeObserver = new MutationObserver(() => {
        const canvas = this.canvas()?.nativeElement;
        if (canvas && JSON.stringify(this.colors(canvas)) !== this.themeSignature) this.draw();
      });
      // Include scoped page/instance tokens and the isolated Studio preview.
      // Observe ancestors only, so chart renders do not observe their own subtree.
      for(let ancestor:HTMLElement|null=this.canvas()?.nativeElement||document.body;ancestor;ancestor=ancestor.parentElement)
        this.themeObserver.observe(ancestor, { attributes: true, attributeFilter: ["class", "style"] });
    }
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
    const colors = this.colors(ctx);
    this.themeSignature = JSON.stringify(colors);
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
            borderColor: colors.accentText,
            backgroundColor: context => {
              const {ctx,chartArea}=context.chart;
              if(!chartArea)return this.alpha(colors.accent, '20');
              const gradient=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
              gradient.addColorStop(0,this.alpha(colors.accent, colors.light?'45':'60'));
              gradient.addColorStop(1,this.alpha(colors.accent, '03'));
              return gradient;
            },
            fill: 'origin',
            tension: 0.35,
            cubicInterpolationMode: 'monotone',
            pointRadius: context => context.dataIndex===points.length-1?4:points.length<20?2.5:1.5,
            pointHoverRadius: 6,
            pointBackgroundColor: colors.accentText,
            pointBorderColor: this.alpha(colors.text,'A0'),
            pointBorderWidth: 1,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        layout:{padding:{top:8,right:5,bottom:0,left:0}},
        animation:{duration:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?0:220},
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            backgroundColor: colors.surface,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.line,
            borderWidth: 1,
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
            ticks: { color: colors.muted, font: { size: 10 }, maxTicksLimit: this.compact()?4:6, maxRotation:0, padding:9 },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: this.alpha(colors.line,'A0'), drawTicks:false, lineWidth:1 },
            border: { display: false, dash:[3,4] },
            ticks: {
              color: colors.muted,
              font: { size: 10 },
              padding:8,
              maxTicksLimit: 4,
              callback: value => this.compact()?this.axisLabel(Number(value)):`${this.axisLabel(Number(value))} ${unit}`,
            },
          },
        },
      },
    });
  }
  private alpha(color:string,opacity:string){return /^#[\da-f]{6}$/i.test(color)?color+opacity:color;}
  private axisLabel(value:number){
    const absolute=Math.abs(value);
    if(absolute>=1000000)return (value/1000000).toLocaleString('it-IT',{maximumFractionDigits:1})+'M';
    if(absolute>=1000)return (value/1000).toLocaleString('it-IT',{maximumFractionDigits:1})+'k';
    return value.toLocaleString('it-IT',{maximumFractionDigits:1});
  }
  private colors(canvas: HTMLCanvasElement) {
    const style = getComputedStyle(canvas);
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    const accent = token("--accent", "#be47ff");
    return {
      accent,
      accentText: token("--accent-text", accent),
      surface: token("--card", "#10152c"),
      text: token("--text", "#f7f6ff"),
      muted: token("--muted", "#a5b3d4"),
      line: token("--line", "#34436c"),
      light:style.colorScheme==='light',
    };
  }
  ngOnDestroy() {
    this.themeObserver?.disconnect();
    this.chart?.destroy();
  }
}
