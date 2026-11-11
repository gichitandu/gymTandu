import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { HUB_CATEGORIES, hubBankLabel, hubBankShort, hubCategory, hubId, HubTransaction, euro, parseEuroInput, validDay, hubToday, dayLabel } from './hub-model';
import { kindForCategory, rulePattern } from './hub-finance';
import { HubStore } from './hub-store';

/** Spesa a mano (contanti) o modifica di un movimento importato: categoria, regola, Dividi. */
@Component({
  selector: 'gt-hub-spend-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" [attr.aria-label]="tx()?'Movimento':'Nuova spesa'" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{tx()?'Movimento':'Nuova spesa'}}</h2><button type="button" class="hb-ib" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  @if(tx();as t){
    <div class="src"><span [class]="'hb-bank md '+t.bank">{{short(t.bank)}}</span><span class="tx"><strong>{{t.description}}</strong><small>{{bank(t.bank)}} · {{day(t.date)}}</small></span><b class="hb-num">{{euro(t.amount,{sign:true})}} €</b></div>
  }@else{
    <label class="hb-field amount"><span>€</span><input name="amount" inputmode="decimal" [(ngModel)]="amount" placeholder="0,00" required autocomplete="off" aria-label="Importo"/></label>
    <div class="two">
      <label class="hb-field stack"><small>Descrizione</small><input name="desc" [(ngModel)]="description" maxlength="120" placeholder="Es. Bar con amici" required/></label>
      <label class="hb-field stack"><small>Data</small><input type="date" name="date" [(ngModel)]="date" required/></label>
    </div>
  }
  <span class="hb-lab">Categoria</span>
  <div class="cats">@for(c of categories;track c.id){<button type="button" class="hb-ch" [class.on]="category()===c.id" (click)="category.set(c.id)"><span [class]="'hb-dot '+c.tone"></span>{{c.label}}</button>}</div>
  @if(tx()){<label class="rule"><input type="checkbox" name="rule" [(ngModel)]="makeRule"/><span>Usa questa categoria anche per i movimenti simili (“{{pattern()}}”)</span></label>}
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions">
    <button class="hb-btn pri" type="submit"><gt-icon name="check"/>Salva</button>
    <div class="hb-actions two" style="margin-top:0">
      <button type="button" class="hb-btn sm" (click)="divide()" [disabled]="!!tx()?.expenseId||amountCents()>=0&&!!tx()"><gt-icon name="users"/>{{tx()?.expenseId?'Già divisa':'Dividi'}}</button>
      @if(tx();as t){<button type="button" class="hb-btn sm danger" (click)="remove(t)"><gt-icon name="trash"/>Elimina</button>}
    </div>
  </div>
</form>`,
  styles: [`.src{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid var(--hb-ln)}
.src .tx{flex:1;min-width:0}.src strong{display:block;font-size:13.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.src small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m)}.src b{font-size:15px}
.amount{justify-content:center;min-height:76px;font-size:40px;font-weight:750;letter-spacing:-1.5px}.amount span{color:var(--hb-f);font-size:28px}.amount input{text-align:center;font-size:40px;font-weight:750;max-width:220px}
.two{display:grid;grid-template-columns:1.5fr 1fr;gap:8px;margin-top:10px}
.cats{display:flex;flex-wrap:wrap;gap:6px}.cats .hb-ch{min-height:32px;font-size:12.5px}
.rule{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:12.5px;line-height:1.4;color:var(--hb-m)}.rule input{width:18px;height:18px;accent-color:#8f7cff;flex:none;margin-top:1px}`],
})
export class HubSpendSheetComponent {
  readonly tx = input<HubTransaction | null>(null);
  readonly defaultDescription = input('');
  readonly closed = output<void>();
  readonly split = output<HubTransaction>();
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly euro = euro; readonly bank = hubBankLabel; readonly short = hubBankShort; readonly day = dayLabel;
  readonly categories = HUB_CATEGORIES;
  readonly category = signal('altro');
  amount = ''; description = ''; date = hubToday(); makeRule = true;
  readonly amountCents = computed(() => this.tx()?.amount ?? -(parseEuroInput(this.amount) ?? 0));
  readonly pattern = computed(() => { const t = this.tx(); return t ? rulePattern(t.description) : ''; });

  constructor() {
    effect(() => {
      const t = this.tx(), d = this.defaultDescription();
      untracked(() => { if (t) this.category.set(t.category || ''); else { this.description = d; this.category.set('altro'); } });
    });
  }

  private manual(): HubTransaction | null {
    const cents = parseEuroInput(this.amount);
    if (!cents || cents <= 0) { this.error.set('Inserisci un importo valido.'); return null; }
    if (!this.description.trim()) { this.error.set('Scrivi una descrizione.'); return null; }
    if (!validDay(this.date)) { this.error.set('Scegli una data valida.'); return null; }
    const id = hubId();
    return { id, updatedAt: 0, bank: 'altro', date: this.date, description: this.description.trim(), amount: -cents, category: this.category(), kind: kindForCategory(this.category(), -cents), hash: 'manual|' + id, manualCategory: true };
  }
  save() {
    this.error.set('');
    const t = this.tx();
    if (!t) { const record = this.manual(); if (!record) return; this.hub.upsert('transactions', record); this.feedback.show('success', 'Spesa aggiunta.'); this.close(); return; }
    const category = this.category();
    this.hub.upsert('transactions', { ...t, category, kind: kindForCategory(category, t.amount), manualCategory: true });
    const pattern = this.pattern();
    if (this.makeRule && pattern.length >= 3) {
      const existing = this.hub.rules().find(r => r.pattern === pattern);
      this.hub.upsert('rules', { id: existing?.id ?? hubId(), updatedAt: existing?.updatedAt ?? 0, pattern, category });
      const similar = this.hub.transactions().filter(x => x.id !== t.id && !x.manualCategory && x.description && rulePattern(x.description) === pattern && x.category !== category);
      if (similar.length) this.hub.upsert('transactions', ...similar.map(x => ({ ...x, category, kind: kindForCategory(category, x.amount) })));
      this.feedback.show('success', similar.length ? `Categoria aggiornata anche su ${similar.length} movimenti simili.` : 'Categoria salvata. La uso anche per i prossimi import.');
    } else this.feedback.show('success', 'Categoria salvata.');
    this.close();
  }
  divide() {
    const t = this.tx() ?? this.manual();
    if (!t) return;
    if (!this.tx()) this.hub.upsert('transactions', t);
    this.split.emit({ ...t, category: this.category() || t.category });
  }
  async remove(t: HubTransaction) {
    if (!await this.confirm.ask({ title: 'Eliminare il movimento?', message: `${t.description} · ${euro(t.amount, { sign: true })} €`, detail: 'Se reimporti lo stesso estratto, il movimento tornerà.', confirmLabel: 'Elimina', tone: 'danger' })) return;
    this.hub.remove('transactions', t.id); this.close();
  }
  close() { this.closed.emit(); }
  protected readonly categoryOf = hubCategory;
}
