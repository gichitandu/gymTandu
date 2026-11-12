import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { readWorkoutWorkbook } from '../services/excel-parser';
import {
  categorize, cellText, detectStatement, detectTransfers, kindForCategory, normalizeStatement, parseCsv, ParseResult, rulePattern,
  StatementLayout, withHashes,
} from './hub-finance';
import { dayLabel, euro, HubBank, hubBankLabel, hubBankShort, HUB_BANKS, hubCategory, hubId, HubTransaction, shortDay } from './hub-model';
import { HubStore } from './hub-store';

const GUIDE: Record<HubBank, { how: string; formats: string[] }> = {
  intesa: { how: 'App o internet banking › lista movimenti › <b>Scarica Excel</b>', formats: ['.xlsx'] },
  revolut: { how: 'Conto › ··· › <b>Estratto conto</b> › formato “Excel”', formats: ['.csv', '.xlsx'] },
  mps: { how: 'Dal Digital Banking scarica la <b>lista movimenti</b> in Excel o CSV', formats: ['.xlsx', '.csv'] },
  altro: { how: 'Qualsiasi lista movimenti in <b>Excel o CSV</b> con data, descrizione e importo', formats: ['.xlsx', '.csv'] },
};
interface Preview { tx: HubTransaction; duplicate: boolean }

@Component({
  selector: 'gt-hub-import', standalone: true, imports: [FormsModule, RouterLink, IconComponent],
  template: `<div class="hb-top"><a class="hb-back" routerLink="/hub/spese"><gt-icon name="back"/>Spese</a></div>
<h1 class="hb-h1" style="margin-top:0">{{preview()?'Controlla e importa':'Importa estratto conto'}}</h1>
@if(!preview()){
  <p class="hb-sub">Scegli la banca, scarica la lista movimenti dalla sua app e caricala qui.</p>
  <div class="hb-cols" style="margin-top:6px">
  <div>
    <div class="hb-sec"><h2>1 · Banca</h2></div>
    <section class="hb-c hb-list bl" role="radiogroup" aria-label="Banca">
      @for(b of banks;track b.id){<button type="button" class="hb-li" [class.sel]="bank()===b.id" role="radio" [attr.aria-checked]="bank()===b.id" (click)="bank.set(b.id)">
        <span [class]="'hb-bank lg '+b.id">{{b.short}}</span><span class="bd"><strong>{{b.label}}</strong><p [innerHTML]="guide[b.id].how"></p><span class="fmt">@for(f of guide[b.id].formats;track f){<span class="hb-tag n">{{f}}</span>}</span></span>
        <span class="rad" [class.on]="bank()===b.id">@if(bank()===b.id){<gt-icon name="check"/>}</span></button>}
    </section>
  </div>
  <div>
    <div class="hb-sec"><h2>2 · File</h2></div>
    <label class="drop" [class.busy]="busy()"><input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" (change)="choose($event)" [disabled]="busy()"/>
      <span class="hb-sq lg v"><gt-icon name="upload"/></span><strong>{{busy()?'Lettura del file…':'Carica la lista movimenti'}}</strong><small>Excel (.xlsx) o CSV, fino a 10 MB · anche più mesi insieme</small><span class="hb-btn pri pick"><gt-icon name="file"/>Scegli file</span></label>
    <p class="hb-note"><gt-icon name="sparkle"/><span>Se sbagli banca non succede nulla: riconosco il formato dalle colonne del file e te lo segnalo.</span></p>
    @if(mapping();as m){<section class="hb-c hb-pad map"><strong>Colonne non riconosciute</strong><p class="hb-sub" style="margin:4px 0 10px">Indica quali colonne contengono data, descrizione e importo.</p>
      @for(k of mapKeys;track k.id){<label class="hb-field stack" style="margin-top:8px"><small>{{k.label}}</small><select [name]="k.id" [ngModel]="m.pick[k.id]" (ngModelChange)="setPick(k.id,$event)"><option [ngValue]="-1">—</option>@for(h of m.headers;track $index){<option [ngValue]="$index">{{h||'Colonna '+($index+1)}}</option>}</select></label>}
      <button type="button" class="hb-btn sm pri" style="margin-top:12px" (click)="applyMapping()">Usa queste colonne</button></section>}
    @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  </div>
  <div class="hb-span">
    <div class="hb-sec"><h2>Ultimi import</h2></div>
    <section class="hb-c hb-list">
      @for(b of banks.slice(0,3);track b.id){<div class="hb-li" style="cursor:default"><span [class]="'hb-bank md '+b.id">{{b.short}}</span><span class="bd"><strong>{{b.label}}</strong><small>{{lastImport(b.id)?.label||'mai importato'}}</small></span>
        @if(lastImport(b.id);as l){<span class="amt">{{l.count}}<small>movimenti</small></span>}@else{<span class="hb-tag v">da fare</span>}</div>}
    </section>
  </div>
  </div>
}@else{
  @if(preview();as p){
  <section class="hb-c det"><span [class]="'hb-bank lg '+p.bank">{{short(p.bank)}}</span><span class="grow"><strong>{{p.fileName}}</strong><small>{{bankLabel(p.bank)}} · {{p.range}} · {{p.total}} righe</small></span><span class="hb-tag" [class.g]="p.recognized" [class.y]="!p.recognized"><gt-icon [name]="p.recognized?'check':'info'"/>{{p.recognized?'Riconosciuto':'Banca scelta'}}</span></section>
  @if(p.recognized&&p.bank!==bank()){<p class="hb-note"><gt-icon name="info"/><span>Avevi scelto {{bankLabel(bank())}}, ma il file è di <b>{{bankLabel(p.bank)}}</b>: uso il formato giusto.</span></p>}
  <div class="sum4">
    <section class="hb-c"><b class="hb-pos">{{fresh().length}}</b><small>nuovi</small></section>
    <section class="hb-c"><b>{{dupCount()}}</b><small>già importati</small></section>
    <section class="hb-c"><b style="color:#8fb0ff">{{transferCount()}}</b><small>giroconti</small></section>
    <section class="hb-c"><b style="color:var(--hb-y)">{{uncategorized()}}</b><small>da scegliere</small></section>
  </div>
  @if(p.parsed.pending||p.parsed.foreign||p.parsed.skipped){<p class="hb-sub" style="margin-top:8px;font-size:12px">{{skipText(p.parsed)}}</p>}
  <div class="hb-sec"><h2>Anteprima</h2><span class="hb-muted" style="font-size:12.5px">{{p.items.length}} movimenti</span></div>
  <section class="hb-c hb-list">
    @for(i of p.items.slice(0,shown());track i.tx.hash){<div class="hb-li rw" [class.skip]="i.duplicate">
      <span class="d"><b>{{i.tx.date.slice(8)}}</b>{{shortDay(i.tx.date).split(' ')[1]}}</span>
      <span class="bd"><span class="raw">{{i.tx.description}}</span>
        @if(i.duplicate){<span class="hb-tag n"><gt-icon name="copy"/>Già importato · saltato</span>}
        @else if(transferIds().has(i.tx.id)){<span class="hb-tag b"><gt-icon name="swap"/>Giroconto · escluso</span>}
        @else{<select class="catsel" [class.empty]="!i.tx.category" [ngModel]="i.tx.category" (ngModelChange)="setCategory(i,$event)" [attr.aria-label]="'Categoria di '+i.tx.description"><option value="">Scegli categoria</option>@for(c of categories;track c.id){<option [value]="c.id">{{c.label}}</option>}</select>}</span>
      <span class="amt" [class.hb-pos]="i.tx.amount>0" [class.hb-muted]="i.duplicate||transferIds().has(i.tx.id)">{{euro(i.tx.amount,{sign:true})}}</span></div>}
  </section>
  @if(shown()<p.items.length){<button type="button" class="hb-btn sm" style="margin-top:10px" (click)="shown.set(shown()+40)">Mostra altri</button>}
  @if(transferPairs()){<div class="xfer"><span class="hb-sq sm b"><gt-icon name="swap"/></span><span><strong>Giroconti tra i tuoi conti</strong><p>Gli spostamenti tra le tue banche non sono spese: li escludo, così non li conti due volte.</p></span></div>}
  @if(newRules().length){<p class="hb-note"><gt-icon name="sparkle"/><span><b>Regole nuove:</b> {{newRules().join(', ')}}. Le uso anche per i prossimi import.</span></p>}
  <p class="hb-note"><gt-icon name="shield"/><span>Il file viene letto <b>sul telefono</b>. Salvo solo data, descrizione, importo e categoria: niente IBAN, numeri di carta o saldo.</span></p>
  <div class="hb-actions two"><button type="button" class="hb-btn sm" (click)="reset()">Annulla</button><button type="button" class="hb-btn pri sm" (click)="commit()" [disabled]="!fresh().length"><gt-icon name="download"/>Importa {{fresh().length}} movimenti</button></div>
  }
}`,
  styles: [`.bl .hb-li{align-items:flex-start;padding:14px;cursor:pointer}.bl .bd strong{white-space:normal}.bl p{margin:4px 0 0;font-size:12px;line-height:1.45;color:var(--hb-m)}.bl p b{color:var(--hb-t);font-weight:600}
.bl .fmt{display:flex;gap:5px;margin-top:8px}.bl .sel{background:linear-gradient(160deg,rgba(143,124,255,.13),rgba(143,124,255,.02));box-shadow:inset 0 0 0 1.5px rgba(143,124,255,.55);border-radius:22px}
.rad{display:grid;place-items:center;flex:none;width:24px;height:24px;margin-top:8px;border-radius:50%;border:2px solid rgba(255,255,255,.18)}.rad.on{border:0;background:linear-gradient(140deg,#8f7cff,#5b8cff);color:#fff}.rad gt-icon{width:13px;height:13px}
.drop{position:relative;display:block;padding:22px 16px;border-radius:24px;border:1.5px dashed rgba(143,124,255,.45);background:radial-gradient(120% 100% at 50% 0%,rgba(143,124,255,.12),transparent 70%);text-align:center;cursor:pointer}
.drop input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%!important;height:100%}.drop .hb-sq{margin:0 auto}.drop strong{display:block;margin-top:12px;font-size:16px;font-weight:700}.drop small{display:block;margin-top:4px;font-size:12.5px;color:var(--hb-m)}
.drop .pick{width:200px;margin:14px auto 0;min-height:44px;font-size:14px;pointer-events:none}.drop.busy{opacity:.6}
.map strong{display:block;font-size:15px}
.det{display:flex;align-items:center;gap:12px;padding:14px;margin-top:10px}.grow{flex:1;min-width:0}.det strong{display:block;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.det small{display:block;margin-top:2px;font-size:12px;color:var(--hb-m)}
.sum4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.sum4 .hb-c{padding:11px 10px;border-radius:18px}.sum4 b{display:block;font-size:22px;font-weight:750;letter-spacing:-.8px}.sum4 small{display:block;margin-top:2px;font-size:10.5px;line-height:1.3;color:var(--hb-m)}
.rw{cursor:default}.rw .d{width:34px;flex:none;text-align:center;font-size:10.5px;font-weight:700;color:var(--hb-m);text-transform:uppercase;line-height:1.1}.rw .d b{display:block;font-size:16px;color:var(--hb-t)}
.rw .raw{display:block;font:600 12px/1.3 ui-monospace,Menlo,monospace;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px}
.rw.skip{opacity:.5}.rw.skip .raw{text-decoration:line-through}
.catsel{max-width:100%;height:28px;padding:0 8px;border-radius:8px;font-size:12px!important;font-weight:650;background:rgba(79,209,165,.14)!important;color:var(--hb-g)}.catsel.empty{background:rgba(255,200,87,.12)!important;color:var(--hb-y);border:1px dashed rgba(255,200,87,.6)!important}.catsel option{background:#1a1a22;color:#fff}
.xfer{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:14px;border-radius:20px;background:linear-gradient(160deg,rgba(91,140,255,.14),rgba(91,140,255,.02));border:1px solid rgba(91,140,255,.3)}.xfer strong{display:block;font-size:14px}.xfer p{margin:4px 0 0;font-size:12.5px;line-height:1.45;color:var(--hb-m)}`],
})
export class HubImportComponent {
  private hub = inject(HubStore);
  private router = inject(Router);
  private feedback = feedbackForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly euro = euro; readonly shortDay = shortDay; readonly short = hubBankShort; readonly bankLabel = hubBankLabel;
  readonly banks = HUB_BANKS; readonly guide = GUIDE;
  readonly categories = ['spesa', 'ristoranti', 'trasporti', 'casa', 'abbonamenti', 'shopping', 'svago', 'salute', 'palestra', 'contanti', 'altro', 'entrate', 'giroconto'].map(id => ({ id, label: hubCategory(id).label }));
  readonly bank = signal<HubBank>('intesa');
  readonly busy = signal(false);
  readonly shown = signal(40);
  readonly mapKeys = [{ id: 'date', label: 'Data' }, { id: 'description', label: 'Descrizione' }, { id: 'amount', label: 'Importo (con segno)' }, { id: 'debit', label: 'Addebiti / uscite' }, { id: 'credit', label: 'Accrediti / entrate' }] as const;
  readonly mapping = signal<{ rows: unknown[][]; headerRow: number; headers: string[]; fileName: string; pick: Record<string, number> } | null>(null);
  readonly preview = signal<{ bank: HubBank; recognized: boolean; fileName: string; total: number; range: string; parsed: ParseResult; items: Preview[] } | null>(null);
  readonly fresh = computed(() => this.preview()?.items.filter(i => !i.duplicate).map(i => i.tx) ?? []);
  readonly dupCount = computed(() => this.preview()?.items.filter(i => i.duplicate).length ?? 0);
  readonly transferIds = computed(() => {
    const fresh = this.fresh(), ids = detectTransfers([...this.hub.transactions(), ...fresh]), own = new Set(fresh.map(t => t.id));
    return new Set([...ids].filter(id => own.has(id)));
  });
  readonly transferCount = computed(() => this.transferIds().size);
  readonly transferPairs = computed(() => this.transferCount() > 0);
  readonly uncategorized = computed(() => this.fresh().filter(t => !t.category && !this.transferIds().has(t.id)).length);
  readonly newRules = signal<string[]>([]);
  private chosenRules = new Map<string, string>();

  lastImport(bank: HubBank) {
    const i = this.hub.imports().find(x => x.bank === bank);
    return i ? { count: i.count, label: `${dayLabel(i.importedAt.slice(0, 10)).split(' ').slice(1).join(' ')} · ${shortDay(i.from)}–${shortDay(i.to)}` } : null;
  }
  setPick(key: string, index: number) { this.mapping.update(m => m ? { ...m, pick: { ...m.pick, [key]: index } } : m); }

  async choose(event: Event) {
    const input = event.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(''); this.mapping.set(null);
    if (file.size > 10 * 1024 * 1024) { this.error.set('Il file supera 10 MB: scarica un periodo più breve.'); return; }
    this.busy.set(true);
    try {
      const rows = await this.readRows(file);
      if (!rows.length) throw new Error('Il file è vuoto.');
      const layout = detectStatement(rows, this.bank());
      if (!layout) {
        const headerRow = Math.max(0, rows.findIndex(r => r.filter(c => cellText(c)).length >= 3));
        this.mapping.set({ rows, headerRow, headers: (rows[headerRow] ?? []).map(c => cellText(c)), fileName: file.name, pick: { date: -1, description: -1, amount: -1, debit: -1, credit: -1 } });
        return;
      }
      this.build(rows, layout, file.name);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'File non leggibile.'); }
    finally { this.busy.set(false); }
  }
  applyMapping() {
    const m = this.mapping(); if (!m) return;
    const p = m.pick, opt = (k: string) => p[k] >= 0 ? p[k] : undefined;
    if (p['date'] < 0 || p['description'] < 0 || (p['amount'] < 0 && p['debit'] < 0 && p['credit'] < 0)) { this.error.set('Scegli almeno data, descrizione e importo.'); return; }
    const layout: StatementLayout = { bank: this.bank(), headerRow: m.headerRow, headers: m.headers, recognized: false, columns: { date: p['date'], description: [p['description']], amount: opt('amount'), debit: opt('debit'), credit: opt('credit') } };
    this.mapping.set(null);
    this.build(m.rows, layout, m.fileName);
  }
  private async readRows(file: File): Promise<unknown[][]> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt') || file.type.includes('csv')) return parseCsv(await file.text());
    if (name.endsWith('.xls')) throw new Error('Il formato .xls non è supportato: scarica la lista in Excel (.xlsx) o CSV.');
    const workbook = await readWorkoutWorkbook(new Uint8Array(await file.arrayBuffer()));
    const sheets = workbook.worksheets.filter(ws => ws.rowCount > 0).sort((a, b) => b.rowCount - a.rowCount);
    const ws = sheets[0];
    if (!ws) throw new Error('Il file Excel non contiene movimenti.');
    const rows: unknown[][] = [];
    for (let r = 1; r <= Math.min(ws.rowCount, 20000); r++) { const values = ws.getRow(r).values; rows.push(Array.isArray(values) ? Array.from(values.slice(1), v => v ?? '') : []); }
    return rows;
  }
  private build(rows: unknown[][], layout: StatementLayout, fileName: string) {
    const parsed = normalizeStatement(rows, layout);
    if (!parsed.rows.length) { this.error.set('Nessun movimento valido trovato nel file. Controlla di aver scaricato la lista movimenti.'); return; }
    const bank = layout.bank, existing = new Set(this.hub.transactions().map(t => t.hash)), rules = this.hub.rules();
    const items: Preview[] = withHashes(bank, parsed.rows).map(({ row, hash }) => {
      const category = row.transfer ? 'giroconto' : categorize(row.description, row.amount, rules);
      // Uscite non riconosciute: restano da categorizzare (contano come «Altro» finché non scegli).
      const tx: HubTransaction = { id: hubId(), updatedAt: 0, bank, date: row.date, description: row.description, amount: row.amount, category: category === 'altro' && row.amount < 0 ? '' : category, kind: kindForCategory(category, row.amount), hash };
      return { tx, duplicate: existing.has(hash) };
    }).sort((a, b) => b.tx.date.localeCompare(a.tx.date));
    const dates = parsed.rows.map(r => r.date).sort();
    this.chosenRules.clear(); this.newRules.set([]); this.shown.set(40);
    this.preview.set({ bank, recognized: layout.recognized, fileName, total: parsed.rows.length + parsed.skipped + parsed.pending + parsed.foreign, range: `${shortDay(dates[0])}–${shortDay(dates.at(-1)!)}`, parsed, items });
  }
  setCategory(item: Preview, category: string) {
    item.tx = { ...item.tx, category, kind: kindForCategory(category || 'altro', item.tx.amount), manualCategory: !!category };
    const pattern = rulePattern(item.tx.description);
    if (category && pattern.length >= 3) {
      this.chosenRules.set(pattern, category);
      // Applica subito ai movimenti simili ancora senza scelta manuale.
      for (const other of this.preview()?.items ?? []) if (other !== item && !other.duplicate && !other.tx.manualCategory && rulePattern(other.tx.description) === pattern) other.tx = { ...other.tx, category, kind: kindForCategory(category, other.tx.amount) };
      this.newRules.set([...this.chosenRules].map(([p, c]) => `“${p}” → ${hubCategory(c).label}`));
    }
    this.preview.update(p => p ? { ...p, items: [...p.items] } : p);
  }
  skipText(p: ParseResult) {
    return [p.pending ? `${p.pending} in sospeso (li importi quando sono contabilizzati)` : '', p.foreign ? `${p.foreign} in altra valuta` : '', p.skipped ? `${p.skipped} righe senza data o importo` : ''].filter(Boolean).join(' · ') + ' non importati.';
  }
  reset() { this.preview.set(null); this.error.set(''); }
  commit() {
    const p = this.preview(); if (!p) return;
    const transfers = this.transferIds();
    const importId = hubId(), list = this.fresh().map(t => transfers.has(t.id) ? { ...t, category: 'giroconto', kind: 'transfer' as const, importId } : { ...t, importId });
    if (!list.length) return;
    // I giroconti trovati su movimenti già presenti vengono aggiornati anche lì.
    const all = detectTransfers([...this.hub.transactions(), ...list]);
    const older = this.hub.transactions().filter(t => all.has(t.id) && t.kind !== 'transfer' && !t.manualCategory).map(t => ({ ...t, category: 'giroconto', kind: 'transfer' as const }));
    this.hub.upsert('transactions', ...list, ...older);
    for (const [pattern, category] of this.chosenRules) { const existing = this.hub.rules().find(r => r.pattern === pattern); this.hub.upsert('rules', { id: existing?.id ?? hubId(), updatedAt: existing?.updatedAt ?? 0, pattern, category }); }
    const dates = list.map(t => t.date).sort();
    this.hub.upsert('imports', { id: importId, updatedAt: 0, bank: p.bank, fileName: p.fileName.slice(0, 120), importedAt: new Date().toISOString(), from: dates[0], to: dates.at(-1)!, count: list.length });
    this.feedback.show('success', `${list.length} movimenti importati.`);
    void this.router.navigate(['/hub/spese'], { queryParams: { vista: 'movimenti' } });
  }
}
