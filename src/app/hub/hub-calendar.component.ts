import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../shared/icon.component';
import { CalItem, dayItems, eventOccurrences, monthSummary, offsetsLabel } from './hub-calendar';
import { addDays, addMonths, cap, daysInMonth, euro, HubEvent, monthKey, monthName, pad2, parseDay, validDay, weekdayName, dayLabel } from './hub-model';
import { HubStore } from './hub-store';
import { HubView } from './hub-view';
import { HubEventSheetComponent } from './hub-event-sheet.component';

const HOUR = 62;
interface Placed { item: CalItem; top: number; height: number; col: number; cols: number }

@Component({
  selector: 'gt-hub-calendar', standalone: true, imports: [IconComponent, HubEventSheetComponent],
  template: `<div class="mh"><h1 class="title">{{cap(monthName(month()))}} <span>{{month().slice(0,4)}}</span></h1>
  <span class="hb-right"><button type="button" class="hb-ib" (click)="shift(-1)" aria-label="Precedente"><gt-icon name="back"/></button><button type="button" class="hb-ib" (click)="shift(1)" aria-label="Successivo"><gt-icon name="chevron-right"/></button></span></div>
<div class="hb-seg seg"><button type="button" [class.on]="mode()==='mese'" (click)="setMode('mese')">Mese</button><button type="button" [class.on]="mode()==='giorno'" (click)="setMode('giorno')">Giorno</button>@if(selected()!==view.today()){<button type="button" (click)="goToday()">Oggi</button>}</div>

@if(mode()==='mese'){
  <div class="stt">
    <span><span class="hb-sq sm b"><gt-icon name="calendar"/></span><span><b>{{monthStats().events}}</b><small>impegni</small></span></span>
    <span><span class="hb-sq sm p"><gt-icon name="weight"/></span><span><b>{{monthStats().done}}/{{monthStats().planned}}</b><small>allenamenti</small></span></span>
    <span><span class="hb-sq sm r"><gt-icon name="wallet"/></span><span><b>{{euro(monthStats().spent,{decimals:false})}} €</b><small>spesi</small></span></span>
  </div>
  <section class="hb-c mg">
    <div class="wd">@for(d of weekdays;track $index){<span>{{d}}</span>}</div>
    <div class="cs">
      @for(c of cells();track c.key){
        @if(c.day){<button type="button" class="tile" [class.td]="c.day===view.today()" [class.sel]="c.day===selected()&&c.day!==view.today()" [class.we]="c.we" [class.past]="c.day<view.today()" (click)="pick(c.day)" [attr.aria-label]="dayLabel(c.day)" [attr.aria-pressed]="c.day===selected()">
          @if(c.spent){<span class="sp" [style.height.%]="c.heat"></span>}<b>{{c.n}}</b><span class="bars">@for(t of c.tones;track $index){<i [class]="'t-'+t" [style.width.%]="[100,72,52][$index]"></i>}</span></button>}
        @else{<span class="tile e"></span>}
      }
    </div>
  </section>
  <div class="lg"><span><span><i class="t-b"></i>Impegni</span><span><i class="t-p"></i>GymTrack</span><span><i class="t-y"></i>Note</span><span><i class="t-r"></i>Scadenze</span></span><span><span class="spk"></span>spese</span></div>
  <section class="peek">
    <div class="hb-hdl" style="margin-bottom:12px"></div>
    <div class="hb-between"><div><strong class="pt">{{dayLabel(selected())}}</strong><small class="ps">{{summary()}}</small></div><button type="button" class="bigd" (click)="setMode('giorno')" aria-label="Apri la giornata">{{dayNum()}}</button></div>
    <div class="pk">
      @for(i of items().slice(0,4);track i.key){<button type="button" (click)="open(i)" [class.done]="i.done"><span [class]="'bar3 t-'+i.tone"></span><span class="t">{{i.time||(i.kind==='spend'?'€':'—')}}</span><span class="bd"><strong>{{i.title}}</strong><small>{{i.subtitle}}@if(i.notify&&i.offsets?.length){<span> · avviso {{offsetsLabel(i.offsets!)}}</span>}</small></span>@if(i.amount){<span class="amt">−{{euro(i.amount)}} €</span>}</button>}
      @if(items().length>4){<button type="button" class="more" (click)="setMode('giorno')">{{items().length-4===1?'Altra voce':'Altre '+(items().length-4)+' voci'}} ›</button>}
      @if(!items().length){<p class="hb-sub" style="padding:4px 4px 2px">Niente in programma. Tocca + per aggiungere.</p>}
    </div>
  </section>
}@else{
  <div class="week">
    @for(d of week();track d.day){<button type="button" [class.sel]="d.day===selected()" [class.past]="d.day<view.today()" [class.today]="d.day===view.today()" (click)="pick(d.day)"><small>{{d.wd}}</small><b>{{d.n}}</b><span class="dots">@for(t of d.tones;track $index){<i [class]="'t-'+t"></i>}</span></button>}
  </div>
  <div class="hb-chips scroll sum">
    <span class="hb-ch"><gt-icon name="calendar"/>{{timed().length}} con orario</span>
    @if(gymToday();as g){<span class="hb-ch pink"><gt-icon name="weight"/>{{g.title}}{{g.time?' · '+g.time:''}}</span>}
    <span class="hb-ch"><gt-icon name="wallet"/>{{spentDay()?'−'+euro(spentDay())+' €':'Nessuna spesa'}}</span>
  </div>
  @if(allDay().length){<div class="allday"><small>Tutto il giorno</small>@for(i of allDay();track i.key){<button type="button" [class]="'ad t-'+i.tone" [class.done]="i.done" (click)="open(i)"><gt-icon [name]="i.icon"/>{{i.title}}@if(i.amount){ −{{euro(i.amount)}} €}</button>}</div>}
  <div class="tl" [style.height.px]="(range().end-range().start)*hour+12">
    @for(h of hours();track h){<div class="hr" [style.top.px]="(h-range().start)*hour"><small>{{pad(h)}}:00</small><i></i></div>}
    @for(f of free();track f.from){<button type="button" class="ev free" [style.top.px]="f.top" [style.height.px]="f.height" (click)="newAt(f.from)"><gt-icon name="plus"/>{{f.label}} libere · tocca per aggiungere</button>}
    @for(p of placed();track p.item.key){
      <button type="button" [class]="'ev t-'+p.item.tone" [class.done]="p.item.done" [class.workout]="p.item.kind==='workout'" [class.short]="p.height<54" [style.top.px]="p.top" [style.height.px]="p.height" [style.left]="'calc(56px + (100% - 56px) * '+p.col/p.cols+')'" [style.width]="'calc((100% - 56px) / '+p.cols+' - 4px)'" (click)="open(p.item)">
        <span class="row2"><span class="tm2">{{p.item.time}}{{endOf(p.item)}}</span>@if(p.item.notify&&p.item.offsets?.length){<span class="bell"><gt-icon name="bell"/></span>}</span>
        <strong>{{p.item.title}}</strong>@if(p.height>=58){<small>@if(p.item.kind==='workout'){<gt-icon name="play"/>Apri in GymTrack}@else{<span>{{p.item.subtitle}}</span>}</small>}
      </button>
    }
    @if(selected()===view.today()&&nowTop()!==null){<div class="now2" [style.top.px]="nowTop()"></div><span class="nowlbl" [style.top.px]="nowTop()!-7">{{clock()}}</span>}
  </div>
  @if(spendList().length){<div class="hb-sec"><h2>Uscite del giorno</h2><button type="button" class="hb-link" (click)="goSpese()">Movimenti ›</button></div>
    <section class="hb-c hb-list">@for(i of spendList();track i.key){<button type="button" class="hb-li" (click)="open(i)"><span class="hb-sq sm o"><gt-icon [name]="i.icon"/></span><span class="bd"><strong>{{i.title}}</strong><small>{{i.subtitle}}</small></span><span class="amt">−{{euro(i.amount!)}} €</span></button>}</section>}
}
<button type="button" class="hb-fab round" (click)="newAt('')" aria-label="Nuovo impegno"><gt-icon name="plus"/></button>
@if(sheet()){<gt-hub-event-sheet [event]="editing()" [defaultDate]="selected()" [defaultTitle]="''" [defaultKind]="'impegno'" [defaultTime]="draftTime()" (closed)="closeSheet()"/>}`,
  styles: [`.mh{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin:0 2px 12px}
.title{margin:0;font-size:35px;font-weight:750;letter-spacing:-1.6px;line-height:1;white-space:nowrap;background:linear-gradient(95deg,#fff 30%,#c9c0ff 70%,#f7b3d6);-webkit-background-clip:text;background-clip:text;color:transparent}
.title span{font-weight:300;-webkit-text-fill-color:#64647a}
.stt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.stt>span{display:flex;align-items:center;gap:8px;padding:10px 9px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid var(--hb-ln);min-width:0}
.stt b{display:block;font-size:16px;font-weight:750;letter-spacing:-.4px;white-space:nowrap}.stt small{display:block;font-size:10.5px;color:var(--hb-m);white-space:nowrap}.stt .hb-sq{width:30px;height:30px;border-radius:10px}
.mg{margin-top:14px;padding:14px 10px 10px;border-radius:28px}
.wd,.cs{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.wd span{text-align:center;font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--hb-f);padding-bottom:6px}
.tile{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;height:60px;border-radius:16px;padding:7px 0 0 8px;background:rgba(255,255,255,.035);overflow:hidden;text-align:left;cursor:pointer;transition:transform .15s}
.tile:active{transform:scale(.95)}.tile.e{background:none;cursor:default}
.tile>b{position:relative;z-index:1;font-size:14px;font-weight:650}.tile.we>b{color:var(--hb-m)}.tile.past>b{color:#8b8b9a}
.tile .bars{position:absolute;z-index:1;left:8px;right:8px;bottom:8px;display:flex;flex-direction:column;gap:3px}.tile .bars i{display:block;height:4px;border-radius:2px}
.tile .sp{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(255,120,150,.30),rgba(255,120,150,0))}
.tile.td{background:linear-gradient(160deg,#a495ff,#6e6bff 60%,#5b7cff);box-shadow:0 12px 26px rgba(110,107,255,.5),inset 0 1px rgba(255,255,255,.4)}.tile.td>b{color:#fff}.tile.td .bars i{box-shadow:0 0 0 1px rgba(255,255,255,.5)}
.tile.sel{box-shadow:inset 0 0 0 2px rgba(179,166,255,.75);background:rgba(143,124,255,.12)}
.t-b{background:#7aa2ff}.t-p{background:#f39ac7}.t-y{background:#ffc857}.t-r{background:#ff6b81}.t-v{background:#8f7cff}.t-g{background:#4fd1a5}.t-o{background:#ff9a62}.t-l{background:#b58cff}
.lg{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 6px 0;font-size:11px;color:var(--hb-m)}.lg>span{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lg>span>span{display:flex;align-items:center;gap:5px}.lg i{width:10px;height:4px;border-radius:2px}
.spk{width:16px;height:10px;border-radius:3px;background:linear-gradient(0deg,rgba(255,107,129,.45),rgba(255,107,129,0))}
.peek{margin-top:16px;padding:8px 14px 14px;border-radius:28px;background:radial-gradient(120% 90% at 100% 0%,rgba(110,107,255,.22),transparent 60%),linear-gradient(180deg,#1c1b27,#14141b);border:1px solid rgba(255,255,255,.09);box-shadow:0 -10px 40px rgba(0,0,0,.4),inset 0 1px rgba(255,255,255,.07);animation:hbRise .45s both}
.pt{display:block;font-size:19px;font-weight:700;letter-spacing:-.5px}.ps{display:block;margin-top:2px;font-size:12px;color:var(--hb-m)}
.bigd{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:17px;background:linear-gradient(160deg,#a495ff,#6e6bff);color:#fff;font-size:22px;font-weight:750;box-shadow:0 10px 22px rgba(110,107,255,.45);cursor:pointer}
.pk{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.pk>button{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06);text-align:left;cursor:pointer}
.pk>button.done strong{text-decoration:line-through;color:var(--hb-m)}.pk .bar3{width:4px;align-self:stretch;border-radius:3px;flex:none}
.pk .bd{flex:1;min-width:0}.pk strong{display:block;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pk small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk .t{width:40px;flex:none;font-size:12.5px;font-weight:700;color:var(--hb-m);font-variant-numeric:tabular-nums}.pk .amt{font-size:14px;font-weight:750;white-space:nowrap}.pk .more{justify-content:center;color:#b3a6ff;font-size:13px;font-weight:650}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:16px;align-items:end}
.week>button{position:relative;height:78px;border-radius:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);cursor:pointer;transition:height .2s}
.week small{font-size:11px;font-weight:700;color:var(--hb-f);letter-spacing:.4px;text-transform:uppercase}.week b{font-size:20px;font-weight:650;letter-spacing:-.5px}.week .past b{color:var(--hb-m)}.week .today:not(.sel){box-shadow:inset 0 0 0 1.5px rgba(179,166,255,.6)}
.week .dots{display:flex;gap:3px;height:5px}.week .dots i{width:5px;height:5px;border-radius:50%}
.week .sel{height:90px;border:0;color:#fff;background:linear-gradient(180deg,#a495ff 0%,#6e6bff 60%,#5b7cff 100%);box-shadow:0 16px 30px rgba(110,107,255,.45),inset 0 1px rgba(255,255,255,.4)}.week .sel small{color:rgba(255,255,255,.8)}.week .sel b{font-size:24px;color:#fff}
.sum{margin-top:14px}.sum .hb-ch{cursor:default;color:var(--hb-t)}.sum .hb-ch.pink{color:var(--hb-p)}
.allday{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.allday small{width:100%;font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--hb-f)}
.ad{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px;border-radius:12px;font-size:12.5px;font-weight:650;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;cursor:pointer;background:rgba(255,255,255,.06)!important;border:1px solid rgba(255,255,255,.1)}.ad gt-icon{width:14px;height:14px}
.ad.t-y{color:#ffd98a;border-color:rgba(255,200,87,.3)}.ad.t-l{color:#d4bdff;border-color:rgba(181,140,255,.3)}.ad.t-o{color:#ffbf98;border-color:rgba(255,154,98,.3)}.ad.t-p{color:#f7b3d6;border-color:rgba(243,154,199,.3)}.ad.t-r{color:#ff9fb0;border-color:rgba(255,107,129,.3)}.ad.t-b{color:#a9c4ff;border-color:rgba(91,140,255,.3)}.ad.done{opacity:.55;text-decoration:line-through}
.tl{position:relative;margin-top:16px}
.hr{position:absolute;left:0;right:0;display:flex;align-items:center;gap:10px;height:14px}.hr small{width:44px;flex:none;font-size:11px;font-weight:600;color:var(--hb-f);text-align:right;font-variant-numeric:tabular-nums}.hr i{flex:1;height:1px;background:rgba(255,255,255,.06)}
.ev{position:absolute;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;padding:8px 11px;border-radius:16px;overflow:hidden;text-align:left;cursor:pointer;margin-top:7px;background:linear-gradient(135deg,rgba(91,140,255,.32),rgba(91,140,255,.12)),#111118!important;border:1px solid rgba(120,160,255,.45);box-shadow:inset 3px 0 0 #7aa2ff}
.ev.t-p{background:linear-gradient(135deg,rgba(243,154,199,.34),rgba(181,140,255,.18)),#111118!important;border-color:rgba(243,154,199,.45);box-shadow:inset 3px 0 0 #f39ac7}
.ev.t-r{background:linear-gradient(135deg,rgba(255,107,129,.3),rgba(255,107,129,.1)),#111118!important;border-color:rgba(255,107,129,.45);box-shadow:inset 3px 0 0 #ff6b81}
.ev.t-y{background:linear-gradient(135deg,rgba(255,200,87,.26),rgba(255,200,87,.08)),#111118!important;border-color:rgba(255,200,87,.4);box-shadow:inset 3px 0 0 #ffc857}
.ev.t-v,.ev.t-l{background:linear-gradient(135deg,rgba(143,124,255,.32),rgba(143,124,255,.12)),#111118!important;border-color:rgba(143,124,255,.45);box-shadow:inset 3px 0 0 #8f7cff}
.ev.t-g{background:linear-gradient(135deg,rgba(79,209,165,.28),rgba(79,209,165,.1)),#111118!important;border-color:rgba(79,209,165,.4);box-shadow:inset 3px 0 0 #4fd1a5}
.ev>*{flex-shrink:0}.ev.short{flex-direction:row;align-items:center;gap:8px;padding-top:0;padding-bottom:0}.ev.short .row2{display:contents}.ev.short .tm2{order:0;flex:none}.ev.short strong{order:1;flex:1 1 auto;min-width:0}.ev.short .bell{order:2;flex:none}
.ev.done{opacity:.55}.ev.done strong{text-decoration:line-through}
.ev strong{font-size:14px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ev small{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;opacity:.85}.ev small gt-icon{width:12px;height:12px}
.row2{display:flex;align-items:center;justify-content:space-between;gap:6px}.tm2{font-size:11.5px;font-weight:700;opacity:.85;font-variant-numeric:tabular-nums}
.bell{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.14)}.bell gt-icon{width:13px;height:13px}
.ev.free{left:56px!important;width:calc(100% - 56px)!important;flex-direction:row;align-items:center;justify-content:center;gap:8px;background:repeating-linear-gradient(135deg,rgba(255,255,255,.025) 0 6px,transparent 6px 12px)!important;border:1.5px dashed rgba(255,255,255,.13);box-shadow:none;color:var(--hb-m);font-size:12.5px;font-weight:650}
.ev.free gt-icon{width:16px;height:16px;color:#b3a6ff}
.now2{position:absolute;z-index:3;left:46px;right:0;display:flex;align-items:center;margin-top:7px;pointer-events:none}.now2::before{content:"";width:10px;height:10px;border-radius:50%;background:#ff6b81;box-shadow:0 0 0 4px rgba(255,107,129,.25);margin-left:2px}.now2::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,#ff6b81,rgba(255,107,129,.15))}
.nowlbl{position:absolute;z-index:3;left:0;width:40px;margin-top:7px;text-align:right;font-size:11px;font-weight:800;color:#ff8fa0;background:var(--hb-bg)}
@media(min-width:900px){.tile{height:84px}.mg{padding:18px}}`],
})
export class HubCalendarComponent {
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly euro = euro; readonly cap = cap; readonly monthName = monthName; readonly dayLabel = dayLabel; readonly offsetsLabel = offsetsLabel; readonly hour = HOUR;
  readonly weekdays = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  private query = toSignal(this.route.queryParamMap);
  readonly selected = computed(() => { const g = this.query()?.get('giorno'); return g && validDay(g) ? g : this.view.today(); });
  readonly mode = computed<'mese' | 'giorno'>(() => this.query()?.get('vista') === 'giorno' ? 'giorno' : 'mese');
  readonly month = computed(() => monthKey(this.selected()));
  readonly sheet = signal(false);
  readonly editing = signal<HubEvent | null>(null);
  readonly draftTime = signal('');
  readonly clock = signal(this.now());

  readonly summaryMonth = computed(() => monthSummary(this.hub.doc(), this.view.gymData(), this.month(), this.view.spend()));
  readonly cells = computed(() => {
    const month = this.month(), first = parseDay(month + '-01'), lead = (first.getDay() + 6) % 7, dim = daysInMonth(month);
    const { tones, spent } = this.summaryMonth(), max = Math.max(1, ...spent.values());
    const cells: { key: string; day?: string; n?: number; we?: boolean; tones: string[]; spent: number; heat: number }[] = [];
    for (let i = 0; i < lead; i++) cells.push({ key: 'l' + i, tones: [], spent: 0, heat: 0 });
    for (let d = 1; d <= dim; d++) {
      const day = `${month}-${pad2(d)}`, s = spent.get(day) ?? 0;
      cells.push({ key: day, day, n: d, we: (lead + d - 1) % 7 >= 5, tones: tones.get(day) ?? [], spent: s, heat: s ? Math.round(18 + 44 * s / max) : 0 });
    }
    while (cells.length % 7) cells.push({ key: 't' + cells.length, tones: [], spent: 0, heat: 0 });
    return cells;
  });
  readonly monthStats = computed(() => {
    const month = this.month(), from = month + '-01', to = `${month}-${pad2(daysInMonth(month))}`, data = this.view.gymData();
    const events = this.hub.events().filter(e => e.kind !== 'nota').reduce((n, e) => n + eventOccurrences(e, from, to).length, 0);
    const planned = data?.scheduledWorkouts.filter(e => monthKey(e.date) === month && (e.kind ?? 'workout') === 'workout').length ?? 0;
    const done = data?.workouts.filter(w => w.status === 'completed' && monthKey(w.date) === month).length ?? 0;
    const spent = this.view.spend().filter(i => monthKey(i.date) === month).reduce((s, i) => s + i.amount, 0);
    return { events, planned: Math.max(planned, done), done, spent };
  });
  readonly items = computed(() => dayItems(this.hub.doc(), this.view.gymData(), this.selected(), this.view.spend(), this.view.recurring()));
  readonly summary = computed(() => {
    const list = this.items(), events = list.filter(i => i.kind === 'event' || i.kind === 'workout').length, spent = this.spentDay();
    return [events ? `${events} ${events === 1 ? 'impegno' : 'impegni'}` : 'Nessun impegno', spent ? `−${euro(spent)} € la tua parte` : ''].filter(Boolean).join(' · ');
  });
  readonly spentDay = computed(() => this.items().filter(i => i.kind === 'spend').reduce((s, i) => s + (i.amount ?? 0), 0));
  readonly week = computed(() => {
    const sel = this.selected(), offset = (parseDay(sel).getDay() + 6) % 7, monday = addDays(sel, -offset);
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i), m = monthSummary(this.hub.doc(), this.view.gymData(), monthKey(day), []).tones.get(day) ?? [];
      return { day, n: Number(day.slice(8)), wd: weekdayName(day).slice(0, 3), tones: m };
    });
  });
  readonly timed = computed(() => this.items().filter(i => !i.allDay && (i.kind === 'event' || i.kind === 'workout')));
  readonly allDay = computed(() => this.items().filter(i => i.allDay && i.kind !== 'spend'));
  readonly spendList = computed(() => this.items().filter(i => i.kind === 'spend'));
  readonly gymToday = computed(() => this.items().find(i => i.kind === 'workout'));
  readonly range = computed(() => {
    let start = 8, end = 22;
    for (const i of this.timed()) { const m = this.minutes(i.time!); start = Math.min(start, Math.floor(m / 60)); end = Math.max(end, Math.min(24, Math.ceil((m + (i.durationMinutes ?? 60)) / 60))); }
    return { start, end };
  });
  readonly hours = computed(() => { const r = this.range(); return Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i); });
  readonly placed = computed<Placed[]>(() => {
    const r = this.range(), list = [...this.timed()].sort((a, b) => this.minutes(a.time!) - this.minutes(b.time!));
    const out: Placed[] = [], ends: number[] = [];
    let cluster: Placed[] = [], clusterEnd = -1;
    const flush = () => { const cols = Math.max(1, ...cluster.map(p => p.col + 1)); cluster.forEach(p => p.cols = cols); cluster = []; ends.length = 0; };
    for (const item of list) {
      const start = this.minutes(item.time!), dur = item.durationMinutes ?? 60, visualEnd = start + Math.max(dur, 50);
      if (start >= clusterEnd) flush();
      let col = ends.findIndex(e => e <= start); if (col < 0) { col = ends.length; ends.push(visualEnd); } else ends[col] = visualEnd;
      const p = { item, top: (start / 60 - r.start) * HOUR, height: Math.max(40, dur / 60 * HOUR - 4), col, cols: 1 };
      cluster.push(p); out.push(p); clusterEnd = Math.max(clusterEnd, visualEnd);
    }
    flush();
    return out;
  });
  readonly free = computed(() => {
    const r = this.range(), busy = this.timed().map(i => [this.minutes(i.time!), this.minutes(i.time!) + (i.durationMinutes ?? 60)] as [number, number]).sort((a, b) => a[0] - b[0]);
    const now = this.selected() === this.view.today() ? this.minutes(this.clock()) : 0;
    let cursor = Math.max(9 * 60, Math.ceil(now / 30) * 30);
    const limit = 21 * 60, out: { from: string; top: number; height: number; label: string }[] = [];
    for (const [s, e] of [...busy, [limit, limit] as [number, number]]) {
      const end = Math.min(s, limit);
      if (end - cursor >= 120) { const mins = end - cursor; out.push({ from: `${pad2(Math.floor(cursor / 60))}:${pad2(cursor % 60)}`, top: (cursor / 60 - r.start) * HOUR, height: mins / 60 * HOUR - 8, label: `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) : ''}` }); }
      cursor = Math.max(cursor, e);
    }
    return out.slice(0, 3);
  });
  readonly nowTop = computed(() => { const m = this.minutes(this.clock()), r = this.range(); return m / 60 >= r.start && m / 60 <= r.end ? (m / 60 - r.start) * HOUR : null; });

  constructor() { setInterval(() => this.clock.set(this.now()), 30000); }
  private now() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
  minutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  pad(n: number) { return pad2(n); }
  dayNum() { return Number(this.selected().slice(8)); }
  endOf(i: CalItem) { if (!i.time || !i.durationMinutes) return ''; const m = this.minutes(i.time) + i.durationMinutes; return ` – ${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`; }
  private nav(params: Record<string, string | null>) { void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true }); }
  pick(day: string) { this.nav({ giorno: day }); }
  setMode(m: 'mese' | 'giorno') { this.nav({ vista: m === 'giorno' ? 'giorno' : null, giorno: this.selected() }); }
  goToday() { this.nav({ giorno: this.view.today() }); }
  shift(n: number) {
    if (this.mode() === 'giorno') { this.pick(addDays(this.selected(), n)); return; }
    const m = addMonths(this.month(), n), day = Math.min(Number(this.selected().slice(8)), daysInMonth(m));
    this.pick(m === monthKey(this.view.today()) ? this.view.today() : `${m}-${pad2(day)}`);
  }
  newAt(time: string) { this.editing.set(null); this.draftTime.set(time); this.sheet.set(true); }
  closeSheet() { this.sheet.set(false); this.editing.set(null); }
  open(i: CalItem) {
    if (i.kind === 'event') { this.editing.set(this.hub.events().find(e => e.id === i.ref) ?? null); this.sheet.set(true); return; }
    if (i.kind === 'workout') { void this.router.navigateByUrl('/'); return; }
    if (i.kind === 'note') { void this.router.navigate(['/hub/note'], { queryParams: { apri: i.ref } }); return; }
    this.goSpese();
  }
  goSpese() { void this.router.navigate(['/hub/spese'], { queryParams: { vista: 'movimenti' } }); }
}
