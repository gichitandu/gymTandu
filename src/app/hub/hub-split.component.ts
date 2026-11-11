import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext } from '../services/feedback';
import { euro, euroParts, initials, shortDay, hubCategory } from './hub-model';
import { HUB_ME, HubStore } from './hub-store';
import { HubView } from './hub-view';
import { HubSplitSheetComponent } from './hub-split-sheet.component';
import { HubGroupSheetComponent, HubSettleSheetComponent, shareSummary, shareText } from './hub-people';
import { expenseShares } from './hub-split';

@Component({
  selector: 'gt-hub-split', standalone: true, imports: [RouterLink, IconComponent, HubSplitSheetComponent, HubGroupSheetComponent, HubSettleSheetComponent],
  template: `<div class="th"><h1 class="hb-h1" style="margin:0">Dividi</h1><button type="button" class="hb-btn sm newg" (click)="sheet.set('group')"><gt-icon name="plus"/>Nuovo gruppo</button></div>
<div class="hb-cols">
<section class="hb-hero green">
  <span class="hb-lbl">Saldo totale</span>
  <div class="hb-money" style="margin-top:8px"><b>{{sign()}}{{parts().whole}}</b><small>,{{parts().dec}} €</small></div>
  <span class="o8">{{pos().net>0?'In totale ti devono più di quanto devi tu':pos().net<0?'In totale devi più di quanto ti devono':'Sei in pari con tutti'}}</span>
  <div class="two"><span>Ti devono<b class="hb-num">{{euro(pos().owed)}} €</b></span><span>Devi<b class="hb-num">{{euro(pos().owe)}} €</b></span></div>
  <div class="hb-actions two"><button type="button" class="hb-btn white" (click)="sheet.set('settle')" [disabled]="!myDebts().length"><gt-icon name="check"/>Salda</button><button type="button" class="hb-btn glass" (click)="shareAll()"><gt-icon name="share"/>Invia riepilogo</button></div>
</section>
<div>
  <div class="hb-sec" style="margin-top:4px"><h2>Gruppi</h2>@if(archived().length){<button type="button" class="hb-link" (click)="showArchived.set(!showArchived())">{{showArchived()?'Nascondi archiviati':'Archiviati ('+archived().length+')'}}</button>}</div>
  <section class="hb-c hb-list gr">
    @for(g of groups();track g.group.id){<a class="hb-li" [routerLink]="['/hub/dividi',g.group.id]">
      <span class="hb-sq" [class]="'hb-sq '+toneOf($index)"><gt-icon [name]="g.group.icon"/></span>
      <span class="bd"><strong>{{g.group.name}}</strong><small><span class="hb-avs">@for(id of g.group.members.slice(0,3);track id){<span class="hb-av" [style.background]="color(id)">{{ini(id)}}</span>}@if(g.group.members.length>3){<span class="hb-av more">+{{g.group.members.length-3}}</span>}</span>{{g.group.members.length}} persone · {{g.expenses.length===1?'1 spesa':g.expenses.length+' spese'}}</small></span>
      <span class="amt" [class.hb-pos]="g.mine>0" [class.hb-neg]="g.mine<0">{{g.mine?euro(g.mine,{sign:true})+' €':'in pari'}}@if(g.mine){<small>{{g.mine>0?'ti devono':'devi'}}</small>}</span></a>}
    @empty{<div class="hb-empty"><span class="hb-sq lg v"><gt-icon name="users"/></span><strong>Nessun gruppo</strong>Crea un gruppo per la casa, un viaggio o il calcetto e aggiungi le persone.</div>}
  </section>
</div>
@if(people().length){<div class="hb-span">
  <div class="hb-sec"><h2>Persone</h2></div>
  <div class="ppl">@for(p of people();track p.id){<div class="hb-c pp"><span class="hb-av" [style.background]="p.color">{{initials(p.name)}}</span><strong>{{p.name}}</strong><b class="hb-num" [class.hb-pos]="p.net>0" [class.hb-neg]="p.net<0">{{p.net?euro(p.net,{sign:true})+' €':'in pari'}}</b></div>}</div>
</div>}
@if(activity().length){<div class="hb-span">
  <div class="hb-sec"><h2>Attività</h2></div>
  <section class="hb-c hb-list">@for(a of activity();track a.id){<div class="hb-li" style="cursor:default"><span [class]="'hb-sq sm '+a.tone"><gt-icon [name]="a.icon"/></span><span class="bd"><strong>{{a.title}}</strong><small>{{a.sub}}</small></span><span class="amt">{{euro(a.amount)}} €@if(a.note){<small [class.hb-pos]="a.good" [class.hb-neg]="a.bad">{{a.note}}</small>}</span></div>}</section>
</div>}
</div>
<button type="button" class="hb-fab" (click)="sheet.set('expense')"><gt-icon name="plus"/>Spesa divisa</button>
@if(sheet()==='expense'){<gt-hub-split-sheet (closed)="sheet.set('')"/>}
@if(sheet()==='group'){<gt-hub-group-sheet (closed)="closeGroup()" (saved)="openGroup($event)"/>}
@if(sheet()==='settle'){<gt-hub-settle-sheet [debts]="myDebts()" (closed)="sheet.set('')"/>}`,
  styles: [`.th{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 14px}.newg{width:auto;min-height:38px;font-size:13px;padding:0 12px}
.o8{display:block;margin-top:6px;font-size:12.5px;opacity:.85}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.two span{padding:10px 12px;border-radius:16px;background:rgba(5,20,25,.32);border:1px solid rgba(255,255,255,.14);font-size:11.5px}.two b{display:block;margin-top:3px;font-size:17px;font-weight:750;letter-spacing:-.4px}
.gr .hb-sq{width:46px;height:46px;border-radius:15px}.gr .hb-sq gt-icon{width:22px;height:22px}.gr .hb-av{width:22px;height:22px;font-size:9px}.gr .hb-av.more{background:var(--hb-s3);color:var(--hb-m)}.gr .amt{font-size:15px}
.ppl{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}.ppl::-webkit-scrollbar{display:none}
.pp{flex:none;width:86px;padding:12px 6px 10px;border-radius:20px;text-align:center}.pp .hb-av{width:44px;height:44px;font-size:16px;box-shadow:0 0 0 3px rgba(255,255,255,.06)}.pp strong{display:block;margin-top:8px;font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pp b{display:block;margin-top:2px;font-size:12px;font-weight:750;white-space:nowrap}`],
})
export class HubSplitComponent {
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedback = feedbackForContext();
  readonly euro = euro; readonly initials = initials;
  readonly sheet = signal<'' | 'expense' | 'group' | 'settle'>('');
  readonly showArchived = signal(false);
  private qp = toSignal(this.route.queryParamMap);
  readonly pos = computed(() => this.view.position());
  readonly parts = computed(() => euroParts(Math.abs(this.pos().net)));
  readonly sign = computed(() => this.pos().net > 0 ? '+' : this.pos().net < 0 ? '−' : '');
  readonly groups = computed(() => this.view.groupViews().filter(g => this.showArchived() || !g.group.archived).sort((a, b) => Number(!!a.group.archived) - Number(!!b.group.archived) || Math.abs(b.mine) - Math.abs(a.mine)));
  readonly archived = computed(() => this.view.groupViews().filter(g => g.group.archived));
  readonly people = computed(() => {
    const net = this.pos().people;
    return this.hub.people().filter(p => p.id !== HUB_ME).map(p => ({ ...p, net: net[p.id] ?? 0 })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 12);
  });
  readonly myDebts = computed(() => this.view.groupViews().flatMap(g => g.debts.filter(d => d.from === HUB_ME || d.to === HUB_ME).map(d => ({ ...d, groupId: g.group.id }))));
  readonly activity = computed(() => {
    const items = [
      ...this.hub.expenses().slice(0, 8).map(e => {
        const mine = expenseShares(e)[HUB_ME] ?? 0, credit = e.paidBy === HUB_ME ? e.amount - mine : -mine;
        return { id: e.id, at: e.updatedAt, title: e.description, sub: `${shortDay(e.date)} · ${e.paidBy === HUB_ME ? 'hai pagato tu' : 'ha pagato ' + this.hub.personName(e.paidBy)} · ${this.groupName(e.groupId)}`, amount: e.amount, icon: hubCategory(e.category).icon, tone: hubCategory(e.category).tone, note: credit > 0 ? `ti spettano ${euro(credit)}` : credit < 0 ? `tua parte ${euro(-credit)}` : '', good: credit > 0, bad: credit < 0 };
      }),
      ...this.hub.settlements().slice(-6).map(s => ({ id: s.id, at: s.updatedAt, title: s.from === HUB_ME ? `Hai saldato con ${this.hub.personName(s.to)}` : s.to === HUB_ME ? `${this.hub.personName(s.from)} ti ha pagato` : `${this.hub.personName(s.from)} ha pagato ${this.hub.personName(s.to)}`, sub: `${shortDay(s.date)} · ${this.groupName(s.groupId)}`, amount: s.amount, icon: 'swap', tone: 'g', note: '', good: false, bad: false })),
    ];
    return items.sort((a, b) => b.at - a.at).slice(0, 6);
  });
  constructor() {
    // ?nuovo=1 apre il nuovo gruppo; tornando indietro (parametro tolto) il foglio si chiude.
    effect(() => { const open = !!this.qp()?.get('nuovo'); untracked(() => { if (open) this.sheet.set('group'); else if (this.sheet() === 'group') this.sheet.set(''); }); });
  }
  groupName(id: string) { return this.hub.groups().find(g => g.id === id)?.name ?? 'Gruppo'; }
  color(id: string) { return this.hub.person(id)?.color ?? '#8a8a9a'; }
  ini(id: string) { return id === HUB_ME ? 'Tu' : initials(this.hub.personName(id)); }
  toneOf(i: number) { return ['b', 'g', 'o', 'v', 'p', 'c'][i % 6]; }
  closeGroup() { this.sheet.set(''); if (this.qp()?.get('nuovo')) void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true }); }
  openGroup(id: string) { void this.router.navigate(['/hub/dividi', id]); }
  async shareAll() {
    const debts = this.view.groupViews().filter(g => !g.group.archived).flatMap(g => g.debts);
    const result = await shareText(shareSummary('Riepilogo Dividi', debts, this.view.shareName), 'Riepilogo Dividi');
    if (result === 'copied') this.feedback.show('success', 'Riepilogo copiato: incollalo dove vuoi.');
  }
}
