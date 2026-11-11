import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { cap, euro, monthName } from '../hub/hub-model';
import { CAR_COST_LABEL, CarCostType } from './garage-stats';
import { GarageView, num } from './garage-view';

const COLORS: Record<CarCostType, string> = { fuel: '#4fd1a5', toll: '#5b8cff', parking: '#ffc857', other: '#8a8a9a' };

/** Statistiche dell'auto: costi del mese per tipo, andamento del carburante e budget consigliato. */
@Component({
  selector: 'gt-garage-insights', standalone: true, imports: [RouterLink, IconComponent],
  template: `<span class="hb-eb">{{cap(monthLabel())}}</span>
<h1 class="hb-h1">Statistiche auto</h1>
<div class="hb-cols" style="margin-top:14px">
  <div>
    <div class="hb-grid2">
      <section class="hb-c tile"><small><gt-icon name="fuel"/>Carburante del mese</small><b class="hb-num">{{euro(g.totals().byType.fuel)}} €</b><em [class.hb-pos]="delta()<0" [class.hb-neg]="delta()>0">{{deltaLabel()}}</em></section>
      <section class="hb-c tile"><small><gt-icon name="gauge"/>Costo per 100 km</small><b class="hb-num">{{g.status().costPer100!==null?euro(g.status().costPer100!)+' €':'—'}}</b><em>{{g.status().costPer100!==null?(g.status().measured?'dai tuoi pieni':'stima'):'servono litri e km'}}</em></section>
    </div>
    <section class="hb-c hb-pad" style="margin-top:10px">
      <h2 class="t">Ripartizione costi</h2>
      @if(g.totals().total>0){<div class="split">
        <span class="donut" [style.background]="donut()"><span><b class="hb-num">{{euro(g.totals().total)}} €</b><small>Totale</small></span></span>
        <ul>@for(r of rows();track r.type){<li><i [style.background]="r.color"></i><span>{{r.label}}</span><b class="hb-num">{{euro(r.amount)}} €</b><em>{{r.pct}} %</em></li>}</ul>
      </div>}@else{<p class="none">Nessuna spesa dell'auto questo mese.</p>}
    </section>
  </div>
  <div>
    <section class="hb-c hb-pad">
      <h2 class="t"><gt-icon name="chart"/>Andamento spesa carburante</h2>
      <div class="bars" role="img" [attr.aria-label]="barsLabel()">@for(b of bars();track b.month){<span class="col" [class.cur]="$last"><em>{{b.fuel?euro(b.fuel,{decimals:false}):''}}</em><i [style.height.%]="b.height"></i><small>{{b.label}}</small></span>}</div>
    </section>
    <section class="hb-c save">
      <span class="hb-sq g"><gt-icon name="piggy"/></span>
      <span class="bd"><strong>Budget auto consigliato</strong>
        @if(g.budget()!==null){<small>Per il prossimo mese, dalla media degli ultimi mesi</small><b class="hb-num">{{euro(g.budget()!,{decimals:false})}} €</b>
          <span class="hb-bar"><i [style.width.%]="usedPct()" [class.over]="usedPct()>=100"></i></span><em>Questo mese: {{euro(g.totals().total)}} € ({{usedPct()}} %)</em>}
        @else{<small>Lo calcolo quando c'è almeno un mese concluso con spese dell'auto.</small>}</span>
    </section>
    <a class="hb-btn sm" routerLink="/hub/spese" style="margin-top:10px"><gt-icon name="wallet"/>Apri le spese nel Planner</a>
  </div>
</div>`,
  styles: [`.tile{padding:14px}.tile small{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--hb-m);line-height:1.3}.tile small gt-icon{width:15px;height:15px;flex:none}
.tile b{display:block;margin-top:10px;font-size:25px;font-weight:750;letter-spacing:-1px;white-space:nowrap}.tile em{display:block;margin-top:3px;font-style:normal;font-size:11.5px;color:var(--hb-m)}
.t{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;letter-spacing:-.3px}.t gt-icon{width:17px;height:17px;color:var(--hb-m)}
.split{display:flex;align-items:center;gap:16px;margin-top:14px}
.donut{position:relative;flex:none;width:118px;height:118px;border-radius:50%;display:grid;place-items:center}
.donut>span{display:grid;place-items:center;align-content:center;width:84px;height:84px;border-radius:50%;background:#15161a;text-align:center}.donut b{font-size:14px;font-weight:750;letter-spacing:-.4px}.donut small{font-size:10.5px;color:var(--hb-m)}
ul{flex:1;min-width:0;margin:0;padding:0;list-style:none;display:grid;gap:9px}li{display:flex;align-items:center;gap:8px;font-size:12.5px}li i{flex:none;width:9px;height:9px;border-radius:50%}li span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}li b{font-weight:650}li em{width:38px;text-align:right;font-style:normal;color:var(--hb-m)}
.none{margin-top:10px;font-size:13px;color:var(--hb-m)}
.bars{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;height:170px;margin-top:14px;align-items:end}
.col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px}.col em{font-style:normal;font-size:10.5px;color:var(--hb-m);font-variant-numeric:tabular-nums}
.col i{display:block;width:100%;max-width:34px;min-height:3px;border-radius:7px 7px 3px 3px;background:linear-gradient(180deg,#5a6472,#3a414b);transition:height .6s cubic-bezier(.2,.8,.2,1)}
.col.cur i{background:linear-gradient(180deg,#8ff0c0,#37c98b)}.col small{font-size:11px;color:var(--hb-m)}.col.cur small,.col.cur em{color:var(--hb-t);font-weight:650}
.save{display:flex;gap:12px;margin-top:10px;padding:14px;background:radial-gradient(120% 100% at 0% 0%,rgba(79,209,165,.14),transparent 60%),linear-gradient(180deg,#17201c,#121316)!important;border-color:rgba(79,209,165,.22)!important}
.save .bd{flex:1;min-width:0}.save strong{display:block;font-size:15px;font-weight:700}.save small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m);line-height:1.4}
.save b{display:block;margin:8px 0;font-size:26px;font-weight:750;letter-spacing:-1px;color:var(--hb-g)}.save em{display:block;margin-top:6px;font-style:normal;font-size:11.5px;color:var(--hb-m)}
.save .hb-bar{display:block}.save .hb-bar i{background:var(--hb-g)}.save .hb-bar i.over{background:var(--hb-r)}`],
})
export class GarageInsightsComponent {
  readonly g = inject(GarageView);
  readonly euro = euro; readonly cap = cap;
  readonly monthLabel = computed(() => monthName(this.g.month()) + ' ' + this.g.month().slice(0, 4));
  readonly rows = computed(() => {
    const t = this.g.totals();
    return (Object.keys(CAR_COST_LABEL) as CarCostType[]).filter(type => t.byType[type] > 0).map(type => ({ type, label: CAR_COST_LABEL[type], amount: t.byType[type], color: COLORS[type], pct: Math.round(t.byType[type] / t.total * 100) }));
  });
  readonly donut = computed(() => {
    const total = this.g.totals().total; let at = 0;
    const stops = this.rows().map(r => { const from = at; at += r.amount / total * 100; return `${r.color} ${from}% ${at}%`; });
    return `conic-gradient(from -90deg, ${stops.join(', ')})`;
  });
  readonly bars = computed(() => {
    const series = this.g.series(), max = Math.max(1, ...series.map(s => s.fuel));
    return series.map(s => ({ ...s, height: Math.round(s.fuel / max * 78), label: cap(monthName(s.month).slice(0, 3)) }));
  });
  readonly barsLabel = computed(() => 'Spesa carburante: ' + this.bars().map(b => `${b.label} ${euro(b.fuel)} €`).join(', '));
  readonly delta = computed(() => { const prev = this.g.previous().byType.fuel; return prev ? this.g.totals().byType.fuel - prev : 0; });
  readonly deltaLabel = computed(() => { const d = this.delta(); return !this.g.previous().byType.fuel ? 'dal Planner' : d === 0 ? 'come il mese scorso' : `${euro(d, { sign: true })} € sul mese scorso`; });
  readonly usedPct = computed(() => { const b = this.g.budget(); return b ? Math.round(this.g.totals().total / b * 100) : 0; });
  protected readonly num = num;
}
