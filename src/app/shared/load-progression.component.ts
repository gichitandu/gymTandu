import { Component, computed, inject, input, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Store } from "../services/store";
import { IconComponent } from "./icon.component";

@Component({
  selector: "gt-load-progression",
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `@let p = proposal();
    <details class="progression-card" [open]="p.eligible">
      <summary class="progression-summary">
        <span
          ><gt-icon name="chart" /><b>Progressione del carico</b
          ><small>{{
            p.eligible
              ? "Una proposta da valutare"
              : p.status === "maintain"
                ? "Consolida il prossimo passo"
                : "Il tuo prossimo riferimento"
          }}</small></span
        ><gt-icon name="plus" />
      </summary>
      <div class="progression-top">
        <span><gt-icon name="bolt" />DAI TUOI ALLENAMENTI</span>
        @if (p.sourceDate) {
          <small>{{ date(p.sourceDate) }}</small>
        }
      </div>
      <h3>{{ p.title }}</h3>
      <p>{{ p.reason }}</p>
      @if (p.previousWeight !== undefined && p.nextWeight !== undefined) {
        <div class="progression-loads">
          <div>
            <small>Ultima seduta</small
            ><strong
              >{{ load(p.previousWeight) }}
              <span>{{ s.settings().unit }}</span></strong
            >
          </div>
          <gt-icon name="arrow" />
          <div>
            <small>La tua proposta</small
            ><strong
              >{{ load(p.nextWeight) }}
              <span>{{ s.settings().unit }}</span></strong
            >
          </div>
        </div>
      }
      @if (p.target; as target) {
        <div class="progression-target">
          Obiettivo attuale: {{ target.sets }} serie · {{ target.repsMin }}–{{
            target.repsMax
          }}
          ripetizioni. RPE di riferimento per l’aumento: massimo 8.
        </div>
      }
      <div class="progression-config">
        <label
          >Incremento disponibile ({{ s.settings().unit }})<input
            type="number"
            inputmode="decimal"
            min="0.1"
            step="0.25"
            [max]="s.weight(50)"
            [ngModel]="increment()"
            (ngModelChange)="increment.set($event)"
            aria-label="Incremento di carico disponibile sulla tua attrezzatura" /></label
        ><span
          >Scegli lo scatto reale della macchina o dei pesi. Per i manubri usa
          la stessa convenzione dello storico.</span
        >
      </div>
      @if (p.eligible) {
        <button
          class="primary full-width"
          (click)="apply()"
          [disabled]="s.busy()"
        >
          <span>Conferma {{ load(p.nextWeight!) }} {{ s.settings().unit }}</span
          ><gt-icon name="check" />
        </button>
      }
      <small class="progression-footnote"
        >La conferma aggiorna solo le serie allenanti ancora da completare. Il
        confronto usa la configurazione registrata; se cambi macchina, aggiorna
        prima i suoi dati. Valuta sempre tecnica e sensazioni.</small
      >
    </details>`,
  styles: [
    `
      :host {
        display: block;
      }
      .progression-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        list-style: none;
        min-height: 44px;
        margin: -5px 0;
      }
      .progression-summary::-webkit-details-marker {
        display: none;
      }
      .progression-summary > span {
        display: grid;
        grid-template-columns: 26px 1fr;
        gap: 3px 6px;
        align-items: center;
        min-width: 0;
      }
      .progression-summary b {
        font-size: 13px;
        letter-spacing: -0.2px;
        line-height: 1.4;
      }
      .progression-summary small {
        font-size: 10px;
        color: var(--muted);
        grid-column: 2;
        line-height: 1.4;
      }
      .progression-summary gt-icon {
        width: 18px;
        height: 18px;
        color: #6bb4ff;
        grid-row: 1/3;
      }
      .progression-summary > gt-icon {
        width: 16px;
        height: 16px;
        transition: transform 0.2s;
      }
      .progression-card[open] .progression-summary {
        margin-bottom: 23px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--line);
      }
      .progression-card[open] .progression-summary > gt-icon {
        transform: rotate(45deg);
      }
      .progression-card > p {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.65;
        margin: 0 0 16px;
      }
      @media (prefers-reduced-motion: reduce) {
        .progression-summary > gt-icon {
          transition: none;
        }
      }
    `,
  ],
})
export class LoadProgressionComponent {
  s = inject(Store);
  exerciseId = input.required<string>();
  increment = signal(2.5);
  proposal = computed(() =>
    this.s.progression(this.exerciseId(), this.s.kg(this.increment())),
  );
  load(kg: number) {
    return this.s
      .weight(kg)
      .toLocaleString("it-IT", { maximumFractionDigits: 2 });
  }
  date(date: string) {
    return new Date(date + "T12:00:00").toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
    });
  }
  async apply() {
    const p = this.proposal();
    if (!p.eligible) return;
    await this.s.applyProgression(
      this.exerciseId(),
      this.s.kg(this.increment()),
    );
  }
}
