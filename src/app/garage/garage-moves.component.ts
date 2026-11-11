import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { cap, dayLabel, euro, HubFuelup } from '../hub/hub-model';
import { CAR_COST_ICON, CAR_COST_LABEL, CAR_COST_TONE, CarCost, CarCostType } from './garage-stats';
import { GarageView, num } from './garage-view';
import { GarageFuelSheetComponent } from './garage-fuel-sheet.component';

type Filter = 'all' | CarCostType;

/** Movimenti dell'auto: le spese riconosciute nel Planner, giorno per giorno. */
@Component({
  selector: 'gt-garage-moves', standalone: true, imports: [IconComponent, GarageFuelSheetComponent],
  template: `<span class="hb-eb">Dal Planner</span>
<h1 class="hb-h1">Movimenti auto</h1>
<div class="hb-chips scroll" style="margin-top:14px">@for(f of filters;track f.id){<button type="button" class="hb-ch" [class.on]="filter()===f.id" (click)="filter.set(f.id)">{{f.label}}</button>}</div>
@if(days().length){
  <section class="hb-c hb-list" style="margin-top:12px">
    @for(d of days();track d.day){
      <div class="hb-dh">{{cap(label(d.day))}}<span>−{{euro(d.total)}} €</span></div>
      @for(c of d.items;track c.id){<button type="button" class="hb-li" (click)="open(c)">
        <span [class]="'hb-sq sm '+tone(c.type)"><gt-icon [name]="icon(c.type)"/></span>
        <span class="bd"><strong>{{c.label}}</strong><small>{{detail(c)}}</small></span>
        <span class="amt">−{{euro(c.amount)}} €@if(c.type==='fuel'&&!c.fuelup&&g.car()){<small class="add">+ litri e km</small>}</span>
      </button>}
    }
  </section>
  @if(more()){<button type="button" class="hb-btn sm" style="margin-top:10px" (click)="limit.set(limit()+60)">Mostra altri</button>}
}@else{
  <section class="hb-c hb-empty" style="margin-top:12px"><span class="hb-sq lg g"><gt-icon name="fuel"/></span><strong>Nessuna spesa dell'auto</strong>
    Qui compaiono carburante, pedaggi e parcheggi presi dal Planner: importa un estratto conto oppure registra un rifornimento.
    <div class="hb-actions two"><button type="button" class="hb-btn sm" (click)="go('/hub/spese/importa')"><gt-icon name="upload"/>Importa estratto</button><button type="button" class="hb-btn sm" (click)="go('/hub/spese')"><gt-icon name="wallet"/>Apri le spese</button></div></section>
}
@if(g.car()){<button type="button" class="hb-fab" (click)="fuelup.set(null);cost.set(null);sheet.set(true)"><gt-icon name="plus"/>Rifornimento</button>}
@if(sheet()){<gt-garage-fuel-sheet [fuelup]="fuelup()" [cost]="cost()" (closed)="sheet.set(false)"/>}`,
  styles: [`.hb-dh{display:flex;justify-content:space-between;gap:10px}.hb-dh span{letter-spacing:0;font-variant-numeric:tabular-nums}
.amt .add{color:var(--hb-g)!important}.hb-fab{background:linear-gradient(180deg,#eafff5,#bff2d9);color:#06281c;box-shadow:0 14px 34px rgba(79,209,165,.35),inset 0 1px #fff}`],
})
export class GarageMovesComponent {
  readonly g = inject(GarageView);
  private router = inject(Router);
  readonly euro = euro; readonly cap = cap; readonly label = dayLabel;
  readonly filters: { id: Filter; label: string }[] = [{ id: 'all', label: 'Tutti' }, { id: 'fuel', label: 'Carburante' }, { id: 'toll', label: 'Pedaggi' }, { id: 'parking', label: 'Parcheggi' }, { id: 'other', label: 'Altro' }];
  private readonly asked = inject(ActivatedRoute).snapshot.queryParamMap.get('tipo') ?? '';
  readonly filter = signal<Filter>(this.filters.some(f => f.id === this.asked) ? this.asked as Filter : 'all');
  readonly limit = signal(60);
  readonly sheet = signal(false);
  readonly fuelup = signal<HubFuelup | null>(null);
  readonly cost = signal<CarCost | null>(null);

  private readonly filtered = computed(() => { const f = this.filter(); return this.g.costs().filter(c => f === 'all' || c.type === f); });
  readonly more = computed(() => this.filtered().length > this.limit());
  readonly days = computed(() => {
    const out: { day: string; total: number; items: CarCost[] }[] = [];
    for (const c of this.filtered().slice(0, this.limit())) {
      let last = out[out.length - 1];
      if (!last || last.day !== c.date) out.push(last = { day: c.date, total: 0, items: [] });
      last.items.push(c); last.total += c.amount;
    }
    return out;
  });

  icon(t: CarCostType) { return CAR_COST_ICON[t]; }
  tone(t: CarCostType) { return CAR_COST_TONE[t]; }
  detail(c: CarCost) {
    const f = c.fuelup, parts = [CAR_COST_LABEL[c.type]];
    if (f?.liters) parts.push(num(f.liters, 1) + ' L');
    if (f?.odometer) parts.push(num(f.odometer) + ' km');
    if (f && !f.full) parts.push('parziale');
    return parts.join(' · ');
  }
  open(c: CarCost) {
    if (c.type !== 'fuel' || !this.g.car()) { this.go('/hub/spese'); return; }
    this.fuelup.set(c.fuelup ?? null); this.cost.set(c.fuelup ? null : c); this.sheet.set(true);
  }
  go(path: string) { void this.router.navigateByUrl(path); }
}
