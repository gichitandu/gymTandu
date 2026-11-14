import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { filterGroupDays, GroupDayOption } from '../services/group-day-filter';

export type { GroupDayOption };

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** Ricerca con filtri al posto del menu a tendina: con i programmi a settimane i giorni sono decine. */
@Component({
  selector: 'gt-group-day-picker', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="gdp">
  <span class="gdp-label">{{title()}}</span>
  <div class="gdp-search"><gt-icon name="search"/><input type="text" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Cerca giorno, scheda o esercizio" aria-label="Cerca l’allenamento" enterkeyhint="search"/>@if(query()){<button type="button" (click)="query.set('')" aria-label="Cancella la ricerca"><gt-icon name="close"/></button>}</div>
  <div class="gdp-chips" role="group" aria-label="Filtri">
    <label class="gdp-date" [class.on]="!!date()"><gt-icon name="calendar"/><span>{{date() ? dateLabel(date()) : 'Data'}}</span><input type="date" [ngModel]="date()" (ngModelChange)="date.set($event || '')" aria-label="Allenamenti programmati in questa data"/></label>
    @if(date()){<button type="button" class="on" (click)="date.set('')" aria-label="Togli il filtro data">✕</button>}
    @if(hasToday()){<button type="button" [class.on]="date()===today" (click)="date.set(date()===today?'':today)">Oggi</button>}
    @for(p of plans();track p.id){<button type="button" [class.on]="planId()===p.id" (click)="planId.set(planId()===p.id?'':p.id)">{{p.name}}</button>}
    @if(weeks().length>1){<select [ngModel]="week()" (ngModelChange)="week.set(+$event)" aria-label="Settimana del programma" [class.on]="!!week()"><option [ngValue]="0">Tutte le settimane</option>@for(w of weeks();track w){<option [ngValue]="w">Settimana {{w}}</option>}</select>}
  </div>
  @if(selected();as cur){<p class="gdp-cur"><gt-icon name="check"/><span>Scelto: <b>{{cur.dayName}}</b>@if(details(cur)){ · {{details(cur)}}}</span></p>}
  <ul class="gdp-list" role="listbox" [attr.aria-label]="title()">
    @for(o of shown();track o.id){<li><button type="button" role="option" [attr.aria-selected]="value()===o.id" [class.on]="value()===o.id" (click)="valueChange.emit(o.id)">
      <span class="gdp-main"><strong>{{o.dayName}}</strong><small>{{details(o)}}</small></span>
      <span class="gdp-count">@if(showShared()){{{o.shared}}/{{o.total}} in comune}@else{{{o.total}} esercizi}</span>
      @if(value()===o.id){<gt-icon name="check"/>}
    </button></li>}
    @empty{<li class="gdp-empty">Nessun allenamento con questi filtri.@if(date()){ In quel giorno non c’è niente in programma.}</li>}
  </ul>
  @if(filtered().length>shown().length){<button type="button" class="gdp-more" (click)="limit.set(limit()+20)">Mostra altri {{filtered().length-shown().length}}</button>}
</div>`,
  styles: [`.gdp{display:grid;gap:10px}.gdp-label{font-size:13px;color:var(--muted)}
.gdp-search{display:flex;align-items:center;gap:8px;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--raised)}
.gdp-search:focus-within{border-color:var(--accent-text,var(--blue))}
.gdp-search gt-icon{width:17px;height:17px;color:var(--muted);flex:none}
.gdp-search input{flex:1;min-width:0;min-height:44px;margin:0;padding:0;border:0;border-radius:0;outline:0;box-shadow:none!important;background:none!important;font-size:16px}
.gdp-search button{display:grid;place-items:center;width:32px;height:32px;min-height:0;padding:0;border:0;background:none;color:var(--muted)}
.gdp-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.gdp-chips::-webkit-scrollbar{display:none}
.gdp-chips>button,.gdp-chips>select,.gdp-date{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:36px;width:auto;margin:0;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--text);font-size:13px;font-weight:600;white-space:nowrap}
.gdp-chips .on{border-color:var(--accent-text,var(--blue));background:var(--accent-soft,#367dff20);color:var(--accent-text,var(--blue))}
.gdp-date{position:relative;cursor:pointer}.gdp-date gt-icon{width:15px;height:15px}
.gdp-date input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.gdp-list{display:grid;gap:6px;max-height:min(360px,52vh);margin:0;padding:0;overflow-y:auto;list-style:none;overscroll-behavior:contain}
.gdp-list button{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;margin:0;padding:8px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);text-align:left;font:inherit}
.gdp-list button.on{border-color:var(--accent-text,var(--blue));background:var(--accent-soft,#367dff20)}
.gdp-list gt-icon{width:18px;height:18px;flex:none;color:var(--accent-text,var(--blue))}
.gdp-main{flex:1;min-width:0}.gdp-main strong{display:block;font-size:14.5px;overflow-wrap:anywhere}.gdp-main small{display:block;margin-top:2px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.gdp-count{flex:none;font-size:12px;color:var(--muted);white-space:nowrap}
.gdp-cur{display:flex;align-items:center;gap:6px;margin:0;font-size:12.5px;color:var(--muted)}.gdp-cur gt-icon{width:15px;height:15px;flex:none;color:var(--accent-text,var(--blue))}.gdp-cur b{color:var(--text)}
.gdp-empty{padding:14px;font-size:13px;color:var(--muted);text-align:center}
.gdp-more{justify-self:center;min-height:40px;padding:0 14px;font-size:13px}`],
})
export class GroupDayPickerComponent {
  readonly options = input<GroupDayOption[]>([]);
  readonly value = input('');
  readonly title = input('Il mio allenamento');
  readonly showShared = input(false);
  /** Data con cui aprire il filtro (es. dal calendario o “oggi”). */
  readonly initialDate = input('');
  readonly valueChange = output<string>();
  readonly today: string;
  readonly query = signal('');
  readonly planId = signal('');
  readonly week = signal(0);
  readonly date = signal('');
  readonly limit = signal(20);
  readonly plans = computed(() => { const map = new Map<string, string>(); for (const o of this.options()) map.set(o.planId, o.planName); return map.size > 1 ? [...map].map(([id, name]) => ({ id, name })) : []; });
  readonly weeks = computed(() => [...new Set(this.options().filter(o => !this.planId() || o.planId === this.planId()).map(o => o.week).filter((w): w is number => !!w))].sort((a, b) => a - b));
  readonly hasToday = computed(() => this.options().some(o => o.dates.includes(this.today)));
  readonly filtered = computed(() => filterGroupDays(this.options(), { query: this.query(), planId: this.planId(), week: this.week(), date: this.date() }));
  readonly shown = computed(() => this.filtered().slice(0, this.limit()));
  readonly selected = computed(() => this.options().find(o => o.id === this.value()));

  constructor() {
    const d = new Date();
    this.today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    effect(() => { const initial = this.initialDate(); untracked(() => { if (initial) this.date.set(initial); }); });
    // Programmi a settimane: senza una data di partenza si apre sulla settimana in corso (o la prossima in programma).
    effect(() => {
      const options = this.options();
      untracked(() => {
        if (this.weekPicked || !options.length) return;
        this.weekPicked = true;
        if (this.initialDate()) return;
        const next = options.filter(o => o.week && o.dates.some(d => d >= this.today)).sort((a, b) => this.nextDate(a).localeCompare(this.nextDate(b)))[0];
        if (next?.week) this.week.set(next.week);
      });
    });
    // Nuovi filtri: si riparte dai primi risultati e, se la scelta attuale sparisce, si propone il primo.
    effect(() => {
      const list = this.filtered();
      untracked(() => { this.limit.set(20); if (list.length && !list.some(o => o.id === this.value())) this.valueChange.emit(list[0].id); });
    });
    effect(() => { const weeks = this.weeks(); untracked(() => { if (this.week() && !weeks.includes(this.week())) this.week.set(0); }); });
  }
  private weekPicked = false;
  details(o: GroupDayOption) {
    const parts = this.plans().length ? [o.planName] : [];
    if (o.week) parts.push('sett. ' + o.week);
    const d = this.nextDate(o); if (d) parts.push(this.dateLabel(d));
    return parts.join(' · ');
  }
  nextDate(o: GroupDayOption) { return o.dates.find(d => d >= this.today) ?? o.dates.at(-1) ?? ''; }
  dateLabel(iso: string) {
    if (!iso) return '';
    if (iso === this.today) return 'oggi';
    const d = new Date(iso + 'T12:00:00');
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  }
}
