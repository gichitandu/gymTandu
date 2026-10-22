import { confirmationForContext } from '../services/confirmation';
import { Component, inject, output, signal } from '@angular/core';
import { DataSet } from '../models/domain';
import { ArchiveSyncService, archiveSummary } from '../services/archive-sync';
export interface ArchiveRecoveryRequest {data:DataSet;scope:'device'|'account'}

@Component({
  selector: 'gt-archive-sync', standalone: true,
  template: `<details class="archive-protection" [open]="sync.status()==='conflict'">
    <summary><span [class.saved]="sync.status()==='saved'">{{sync.status()==='saved'?'✓':sync.status()==='conflict'?'!':'↻'}}</span> Protezione dati · {{label()}}</summary>
    <p role="status">{{sync.message()}}</p>
    @if(sync.lastSaved()){<p class="saved-date">Ultima copia server: {{savedDate()}}</p>}
    <div class="archive-actions"><button type="button" (click)="save()" [disabled]="working()||sync.status()==='syncing'||sync.status()==='conflict'">Salva copia ora</button>
      <button type="button" (click)="restore()" [disabled]="working()||sync.status()==='syncing'">Aggiungi piani ed esercizi dalla copia server</button>
      @if(sync.canRecoverDevice()){<button type="button" (click)="restore('device')" [disabled]="working()||sync.status()==='syncing'">Copia dello spazio locale</button>}</div>
    @if(localNotice()){<p role="status">{{localNotice()}}</p>}
  </details>`,
  styles: [`:host{display:block;margin:12px 0}.archive-protection{padding:11px 14px;border:1px solid var(--line,#2b4055);border-radius:12px;background:var(--card,#102236);font-size:12px}.archive-protection summary{cursor:pointer;min-height:30px;line-height:1.5}.archive-protection summary span{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#70561d;color:white;margin-right:6px}.archive-protection summary span.saved{background:#145a42}.archive-protection p{font-size:12px;line-height:1.6;margin:10px 0;color:var(--muted,#b0bfd0)}.archive-actions{display:flex;flex-wrap:wrap;gap:8px}.archive-actions button{font-size:12px;min-height:44px}.saved-date{font-size:11px!important}`],
})
export class ArchiveSyncComponent {
 private confirmation=confirmationForContext();
  sync = inject(ArchiveSyncService);
  recover = output<ArchiveRecoveryRequest>();
  working = signal(false);localNotice = signal('');
  label() { return ({local:'sul dispositivo',syncing:'copia in corso',saved:'copia server aggiornata',offline:'in attesa della rete',conflict:'due copie da verificare'})[this.sync.status()]; }
  savedDate() { return new Date(this.sync.lastSaved()!).toLocaleString('it-IT'); }
  async save() { this.working.set(true);try { if (!await this.sync.flush()) this.localNotice.set('La copia locale rimane conservata. Controlla la connessione e lo stato della copia server.');else this.localNotice.set(''); }finally{this.working.set(false);} }
  async restore(scope = this.sync.currentScope()) {
    if (!scope || this.working()) return;
    this.working.set(true);this.localNotice.set('');
    try {
      const data = await this.sync.readRemote(scope);if (!data) return;
      const counts = archiveSummary(data);
      if (!await this.confirmation.ask(`La copia server contiene ${counts.plans} piani e ${counts.plannedExercises} esercizi nei piani. Aggiungere i piani e gli esercizi mantenendo i dati attuali e le copie originali? Pasti e storico attuali restano invariati.`)) return;
      this.recover.emit({data,scope});
    } finally { this.working.set(false); }
  }
}
