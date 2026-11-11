import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { HubColor, HUB_COLORS, hubId, HubNote, hubToday, shortDay, validDay } from './hub-model';
import { TONE_OF } from './hub-calendar';
import { HubStore } from './hub-store';

/** Editor di una nota: titolo, testo, colore, fissata e data facoltativa nel calendario. */
@Component({
  selector: 'gt-hub-note-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="close()"></div>
<form class="hb-sheet" role="dialog" aria-label="Nota" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{note()?'Nota':'Nuova nota'}}</h2><button type="button" class="hb-ib" (click)="close()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <input class="nt-title" name="title" [(ngModel)]="title" maxlength="120" placeholder="Titolo" aria-label="Titolo"/>
  <textarea class="nt-body" name="body" [(ngModel)]="body" maxlength="4000" placeholder="Scrivi qui…" aria-label="Testo della nota" rows="7"></textarea>
  <div class="hb-c opts">
    <div class="line"><span class="hb-sq sm y"><gt-icon name="pin2"/></span><span class="grow"><strong>Fissa nella schermata Oggi</strong><small>Le note fissate compaiono sempre per prime</small></span><button type="button" class="hb-tog" role="switch" [attr.aria-checked]="pinned()" (click)="pinned.set(!pinned())" aria-label="Fissa nota"></button></div>
    <div class="line"><span class="hb-sq sm b"><gt-icon name="calendar"/></span><span class="grow"><strong>Mostra in un giorno</strong><small>{{date()?'Compare nel calendario del Hub':'Facoltativo'}}</small></span>
      @if(date()){<input type="date" class="dt" name="date" [ngModel]="date()" (ngModelChange)="date.set($event)" aria-label="Giorno della nota"/><button type="button" class="hb-ib x" (click)="date.set('')" aria-label="Togli il giorno"><gt-icon name="close"/></button>}
      @else{<button type="button" class="hb-btn sm add" (click)="date.set(today())">Aggiungi</button>}</div>
    <div class="line"><span class="grow"><strong>Colore</strong></span><div class="cols">@for(c of colors;track c){<button type="button" [class]="'col hb-dot '+tone(c)" [class.on]="color()===c" (click)="color.set(c)" [attr.aria-label]="'Colore '+c"></button>}</div></div>
  </div>
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions" [class.two]="!!note()">
    @if(note()){<button type="button" class="hb-btn danger" (click)="remove()"><gt-icon name="trash"/>Elimina</button>}
    <button type="submit" class="hb-btn pri"><gt-icon name="check"/>Salva</button>
  </div>
</form>`,
  styles: [`.nt-title{display:block;width:100%;margin:12px 0 2px;padding:6px 2px 10px;border:0;outline:0;background:none;color:var(--hb-t);font:inherit;font-size:23px;font-weight:700;letter-spacing:-.6px}.nt-title::placeholder,.nt-body::placeholder{color:var(--hb-f)}
.nt-body{display:block;width:100%;min-height:160px;padding:12px 14px;border-radius:18px;border:1px solid var(--hb-ln);outline:0;background:rgba(255,255,255,.04);color:var(--hb-t);font:inherit;font-size:16px;line-height:1.5;resize:vertical}.nt-body:focus{border-color:rgba(143,124,255,.6)}
.opts{margin-top:12px;padding:4px 14px}.line{display:flex;align-items:center;gap:12px;min-height:58px}.line+.line{border-top:1px solid var(--hb-ln)}.grow{flex:1;min-width:0}.line strong{display:block;font-size:14px;font-weight:650}.line small{display:block;margin-top:2px;font-size:11.5px;color:var(--hb-m)}
.dt{height:38px;padding:0 8px;border-radius:12px;border:1px solid var(--hb-ln);background:rgba(255,255,255,.06);color:var(--hb-t);font:inherit;font-size:14px}.x{width:34px;height:34px;border-radius:11px}.add{width:auto;min-height:36px;padding:0 12px;font-size:12.5px}
.cols{display:flex;gap:9px}.col{width:26px;height:26px;border-radius:9px;border:0;cursor:pointer}.col.on{box-shadow:0 0 0 3px #151420,0 0 0 5px #fff}`],
})
export class HubNoteSheetComponent {
  readonly note = input<HubNote | null>(null);
  readonly closed = output<void>();
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly colors = HUB_COLORS;
  title = ''; body = '';
  readonly pinned = signal(false);
  readonly date = signal('');
  readonly color = signal<HubColor>('amber');
  readonly error = signal('');
  readonly today = hubToday;
  constructor() {
    effect(() => {
      const n = this.note();
      untracked(() => { this.title = n?.title ?? ''; this.body = n?.body ?? ''; this.pinned.set(n?.pinned ?? false); this.date.set(n?.date ?? ''); this.color.set(n?.color ?? 'amber'); });
    });
  }
  tone(c: HubColor) { return TONE_OF[c]; }
  close() { this.closed.emit(); }
  save() {
    const title = this.title.trim(), body = this.body.trim(), date = this.date();
    if (!title && !body) { this.error.set('Scrivi almeno un titolo o un testo.'); return; }
    if (date && !validDay(date)) { this.error.set('Il giorno non è valido.'); return; }
    const base = this.note();
    this.hub.upsert('notes', { id: base?.id ?? hubId(), updatedAt: base?.updatedAt ?? 0, title, body, pinned: this.pinned(), date: date || undefined, color: this.color() });
    this.feedback.show('success', base ? 'Nota aggiornata.' : 'Nota salvata.');
    this.close();
  }
  async remove() {
    const n = this.note(); if (!n) return;
    if (!await this.confirm.ask({ title: 'Eliminare la nota?', message: `“${n.title || 'Nota senza titolo'}” verrà eliminata.`, confirmLabel: 'Elimina', tone: 'danger' })) return;
    this.hub.remove('notes', n.id); this.feedback.show('success', 'Nota eliminata.'); this.close();
  }
}

@Component({
  selector: 'gt-hub-notes', standalone: true, imports: [FormsModule, IconComponent, HubNoteSheetComponent],
  template: `<div class="th"><h1 class="hb-h1" style="margin:0">Note</h1><span class="hb-sub" style="margin:0">{{count()}}</span></div>
<label class="hb-field srch"><gt-icon name="search"/><input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Cerca nelle note" aria-label="Cerca nelle note"/></label>
@if(pinned().length){<div class="hb-sec"><h2>Fissate</h2></div>
<div class="grid hb-stagger">@for(n of pinned();track n.id){<button type="button" [class]="'nt '+tone(n.color)" (click)="open(n)"><span class="hd"><gt-icon name="pin2"/>@if(n.date){<em>{{shortDay(n.date)}}</em>}</span><strong>{{n.title||firstLine(n.body)}}</strong>@if(n.title&&n.body){<p>{{n.body}}</p>}</button>}</div>}
@if(others().length){<div class="hb-sec">@if(pinned().length){<h2>Altre</h2>}@else{<h2>Tutte le note</h2>}</div>
<div class="grid hb-stagger">@for(n of others();track n.id){<button type="button" [class]="'nt '+tone(n.color)" (click)="open(n)"><span class="hd"><gt-icon name="note"/>@if(n.date){<em>{{shortDay(n.date)}}</em>}</span><strong>{{n.title||firstLine(n.body)}}</strong>@if(n.title&&n.body){<p>{{n.body}}</p>}</button>}</div>}
@if(!pinned().length&&!others().length){<section class="hb-c" style="margin-top:14px"><div class="hb-empty"><span class="hb-sq lg y"><gt-icon name="note"/></span>
  @if(query()){<strong>Nessuna nota trovata</strong>Prova con un'altra parola.}@else{<strong>Nessuna nota</strong>Scrivi idee, liste e promemoria: puoi fissarle nella schermata Oggi o legarle a un giorno del calendario.}</div></section>}
<button type="button" class="hb-fab" (click)="open(null)"><gt-icon name="plus"/>Nota</button>
@if(editing(); as e){<gt-hub-note-sheet [note]="e.note" (closed)="closeEditor()"/>}`,
  styles: [`.th{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 2px 14px}.srch{min-height:46px;border-radius:15px}.srch input{min-height:44px;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media(min-width:700px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(min-width:1100px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.nt{display:block;width:100%;min-height:128px;padding:14px;border-radius:22px;border:1px solid var(--hb-ln);background:rgba(255,255,255,.04);color:var(--hb-t);text-align:left;font:inherit;cursor:pointer;transition:transform .15s}.nt:active{transform:scale(.98)}
.hd{display:flex;align-items:center;justify-content:space-between;gap:6px}.hd gt-icon{width:15px;height:15px}.hd em{font-style:normal;font-size:11px;font-weight:650;color:var(--hb-m)}
.nt strong{display:block;margin-top:10px;font-size:14px;font-weight:700;line-height:1.3;overflow-wrap:anywhere}.nt p{margin:5px 0 0;font-size:12px;line-height:1.4;color:var(--hb-m);white-space:pre-line;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.nt.y{background:linear-gradient(160deg,rgba(255,200,87,.16),rgba(255,200,87,.03) 70%);border-color:rgba(255,200,87,.22)}.nt.y gt-icon{color:var(--hb-y)}
.nt.v,.nt.b{background:linear-gradient(160deg,rgba(143,124,255,.18),rgba(143,124,255,.03) 70%);border-color:rgba(143,124,255,.24)}.nt.v gt-icon,.nt.b gt-icon{color:#b3a6ff}
.nt.b{background:linear-gradient(160deg,rgba(92,140,255,.18),rgba(92,140,255,.03) 70%);border-color:rgba(92,140,255,.24)}.nt.b gt-icon{color:var(--hb-b)}
.nt.p,.nt.r{background:linear-gradient(160deg,rgba(243,154,199,.16),rgba(243,154,199,.03) 70%);border-color:rgba(243,154,199,.24)}.nt.p gt-icon{color:var(--hb-p)}.nt.r gt-icon{color:var(--hb-r)}
.nt.g{background:linear-gradient(160deg,rgba(79,209,165,.15),rgba(79,209,165,.03) 70%);border-color:rgba(79,209,165,.22)}.nt.g gt-icon{color:var(--hb-g)}`],
})
export class HubNotesComponent {
  private hub = inject(HubStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly shortDay = shortDay;
  readonly query = signal('');
  readonly editing = signal<{ note: HubNote | null } | null>(null);
  private qp = toSignal(this.route.queryParamMap);
  private fromLink = false;
  private filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = [...this.hub.notes()].sort((a, b) => b.updatedAt - a.updatedAt);
    return q ? list.filter(n => (n.title + '\n' + n.body).toLowerCase().includes(q)) : list;
  });
  readonly pinned = computed(() => this.filtered().filter(n => n.pinned));
  readonly others = computed(() => this.filtered().filter(n => !n.pinned));
  readonly count = computed(() => { const n = this.hub.notes().length; return n === 1 ? '1 nota' : `${n} note`; });
  constructor() {
    // ?nuova=1 apre l'editor vuoto, ?apri=<id> apre una nota (da Oggi o dal calendario).
    effect(() => {
      const p = this.qp(), ready = this.hub.ready();
      if (!p || !ready) return;
      const id = p.get('apri');
      untracked(() => {
        if (p.get('nuova')) this.editing.set({ note: null });
        else if (id) { const n = this.hub.notes().find(x => x.id === id); if (n) this.editing.set({ note: n }); }
        else if (this.fromLink) this.editing.set(null);
        this.fromLink = !!(p.get('nuova') || id);
      });
    });
  }
  tone(c: HubColor) { return TONE_OF[c] ?? 'y'; }
  firstLine(text: string) { return text.split('\n')[0].slice(0, 80) || 'Nota'; }
  open(n: HubNote | null) { this.editing.set({ note: n }); }
  closeEditor() {
    this.editing.set(null);
    const p = this.qp();
    if (p?.get('nuova') || p?.get('apri')) void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }
}
