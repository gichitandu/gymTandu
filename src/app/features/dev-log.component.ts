import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { AuthService } from '../services/auth';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { DevLogItem, DevLogKind, DevLogPriority, DevLogStatus } from '../services/dev-log';

type Tab = 'open' | 'fixed' | 'closed';
type KindFilter = 'all' | DevLogKind;
const KIND_LABEL: Record<DevLogKind, string> = { error: 'Errore', bug: 'Bug', improvement: 'Miglioria', idea: 'Idea' };
const STATUS_LABEL: Record<DevLogStatus, string> = { open: 'Aperto', in_progress: 'In corso', fixed: 'Da verificare', resolved: 'Risolto', dismissed: 'Scartato' };
const PRIORITY_LABEL: Record<DevLogPriority, string> = { high: 'Alta', medium: 'Media', low: 'Bassa' };
const ACTOR_LABEL = { user: 'Tu', claude: 'Claude', system: 'Automatico' } as const;

/** Registro sviluppo del Super Admin: errori automatici, bug, migliorie e la cronologia delle correzioni. */
@Component({
  selector: 'gt-dev-log', standalone: true, imports: [FormsModule, RouterLink, IconComponent],
  template: `<section class="dl">
@if(selected(); as item){
  <button type="button" class="dl-back" (click)="selected.set(null)"><gt-icon name="back"/>Registro</button>
  <div class="dl-tags"><span class="dl-code">{{item.code}}</span><span class="dl-tag" [attr.data-k]="item.kind">{{item.source==='auto'?'Errore auto':kindLabel[item.kind]}}</span>
    <span class="dl-tag" [attr.data-s]="item.status">{{statusLabel[item.status]}}</span>@if(item.regression){<span class="dl-tag" data-s="regression">Regressione</span>}</div>
  <h1>{{item.title}}</h1>
  <div class="dl-stats">
    @if(item.source==='auto'){<div><b>{{item.occurrences}}</b>casi</div><div><b>{{item.lastSeen?ago(item.lastSeen):'—'}}</b>ultima volta</div>}
    <div><b>{{priorityLabel[item.priority]}}</b>priorità</div>@if(item.route){<div><b>{{item.route}}</b>pagina</div>}
  </div>
  @if(item.details){<div class="dl-box"><div class="dl-lbl">Descrizione</div><p class="dl-pre">{{item.details}}</p></div>}
  @if(item.verification; as v){<div class="dl-box" [class.ok]="v.ready"><div class="dl-lbl">Verifica della correzione</div><p>{{v.reason}}</p></div>}
  @if(item.recent?.length){<div class="dl-box"><div class="dl-lbl">Ultimo caso</div>
    <p class="dl-meta">{{date(item.recent![0].at)}} · build {{item.recent![0].build.slice(0,8)}}{{item.recent![0].device?' · '+item.recent![0].device:''}}</p>
    <pre>{{item.recent![0].message}}@if(item.recent![0].stack){
{{item.recent![0].stack}}}</pre></div>}
  <div class="dl-box"><div class="dl-lbl">Cronologia</div><ol class="dl-tl">
    @for(e of item.events||[];track $index){<li [attr.data-a]="e.actor" [attr.data-k]="e.kind"><strong>{{actorLabel[e.actor]}} · {{eventLabel(e.kind)}}</strong><small>{{date(e.at)}}</small>@if(e.note){<span class="dl-pre">{{e.note}}</span>}</li>}
  </ol></div>
  <label class="dl-field"><span>Nota</span><textarea [(ngModel)]="note" rows="2" maxlength="2000" placeholder="Facoltativa: aggiunta alla cronologia"></textarea></label>
  <div class="dl-actions">
    @if(item.status==='fixed'){<button type="button" class="dl-btn ok" [disabled]="busy()" (click)="act(item,'resolve')"><gt-icon name="check"/>Confermo risolto</button>}
    @if(['fixed','resolved','dismissed'].includes(item.status)){<button type="button" class="dl-btn" [disabled]="busy()" (click)="act(item,'reopen')"><gt-icon name="repeat"/>Riapri</button>}
    @if(item.status!=='resolved'&&item.status!=='fixed'){<button type="button" class="dl-btn" [disabled]="busy()" (click)="act(item,'resolve')"><gt-icon name="check"/>Segna risolto</button>}
    @if(note.trim()){<button type="button" class="dl-btn" [disabled]="busy()" (click)="act(item,'note')"><gt-icon name="note"/>Salva nota</button>}
    <select class="dl-btn" [ngModel]="item.priority" (ngModelChange)="setPriority(item,$event)" [disabled]="busy()" aria-label="Priorità">
      <option value="high">Priorità alta</option><option value="medium">Priorità media</option><option value="low">Priorità bassa</option></select>
    @if(item.status!=='dismissed'&&item.status!=='resolved'){<button type="button" class="dl-btn danger" [disabled]="busy()" (click)="dismiss(item)"><gt-icon name="trash"/>Scarta</button>}
  </div>
} @else if(creating()){
  <button type="button" class="dl-back" (click)="creating.set(false)"><gt-icon name="back"/>Registro</button>
  <h1>Nuova voce</h1>
  <form class="dl-form" (ngSubmit)="create()">
    <div class="dl-chips">@for(k of manualKinds;track k){<button type="button" class="dl-chip" [class.on]="draft.kind===k" (click)="draft.kind=k">{{kindLabel[k]}}</button>}</div>
    <label class="dl-field"><span>Titolo</span><input name="title" [(ngModel)]="draft.title" maxlength="120" required placeholder="Cosa va corretto o migliorato"/></label>
    <label class="dl-field"><span>Descrizione</span><textarea name="details" [(ngModel)]="draft.details" rows="5" maxlength="4000" placeholder="Come riprodurlo, cosa ti aspetti, idee"></textarea></label>
    <label class="dl-field"><span>Pagina (facoltativa)</span><select name="route" [(ngModel)]="draft.route"><option value="">Nessuna</option>@for(p of pages;track p.path){<option [value]="p.path">{{p.label}}</option>}</select></label>
    <label class="dl-field"><span>Priorità</span><select name="priority" [(ngModel)]="draft.priority"><option value="high">Alta</option><option value="medium">Media</option><option value="low">Bassa</option></select></label>
    <button type="submit" class="dl-btn primary" [disabled]="busy()||!draft.title.trim()">Aggiungi al registro</button>
  </form>
} @else {
  <div class="dl-head"><h1>Registro sviluppo</h1><button type="button" class="dl-btn primary" (click)="startCreate()"><gt-icon name="plus"/>Nuova</button></div>
  <p class="dl-intro">Errori registrati in automatico e cose da correggere o migliorare. Claude legge questo registro, segna le correzioni e chiude ciò che la nuova versione conferma risolto.</p>
  <div class="dl-tabs" role="tablist">
    <button type="button" role="tab" [class.on]="tab()==='open'" [attr.aria-selected]="tab()==='open'" (click)="tab.set('open')"><b>{{(counts().open||0)+(counts().in_progress||0)}}</b>Aperti</button>
    <button type="button" role="tab" [class.on]="tab()==='fixed'" [attr.aria-selected]="tab()==='fixed'" (click)="tab.set('fixed')"><b>{{counts().fixed||0}}</b>Da verificare</button>
    <button type="button" role="tab" [class.on]="tab()==='closed'" [attr.aria-selected]="tab()==='closed'" (click)="tab.set('closed')"><b>{{(counts().resolved||0)+(counts().dismissed||0)}}</b>Chiusi</button>
  </div>
  <div class="dl-chips">@for(k of filters;track k.id){<button type="button" class="dl-chip" [class.on]="kind()===k.id" (click)="kind.set(k.id)">{{k.label}}</button>}</div>
  @if(loading()){<p class="dl-empty" role="status">Caricamento…</p>}
  @else if(!visible().length){<p class="dl-empty">Niente qui.</p>}
  <div class="dl-list">@for(item of visible();track item.id){
    <button type="button" class="dl-item" [attr.data-k]="item.source==='auto'?'auto':item.kind" [attr.data-s]="item.status" (click)="open(item)">
      <span class="dl-tags"><span class="dl-code">{{item.code}}</span><span class="dl-tag" [attr.data-k]="item.kind">{{item.source==='auto'?'Errore auto':kindLabel[item.kind]}}</span>
        @if(item.regression&&item.status!=='resolved'){<span class="dl-tag" data-s="regression">Regressione</span>}
        @if(item.status==='in_progress'){<span class="dl-tag" data-s="in_progress">In corso</span>}
        @if(item.priority==='high'&&item.status!=='resolved'){<span class="dl-tag" data-p="high">Alta</span>}</span>
      <strong>{{item.title}}</strong>
      <small>@if(item.source==='auto'){×{{item.occurrences}} · }{{item.route?item.route+' · ':''}}{{ago(item.updatedAt)}}@if(item.status==='fixed'&&item.verification){ · {{item.verification.ready?'pronto da chiudere':'in attesa di prova'}}}</small>
      @if(item.status==='fixed'&&item.fixSummary){<small class="dl-fix">{{item.fixCommit?item.fixCommit.slice(0,7)+' · ':''}}{{item.fixSummary}}</small>}
    </button>}
  </div>
  <a class="dl-back" routerLink="/profilo"><gt-icon name="back"/>Profilo</a>
}
</section>`,
  styles: [`
.dl{max-width:720px;margin:0 auto;padding:12px 16px 96px;display:flex;flex-direction:column;gap:12px;color:var(--text,#f1f5fc)}
h1{font-size:24px;font-weight:800;margin:0;line-height:1.2;overflow-wrap:anywhere}
.dl-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dl-intro,.dl-empty,.dl-meta{color:var(--muted,#8e9bad);font-size:14px;margin:0}
.dl-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.dl-tabs button{background:var(--card,#131923);border:1px solid var(--line,#252e3c);border-radius:14px;padding:10px 6px;color:var(--muted,#8e9bad);font-size:12px;cursor:pointer}
.dl-tabs b{display:block;font-size:20px;color:var(--text,#f1f5fc)}.dl-tabs .on{border-color:var(--blue,#367dff)}
.dl-chips{display:flex;gap:6px;flex-wrap:wrap}
.dl-chip{border:0;border-radius:99px;padding:7px 12px;background:var(--raised,#19212e);color:var(--muted,#8e9bad);font-size:13px;cursor:pointer}
.dl-chip.on{background:var(--text,#f1f5fc);color:var(--bg,#0b0f17);font-weight:700}
.dl-list{display:flex;flex-direction:column;gap:10px}
.dl-item{--c:var(--blue,#367dff);text-align:left;display:flex;flex-direction:column;gap:5px;background:var(--card,#131923);border:1px solid var(--line,#252e3c);border-left:4px solid var(--c);border-radius:16px;padding:12px 14px;color:inherit;font:inherit;cursor:pointer}
.dl-item[data-k=auto]{--c:#ff5b6b}.dl-item[data-k=bug]{--c:#ff9f43}.dl-item[data-k=idea]{--c:#b38cff}.dl-item[data-s=fixed]{--c:#ffd166}.dl-item[data-s=resolved]{--c:var(--green,#42d5a0)}.dl-item[data-s=dismissed]{--c:var(--muted,#8e9bad)}
.dl-item strong{font-size:15px;overflow-wrap:anywhere}.dl-item small{color:var(--muted,#8e9bad);font-size:12px;overflow-wrap:anywhere}.dl-fix{font-style:italic}
.dl-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.dl-code{font-size:12px;font-weight:700;color:var(--muted,#8e9bad)}
.dl-tag{--t:var(--blue,#367dff);font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;color:var(--t);background:color-mix(in srgb,var(--t) 16%,transparent);text-transform:uppercase}
.dl-tag[data-k=error]{--t:#ff5b6b}.dl-tag[data-k=bug]{--t:#ff9f43}.dl-tag[data-k=idea]{--t:#b38cff}.dl-tag[data-s=regression]{--t:#ff9f43}.dl-tag[data-s=fixed]{--t:#ffd166}.dl-tag[data-s=resolved]{--t:var(--green,#42d5a0)}.dl-tag[data-s=dismissed]{--t:var(--muted,#8e9bad)}.dl-tag[data-s=in_progress]{--t:#5ec8ff}.dl-tag[data-p=high]{--t:#ff5b6b}
.dl-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}
.dl-stats div{background:var(--raised,#19212e);border-radius:10px;padding:8px;font-size:11px;color:var(--muted,#8e9bad)}.dl-stats b{display:block;color:var(--text,#f1f5fc);font-size:15px;overflow-wrap:anywhere}
.dl-box{background:var(--card,#131923);border:1px solid var(--line,#252e3c);border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}.dl-box.ok{border-color:var(--green,#42d5a0)}.dl-box p{margin:0;font-size:14px}
.dl-lbl{font-size:11px;font-weight:700;color:var(--muted,#8e9bad);text-transform:uppercase;letter-spacing:.06em}
.dl-pre{white-space:pre-wrap;overflow-wrap:anywhere}
pre{margin:0;font:11.5px/1.45 ui-monospace,Menlo,monospace;color:var(--muted,#b9c7d8);white-space:pre-wrap;overflow-wrap:anywhere}
.dl-tl{list-style:none;margin:0;padding:0 0 0 18px;display:flex;flex-direction:column;gap:10px;border-left:2px solid var(--line,#252e3c)}
.dl-tl li{--d:var(--muted,#8e9bad);position:relative;display:flex;flex-direction:column;font-size:13px}
.dl-tl li::before{content:'';position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--d)}
.dl-tl li[data-a=claude]{--d:#b38cff}.dl-tl li[data-k=resolved]{--d:var(--green,#42d5a0)}.dl-tl li[data-k=reopened]{--d:#ff9f43}.dl-tl li[data-k=created]{--d:#ff5b6b}
.dl-tl small{color:var(--muted,#8e9bad);font-size:11px}
.dl-actions{display:flex;flex-wrap:wrap;gap:8px}
.dl-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line,#252e3c);background:var(--card,#131923);color:var(--text,#f1f5fc);border-radius:12px;padding:9px 13px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.dl-btn.primary{background:var(--blue,#367dff);border-color:transparent;color:#fff}.dl-btn.ok{background:var(--green,#42d5a0);border-color:transparent;color:#03231a}.dl-btn.danger{color:#ff5b6b}.dl-btn:disabled{opacity:.5}
.dl-back{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;background:none;border:0;color:var(--blue,#367dff);font:inherit;font-size:15px;padding:4px 0;cursor:pointer;text-decoration:none}
.dl-form{display:flex;flex-direction:column;gap:12px}
.dl-field{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted,#8e9bad)}
.dl-field input,.dl-field textarea,.dl-field select{font:inherit;font-size:16px;color:var(--text,#f1f5fc);background:var(--raised,#19212e);border:1px solid var(--line,#252e3c);border-radius:12px;padding:10px 12px}
`],
})
export class DevLogComponent implements OnInit {
  private auth = inject(AuthService);
  private feedback = feedbackForContext();
  private confirmation = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly kindLabel = KIND_LABEL; readonly statusLabel = STATUS_LABEL; readonly priorityLabel = PRIORITY_LABEL; readonly actorLabel = ACTOR_LABEL;
  readonly manualKinds: DevLogKind[] = ['bug', 'improvement', 'idea'];
  readonly filters: { id: KindFilter; label: string }[] = [{ id: 'all', label: 'Tutti' }, { id: 'error', label: 'Errori auto' }, { id: 'bug', label: 'Bug' }, { id: 'improvement', label: 'Migliorie' }, { id: 'idea', label: 'Idee' }];
  readonly pages = [
    { path: '/', label: 'Home' }, { path: '/piani', label: 'Schede' }, { path: '/piano/:id', label: 'Dettaglio scheda' }, { path: '/sessione', label: 'Allenamento in corso' },
    { path: '/allenamenti', label: 'Allenamenti' }, { path: '/progressi', label: 'Progressi' }, { path: '/calendario', label: 'Calendario' }, { path: '/alimentazione', label: 'Alimentazione' },
    { path: '/catalogo', label: 'Catalogo esercizi' }, { path: '/profilo', label: 'Profilo' }, { path: '/recupero', label: 'Recupero' }, { path: '/design-studio', label: 'Design Studio' },
  ];
  readonly items = signal<DevLogItem[]>([]);
  readonly counts = signal<Partial<Record<DevLogStatus, number>>>({});
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly tab = signal<Tab>('open');
  readonly kind = signal<KindFilter>('all');
  readonly selected = signal<DevLogItem | null>(null);
  readonly creating = signal(false);
  note = '';
  draft = { kind: 'bug' as DevLogKind, title: '', details: '', route: '', priority: 'medium' as DevLogPriority };
  readonly visible = computed(() => {
    const statuses: DevLogStatus[] = this.tab() === 'open' ? ['open', 'in_progress'] : this.tab() === 'fixed' ? ['fixed'] : ['resolved', 'dismissed'];
    return this.items().filter(item => statuses.includes(item.status) && (this.kind() === 'all' || (this.kind() === 'error' ? item.source === 'auto' || item.kind === 'error' : item.kind === this.kind())));
  });

  ngOnInit() { void this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.auth.request('dev-log/items');
      this.items.set(Array.isArray(data.items) ? data.items : []);
      this.counts.set(data.counts || {});
      this.error.set('');
    } catch (failure) { this.error.set(failure instanceof Error ? failure.message : 'Registro non disponibile.'); }
    finally { this.loading.set(false); }
  }

  async open(item: DevLogItem) {
    this.note = '';
    this.selected.set(item);
    try { this.selected.set((await this.auth.request('dev-log/items/' + item.id)).item); }
    catch (failure) { this.error.set(failure instanceof Error ? failure.message : 'Voce non disponibile.'); }
  }

  startCreate() { this.draft = { kind: 'bug', title: '', details: '', route: '', priority: 'medium' }; this.creating.set(true); }

  async create() {
    if (this.busy() || !this.draft.title.trim()) return;
    this.busy.set(true);
    try {
      const { item } = await this.auth.request('dev-log/items', { ...this.draft, route: this.draft.route || null });
      this.creating.set(false);
      this.feedback.show('success', item.code + ' aggiunto al registro.');
      await this.load();
    } catch (failure) { this.error.set(failure instanceof Error ? failure.message : 'Voce non salvata.'); }
    finally { this.busy.set(false); }
  }

  async act(item: DevLogItem, action: 'resolve' | 'reopen' | 'note' | 'dismiss' | 'update', extra: Record<string, unknown> = {}) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.auth.request('dev-log/items/' + item.id, { action, note: this.note.trim() || undefined, ...extra });
      this.note = '';
      this.selected.set(result.item);
      void this.load();
    } catch (failure) { this.error.set(failure instanceof Error ? failure.message : 'Operazione non riuscita.'); }
    finally { this.busy.set(false); }
  }

  async setPriority(item: DevLogItem, priority: DevLogPriority) {
    if (priority !== item.priority) await this.act(item, 'update', { priority });
  }

  async dismiss(item: DevLogItem) {
    const ok = await this.confirmation.ask({ title: 'Scartare ' + item.code + '?', message: 'La voce esce dagli aperti. Se è un errore automatico i nuovi casi vengono ancora contati ma non la riaprono.', confirmLabel: 'Scarta', tone: 'danger' });
    if (ok) await this.act(item, 'dismiss');
  }

  eventLabel(kind: string) {
    return ({ created: 'creato', started: 'lavoro iniziato', fixed: 'corretto', resolved: 'risolto', reopened: 'riaperto', dismissed: 'scartato', note: 'nota', priority: 'priorità' } as Record<string, string>)[kind] || kind;
  }
  date(at: number) { return new Date(at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  ago(at: number) {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return 'adesso';
    if (minutes < 60) return minutes + ' min fa';
    if (minutes < 1440) return Math.round(minutes / 60) + ' ore fa';
    const days = Math.round(minutes / 1440);
    return days === 1 ? 'ieri' : days + ' giorni fa';
  }
}
