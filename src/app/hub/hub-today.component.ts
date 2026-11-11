import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { Store } from '../services/store';
import { feedbackForContext } from '../services/feedback';
import { dayItems, CalItem, upcoming } from './hub-calendar';
import { cap, dayLabel, euro, euroParts, HubEvent, HubEventKind, hubId, initials, shortDay } from './hub-model';
import { HUB_ME, HubStore } from './hub-store';
import { HubView } from './hub-view';
import { HubEventSheetComponent } from './hub-event-sheet.component';
import { HubSpendSheetComponent } from './hub-spend-sheet.component';
import { HubSplitSheetComponent } from './hub-split-sheet.component';
import { HubTransaction } from './hub-model';

@Component({
  selector: 'gt-hub-today', standalone: true, imports: [FormsModule, RouterLink, IconComponent, HubEventSheetComponent, HubSpendSheetComponent, HubSplitSheetComponent],
  template: `<span class="hb-eb">{{dayLabel(view.today())}}</span>
<h1 class="hb-h1">{{greeting()}}, {{name()}}</h1>
<div class="hb-cols" style="margin-top:16px">
  @if(view.budget();as b){
    <section class="hb-hero">
      <div class="hb-between"><span class="hb-lbl">Piano risparmio · {{monthLabel()}}</span><span class="hb-chip">@if(b.onTrack){<gt-icon name="check"/>In linea}@else{<gt-icon name="info"/>Sopra il ritmo}</span></div>
      <div class="hb-between" style="margin-top:12px;align-items:center">
        <div><span class="o8">{{b.left>=0?'Oggi puoi spendere ancora':'Oggi hai superato il budget di'}}</span>
          <div class="hb-money" style="margin-top:6px"><b>{{parts(abs(b.left)).whole}}</b><small>,{{parts(abs(b.left)).dec}} €</small></div>
          <span class="o7">Budget del giorno {{euro(b.daily)}} € · se avanzi, domani hai di più</span></div>
        <span class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="37" class="tr"/><circle cx="42" cy="42" r="37" class="fg" [attr.stroke-dasharray]="(232.5*b.usedPct/100)+' 232.5'"/></svg><b>{{b.usedPct}}%</b></span>
      </div>
      <div class="bot"><gt-icon name="target"/><span>Verso <b>{{euro(view.activePlan()!.goal,{decimals:false})}} €</b></span><span class="hb-bar grow"><i [style.width.%]="savePct()" style="background:#fff"></i></span><b>stima {{euro(max0(b.projectedSaving),{decimals:false})}} €</b></div>
    </section>
  }@else if(!hub.transactions().length){
    <section class="hb-hero"><span class="hb-lbl">Spese e risparmio</span><h2 class="h2">Importa il primo estratto conto</h2><p class="o8">Intesa Sanpaolo, Revolut o Monte dei Paschi: GymTrack ordina i movimenti e ti prepara un piano per spendere meno.</p>
      <a class="hb-btn white" routerLink="/hub/spese/importa" style="margin-top:14px"><gt-icon name="upload"/>Importa estratto conto</a></section>
  }@else{
    <section class="hb-hero"><span class="hb-lbl">Uscite di oggi · {{monthLabel()}}</span><div class="hb-money" style="margin-top:8px"><b>{{parts(view.spentToday()).whole}}</b><small>,{{parts(view.spentToday()).dec}} €</small></div>
      <p class="o8">Imposta quanto vuoi risparmiare al mese: calcolo un tetto per ogni ambito e il budget di ogni giorno.</p>
      <a class="hb-btn white" routerLink="/hub/spese" [queryParams]="{vista:'piano'}" style="margin-top:12px"><gt-icon name="piggy"/>Crea il piano risparmio</a></section>
  }
  <div>
    <form class="cap" (ngSubmit)="quick('nota')"><gt-icon name="plus"/><input name="q" [(ngModel)]="text" placeholder="Aggiungi nota, impegno o spesa" maxlength="140" autocomplete="off" aria-label="Aggiungi nota, impegno o spesa"/><button type="submit" class="go" [disabled]="!text.trim()" aria-label="Salva come nota"><gt-icon name="arrow"/></button></form>
    <div class="hb-chips scroll qk">
      <button type="button" class="hb-ch" (click)="quick('nota')"><span class="hb-dot y"></span>Nota</button>
      <button type="button" class="hb-ch" (click)="quick('impegno')"><span class="hb-dot b"></span>Impegno</button>
      <button type="button" class="hb-ch" (click)="quick('scadenza')"><span class="hb-dot r"></span>Scadenza</button>
      <button type="button" class="hb-ch" (click)="quick('spesa')"><span class="hb-dot o"></span>Spesa</button>
      <a class="hb-ch" routerLink="/hub/spese/importa"><gt-icon name="upload"/>Estratto</a>
    </div>
    <div class="bento">
      <a class="hb-c nx" routerLink="/hub/calendario" [queryParams]="next()?{giorno:next()!.day}:{}">
        <span class="k">Prossimo impegno</span>
        @if(next();as n){<span class="tm">{{n.item.time||shortDay(n.day)}}</span><strong>{{n.item.title}}</strong><span class="s">{{n.day===view.today()?'Oggi':cap(dayLabel(n.day))}}</span>
          <span class="cd">@if(n.item.time&&n.day===view.today()){<span class="hb-tag b"><gt-icon name="clock"/>{{countdown(n.item.time)}}</span>}@if(n.item.notify){<span class="hb-tag n"><gt-icon name="bell"/>avviso attivo</span>}</span>}
        @else{<span class="tm dim">—</span><strong>Nessun impegno</strong><span class="s">Aggiungine uno dal calendario</span>}
      </a>
      <a class="hb-c mini" routerLink="/hub/spese"><span class="k"><gt-icon name="wallet"/>Uscite oggi</span><b class="hb-num">{{euro(view.spentToday())}} €</b><small>solo la tua parte</small></a>
      <a class="hb-c mini" routerLink="/hub/dividi"><span class="k"><gt-icon name="users"/>Dividi</span><b class="hb-num" [class.hb-pos]="view.position().net>0" [class.hb-neg]="view.position().net<0">{{euro(view.position().net,{sign:true})}} €</b>
        @if(debtors().length){<span class="hb-avs" style="margin-top:8px">@for(p of debtors();track p.id){<span class="hb-av" [style.background]="p.color">{{initials(p.name)}}</span>}</span>}@else{<small>{{view.position().net>=0?'tutti in pari':'devi saldare'}}</small>}</a>
    </div>
  </div>
  <div>
    <div class="hb-sec"><h2>La giornata</h2><a routerLink="/hub/calendario">Calendario ›</a></div>
    <section class="hb-c hb-list">
      @for(i of items();track i.key){
        @if(nowIndex()===$index){<div class="now">ORA · {{clock()}}</div>}
        <button type="button" class="hb-li" [class.done]="i.done" (click)="openItem(i)">
          <span class="tm">@if(i.time){<span>{{i.time}}</span>}@else if(i.kind==='note'){<gt-icon name="pin2"/>}@else{<span>—</span>}</span>
          <span [class]="'hb-sq sm '+i.tone"><gt-icon [name]="i.icon"/></span>
          <span class="bd"><strong>{{i.title}}</strong><small>@if(i.kind==='workout'){<span class="hb-tag p"><gt-icon name="out"/>Apri in GymTrack</span>}@if(i.notify&&i.offsets?.length){<span class="hb-tag b"><gt-icon name="bell"/>avviso</span>}{{i.subtitle}}</small></span>
          @if(i.amount){<span class="amt">−{{euro(i.amount)}} €</span>}
        </button>
      }@empty{<div class="hb-empty"><span class="hb-sq lg v"><gt-icon name="calendar"/></span><strong>Giornata libera</strong>Nessun impegno, allenamento o spesa per oggi.</div>}
      @if(items().length&&nowIndex()===items().length){<div class="now">ORA · {{clock()}}</div>}
    </section>
  </div>
  <div>
    <div class="hb-sec"><h2>Note fissate</h2><a routerLink="/hub/note">Tutte ›</a></div>
    @if(pinned().length){<div class="notes">@for(n of pinned();track n.id){<a [class]="'nt '+tone(n.color)" routerLink="/hub/note" [queryParams]="{apri:n.id}"><gt-icon name="pin2"/><strong>{{n.title||'Nota'}}</strong><p>{{n.body}}</p></a>}</div>}
    @else{<a class="hb-c hb-empty" routerLink="/hub/note" style="display:block"><strong>Nessuna nota fissata</strong>Fissa una nota per vederla qui ogni giorno.</a>}
  </div>
</div>
@if(sheet()==='event'){<gt-hub-event-sheet [event]="editEvent()" [defaultDate]="view.today()" [defaultTitle]="draftTitle()" [defaultKind]="draftKind()" (closed)="sheet.set('')"/>}
@if(sheet()==='spend'){<gt-hub-spend-sheet [defaultDescription]="draftTitle()" (closed)="sheet.set('')" (split)="splitTx.set($event);sheet.set('split')"/>}
@if(sheet()==='split'){<gt-hub-split-sheet [tx]="splitTx()" (closed)="sheet.set('')"/>}`,
  styles: [`.o8{display:block;font-size:13px;opacity:.85;line-height:1.45}.o7{display:block;margin-top:8px;font-size:12px;opacity:.75}.h2{margin:8px 0 6px;font-size:24px;font-weight:750;letter-spacing:-.7px}
.ring{position:relative;display:grid;place-items:center;flex:none;width:84px;height:84px}.ring svg{position:absolute;inset:0;transform:rotate(-90deg)}.ring circle{fill:none;stroke-width:9}.ring .tr{stroke:rgba(255,255,255,.18)}.ring .fg{stroke:#fff;stroke-linecap:round;transition:stroke-dasharray .8s}.ring b{font-size:15px;font-weight:800}
.bot{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.16);font-size:12.5px}.bot b{font-weight:800}.bot gt-icon{width:18px;height:18px}.grow{flex:1}.bot .hb-bar{background:rgba(255,255,255,.18);height:7px}
.cap{display:flex;align-items:center;gap:10px;height:54px;padding:0 7px 0 15px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid var(--hb-ln)}.cap:focus-within{border-color:rgba(143,124,255,.55)}
.cap>gt-icon{width:19px;height:19px;color:#b3a6ff;flex:none}.cap input{flex:1;min-width:0;border:0;outline:0;background:none;color:var(--hb-t);font:inherit;font-size:16px}.cap input::placeholder{color:var(--hb-m)}
.go{display:grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:0;border-radius:13px;background:linear-gradient(140deg,#b3a6ff,#6e6bff);color:#fff;cursor:pointer}.go:disabled{opacity:.35}.go gt-icon{width:18px;height:18px}
.qk{margin-top:8px}.qk .hb-ch{min-height:30px;font-size:12.5px}
.bento{display:grid;grid-template-columns:1.12fr 1fr;grid-template-rows:auto auto;gap:10px;margin-top:12px}.bento .hb-c{padding:14px;display:block}
.nx{grid-row:span 2;display:flex!important;flex-direction:column;background:radial-gradient(140% 80% at 0% 0%,rgba(91,140,255,.22),transparent 60%),linear-gradient(180deg,#18181f,#121218)!important}
.nx .k{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8fb0ff}.nx .tm{margin-top:10px;font-size:34px;font-weight:750;letter-spacing:-1.4px;line-height:1}.nx .tm.dim{color:var(--hb-f)}
.nx strong{display:block;margin-top:6px;font-size:15.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nx .s{font-size:12px;color:var(--hb-m)}.nx .cd{margin-top:auto;padding-top:10px;display:flex;flex-direction:column;align-items:flex-start;gap:6px}
.mini .k{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--hb-m)}.mini .k gt-icon{width:13px;height:13px}
.mini b{display:block;margin-top:8px;font-size:21px;font-weight:750;letter-spacing:-.8px;white-space:nowrap}.mini small{display:block;margin-top:2px;font-size:11.5px;color:var(--hb-m)}.mini .hb-av{width:26px;height:26px;font-size:10px}
.now{display:flex;align-items:center;gap:8px;padding:2px 14px;height:22px;font-size:10.5px;font-weight:750;letter-spacing:.6px;color:#b3a6ff}
.now::before{content:"";width:7px;height:7px;border-radius:50%;background:#b3a6ff;box-shadow:0 0 0 4px rgba(179,166,255,.2)}.now::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(179,166,255,.7),transparent)}
.notes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.nt{display:block;padding:14px;border-radius:22px;min-height:118px;border:1px solid var(--hb-ln);animation:hbRise .45s both}
.nt gt-icon{width:15px;height:15px}.nt strong{display:block;margin-top:10px;font-size:14px;font-weight:700;line-height:1.3}.nt p{margin:5px 0 0;font-size:12px;line-height:1.4;color:var(--hb-m);white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.nt.y{background:linear-gradient(160deg,rgba(255,200,87,.16),rgba(255,200,87,.03) 70%);border-color:rgba(255,200,87,.22)}.nt.y gt-icon{color:var(--hb-y)}
.nt.v,.nt.b{background:linear-gradient(160deg,rgba(143,124,255,.18),rgba(143,124,255,.03) 70%);border-color:rgba(143,124,255,.24)}.nt.v gt-icon,.nt.b gt-icon{color:#b3a6ff}
.nt.p,.nt.r{background:linear-gradient(160deg,rgba(243,154,199,.16),rgba(243,154,199,.03) 70%);border-color:rgba(243,154,199,.24)}.nt.p gt-icon,.nt.r gt-icon{color:var(--hb-p)}
.nt.g{background:linear-gradient(160deg,rgba(79,209,165,.15),rgba(79,209,165,.03) 70%);border-color:rgba(79,209,165,.22)}.nt.g gt-icon{color:var(--hb-g)}`],
})
export class HubTodayComponent {
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  private gym = inject(Store);
  private router = inject(Router);
  private feedback = feedbackForContext();
  readonly euro = euro; readonly dayLabel = dayLabel; readonly shortDay = shortDay; readonly cap = cap; readonly initials = initials;
  text = '';
  readonly sheet = signal<'' | 'event' | 'spend' | 'split'>('');
  readonly editEvent = signal<HubEvent | null>(null);
  readonly draftTitle = signal('');
  readonly draftKind = signal<HubEventKind>('impegno');
  readonly splitTx = signal<HubTransaction | null>(null);
  readonly clock = signal(this.now());

  readonly name = computed(() => (this.gym.profile().name || '').split(' ')[0] || 'ciao');
  readonly greeting = computed(() => { const h = Number(this.clock().slice(0, 2)); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; });
  readonly monthLabel = computed(() => new Date().toLocaleDateString('it-IT', { month: 'long' }));
  readonly items = computed(() => dayItems(this.hub.doc(), this.view.gymData(), this.view.today(), this.view.spend(), this.view.recurring()));
  readonly nowIndex = computed(() => { const c = this.clock(), list = this.items(); const i = list.findIndex(x => !x.allDay && (x.time ?? '') > c); return i < 0 ? list.length : i; });
  readonly next = computed(() => {
    const today = this.view.today(), c = this.clock();
    const todays = this.items().filter(i => i.kind === 'event' && i.time && i.time >= c && !i.done).map(item => ({ day: today, item }));
    return todays[0] ?? upcoming(this.hub.doc(), today, []).find(u => u.item.kind === 'event');
  });
  readonly pinned = computed(() => this.hub.notes().filter(n => n.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4));
  readonly debtors = computed(() => Object.entries(this.view.position().people).filter(([, v]) => v > 0).map(([id]) => this.hub.person(id)).filter(p => !!p).slice(0, 4) as { id: string; name: string; color: string }[]);
  readonly savePct = computed(() => { const b = this.view.budget(), p = this.view.activePlan(); return b && p?.goal ? Math.max(0, Math.min(100, Math.round(b.projectedSaving / p.goal * 100))) : 0; });

  constructor() { setInterval(() => this.clock.set(this.now()), 30000); }
  private now() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  parts(c: number) { return euroParts(c); }
  abs(n: number) { return Math.abs(n); }
  max0(n: number) { return Math.max(0, n); }
  tone(c: string) { return ({ blue: 'b', violet: 'v', pink: 'p', amber: 'y', green: 'g', red: 'r' } as Record<string, string>)[c] ?? 'y'; }
  countdown(time: string) {
    const [h, m] = time.split(':').map(Number), now = new Date(), mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (mins <= 0) return 'adesso'; const hh = Math.floor(mins / 60), mm = mins % 60;
    return 'tra ' + (hh ? hh + ' h ' : '') + (mm || !hh ? mm + ' min' : '');
  }
  quick(kind: 'nota' | 'impegno' | 'scadenza' | 'spesa') {
    const text = this.text.trim();
    if (kind === 'nota' && text) {
      this.hub.upsert('notes', { id: hubId(), updatedAt: 0, title: text.slice(0, 80), body: text.length > 80 ? text : '', pinned: false, color: 'amber' });
      this.text = ''; this.feedback.show('success', 'Nota salvata.'); return;
    }
    if (kind === 'nota') { void this.router.navigate(['/hub/note'], { queryParams: { nuova: 1 } }); return; }
    this.draftTitle.set(text); this.text = '';
    if (kind === 'spesa') { this.sheet.set('spend'); return; }
    this.draftKind.set(kind); this.editEvent.set(null); this.sheet.set('event');
  }
  openItem(i: CalItem) {
    if (i.kind === 'workout') { void this.router.navigateByUrl('/'); return; }
    if (i.kind === 'event') { this.editEvent.set(this.hub.events().find(e => e.id === i.ref) ?? null); this.sheet.set('event'); return; }
    if (i.kind === 'note') { void this.router.navigate(['/hub/note'], { queryParams: { apri: i.ref } }); return; }
    void this.router.navigate(['/hub/spese'], { queryParams: { vista: 'movimenti' } });
  }
  protected readonly me = HUB_ME;
}
