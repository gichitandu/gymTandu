import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { euro, hubToday, shortDay } from '../hub/hub-model';
import { HubStore } from '../hub/hub-store';
import { FUEL_LABEL, GarageView, num, parseAmount } from './garage-view';
import { GarageCarSheetComponent } from './garage-car-sheet.component';
import { GarageFuelSheetComponent } from './garage-fuel-sheet.component';
import { CAR_DEFAULT_COLOR, CarArtComponent } from './car-art.component';
import { odometerReadings } from './garage-stats';
import { addDays, isoDay } from '../hub/hub-model';

/** GT Garage: la scheda dell'auto con carburante e autonomia stimati, costi dal Planner e scadenze. */
@Component({
  selector: 'gt-garage', standalone: true, imports: [FormsModule, RouterLink, IconComponent, GarageCarSheetComponent, GarageFuelSheetComponent, CarArtComponent],
  template: `@if(g.car();as car){
<header class="top"><span class="nm"><span class="hb-eb">Il tuo garage</span><strong>{{car.name}}</strong><small>{{fuelLabel(car.fuel)}}@if(car.plate){ · {{car.plate}}}</small></span>
  <span class="chip" [class.warn]="chip().tone==='warn'"><i></i>{{chip().text}}</span></header>
<div class="hb-cols">
  <div>
    <section class="stage" [class.photo]="!!car.photo">
      <span class="spot" aria-hidden="true"></span>
      @if(car.photo){<img [src]="car.photo" [alt]="'Foto di '+car.name"/>}@else{<gt-car-art [color]="car.color||defaultColor"/>}
      <button type="button" class="tool" (click)="sheet.set('car')"><gt-icon [name]="car.photo?'edit':'camera'"/>{{car.photo?'Modifica':'Foto e colore'}}</button>
    </section>
    <section class="hb-c lv">
      @if(st().fuelPct!==null){
        <div><small><gt-icon name="fuel"/>{{st().live?'Carburante':'Carburante stimato'}}</small><b>{{st().fuelPct}}<u>%</u></b><span class="hb-bar"><i [style.width.%]="st().fuelPct" [class.low]="st().fuelPct!<=15"></i></span></div>
        <div><small><gt-icon name="road"/>{{st().live?'Autonomia':'Autonomia stimata'}}</small><b>{{n(st().rangeKm!)}}<u>km</u></b><em>@if(st().live){Dalla Golf · {{when(g.vw()?.capturedAt)}}}@else{{{n(st().fuelLiters!,0)}} L su {{n(car.tankLiters)}} nel serbatoio}</em></div>
      }@else{<p class="hint"><gt-icon name="info"/>{{levelHint()}}</p>}
    </section>
    <div class="hb-grid2 act"><button type="button" class="hb-btn pri" (click)="sheet.set('fuel')"><gt-icon name="fuel"/>Rifornimento</button><button type="button" class="hb-btn" (click)="openKm()"><gt-icon name="gauge"/>Aggiorna km</button></div>
  </div>
  <div>
    @if(g.unlinked().length){<a class="todo" routerLink="/auto/movimenti" [queryParams]="{tipo:'fuel'}"><span class="hb-sq sm g"><gt-icon name="fuel"/></span><span><strong>{{g.unlinked().length}} {{g.unlinked().length===1?'rifornimento':'rifornimenti'}} dal Planner</strong><small>Aggiungi litri e chilometri per calcolare il consumo</small></span><gt-icon name="chevron-right"/></a>}
    <div class="tiles">
      <a class="hb-c tile" routerLink="/auto/movimenti" [queryParams]="{tipo:'fuel'}"><gt-icon name="fuel"/><span><small>Ultimo pieno@if(lastFuel();as f){ · {{day(f.date)}}}</small><b>@if(lastFuel();as f){{{euro(f.amount)}} €}@else{—}</b></span></a>
      <div class="hb-c tile"><gt-icon name="gauge"/><span><small>{{st().consumptionFrom==='car'?'Consumo dall’auto':'Consumo medio'}}</small><b>{{st().consumption?n(st().consumption!,1)+' L/100 km':'—'}}</b></span></div>
      <a class="hb-c tile" routerLink="/auto/statistiche"><gt-icon name="wallet"/><span><small>Spesa del mese</small><b>{{euro(g.totals().total)}} €</b></span></a>
      <div class="hb-c tile"><gt-icon name="calendar"/><span><small>Prossimo pieno</small><b [class.hb-pos]="st().refuelInDays!==null&&st().refuelInDays!>3" [class.hb-neg]="st().refuelInDays!==null&&st().refuelInDays!<=1">{{refuelLabel()}}</b></span></div>
    </div>
    <section class="hb-c hb-list rows">
      <div class="hb-li"><gt-icon name="road"/><span class="bd"><strong>Chilometri del mese</strong></span><span class="amt">{{st().kmMonth!==null?n(st().kmMonth!)+' km':'—'}}</span></div>
      <a class="hb-li" routerLink="/auto/statistiche"><gt-icon name="chart"/><span class="bd"><strong>Costo per 100 km</strong></span><span class="amt">{{st().costPer100!==null?euro(st().costPer100!)+' €':'—'}}</span></a>
      <button type="button" class="hb-li" (click)="openKm()"><gt-icon name="car"/><span class="bd"><strong>Contachilometri</strong></span><span class="amt">{{st().odometer!==null?n(st().odometer!)+' km':'Da inserire'}}</span></button>
    </section>
    <button type="button" class="hb-c vwc" [class.ok]="vwTone()==='ok'" [class.warn]="vwTone()==='warn'" [class.bad]="vwTone()==='bad'" (click)="sheet.set('vw')">
      <span class="vwm"><gt-icon name="bolt"/></span>
      <span class="bd"><strong>{{vwTitle()}}</strong><small>{{vwText()}}</small></span><gt-icon name="chevron-right"/>
    </button>
    <button type="button" class="hb-c state" (click)="sheet.set('car')">
      <span class="hb-sq" [class.g]="stateTone()==='ok'" [class.y]="stateTone()==='soon'" [class.r]="stateTone()==='late'" [class.n]="stateTone()==='none'"><gt-icon name="shield"/></span>
      <span class="bd"><strong>Stato veicolo</strong><small>{{stateText()}}</small></span>
      @if(stateTone()==='ok'){<span class="okk"><gt-icon name="check"/></span>}<gt-icon name="chevron-right"/>
    </button>
    @if(g.deadlines().length||service().length){<section class="hb-c hb-list rows dl">@for(d of g.deadlines();track d.key){<div class="hb-li"><span [class]="'dot '+d.tone"></span><span class="bd"><strong>{{d.label}}</strong><small>{{day(d.date)}} {{d.date.slice(0,4)}}</small></span><span class="amt" [class.hb-neg]="d.tone==='late'" [class.warn]="d.tone==='soon'">{{d.days<0?'scaduta da '+(-d.days)+' g':d.days===0?'oggi':'tra '+d.days+' g'}}</span></div>}
      @for(r of service();track r.label){<div class="hb-li"><span [class]="'dot '+r.tone"></span><span class="bd"><strong>{{r.label}}</strong><small>Dalla Golf</small></span><span class="amt" [class.hb-neg]="r.tone==='late'" [class.warn]="r.tone==='soon'">{{r.text}}</span></div>}</section>}
    <p class="hb-note"><gt-icon name="info"/>@if(st().live){<span>Carburante, autonomia e chilometri arrivano <b>dalla Golf</b> tramite il portale Volkswagen, ogni 15–30 minuti quando l'auto trasmette. Costi e consumo dei pieni restano calcolati dall'app.</span>}@else{<span>Carburante, autonomia e prossimo pieno sono <b>stime calcolate dall'app</b> su pieni e chilometri che registri, finché non colleghi il portale Volkswagen.</span>}</p>
  </div>
</div>
}@else{
<section class="first">
  <span class="spot" aria-hidden="true"></span>
  <gt-car-art/>
  <h1>Il tuo garage</h1>
  <p>Aggiungi la tua auto: vedrai i costi di carburante presi dal Planner, il consumo reale, l'autonomia stimata e le scadenze.</p>
  <button type="button" class="hb-btn pri" (click)="sheet.set('car')"><gt-icon name="plus"/>Aggiungi la tua auto</button>
</section>}
@if(sheet()==='car'){<gt-garage-car-sheet (closed)="sheet.set('')"/>}
@if(sheet()==='fuel'){<gt-garage-fuel-sheet (closed)="sheet.set('')"/>}
@if(sheet()==='vw'){<div class="hb-dim" (click)="sheet.set('')"></div>
<section class="hb-sheet vws" role="dialog" aria-label="Dati automatici dalla Golf">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>Dati automatici</h2><button type="button" class="hb-ib" (click)="sheet.set('')" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <div class="vwc big" [class.ok]="vwTone()==='ok'" [class.warn]="vwTone()==='warn'" [class.bad]="vwTone()==='bad'"><span class="vwm"><gt-icon name="bolt"/></span><span class="bd"><strong>{{vwTitle()}}</strong><small>{{vwText()}}</small></span></div>
  @if(g.vw()?.values;as v){<div class="vwv">
    <span><small>Carburante</small><b>{{v.fuelPct!=null?v.fuelPct+' %':'—'}}</b></span><span><small>Autonomia</small><b>{{v.rangeKm!=null?n(v.rangeKm)+' km':'—'}}</b></span>
    <span><small>Chilometri</small><b>{{v.odometerKm!=null?n(v.odometerKm):'—'}}</b></span><span><small>Consumo medio</small><b>{{v.consumption!=null?n(v.consumption,1)+' L':'—'}}</b></span>
  </div>}
  @if(g.vw()?.configured){<button type="button" class="hb-btn pri" style="margin-top:12px" (click)="g.syncVw()" [disabled]="g.vwBusy()"><gt-icon name="repeat"/>{{g.vwBusy()?'Controllo in corso…':'Aggiorna ora'}}</button>}
  @if(g.vwError()){<p class="hb-err" role="alert">{{g.vwError()}}</p>}
  <details class="steps" [open]="vwTone()!=='ok'"><summary>Come collegare la Golf</summary>
    <ol>
      <li>Apri il <a href="https://eu-data-act.drivesomethinggreater.com/" target="_blank" rel="noopener">portale EU Data Act di Volkswagen</a> e accedi con il tuo <b>Volkswagen ID</b> (lo stesso dell'app Volkswagen). La Golf deve risultare tua come utente principale.</li>
      <li>In <b>Data clusters → Vehicle overview</b> crea una richiesta <b>continua ogni 15 minuti</b> con <b>All Data</b>.</li>
      <li>Su GitHub, nel repository dell'app: <b>Settings → Secrets and variables → Actions</b>, aggiungi <b>VW_ID_EMAIL</b> e <b>VW_ID_PASSWORD</b>.</li>
      <li>Avvia di nuovo <b>Pubblica su Cloudflare</b> (scheda Actions). I primi dati possono arrivare dopo qualche ora: l'auto li invia quando la usi.</li>
    </ol>
    <p>È gratuito: il portale è il canale ufficiale previsto dalla legge europea sui dati (EU Data Act). La password resta un segreto di Cloudflare e non arriva mai nell'app. Se Volkswagen cambia l'accesso, restano i dati che inserisci tu.</p>
  </details>
</section>}
@if(sheet()==='km'){<div class="hb-dim" (click)="sheet.set('')"></div>
<form class="hb-sheet" role="dialog" aria-label="Aggiorna chilometri" (ngSubmit)="saveKm()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>Aggiorna chilometri</h2><button type="button" class="hb-ib" (click)="sheet.set('')" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <label class="hb-field stack"><small>Contachilometri di oggi</small><input name="km" inputmode="numeric" [(ngModel)]="km" [placeholder]="st().odometer?'Ultimi: '+n(st().odometer!):'Es. 45.300'" autocomplete="off" required/></label>
  <p class="hb-sub">Più spesso lo aggiorni, più precise sono autonomia e data del prossimo pieno.</p>
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions"><button class="hb-btn pri" type="submit"><gt-icon name="check"/>Salva</button></div>
</form>}`,
  styles: [`.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 2px 0}
.nm{min-width:0}.nm strong{display:block;margin-top:5px;font-size:30px;font-weight:750;letter-spacing:-1.1px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nm small{display:block;margin-top:4px;font-size:13px;color:var(--hb-m)}
.chip{display:inline-flex;align-items:center;gap:7px;flex:none;height:30px;padding:0 11px;border-radius:999px;font-size:12px;font-weight:650;color:#8ff0c0;background:rgba(79,209,165,.12);border:1px solid rgba(79,209,165,.28)}
.chip i{width:7px;height:7px;border-radius:50%;background:#4fd1a5;box-shadow:0 0 0 3px rgba(79,209,165,.22)}.chip.warn{color:var(--hb-y);background:rgba(255,200,87,.1);border-color:rgba(255,200,87,.28)}.chip.warn i{background:var(--hb-y);box-shadow:0 0 0 3px rgba(255,200,87,.2)}
.stage{position:relative;margin:0;padding:12px 0 36px;isolation:isolate;animation:hbRise .5s cubic-bezier(.2,.8,.2,1) both}
.spot{position:absolute;z-index:-1;inset:0 -16px;background:radial-gradient(58% 62% at 50% 46%,rgba(255,255,255,.13),rgba(255,255,255,.035) 55%,transparent 76%),radial-gradient(46% 16% at 50% 80%,rgba(79,209,165,.16),transparent 70%);pointer-events:none}
.stage gt-car-art{animation:drive .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes drive{from{opacity:0;transform:translateX(46px)}to{opacity:1;transform:none}}
.stage.photo{padding:14px 0 16px}.stage img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:26px;border:1px solid rgba(255,255,255,.1);box-shadow:0 22px 50px rgba(0,0,0,.55)}
.tool{position:absolute;right:4px;bottom:4px;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(20,21,24,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:12px;font-weight:650;color:var(--hb-t);cursor:pointer}.tool gt-icon{width:14px;height:14px;color:var(--hb-m)}
.stage.photo .tool{right:12px;bottom:28px}
.lv{display:grid;grid-template-columns:1fr 1fr;padding:16px}
.lv>div+div{padding-left:16px;border-left:1px solid var(--hb-ln)}.lv>div:first-child{padding-right:16px}
.lv small{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--hb-m)}.lv small gt-icon{width:15px;height:15px}
.lv b{display:block;margin:6px 0 10px;font-size:34px;font-weight:750;letter-spacing:-1.4px;line-height:1;font-variant-numeric:tabular-nums}.lv b u{margin-left:4px;text-decoration:none;font-size:16px;font-weight:650;letter-spacing:0;color:var(--hb-m)}
.lv em{display:block;font-style:normal;font-size:11.5px;color:var(--hb-m)}
.lv .hb-bar{display:block;height:8px;border-radius:5px}.lv .hb-bar i{border-radius:5px;background:linear-gradient(90deg,#37c98b,#8ff0c0);box-shadow:0 0 12px rgba(79,209,165,.5)}.lv .hb-bar i.low{background:linear-gradient(90deg,#ff6b81,#ff9a62);box-shadow:0 0 12px rgba(255,107,129,.5)}
.hint{grid-column:1/-1;display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45;color:var(--hb-m)}.hint gt-icon{width:17px;height:17px;flex:none;margin-top:1px;color:var(--hb-g)}
.act{margin-top:10px}
.todo{display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:12px 14px;border-radius:20px;background:rgba(79,209,165,.08);border:1px solid rgba(79,209,165,.25)}
.todo>span:nth-child(2){flex:1;min-width:0}.todo strong{display:block;font-size:13.5px;font-weight:650}.todo small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m)}.todo>gt-icon{width:17px;height:17px;color:var(--hb-m)}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.tile{display:flex;align-items:center;gap:10px;padding:13px 12px;border-radius:20px;min-width:0}.tile>gt-icon{width:20px;height:20px;flex:none;color:var(--hb-m)}.tile>span{min-width:0}
.tile small{display:block;font-size:11.5px;color:var(--hb-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tile b{display:block;margin-top:3px;font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.rows{margin-top:10px}.rows .hb-li{cursor:default}.rows a.hb-li,.rows button.hb-li{cursor:pointer}.rows .hb-li>gt-icon{width:20px;height:20px;flex:none;color:var(--hb-m)}.rows .bd strong{font-weight:550;white-space:normal}.rows .amt.warn{color:var(--hb-y)}
.state{display:flex;align-items:center;gap:12px;width:100%;margin-top:10px;padding:13px 14px;text-align:left;cursor:pointer;color:inherit}.state .bd{flex:1;min-width:0}.state strong{display:block;font-size:14.5px;font-weight:650}.state small{display:block;margin-top:2px;font-size:12.5px;color:var(--hb-m)}.state>gt-icon{width:17px;height:17px;color:var(--hb-m)}
.okk{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:50%;background:#4fd1a5;color:#06281c}.okk gt-icon{width:13px;height:13px}
.vwc{display:flex;align-items:center;gap:12px;width:100%;margin-top:10px;padding:13px 14px;text-align:left;cursor:pointer;color:inherit}.vwc .bd{flex:1;min-width:0}.vwc strong{display:block;font-size:14.5px;font-weight:650}.vwc small{display:block;margin-top:2px;font-size:12.5px;color:var(--hb-m);line-height:1.35}.vwc>gt-icon{width:17px;height:17px;color:var(--hb-m)}
.vwm{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:13px;background:rgba(255,255,255,.07);color:var(--hb-m);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.vwm gt-icon{width:20px;height:20px}
.vwc.ok .vwm{background:rgba(79,209,165,.15);color:var(--hb-g);box-shadow:inset 0 0 0 1px rgba(79,209,165,.3)}.vwc.warn .vwm{background:rgba(255,200,87,.13);color:var(--hb-y)}.vwc.bad .vwm{background:rgba(255,107,129,.14);color:var(--hb-r)}
.vwc.big{margin-top:0;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid var(--hb-ln);cursor:default}
.vwv{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.vwv span{padding:11px 12px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid var(--hb-ln)}.vwv small{display:block;font-size:11.5px;color:var(--hb-m)}.vwv b{display:block;margin-top:3px;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.steps{margin-top:14px;border-radius:18px;border:1px solid var(--hb-ln);background:rgba(255,255,255,.03)}.steps summary{padding:13px 14px;font-size:14px;font-weight:650;cursor:pointer}
.steps ol{margin:0;padding:0 16px 0 34px;display:grid;gap:9px;font-size:13px;line-height:1.5;color:var(--hb-m)}.steps b{color:var(--hb-t);font-weight:650}.steps a{color:var(--hb-g);text-decoration:underline}
.steps p{margin:12px 14px 14px;font-size:12px;line-height:1.5;color:var(--hb-m)}
.dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--hb-g)}.dot.soon{background:var(--hb-y)}.dot.late{background:var(--hb-r)}
.first{position:relative;isolation:isolate;padding:22px 14px 8px;text-align:center}.first gt-car-art{max-width:440px;margin:0 auto}.first h1{margin:14px 0 6px;font-size:28px;font-weight:750;letter-spacing:-1px}.first p{margin:0 auto 18px;max-width:420px;font-size:14px;line-height:1.5;color:var(--hb-m)}.first .hb-btn{max-width:420px;margin:0 auto}
.first .spot{inset:0 -16px 46% -16px}
@media(min-width:900px){.stage{padding:40px 30px 46px}}
@media(prefers-reduced-motion:reduce){.stage gt-car-art{animation:none}}`],
})
export class GarageComponent {
  readonly g = inject(GarageView);
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly euro = euro; readonly day = shortDay;
  readonly sheet = signal<'' | 'car' | 'fuel' | 'km' | 'vw'>('');
  readonly st = this.g.status;
  readonly defaultColor = CAR_DEFAULT_COLOR;
  readonly lastFuel = computed(() => this.g.costs().find(c => c.type === 'fuel'));
  /** Le stime valgono finché le letture dei chilometri sono recenti. */
  readonly chip = computed(() => {
    if (this.st().live) return { tone: 'ok', text: 'Dalla Golf · ' + this.when(this.g.vw()?.capturedAt) };
    if (this.st().fuelPct === null) return { tone: 'warn', text: 'Da completare' };
    const readings = odometerReadings(this.g.car(), this.g.fuelups()), last = readings[readings.length - 1]?.date ?? '';
    return last >= addDays(this.g.view.today(), -10) ? { tone: 'ok', text: 'Stime aggiornate' } : { tone: 'warn', text: 'Aggiorna i km' };
  });
  readonly vwTone = computed(() => { const v = this.g.vw(); if (!v || !v.configured) return 'off'; return v.state === 'ok' ? 'ok' : v.state === 'auth' || v.state === 'error' ? 'bad' : 'warn'; });
  readonly vwTitle = computed(() => {
    const v = this.g.vw();
    if (!v || !v.configured) return 'Collega la Golf';
    return ({ ok: 'Collegata al portale Volkswagen', pending: 'Collegamento in preparazione', waiting: 'In attesa dei dati', norequest: 'Richiesta dati da attivare', novehicle: 'Auto non trovata', auth: 'Accesso Volkswagen da controllare', error: 'Collegamento non riuscito', off: 'Collega la Golf' } as Record<string, string>)[v.state] ?? 'Collegamento Volkswagen';
  });
  readonly vwText = computed(() => {
    const v = this.g.vw();
    if (!v || !v.configured) return 'Carburante, autonomia e km in automatico: tocca per sapere come';
    if (v.state === 'ok') return v.capturedAt ? 'Dati rilevati ' + this.when(v.capturedAt) + (v.vehicle ? ' · telaio ' + v.vehicle : '') : 'Collegata';
    if (v.state === 'pending') return 'Il primo controllo parte entro 30 minuti';
    return v.message || 'Riprovo al prossimo controllo';
  });
  /** Tagliando e cambio olio come li segnala l'auto (giorni e km mancanti; negativi = scaduti). */
  readonly service = computed(() => {
    const v = this.g.vw()?.values; if (!v || !this.st().live) return [];
    const row = (label: string, days?: number | null, km?: number | null) => {
      if (days == null && km == null) return null;
      const late = (days ?? 1) < 0 || (km ?? 1) < 0, soon = !late && ((days ?? 999) <= 30 || (km ?? 99999) <= 1000);
      const parts = [days != null ? (days < 0 ? 'scaduto da ' + (-days) + ' g' : 'tra ' + days + ' g') : '', km != null ? (km < 0 ? num(-km) + ' km oltre' : num(km) + ' km') : ''].filter(Boolean);
      return { label, text: parts.join(' · '), tone: late ? 'late' : soon ? 'soon' : 'ok' };
    };
    return [row('Tagliando', v.inspectionDays, v.inspectionKm), row('Cambio olio', v.oilDays, v.oilKm)].filter(r => !!r) as { label: string; text: string; tone: string }[];
  });
  /** "oggi 21:40", "ieri 18:05" oppure "9 nov 18:05". */
  when(at: number | null | undefined) {
    if (!at) return '';
    const d = new Date(at), time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), today = this.g.view.today(), day = isoDay(d);
    return day === today ? 'oggi ' + time : day === addDays(today, -1) ? 'ieri ' + time : shortDay(day) + ' ' + time;
  }
  km = '';
  constructor() { void this.g.loadVw(true); }

  readonly levelHint = computed(() => {
    const s = this.st();
    if (!s.consumption) return 'Registra due pieni con i chilometri (o indica il consumo nella scheda dell\'auto) per vedere carburante e autonomia.';
    return 'Registra un pieno con i chilometri: da lì stimo il carburante rimasto e l\'autonomia.';
  });
  readonly refuelLabel = computed(() => {
    const days = this.st().refuelInDays;
    if (days === null) return '—';
    return days <= 0 ? 'Adesso' : days === 1 ? 'Domani' : 'Fra ' + days + ' giorni';
  });
  readonly stateTone = computed(() => { const list = this.g.deadlines(); return !list.length ? 'none' : list.some(d => d.tone === 'late') ? 'late' : list.some(d => d.tone === 'soon') ? 'soon' : 'ok'; });
  readonly stateText = computed(() => {
    const list = this.g.deadlines(), first = list[0];
    if (!first) return 'Aggiungi assicurazione, bollo, revisione e tagliando';
    if (first.tone === 'late') return `${first.label} scaduta da ${-first.days} giorni`;
    if (first.tone === 'soon') return first.days === 0 ? `${first.label}: scade oggi` : `${first.label} tra ${first.days} giorni`;
    return 'Tutto regolare';
  });

  n(value: number, decimals = 0) { return num(value, decimals); }
  fuelLabel(f: string) { return FUEL_LABEL[f] ?? f; }
  openKm() { this.km = ''; this.error.set(''); this.sheet.set('km'); }
  saveKm() {
    const car = this.g.car(), km = parseAmount(this.km), last = this.st().odometer;
    if (!car) return;
    if (!km || km > 2000000) { this.error.set('I chilometri non sembrano validi.'); return; }
    if (last !== null && km < last) { this.error.set(`L'ultima lettura è ${num(last)} km: il nuovo valore non può essere più basso.`); return; }
    const today = hubToday(), readings = [...car.readings.filter(r => r.date !== today), { date: today, km: Math.round(km) }].sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
    this.hub.upsert('cars', { ...car, readings });
    this.feedback.show('success', 'Chilometri aggiornati.');
    this.sheet.set('');
  }
}
