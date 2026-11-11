import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { euro, HubExpense, hubId, HubSplitMode, HubTransaction, HUB_SPENDING_CATEGORIES, initials, parseEuroInput, validDay, hubToday } from './hub-model';
import { computeShares, splitProblem } from './hub-split';
import { HUB_ME, HubStore } from './hub-store';

const MODES: { v: HubSplitMode; l: string }[] = [{ v: 'equal', l: 'Uguale' }, { v: 'amounts', l: 'Importi' }, { v: 'percent', l: '%' }, { v: 'shares', l: 'Quote' }];

/** Nuova spesa divisa (o modifica), anche collegata a un movimento della banca. */
@Component({
  selector: 'gt-hub-split-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" aria-label="Spesa divisa" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{expense()?'Modifica spesa':'Nuova spesa'}}</h2>
    @if(groups().length){<label class="grp"><span class="hb-sq sm b"><gt-icon name="users"/></span><select name="group" [ngModel]="groupId()" (ngModelChange)="pickGroup($event)" aria-label="Gruppo">@for(g of groups();track g.id){<option [value]="g.id">{{g.name}}</option>}</select><gt-icon name="chevron-down"/></label>}</div>
  @if(!groups().length){
    <div class="hb-empty"><span class="hb-sq lg v"><gt-icon name="users"/></span><strong>Nessun gruppo</strong>Crea un gruppo (casa, viaggio, calcetto…) e aggiungi le persone con cui dividere.</div>
    <button type="button" class="hb-btn pri" (click)="newGroup()"><gt-icon name="plus"/>Crea un gruppo</button>
  }@else{
    <label class="amountx"><input name="amount" inputmode="decimal" [(ngModel)]="amount" (ngModelChange)="amountText.set($event)" placeholder="0,00" autocomplete="off" aria-label="Importo"/><span>€</span></label>
    <label class="hb-field"><input name="desc" [(ngModel)]="description" maxlength="120" placeholder="Descrizione" aria-label="Descrizione"/>
      <select class="cat" name="cat" [(ngModel)]="category" aria-label="Categoria">@for(c of categories;track c.id){<option [value]="c.id">{{c.label}}</option>}</select></label>
    @if(tx();as t){<div class="lk"><span class="hb-sq sm v"><gt-icon name="link"/></span><span class="grow"><strong>Collegata al movimento</strong><small>{{t.date}} · {{t.description}} {{euro(t.amount,{sign:true})}}</small><em>Nelle tue spese conta solo la tua parte: {{euro(myShare())}} €</em></span></div>}
    @else{<label class="hb-field stack" style="margin-top:10px"><small>Data</small><input type="date" name="date" [(ngModel)]="date"/></label>}
    <span class="hb-lab">Pagato da</span>
    <div class="hb-chips">@for(p of members();track p.id){<button type="button" class="hb-ch payer" [class.on]="paidBy()===p.id" (click)="paidBy.set(p.id)"><span class="hb-av" [style.background]="p.color">{{initials(p.name)}}</span>{{p.id===me?'Tu':p.name}}</button>}</div>
    <span class="hb-lab">Come dividere</span>
    <div class="hb-seg">@for(m of modes;track m.v){<button type="button" [class.on]="mode()===m.v" (click)="setMode(m.v)">{{m.l}}</button>}</div>
    <section class="hb-c hb-list mem">
      @for(p of members();track p.id){<div class="hb-li">
        <button type="button" class="cb" [class.on]="(parts()[p.id]??0)>0" (click)="toggle(p.id)" [attr.aria-pressed]="(parts()[p.id]??0)>0" [attr.aria-label]="'Includi '+p.name">@if((parts()[p.id]??0)>0){<gt-icon name="check"/>}</button>
        <span class="hb-av" [style.background]="p.color">{{initials(p.name)}}</span><span class="bd"><strong>{{p.id===me?'Tu':p.name}}</strong></span>
        @if(mode()!=='equal'&&(parts()[p.id]??0)>0){<input class="val" inputmode="decimal" [ngModel]="valueText(p.id)" (ngModelChange)="setValue(p.id,$event)" [name]="'v'+p.id" [attr.aria-label]="'Quota di '+p.name"/>}
        <span class="amt">{{euro(shares()[p.id]??0)}} €</span>
      </div>}
    </section>
    <div class="tot"><span>{{activeCount()}} persone</span>@if(problem()){<span class="hb-neg">{{problem()}}</span>}@else{<span class="hb-pos">{{euro(cents())}} € divisi senza resto ✓</span>}</div>
    @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
    <div class="hb-actions"><button class="hb-btn pri" type="submit" [disabled]="!!problem()"><gt-icon name="check"/>{{expense()?'Salva modifiche':'Aggiungi spesa'}}</button>
      @if(expense();as e){<button type="button" class="hb-btn sm danger" (click)="remove(e)"><gt-icon name="trash"/>Elimina spesa</button>}</div>
  }
</form>`,
  styles: [`.grp{position:relative;display:flex;align-items:center;gap:6px;height:36px;padding:0 10px 0 5px;border-radius:12px;background:rgba(91,140,255,.14);color:#8fb0ff;font-size:13px;font-weight:650}
.grp .hb-sq{width:26px;height:26px;border-radius:8px}.grp select{appearance:none;border:0;background:none;color:inherit;font:inherit;max-width:150px;padding-right:2px}.grp>gt-icon{width:13px;height:13px}.grp select option{background:#1a1a22;color:#fff}
.amountx{display:flex;align-items:baseline;justify-content:center;gap:4px;margin:8px 0 10px}.amountx input{width:210px;border:0;outline:0;background:none;color:var(--hb-t);font:inherit;font-size:52px;font-weight:750;letter-spacing:-2px;text-align:right}.amountx span{font-size:24px;font-weight:650;color:var(--hb-m)}
.cat{flex:none!important;max-width:44%;font-size:13px!important;color:var(--hb-g)!important;text-align:right}
.lk{display:flex;align-items:flex-start;gap:12px;margin-top:10px;padding:12px 14px;border-radius:18px;background:linear-gradient(160deg,rgba(143,124,255,.14),rgba(143,124,255,.03));border:1px solid rgba(143,124,255,.26)}
.lk .grow{flex:1;min-width:0}.lk strong{display:block;font-size:13.5px}.lk small{display:block;margin-top:2px;font-size:11.5px;color:var(--hb-m);font-family:ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lk em{display:block;margin-top:4px;font-style:normal;font-size:12px;color:#c9c0ff}
.payer{padding-left:5px}.payer .hb-av{width:26px;height:26px;font-size:10px;box-shadow:none}
.mem{margin-top:10px}.mem .hb-li{cursor:default;padding:10px 14px}.mem .hb-av{width:32px;height:32px;font-size:12px}
.cb{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border-radius:8px;border:2px solid rgba(255,255,255,.2);background:none;cursor:pointer;color:#fff}.cb.on{border:0;background:linear-gradient(140deg,#8f7cff,#5b8cff)}.cb gt-icon{width:14px;height:14px}
.val{width:64px;height:34px;padding:0 8px;border-radius:10px;border:1px solid var(--hb-ln);background:rgba(255,255,255,.06);color:var(--hb-t);font:inherit;font-size:14px;text-align:right}
.tot{display:flex;justify-content:space-between;gap:10px;margin:10px 4px 0;font-size:12.5px;color:var(--hb-m)}`],
})
export class HubSplitSheetComponent {
  readonly group = input<string>('');
  readonly tx = input<HubTransaction | null>(null);
  readonly expense = input<HubExpense | null>(null);
  readonly closed = output<void>();
  private hub = inject(HubStore);
  private router = inject(Router);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly me = HUB_ME; readonly euro = euro; readonly initials = initials; readonly modes = MODES;
  readonly categories = HUB_SPENDING_CATEGORIES;
  readonly groups = computed(() => this.hub.groups().filter(g => !g.archived));
  readonly groupId = signal('');
  readonly members = computed(() => {
    const g = this.hub.groups().find(x => x.id === this.groupId());
    return (g?.members ?? []).map(id => this.hub.person(id)).filter(p => !!p && !p.deleted).map(p => p!);
  });
  amount = ''; description = ''; category = 'altro'; date = hubToday();
  readonly amountText = signal('');
  readonly paidBy = signal(HUB_ME);
  readonly mode = signal<HubSplitMode>('equal');
  readonly parts = signal<Record<string, number>>({});
  readonly cents = computed(() => Math.max(0, parseEuroInput(this.amountText()) ?? 0));
  readonly shares = computed(() => computeShares(this.cents(), this.mode(), this.parts()));
  readonly myShare = computed(() => this.shares()[HUB_ME] ?? 0);
  readonly activeCount = computed(() => Object.values(this.parts()).filter(v => v > 0).length);
  readonly problem = computed(() => splitProblem(this.cents(), this.mode(), this.parts()));

  constructor() {
    effect(() => {
      const e = this.expense(), t = this.tx(), g = this.group();
      untracked(() => {
        const groups = this.groups();
        if (e) {
          this.groupId.set(e.groupId); this.setAmount(e.amount); this.description = e.description; this.category = e.category; this.date = e.date;
          this.paidBy.set(e.paidBy); this.mode.set(e.mode); this.parts.set({ ...e.parts });
          return;
        }
        this.groupId.set(g || groups[0]?.id || '');
        if (t) { this.setAmount(Math.abs(t.amount)); this.description = t.description.split(' · ')[0].replace(/^(pagamento|pag\.?|pos|addebito)\s+(pos\s+)?/i, '').slice(0, 60); this.category = t.category || 'altro'; this.date = t.date; }
        this.resetParts();
      });
    });
  }
  private setAmount(cents: number) { this.amount = (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 }).replace(/\./g, ''); this.amountText.set(this.amount); }
  private resetParts() { this.parts.set(Object.fromEntries(this.members().map(p => [p.id, 1]))); if (!this.members().some(p => p.id === this.paidBy())) this.paidBy.set(this.members()[0]?.id ?? HUB_ME); }
  pickGroup(id: string) { this.groupId.set(id); this.resetParts(); }
  setMode(mode: HubSplitMode) {
    const active = this.members().filter(p => (this.parts()[p.id] ?? 0) > 0);
    this.mode.set(mode);
    if (mode === 'equal' || mode === 'shares') this.parts.set(Object.fromEntries(active.map(p => [p.id, 1])));
    if (mode === 'percent') { const each = Math.floor(10000 / Math.max(1, active.length)) / 100; this.parts.set(Object.fromEntries(active.map((p, i) => [p.id, i === 0 ? Math.round((100 - each * (active.length - 1)) * 100) / 100 : each]))); }
    if (mode === 'amounts') this.parts.set(computeShares(this.cents(), 'equal', Object.fromEntries(active.map(p => [p.id, 1]))));
  }
  toggle(id: string) {
    const on = (this.parts()[id] ?? 0) > 0;
    const next = { ...this.parts(), [id]: on ? 0 : 1 };
    if (this.mode() === 'equal' || this.mode() === 'shares') this.parts.set(next);
    else { this.parts.set(next); this.setMode(this.mode()); }
  }
  valueText(id: string) { const v = this.parts()[id] ?? 0; return this.mode() === 'amounts' ? (v / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : String(v).replace('.', ','); }
  setValue(id: string, text: string) {
    const n = this.mode() === 'amounts' ? parseEuroInput(text) : Number(String(text).replace(',', '.'));
    if (n === null || !Number.isFinite(n) || n < 0) return;
    this.parts.update(p => ({ ...p, [id]: n }));
  }
  newGroup() { this.close(); void this.router.navigate(['/hub/dividi'], { queryParams: { nuovo: 1 } }); }
  save() {
    this.error.set('');
    const problem = this.problem();
    if (problem) { this.error.set(problem); return; }
    if (!this.description.trim()) { this.error.set('Scrivi una descrizione.'); return; }
    if (!validDay(this.date)) { this.error.set('Scegli una data valida.'); return; }
    const base = this.expense(), t = this.tx();
    const parts = Object.fromEntries(Object.entries(this.parts()).filter(([, v]) => v > 0));
    const record: HubExpense = {
      id: base?.id ?? hubId(), updatedAt: base?.updatedAt ?? 0, groupId: this.groupId(), description: this.description.trim(), amount: this.cents(),
      paidBy: this.paidBy(), date: t?.date ?? this.date, category: this.category, mode: this.mode(), parts, transactionId: base?.transactionId ?? t?.id,
    };
    this.hub.upsert('expenses', record);
    if (t && !base) this.hub.upsert('transactions', { ...t, expenseId: record.id });
    const mine = this.myShare(), credit = record.paidBy === HUB_ME ? record.amount - mine : 0;
    this.feedback.show('success', credit > 0 ? `Spesa aggiunta: ti spettano ${euro(credit)} €.` : 'Spesa aggiunta al gruppo.');
    this.close();
  }
  async remove(e: HubExpense) {
    if (!await this.confirm.ask({ title: 'Eliminare la spesa?', message: `${e.description} · ${euro(e.amount)} €`, confirmLabel: 'Elimina', tone: 'danger' })) return;
    this.hub.remove('expenses', e.id);
    const linked = this.hub.transactions().find(t => t.expenseId === e.id);
    if (linked) { const { expenseId: _drop, ...rest } = linked; this.hub.upsert('transactions', rest as HubTransaction); }
    this.close();
  }
  close() { this.closed.emit(); }
}
