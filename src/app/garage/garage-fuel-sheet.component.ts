import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { euro, HubFuelup, hubId, hubToday, parseEuroInput, shortDay, validDay } from '../hub/hub-model';
import { kindForCategory } from '../hub/hub-finance';
import { HubStore } from '../hub/hub-store';
import { CarCost } from './garage-stats';
import { GarageView, num, parseAmount } from './garage-view';

/** Rifornimento: collega una spesa di carburante del Planner (o ne crea una) e aggiunge litri e chilometri. */
@Component({
  selector: 'gt-garage-fuel-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" aria-label="Rifornimento" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{fuelup()?'Rifornimento':'Nuovo rifornimento'}}</h2><button type="button" class="hb-ib" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  @if(linked();as c){
    <div class="src"><span class="hb-sq g"><gt-icon name="fuel"/></span><span class="tx"><strong>{{c.label}}</strong><small>Dal Planner · {{day(c.date)}}</small></span><b class="hb-num">{{euro(c.amount)}} €</b></div>
    @if(!fuelup()&&!cost()){<button type="button" class="hb-link" (click)="pickedId.set('')">Scegli un'altra spesa</button>}
  }@else{
    @if(choices().length){
      <span class="hb-lab" style="margin-top:0">Spese di carburante nel Planner</span>
      <div class="pick">@for(c of choices();track c.id){<button type="button" class="hb-li" (click)="pickedId.set(c.id)"><span class="hb-sq sm g"><gt-icon name="fuel"/></span><span class="bd"><strong>{{c.label}}</strong><small>{{day(c.date)}}</small></span><span class="amt">{{euro(c.amount)}} €</span></button>}</div>
      <span class="hb-lab">Oppure pagato in contanti</span>
    }
    <label class="hb-field amount"><span>€</span><input name="amount" inputmode="decimal" [(ngModel)]="amount" placeholder="0,00" autocomplete="off" aria-label="Importo"/></label>
    <div class="two" style="margin-top:8px">
      <label class="hb-field stack"><small>Distributore</small><input name="station" [(ngModel)]="station" maxlength="40" placeholder="Es. Eni"/></label>
      <label class="hb-field stack"><small>Data</small><input type="date" name="date" [(ngModel)]="date" required/></label>
    </div>
    <p class="hb-sub">La spesa viene aggiunta anche al Planner, in Trasporti. Se paghi con carta, scegli invece il movimento dell'estratto per non contarlo due volte.</p>
  }
  <span class="hb-lab">Litri e chilometri</span>
  <div class="two">
    <label class="hb-field stack"><small>Litri</small><input name="liters" inputmode="decimal" [(ngModel)]="liters" placeholder="Es. 38,5" autocomplete="off"/></label>
    <label class="hb-field stack"><small>Contachilometri</small><input name="km" inputmode="numeric" [(ngModel)]="km" [placeholder]="kmHint()" autocomplete="off"/></label>
  </div>
  <div class="full"><span><strong>Ho fatto il pieno</strong><small>Serve per calcolare consumo, carburante rimasto e autonomia.</small></span>
    <button type="button" class="hb-tog" role="switch" [attr.aria-checked]="full()" (click)="full.set(!full())" aria-label="Ho fatto il pieno"></button></div>
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions">
    <button class="hb-btn pri" type="submit"><gt-icon name="check"/>Salva</button>
    @if(fuelup();as f){<button type="button" class="hb-btn sm danger" (click)="remove(f)"><gt-icon name="trash"/>Elimina rifornimento</button>}
  </div>
</form>`,
  styles: [`.src{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid var(--hb-ln)}
.src .tx{flex:1;min-width:0}.src strong{display:block;font-size:13.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.src small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m)}.src b{font-size:15px}
.hb-link{margin:8px 2px 0;border:0;background:none;padding:0;font-size:12.5px;font-weight:600;color:var(--hb-g);cursor:pointer}
.pick{border-radius:18px;border:1px solid var(--hb-ln);overflow:hidden;max-height:176px;overflow-y:auto}
.amount{justify-content:center;min-height:68px;font-size:34px;font-weight:750;letter-spacing:-1.2px}.amount span{color:var(--hb-f);font-size:24px}.amount input{text-align:center;font-size:34px;font-weight:750;max-width:200px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.full{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid var(--hb-ln)}
.full strong{display:block;font-size:14px;font-weight:650}.full small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m);line-height:1.35}.full .hb-tog{margin-left:auto}`],
})
export class GarageFuelSheetComponent {
  readonly fuelup = input<HubFuelup | null>(null);
  /** Spesa del Planner da completare con litri e chilometri. */
  readonly cost = input<CarCost | null>(null);
  readonly closed = output<void>();
  private hub = inject(HubStore);
  private garage = inject(GarageView);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly euro = euro; readonly day = shortDay;
  readonly pickedId = signal('');
  readonly full = signal(true);
  amount = ''; station = ''; date = hubToday(); liters = ''; km = '';

  readonly choices = computed(() => this.garage.unlinked().slice(0, 12));
  readonly linked = computed<CarCost | undefined>(() => {
    const id = this.fuelup()?.transactionId ?? this.cost()?.id ?? this.pickedId();
    return id ? this.garage.costs().find(c => c.id === id) : undefined;
  });
  readonly kmHint = computed(() => { const km = this.garage.status().odometer; return km ? 'Ultimi: ' + num(km) : 'Es. 45.300'; });

  constructor() {
    effect(() => {
      const f = this.fuelup();
      untracked(() => {
        if (!f) return;
        this.liters = f.liters ? String(f.liters).replace('.', ',') : ''; this.km = f.odometer ? String(f.odometer) : '';
        this.full.set(f.full); this.station = f.station ?? ''; this.date = f.date;
      });
    });
  }

  save() {
    this.error.set('');
    const car = this.garage.car();
    if (!car) { this.error.set('Aggiungi prima la tua auto.'); return; }
    const liters = this.liters.trim() ? parseAmount(this.liters) : undefined, km = this.km.trim() ? parseAmount(this.km) : undefined;
    if (liters === null || (liters && liters > 300)) { this.error.set('I litri non sembrano validi.'); return; }
    if (km === null || (km && km > 2000000)) { this.error.set('I chilometri non sembrano validi.'); return; }
    const existing = this.fuelup(), linked = this.linked();
    let transactionId = existing?.transactionId ?? linked?.id, date = existing?.date ?? linked?.date ?? this.date, own = existing?.ownTransaction;
    if (!transactionId) {
      const cents = parseEuroInput(this.amount);
      if (!cents || cents <= 0) { this.error.set('Inserisci l\'importo, oppure scegli una spesa del Planner.'); return; }
      if (!validDay(this.date)) { this.error.set('Scegli una data valida.'); return; }
      transactionId = hubId(); date = this.date; own = true;
      this.hub.upsert('transactions', {
        id: transactionId, updatedAt: 0, bank: 'altro', date, description: ('Rifornimento ' + this.station.trim()).trim(), amount: -cents,
        category: 'trasporti', kind: kindForCategory('trasporti', -cents), hash: 'manual|' + transactionId, manualCategory: true,
      });
    }
    this.hub.upsert('fuelups', {
      id: existing?.id ?? hubId(), updatedAt: existing?.updatedAt ?? 0, carId: car.id, date, transactionId,
      liters: liters || undefined, odometer: km ? Math.round(km) : undefined, full: this.full(), station: this.station.trim() || undefined, ownTransaction: own || undefined,
    });
    this.feedback.show('success', existing ? 'Rifornimento aggiornato.' : 'Rifornimento salvato.');
    this.close();
  }
  async remove(f: HubFuelup) {
    const detail = f.ownTransaction ? 'Elimino anche la spesa creata nel Planner.' : 'La spesa resta nel Planner.';
    if (!await this.confirm.ask({ title: 'Eliminare il rifornimento?', message: shortDay(f.date), detail, confirmLabel: 'Elimina', tone: 'danger' })) return;
    this.hub.remove('fuelups', f.id);
    if (f.ownTransaction) this.hub.remove('transactions', f.transactionId);
    this.close();
  }
  close() { this.closed.emit(); }
}
