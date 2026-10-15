import { Component, inject } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { DatePipe } from "@angular/common";
import { Store } from "../services/store";
import { ProgressChartComponent } from "../shared/progress-chart.component";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
@Component({
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    ProgressChartComponent,
    IconComponent,
    StatusComponent,
  ],
  template: ` <div class="page-heading">
      <div>
        <p class="eyebrow">IL TUO PROSSIMO LIVELLO</p>
        <h1>
          Ciao {{ s.profile().name }} <span style="font-size:26px">👋</span>
        </h1>
        <p class="subtle">Continua a migliorare, un allenamento alla volta.</p>
      </div>
      <div class="date"><gt-icon name="calendar" />{{ todayLabel }}</div>
    </div>
    <gt-status />
    <div class="stats-grid">
      <div class="card stat">
        <div class="stat-icon"><gt-icon name="weight" /></div>
        <span class="stat-label">Allenamenti completati</span>
        <div class="stat-value">{{ s.completed().length }}</div>
        <span class="stat-foot">Il tuo impegno, nel tempo</span>
      </div>
      <div class="card stat">
        <div class="stat-icon"><gt-icon name="activity" /></div>
        <span class="stat-label">Volume totale sollevato</span>
        <div class="stat-value">
          {{ s.formatWeight(s.totalVolume())
          }}<small>{{ s.settings().unit }}</small>
        </div>
        <span class="stat-foot">Solo carichi esterni</span>
      </div>
      <div class="card stat">
        <div class="stat-icon"><gt-icon name="trophy" /></div>
        <span class="stat-label">Esercizi con record</span>
        <div class="stat-value">{{ s.recordCount() }}</div>
        <span class="stat-foot">I tuoi riferimenti personali</span>
      </div>
      <div class="card stat">
        <div class="stat-icon"><gt-icon name="calendar" /></div>
        <span class="stat-label">Questa settimana</span>
        <div class="stat-value">
          {{ s.week().length }}<small>allenamenti</small>
        </div>
        <span class="stat-foot">Un passo più vicino all’obiettivo</span>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="stack">
        <section class="card chart-card">
          <div class="card-head">
            <div>
              <h2>La tua progressione</h2>
              <p>Piccoli miglioramenti. Grandi risultati.</p>
            </div>
            <a class="link" routerLink="/progressi"
              >Esplora <gt-icon name="arrow"
            /></a>
          </div>
          <gt-progress-chart />
        </section>
        <section class="card">
          <div class="card-head">
            <div>
              <h2>Ultimi allenamenti</h2>
              <p>Il lavoro fatto, nero su bianco.</p>
            </div>
            <a class="link" routerLink="/allenamenti"
              >Vedi tutti <gt-icon name="arrow"
            /></a>
          </div>
          @if (s.completed().length) {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Allenamento</th>
                    <th>Data</th>
                    <th>Volume</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of s.completed().slice(0, 3); track w.id) {
                    <tr>
                      <td>
                        <strong>{{ w.dayName }}</strong
                        ><small>{{ w.planName }}</small>
                      </td>
                      <td>{{ w.date | date: "dd/MM" }}</td>
                      <td>
                        {{ s.formatWeight(s.volume(w.id)) }}
                        {{ s.settings().unit }}
                      </td>
                      <td>
                        <a
                          routerLink="/allenamenti"
                          class="link"
                          aria-label="Vai allo storico"
                          ><gt-icon name="arrow"
                        /></a>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty">
              <gt-icon name="activity" />
              <h3>Il primo allenamento ti aspetta</h3>
              <p>Le tue sessioni appariranno qui dopo averle completate.</p>
            </div>
          }
        </section>
      </div>
      <div class="stack">
        <section class="card next-card">
          <span class="pill">{{
            s.draft() ? "SESSIONE IN CORSO" : "IL PROSSIMO PASSO"
          }}</span>
          @if (s.draft(); as draft) {
            <h2>{{ draft.dayName }}</h2>
            <p>Il tuo allenamento è al sicuro. Riprendi da dove eri rimasto.</p>
            <a class="button primary" routerLink="/sessione"
              >Riprendi allenamento <gt-icon name="arrow"
            /></a>
          } @else if (s.nextDay(); as day) {
            <h2>{{ day.name }}</h2>
            <p>{{ s.activePlan()?.name }}</p>
            <div class="next-meta">
              <span
                ><gt-icon name="weight" />{{
                  s.planExercises(day.id).length
                }}
                esercizi</span
              ><span><gt-icon name="plans" />Giorno {{ day.order + 1 }}</span>
            </div>
            <button
              class="primary"
              (click)="start(day.id)"
              [disabled]="!s.ready() || s.busy()"
            >
              Inizia allenamento <gt-icon name="arrow" />
            </button>
          } @else {
            <h2>Scrivi il tuo<br />prossimo capitolo.</h2>
            <p>
              Un piano su misura è il primo passo. Scegli i tuoi esercizi e
              inizia a costruire.
            </p>
            <div class="next-meta">
              <span><gt-icon name="weight" />Il tuo ritmo</span
              ><span><gt-icon name="bolt" />Il tuo obiettivo</span>
            </div>
            <a class="button primary" routerLink="/piani"
              >Crea il primo piano <gt-icon name="arrow"
            /></a>
          }
        </section>
        <section class="card week-card">
          <div class="card-head">
            <div>
              <h2>La tua settimana</h2>
              <p>La costanza fa la differenza.</p>
            </div>
            <gt-icon name="calendar" />
          </div>
          <div class="week-days">
            @for (day of weekDays; track $index; let i = $index) {
              <div class="week-day">
                {{ day.label
                }}<i
                  [class.done]="dayDone(i)"
                  [class.today]="todayIndex === i"
                  >{{ dayDone(i) ? "✓" : day.date }}</i
                >
              </div>
            }
          </div>
          <p class="week-caption">
            <b style="color:var(--text)">{{ s.week().length }} sessioni</b>
            completate questa settimana
          </p>
        </section>
        <section class="card week-card">
          <div class="exercise-info">
            <span class="stat-icon" style="margin:0"
              ><gt-icon name="shield"
            /></span>
            <div>
              <h3>I tuoi progressi restano tuoi.</h3>
              <p class="subtle">
                Nessun account. Nessun abbonamento.<br />Solo tu e il tuo
                allenamento.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
    <div class="banner">
      <gt-icon name="download" />
      <div>
        <b>Proteggi il lavoro che stai facendo.</b>
        <p>
          Esporta periodicamente un backup: i dati sono salvati solo su questo
          dispositivo.
        </p>
      </div>
      <a class="link" routerLink="/profilo"
        >Gestisci backup <gt-icon name="arrow"
      /></a>
    </div>`,
})
export class HomeComponent {
  s = inject(Store);
  router = inject(Router);
  todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  todayIndex = (new Date().getDay() + 6) % 7;
  weekDays = ["L", "M", "M", "G", "V", "S", "D"].map((label, i) => {
    const d = new Date();
    d.setDate(d.getDate() - this.todayIndex + i);
    return { label, date: d.getDate() };
  });
  dayDone(index: number) {
    return this.s
      .week()
      .some((w) => (new Date(w.date + "T12:00:00").getDay() + 6) % 7 === index);
  }
  async start(id: string) {
    if (await this.s.start(id)) await this.router.navigateByUrl("/sessione");
  }
}
