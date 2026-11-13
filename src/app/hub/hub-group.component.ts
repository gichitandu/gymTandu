import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { HubShareService } from './hub-share';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext } from '../services/feedback';
import { cap, euro, euroParts, HubExpense, hubCategory, hubId, initials, monthName, shortDay } from './hub-model';
import { HUB_ME, HubStore } from './hub-store';
import { HubView } from './hub-view';
import { expenseShares } from './hub-split';
import { HubSplitSheetComponent } from './hub-split-sheet.component';
import { HubGroupSheetComponent, HubSettleSheetComponent, shareSummary, shareText } from './hub-people';

@Component({
  selector: 'gt-hub-group', standalone: true, imports: [RouterLink, IconComponent, HubSplitSheetComponent, HubGroupSheetComponent, HubSettleSheetComponent],
  template: `@if(view(); as g){
<div class="hb-top"><a class="hb-back" routerLink="/hub/dividi" aria-label="Torna a Dividi"><gt-icon name="back"/></a>
  <div class="tt"><span [class]="'hb-sq sm '+tone()"><gt-icon [name]="g.group.icon"/></span><span><h1>{{g.group.name}}</h1><small>{{g.group.members.length}} persone@if(g.group.archived){ · archiviato}</small></span></div>
  <button type="button" class="hb-ib" (click)="sheet.set('edit')" aria-label="Impostazioni gruppo"><gt-icon name="settings"/></button></div>
<div class="hb-cols">
<section class="hb-hero green">
  <div class="hb-between"><span class="hb-lbl">{{g.mine>0?'Ti devono':g.mine<0?'Devi':'Saldo'}}</span><span class="hb-avs">@for(id of g.group.members.slice(0,5);track id){<span class="hb-av" [style.background]="color(id)">{{ini(id)}}</span>}</span></div>
  <div class="hb-money" style="margin-top:8px"><b>{{parts().whole}}</b><small>,{{parts().dec}} €</small></div>
  <span class="o8">{{g.mine===0?'Sei in pari con questo gruppo':g.mine>0?'Gli altri ti devono questa cifra in totale':'La tua parte ancora da restituire'}}</span>
  <div class="hb-actions two"><button type="button" class="hb-btn white" (click)="sheet.set('settle')" [disabled]="!mineDebts().length"><gt-icon name="check"/>Salda</button><button type="button" class="hb-btn glass" (click)="share()"><gt-icon name="share"/>Riepilogo</button></div>
  <button type="button" class="hb-btn glass invite" (click)="invite()" [disabled]="inviting()"><gt-icon name="users"/>{{inviting()?'Preparo il link…':g.group.shared?'Invita con un link':'Condividi il gruppo e invita'}}</button>
  @if(shareError();as err){<p class="hb-err" role="alert">{{err}}</p>}
</section>
<div>
  <div class="hb-sec" style="margin-top:4px"><h2>Chi deve a chi</h2></div>
  <section class="hb-c hb-list">
    @for(d of g.debts;track $index){<div class="hb-li dt" style="cursor:default">
      <span class="flow"><span class="hb-av" [style.background]="color(d.from)">{{ini(d.from)}}</span><gt-icon name="arrow"/><span class="hb-av" [style.background]="color(d.to)">{{ini(d.to)}}</span></span>
      <span class="bd"><strong>{{debtLabel(d.from,d.to)}}</strong><small class="hb-num">{{euro(d.amount)}} €</small></span>
      <button type="button" class="hb-btn sm mark" (click)="markPaid(d.from,d.to)">Segna pagato</button></div>}
    @empty{<div class="hb-empty"><span class="hb-sq lg g"><gt-icon name="check"/></span><strong>Tutti in pari</strong>Nessun debito aperto in questo gruppo.</div>}
  </section>
  <div class="stats">
    <div class="hb-c st"><small>{{monthLabel()}}</small><b class="hb-num">{{euro(g.monthTotal)}} €</b></div>
    <div class="hb-c st"><small>La tua parte</small><b class="hb-num">{{euro(myMonth())}} €</b></div>
    <div class="hb-c st"><small>Dall'inizio</small><b class="hb-num">{{euro(total())}} €</b></div>
  </div>
</div>
<div class="hb-span">
  <div class="hb-sec"><h2>Movimenti</h2>@if(g.group.archived){<button type="button" class="hb-link" (click)="restore()">Ripristina gruppo</button>}</div>
  @for(day of days();track day.date){<div class="dl">{{day.label}}</div>
  <section class="hb-c hb-list">@for(r of day.rows;track r.id){
    @if(r.expense; as e){<button type="button" class="hb-li" (click)="edit.set(e);sheet.set('expense')">
      <span [class]="'hb-sq sm '+cat(e.category).tone"><gt-icon [name]="cat(e.category).icon"/></span>
      <span class="bd"><strong>{{e.description}}</strong><small>{{e.paidBy===me?'Hai pagato tu':'Ha pagato '+name(e.paidBy)}} · {{modeLabel(e)}}</small></span>
      <span class="amt">{{euro(e.amount)}} €<small [class.hb-pos]="r.credit>0" [class.hb-neg]="r.credit<0">{{r.credit>0?'ti spettano '+euro(r.credit):r.credit<0?'devi '+euro(-r.credit):'non coinvolto'}}</small></span></button>}
    @else{<div class="hb-li" style="cursor:default"><span class="hb-sq sm g"><gt-icon name="swap"/></span><span class="bd"><strong>{{r.title}}</strong><small>Pagamento registrato</small></span><span class="amt">{{euro(r.amount)}} €<button type="button" class="undo" (click)="undo(r.id)">Annulla</button></span></div>}
  }</section>}
  @empty{<section class="hb-c"><div class="hb-empty"><span class="hb-sq lg v"><gt-icon name="cart"/></span><strong>Ancora nessuna spesa</strong>Aggiungi la prima spesa: GymTrack calcola chi deve cosa.</div></section>}
</div>
</div>
<button type="button" class="hb-fab" (click)="edit.set(null);sheet.set('expense')"><gt-icon name="plus"/>Spesa</button>
@if(sheet()==='expense'){<gt-hub-split-sheet [group]="g.group.id" [expense]="edit()" (closed)="sheet.set('');edit.set(null)"/>}
@if(sheet()==='edit'){<gt-hub-group-sheet [group]="g.group" (closed)="sheet.set('')" (saved)="sheet.set('')"/>}
@if(sheet()==='settle'){<gt-hub-settle-sheet [debts]="mineDebts()" (closed)="sheet.set('')"/>}
}@else{
<div class="hb-top"><a class="hb-back" routerLink="/hub/dividi" aria-label="Torna a Dividi"><gt-icon name="back"/></a><h1 class="hb-h1" style="margin:0">Gruppo</h1></div>
<section class="hb-c"><div class="hb-empty"><span class="hb-sq lg v"><gt-icon name="users"/></span><strong>{{hub.ready()?'Gruppo non trovato':'Caricamento…'}}</strong>@if(hub.ready()){Potrebbe essere stato eliminato da un altro dispositivo.}</div></section>
}`,
  styles: [`.tt{flex:1;min-width:0;display:flex;align-items:center;gap:10px}.tt h1{margin:0;font-size:19px;font-weight:750;letter-spacing:-.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tt small{display:block;font-size:12px;color:var(--hb-m)}.tt>span:last-child{min-width:0}
.invite{width:100%;margin-top:8px}
.o8{display:block;margin-top:6px;font-size:12.5px;opacity:.85}.hb-hero .hb-av{width:26px;height:26px;font-size:10px;box-shadow:0 0 0 2px rgba(15,42,51,.9)}
.dt .flow{display:flex;align-items:center;gap:3px;flex:none}.dt .flow gt-icon{width:13px;height:13px;color:var(--hb-f)}.dt .hb-av{width:30px;height:30px;font-size:11px}
.mark{width:auto;min-height:34px;padding:0 11px;font-size:12px;background:rgba(79,209,165,.14)!important;color:var(--hb-g);border-color:rgba(79,209,165,.3)!important}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.st{padding:12px;border-radius:18px}.st small{display:block;font-size:11px;color:var(--hb-m);line-height:1.25}.st b{display:block;margin-top:6px;font-size:16px;font-weight:750;letter-spacing:-.3px}
.dl{margin:14px 4px 6px;font-size:11.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--hb-f)}.dl:first-of-type{margin-top:0}
button.hb-li{width:100%;text-align:left}
.undo{display:block;margin:2px 0 0 auto;padding:0;border:0;background:none;color:var(--hb-v);font-size:11.5px;font-weight:600;cursor:pointer}`],
})
export class HubGroupComponent {
  readonly hub = inject(HubStore);
  private hv = inject(HubView);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedback = feedbackForContext();
  readonly euro = euro; readonly me = HUB_ME;
  private sharing = inject(HubShareService);
  readonly inviting = signal(false);
  readonly shareError = signal('');
  readonly sheet = signal<'' | 'expense' | 'edit' | 'settle'>('');
  readonly edit = signal<HubExpense | null>(null);
  private params = toSignal(this.route.paramMap);
  readonly id = computed(() => this.params()?.get('id') ?? '');
  readonly view = computed(() => this.hv.groupViews().find(g => g.group.id === this.id()));
  readonly tone = computed(() => { const i = this.hub.groups().findIndex(g => g.id === this.id()); return ['b', 'g', 'o', 'v', 'p', 'c'][Math.max(0, i) % 6]; });
  readonly parts = computed(() => euroParts(Math.abs(this.view()?.mine ?? 0)));
  readonly mineDebts = computed(() => { const g = this.view(); return g ? g.debts.filter(d => d.from === HUB_ME || d.to === HUB_ME).map(d => ({ ...d, groupId: g.group.id })) : []; });
  readonly monthLabel = computed(() => cap(monthName(this.hv.month())));
  readonly myMonth = computed(() => { const g = this.view(), m = this.hv.month(); return g ? g.expenses.filter(e => e.date.slice(0, 7) === m).reduce((s, e) => s + (expenseShares(e)[HUB_ME] ?? 0), 0) : 0; });
  readonly total = computed(() => this.view()?.expenses.reduce((s, e) => s + e.amount, 0) ?? 0);
  readonly days = computed(() => {
    const g = this.view(); if (!g) return [];
    type Row = { id: string; date: string; at: number; expense?: HubExpense; credit: number; title: string; amount: number };
    const rows: Row[] = [
      ...g.expenses.map(e => { const mine = expenseShares(e)[HUB_ME] ?? 0; return { id: e.id, date: e.date, at: e.updatedAt, expense: e, credit: e.paidBy === HUB_ME ? e.amount - mine : -mine, title: e.description, amount: e.amount }; }),
      ...g.settlements.map(s => ({ id: s.id, date: s.date, at: s.updatedAt, credit: 0, title: s.from === HUB_ME ? `Hai pagato ${this.name(s.to)}` : s.to === HUB_ME ? `${this.name(s.from)} ti ha pagato` : `${this.name(s.from)} → ${this.name(s.to)}`, amount: s.amount })),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
    const out: { date: string; label: string; rows: Row[] }[] = [];
    for (const r of rows) { const last = out[out.length - 1]; if (last?.date === r.date) last.rows.push(r); else out.push({ date: r.date, label: shortDay(r.date), rows: [r] }); }
    return out;
  });
  private wasFound = false;
  constructor() {
    // Se il gruppo viene eliminato (anche da un altro dispositivo) si torna alla lista.
    effect(() => { const found = !!this.view(); if (found) this.wasFound = true; else if (this.wasFound && this.hub.ready()) void this.router.navigate(['/hub/dividi'], { replaceUrl: true }); });
  }
  cat(id: string) { return hubCategory(id); }
  name(id: string) { return this.hub.personName(id); }
  ini(id: string) { return id === HUB_ME ? 'Tu' : initials(this.name(id)); }
  color(id: string) { return this.hub.person(id)?.color ?? '#8a8a9a'; }
  debtLabel(from: string, to: string) { return to === HUB_ME ? `${this.name(from)} ti deve` : from === HUB_ME ? `Devi a ${this.name(to)}` : `${this.name(from)} deve a ${this.name(to)}`; }
  modeLabel(e: HubExpense) {
    const n = Object.values(e.parts).filter(v => v > 0).length;
    return e.mode === 'equal' ? `diviso in ${n}` : e.mode === 'amounts' ? 'importi diversi' : e.mode === 'percent' ? 'in percentuale' : 'a quote';
  }
  markPaid(from: string, to: string) {
    const g = this.view(), d = g?.debts.find(x => x.from === from && x.to === to);
    if (!g || !d) return;
    this.hub.upsert('settlements', { id: hubId(), updatedAt: 0, groupId: g.group.id, from, to, amount: d.amount, date: this.hv.today() });
    this.feedback.show('success', `Pagamento di ${euro(d.amount)} € registrato.`);
  }
  undo(id: string) { this.hub.remove('settlements', id); this.feedback.show('success', 'Pagamento annullato.'); }
  restore() { const g = this.view()?.group; if (g) this.hub.upsert('groups', { ...g, archived: false }); }
  /** Crea (o riprende) il link: chi lo apre, dopo l'accesso, entra nel gruppo con un tocco. */
  async invite() {
    const g = this.view()?.group; if (!g) return;
    this.inviting.set(true); this.shareError.set('');
    try {
      const link = await this.sharing.createInvite(g.id);
      const result = await shareText(`Entra nel gruppo “${g.name}” su GymTrack · Dividi:\n${link}`, g.name);
      if (result === 'copied') this.feedback.show('success', 'Link di invito copiato: incollalo dove vuoi.');
      else if (result === 'failed') this.shareError.set('Non riesco a condividere il link: ' + link);
    } catch (e) { this.shareError.set(e instanceof Error ? e.message : 'Invito non riuscito. Riprova.'); }
    finally { this.inviting.set(false); }
  }
  async share() {
    const g = this.view(); if (!g) return;
    const result = await shareText(shareSummary(g.group.name, g.debts, this.hv.shareName), g.group.name);
    if (result === 'copied') this.feedback.show('success', 'Riepilogo copiato: incollalo dove vuoi.');
  }
}
