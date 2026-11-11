import { Component, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { HubCar, HubCarFuel, hubToday, validDay } from '../hub/hub-model';
import { HubStore } from '../hub/hub-store';
import { FUEL_LABEL, parseAmount } from './garage-view';
import { CAR_COLORS, CAR_DEFAULT_COLOR, CarArtComponent } from './car-art.component';

const PHOTO_MAX_CHARS = 260000;

/** Riduce la foto scelta a un JPEG leggero: resta nell'archivio del Hub e si sincronizza. */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    for (const [side, quality] of [[960, .82], [800, .72], [640, .6]] as const) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= PHOTO_MAX_CHARS) return url;
    }
  } finally { bitmap.close?.(); }
  throw new Error('Foto troppo grande.');
}

/** Scheda dell'auto: nome, serbatoio, consumo dichiarato, scadenze e foto. */
@Component({
  selector: 'gt-garage-car-sheet', standalone: true, imports: [FormsModule, IconComponent, CarArtComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" [attr.aria-label]="car()?'La tua auto':'Aggiungi auto'" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{car()?'La tua auto':'Aggiungi la tua auto'}}</h2><button type="button" class="hb-ib" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <div class="ph">
    @if(photo()){<img [src]="photo()" alt="Foto dell'auto"/>}@else{<span class="none"><gt-car-art [color]="color()"/></span>
      <div class="sw" role="radiogroup" aria-label="Colore dell'auto">@for(c of colors;track c.id){<button type="button" role="radio" [attr.aria-checked]="color()===c.id" [attr.aria-label]="c.label" [title]="c.label" [class.on]="color()===c.id" [style.--sw]="c.id" (click)="color.set(c.id)"></button>}</div>}
    <div class="phb"><button type="button" class="hb-btn sm" (click)="picker.click()" [disabled]="busy()"><gt-icon name="camera"/>{{busy()?'Preparo la foto…':photo()?'Cambia foto':'Carica una foto'}}</button>
      @if(photo()){<button type="button" class="hb-btn sm danger" (click)="photo.set('')"><gt-icon name="trash"/>Rimuovi</button>}</div>
    <input #picker type="file" accept="image/*" hidden (change)="pick($event)"/>
  </div>
  <div class="two">
    <label class="hb-field stack"><small>Nome dell'auto</small><input name="name" [(ngModel)]="name" maxlength="40" placeholder="Es. Golf 8" required/></label>
    <label class="hb-field stack"><small>Targa (facoltativa)</small><input name="plate" [(ngModel)]="plate" maxlength="10" autocapitalize="characters" autocomplete="off" placeholder="AB123CD"/></label>
  </div>
  <span class="hb-lab">Alimentazione</span>
  <div class="hb-chips">@for(f of fuels;track f){<button type="button" class="hb-ch" [class.on]="fuel()===f" (click)="fuel.set(f)">{{label(f)}}</button>}</div>
  <div class="two" style="margin-top:12px">
    <label class="hb-field stack"><small>Serbatoio (litri)</small><input name="tank" inputmode="decimal" [(ngModel)]="tank" placeholder="Dal libretto" required autocomplete="off"/></label>
    <label class="hb-field stack"><small>Consumo (L/100 km)</small><input name="cons" inputmode="decimal" [(ngModel)]="consumption" placeholder="Facoltativo" autocomplete="off"/></label>
  </div>
  @if(!hasReadings()){<label class="hb-field stack" style="margin-top:8px"><small>Chilometri attuali</small><input name="km" inputmode="numeric" [(ngModel)]="km" placeholder="Dal contachilometri" autocomplete="off"/></label>}
  <p class="hb-sub">Il consumo dichiarato serve solo all'inizio: dopo due pieni con i chilometri lo calcolo dai tuoi dati.</p>
  <span class="hb-lab">Scadenze (facoltative)</span>
  <div class="two">
    <label class="hb-field stack"><small>Assicurazione</small><input type="date" name="d1" [(ngModel)]="insurance"/></label>
    <label class="hb-field stack"><small>Bollo</small><input type="date" name="d2" [(ngModel)]="tax"/></label>
    <label class="hb-field stack"><small>Revisione</small><input type="date" name="d3" [(ngModel)]="inspection"/></label>
    <label class="hb-field stack"><small>Tagliando</small><input type="date" name="d4" [(ngModel)]="service"/></label>
  </div>
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions">
    <button class="hb-btn pri" type="submit" [disabled]="busy()"><gt-icon name="check"/>Salva</button>
    @if(car()){<button type="button" class="hb-btn sm danger" (click)="remove()"><gt-icon name="trash"/>Elimina auto e rifornimenti</button>}
  </div>
</form>`,
  styles: [`.two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ph{margin-bottom:12px}.ph img{display:block;width:100%;height:170px;border-radius:20px;border:1px solid var(--hb-ln);object-fit:cover}
.ph .none{display:block;padding:14px 28px 6px;border-radius:20px;border:1px solid var(--hb-ln);background:radial-gradient(70% 90% at 50% 35%,#2a2c31,#141518 72%)}
.sw{display:flex;justify-content:center;gap:10px;margin-top:10px}.sw button{width:30px;height:30px;border-radius:50%;background:var(--sw);border:2px solid rgba(255,255,255,.18);cursor:pointer}.sw button.on{box-shadow:0 0 0 2px #121316,0 0 0 4px var(--hb-g)}
.phb{display:flex;gap:8px;margin-top:8px}.phb .hb-btn{flex:1}`],
})
export class GarageCarSheetComponent {
  readonly closed = output<void>();
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly car = this.hub.car;
  readonly fuels: HubCarFuel[] = ['benzina', 'diesel', 'ibrida', 'gpl', 'metano'];
  readonly fuel = signal<HubCarFuel>('benzina');
  readonly photo = signal('');
  readonly colors = CAR_COLORS;
  readonly color = signal(CAR_DEFAULT_COLOR);
  readonly busy = signal(false);
  name = ''; plate = ''; tank = ''; consumption = ''; km = '';
  insurance = ''; tax = ''; inspection = ''; service = '';

  constructor() {
    effect(() => {
      const car = this.car();
      untracked(() => {
        if (!car) return;
        this.name = car.name; this.plate = car.plate ?? ''; this.fuel.set(car.fuel); this.photo.set(car.photo ?? ''); this.color.set(car.color ?? CAR_DEFAULT_COLOR);
        this.tank = car.tankLiters ? String(car.tankLiters).replace('.', ',') : '';
        this.consumption = car.declaredConsumption ? String(car.declaredConsumption).replace('.', ',') : '';
        this.insurance = car.deadlines?.insurance ?? ''; this.tax = car.deadlines?.tax ?? ''; this.inspection = car.deadlines?.inspection ?? ''; this.service = car.deadlines?.service ?? '';
      });
    });
  }
  label(f: string) { return FUEL_LABEL[f] ?? f; }
  hasReadings() { return !!this.car()?.readings?.length; }

  async pick(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(true); this.error.set('');
    try { this.photo.set(await shrinkPhoto(file)); }
    catch { this.error.set('Non riesco a usare questa foto. Prova con un\'altra immagine.'); }
    finally { this.busy.set(false); }
  }

  save() {
    this.error.set('');
    const name = this.name.trim(), tank = parseAmount(this.tank), consumption = this.consumption.trim() ? parseAmount(this.consumption) : undefined;
    if (!name) { this.error.set('Scrivi il nome dell\'auto.'); return; }
    if (!tank || tank > 200) { this.error.set('Indica la capienza del serbatoio in litri.'); return; }
    if (consumption === null || (consumption && consumption > 40)) { this.error.set('Il consumo non sembra valido (litri ogni 100 km).'); return; }
    const deadlines: HubCar['deadlines'] = {};
    for (const [key, value] of [['insurance', this.insurance], ['tax', this.tax], ['inspection', this.inspection], ['service', this.service]] as const) {
      if (!value) continue;
      if (!validDay(value)) { this.error.set('Controlla le date delle scadenze.'); return; }
      deadlines[key] = value;
    }
    const current = this.car(), readings = [...(current?.readings ?? [])];
    if (!readings.length && this.km.trim()) {
      const km = parseAmount(this.km);
      if (!km || km > 2000000) { this.error.set('I chilometri non sembrano validi.'); return; }
      readings.push({ date: hubToday(), km: Math.round(km) });
    }
    this.hub.upsert('cars', {
      id: current?.id ?? 'car', updatedAt: current?.updatedAt ?? 0, name, plate: this.plate.trim().toUpperCase() || undefined, fuel: this.fuel(),
      tankLiters: tank, declaredConsumption: consumption || undefined, readings, deadlines, photo: this.photo() || undefined, color: this.color(),
    });
    this.feedback.show('success', current ? 'Auto aggiornata.' : 'Auto aggiunta.');
    this.close();
  }
  async remove() {
    const car = this.car();
    if (!car || !await this.confirm.ask({ title: 'Eliminare l\'auto?', message: car.name, detail: 'Elimino anche i rifornimenti registrati. Le spese restano nel Planner.', confirmLabel: 'Elimina', tone: 'danger' })) return;
    const fuelups = this.hub.fuelups().filter(f => f.carId === car.id).map(f => f.id);
    if (fuelups.length) this.hub.remove('fuelups', ...fuelups);
    this.hub.remove('cars', car.id);
    this.close();
  }
  close() { this.closed.emit(); }
}
