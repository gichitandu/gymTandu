import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { PushReminderService, PushReminderState } from '../services/push-reminder';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { HubColor, HubEvent, HubEventKind, hubId, HubRepeat, HUB_COLORS, hubToday, validDay, validTime } from './hub-model';
import { HubStore } from './hub-store';
import { offsetsLabel, TONE_OF } from './hub-calendar';

const OFFSETS = [{ v: 0, l: "All'ora" }, { v: 15, l: '15 min' }, { v: 30, l: '30 min' }, { v: 60, l: '1 ora prima' }, { v: 1440, l: '1 giorno prima' }, { v: 10080, l: '1 settimana' }];
const REPEATS: { v: HubRepeat; l: string }[] = [{ v: 'none', l: 'Mai' }, { v: 'weekly', l: 'Ogni settimana' }, { v: 'monthly', l: 'Ogni mese' }, { v: 'yearly', l: 'Ogni anno' }];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/** Nuovo impegno / modifica, con il flag «Invia notifica» e gli anticipi. */
@Component({
  selector: 'gt-hub-event-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" [attr.aria-label]="existing()?'Modifica':'Nuovo'" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{existing()?'Modifica':'Nuovo'}}</h2><button type="button" class="hb-ib" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <div class="hb-seg">@for(k of kinds;track k.v){<button type="button" [class.on]="kind()===k.v" (click)="setKind(k.v)">{{k.l}}</button>}</div>
  <input class="ev-title" name="title" [(ngModel)]="title" placeholder="Titolo" maxlength="140" required autocomplete="off" [attr.aria-label]="'Titolo'"/>
  <div class="two">
    <label class="hb-field stack"><small>Data</small><input type="date" name="date" [(ngModel)]="date" required/></label>
    <label class="hb-field stack" [class.off]="allDay()"><small>Ora</small><input type="time" name="time" [(ngModel)]="time" [disabled]="allDay()"/></label>
  </div>
  <div class="line"><span><strong>Tutto il giorno</strong><small>Senza orario preciso</small></span><button type="button" class="hb-tog" role="switch" [attr.aria-checked]="allDay()" (click)="allDay.set(!allDay())" aria-label="Tutto il giorno"></button></div>
  @if(!allDay()){<span class="hb-lab">Durata</span><div class="hb-chips scroll">@for(d of durations;track d){<button type="button" class="hb-ch" [class.on]="duration()===d" (click)="duration.set(d)">{{d<60?d+' min':d/60+' h'}}</button>}</div>}
  <span class="hb-lab">Ripeti</span>
  <div class="hb-chips">@for(r of repeats;track r.v){<button type="button" class="hb-ch" [class.on]="repeat()===r.v" (click)="repeat.set(r.v)">@if(repeat()===r.v&&r.v!=='none'){<gt-icon name="repeat"/>}{{r.l}}</button>}</div>
  <section class="nt">
    <div class="hb-row"><span class="hb-mk ntm"><gt-icon name="bell"/></span><span class="grow"><strong>Invia notifica</strong><small>Arriva sul telefono anche ad app chiusa</small></span><button type="button" class="hb-tog" role="switch" [attr.aria-checked]="notify()" (click)="toggleNotify()" aria-label="Invia notifica"></button></div>
    @if(notify()){
      <div class="hb-chips">@for(o of offsets;track o.v){<button type="button" class="hb-ch" [class.on]="chosen().includes(o.v)" (click)="toggleOffset(o.v)">@if(chosen().includes(o.v)){<gt-icon name="check"/>}{{o.l}}</button>}</div>
      <div class="pv"><span class="hb-mk"><gt-icon name="grid"/></span><span class="grow"><b>{{title||'Nuovo impegno'}}</b><span>{{preview()}}</span></span><em>anteprima</em></div>
      @if(device();as d){
        @if(!push.supported()||push.homeRequired()){<p class="hint">Su iPhone apri GymTrack dall’icona nella Home (iOS 16.4+) per ricevere le notifiche.</p>}
        @else if(!d.available){<p class="hint">Il servizio notifiche non è ancora attivo sul server: l’impegno viene salvato e la notifica partirà quando sarà attivo.</p>}
        @else if(!d.deviceEnabled){<div class="hint act"><span>Le notifiche non sono attive su questo dispositivo.</span><button type="button" class="hb-btn sm" (click)="enableDevice(d)" [disabled]="busy()">Attiva qui</button></div>}
      }
    }
  </section>
  <div class="line"><span class="hb-sq sm b"><gt-icon name="calendar"/></span><span class="grow"><strong>Mostra nel calendario iPhone</strong><small>Con il calendario abbonato di GymTrack</small></span><button type="button" class="hb-tog" role="switch" [attr.aria-checked]="showInCalendar()" (click)="showInCalendar.set(!showInCalendar())" aria-label="Mostra nel calendario iPhone"></button></div>
  <span class="hb-lab">Note</span>
  <label class="hb-field"><textarea name="notes" [(ngModel)]="notes" maxlength="2000" placeholder="Dettagli, luogo, cosa portare…"></textarea></label>
  <span class="hb-lab">Colore</span>
  <div class="cols">@for(c of colors;track c){<button type="button" [class]="'col hb-dot '+tone(c)" [class.on]="color()===c" (click)="color.set(c)" [attr.aria-label]="'Colore '+c"></button>}</div>
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions">
    <button class="hb-btn pri" type="submit"><gt-icon name="check"/>{{existing()?'Salva modifiche':'Salva'}}</button>
    @if(existing();as e){<div class="hb-actions two" style="margin-top:0"><button type="button" class="hb-btn sm" (click)="toggleDone(e)">{{e.done?'Segna da fare':'Segna come fatto'}}</button><button type="button" class="hb-btn sm danger" (click)="remove(e)"><gt-icon name="trash"/>Elimina</button></div>}
  </div>
</form>`,
  styles: [`.ev-title{display:block;width:100%;margin:14px 0 4px;padding:6px 2px 12px;border:0;border-bottom:1px solid rgba(255,255,255,.1);outline:0;background:none;color:var(--hb-t);font:inherit;font-size:23px;font-weight:700;letter-spacing:-.6px}
.ev-title::placeholder{color:var(--hb-f)}.ev-title:focus{border-color:rgba(143,124,255,.6)}
.two{display:grid;grid-template-columns:1.3fr 1fr;gap:8px;margin-top:14px}.off{opacity:.45}
.line{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid var(--hb-ln)}
.line strong,.nt strong{display:block;font-size:14px;font-weight:650}.line small,.nt small{display:block;margin-top:2px;font-size:11.5px;color:var(--hb-m)}.grow{flex:1;min-width:0}
.nt{margin-top:16px;padding:14px;border-radius:24px;background:radial-gradient(120% 100% at 0% 0%,rgba(124,107,255,.3),transparent 60%),linear-gradient(180deg,#1c1a2c,#151420);border:1px solid rgba(143,124,255,.4);box-shadow:0 18px 40px rgba(110,107,255,.18)}
.nt .hb-chips{margin-top:12px}.ntm{width:40px;height:40px;border-radius:13px}
.pv{display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px 12px;border-radius:18px;background:rgba(40,38,60,.75);border:1px solid rgba(255,255,255,.08)}
.pv .hb-mk{width:34px;height:34px}.pv b{display:block;font-size:13px}.pv span span{display:block;font-size:12px;color:var(--hb-m);margin-top:1px}.pv em{align-self:flex-start;font-style:normal;font-size:11px;color:var(--hb-f)}
.hint{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:#c9c0ff}.hint.act{display:flex;align-items:center;gap:10px}.hint.act span{flex:1}.hint.act .hb-btn{width:auto}
.cols{display:flex;gap:10px}.col{width:30px;height:30px;border-radius:10px;border:0;cursor:pointer}.col.on{box-shadow:0 0 0 3px #151420,0 0 0 5px #fff}`],
})
export class HubEventSheetComponent {
  readonly event = input<HubEvent | null>(null);
  readonly defaultDate = input('');
  readonly defaultTitle = input('');
  readonly defaultKind = input<HubEventKind>('impegno');
  readonly defaultTime = input('');
  readonly closed = output<void>();
  private hub = inject(HubStore);
  readonly push = inject(PushReminderService);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly kinds: { v: HubEventKind; l: string }[] = [{ v: 'impegno', l: 'Impegno' }, { v: 'nota', l: 'Nota' }, { v: 'scadenza', l: 'Scadenza' }];
  readonly offsets = OFFSETS; readonly repeats = REPEATS; readonly durations = DURATIONS; readonly colors = HUB_COLORS;
  readonly existing = computed(() => this.event());
  readonly kind = signal<HubEventKind>('impegno');
  title = ''; date = ''; time = '09:00'; notes = '';
  readonly allDay = signal(false);
  readonly duration = signal(60);
  readonly repeat = signal<HubRepeat>('none');
  readonly notify = signal(true);
  readonly chosen = signal<number[]>([30]);
  readonly showInCalendar = signal(true);
  readonly color = signal<HubColor>('blue');
  readonly device = signal<PushReminderState | null>(null);
  readonly busy = signal(false);

  constructor() {
    effect(() => {
      const e = this.event(), date = this.defaultDate(), title = this.defaultTitle(), kind = this.defaultKind(), time = this.defaultTime();
      untracked(() => {
        if (e) {
          this.kind.set(e.kind); this.title = e.title; this.date = e.date; this.time = e.time ?? '09:00'; this.notes = e.notes;
          this.allDay.set(!e.time); this.duration.set(e.durationMinutes ?? 60); this.repeat.set(e.repeat); this.notify.set(e.notify);
          this.chosen.set(e.notifyOffsets.length ? [...e.notifyOffsets] : [30]); this.showInCalendar.set(e.showInCalendar); this.color.set(e.color);
        } else {
          this.kind.set(kind); this.title = title; this.date = date || hubToday(); this.notes = '';
          this.setKind(kind);
          if (time && validTime(time)) { this.time = time; this.allDay.set(false); }
        }
      });
    });
    void this.loadDevice();
  }
  tone(c: HubColor) { return TONE_OF[c]; }
  setKind(k: HubEventKind) {
    this.kind.set(k);
    if (this.existing()) return;
    if (k === 'scadenza') { this.allDay.set(true); this.chosen.set([1440]); this.color.set('red'); }
    else if (k === 'nota') { this.allDay.set(true); this.notify.set(false); this.color.set('amber'); }
    else { this.allDay.set(false); this.notify.set(true); this.chosen.set([30]); this.color.set('blue'); }
  }
  preview() {
    const offsets = this.chosen();
    if (!offsets.length) return 'Scegli quando avvisarti';
    const first = Math.max(...offsets), at = this.allDay() ? '09:00' : this.time;
    if (first === 0) return `Adesso · ${at}`;
    if (first < 1440) return `Tra ${first < 60 ? first + ' minuti' : first / 60 + (first === 60 ? ' ora' : ' ore')} · alle ${at}`;
    return `${first === 1440 ? 'Domani' : 'Tra una settimana'} alle ${at} · ${offsetsLabel(offsets)}`;
  }
  toggleNotify() { this.notify.set(!this.notify()); if (this.notify()) void this.loadDevice(); }
  toggleOffset(v: number) { this.chosen.update(list => list.includes(v) ? list.filter(x => x !== v) : [...list, v].sort((a, b) => a - b)); }
  private async loadDevice() {
    try { this.device.set(await this.push.load()); } catch { this.device.set(null); }
  }
  async enableDevice(state: PushReminderState) {
    this.busy.set(true); this.error.set('');
    try { this.device.set(await this.push.enable(state, { time: state.time, timezone: state.timezone, everyDay: state.everyDay })); this.feedback.show('success', 'Notifiche attive su questo dispositivo.'); }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Notifiche non attivate.'); }
    finally { this.busy.set(false); }
  }
  save() {
    this.error.set('');
    const title = this.title.trim();
    if (!title) { this.error.set('Scrivi un titolo.'); return; }
    if (!validDay(this.date)) { this.error.set('Scegli una data valida.'); return; }
    if (!this.allDay() && !validTime(this.time)) { this.error.set('Scegli un orario valido.'); return; }
    if (this.notify() && !this.chosen().length) { this.error.set('Scegli quando ricevere la notifica.'); return; }
    const base = this.existing();
    const record: HubEvent = {
      id: base?.id ?? hubId(), updatedAt: base?.updatedAt ?? 0, kind: this.kind(), title, notes: this.notes.trim(), date: this.date,
      ...(this.allDay() ? {} : { time: this.time, durationMinutes: this.duration() }),
      repeat: this.repeat(), notify: this.notify(), notifyOffsets: this.notify() ? this.chosen() : [], showInCalendar: this.showInCalendar(), color: this.color(), done: base?.done,
    };
    this.hub.upsert('events', record);
    this.feedback.show('success', base ? 'Modifiche salvate.' : this.notify() ? 'Salvato. Ti avviso ' + offsetsLabel(record.notifyOffsets) + '.' : 'Salvato nel calendario.');
    this.close();
  }
  toggleDone(e: HubEvent) { this.hub.upsert('events', { ...e, done: !e.done }); this.close(); }
  async remove(e: HubEvent) {
    if (!await this.confirm.ask({ title: 'Eliminare?', message: `“${e.title}”${e.repeat !== 'none' ? ' e tutte le ripetizioni' : ''} verrà eliminato.`, confirmLabel: 'Elimina', tone: 'danger' })) return;
    this.hub.remove('events', e.id); this.feedback.show('success', 'Eliminato.'); this.close();
  }
  close() { this.closed.emit(); }
}
