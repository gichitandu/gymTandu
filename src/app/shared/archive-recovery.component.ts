import { Component, effect, inject, untracked } from '@angular/core';
import { ArchiveRecoveryService } from '../services/archive-recovery';
import { Store } from '../services/store';
import { AuthService } from '../services/auth';

@Component({
  selector: 'gt-archive-recovery', standalone: true,
  template: `<details class="archive-recovery">
    <summary>Ritrova piani ed esercizi @if(recovery.candidates().length){<span>· archivio trovato</span>}</summary>
    <p>Controlla gli altri archivi di questa installazione. Puoi aggiungere i piani e gli esercizi mancanti conservando entrambe le copie.</p>
    <button type="button" (click)="recovery.scan()" [disabled]="recovery.busy()">{{recovery.busy()?'Controllo in corso…':'Cerca archivi sul dispositivo'}}</button>
    @for(archive of recovery.candidates();track archive.key){
      <section class="recovery-candidate">
        <strong>{{archive.label}}</strong>
        <p>{{archive.plans}} piani · {{archive.exercises}} esercizi aggiunti o modificati · {{archive.workouts}} sessioni · {{archive.meals}} pasti</p>
        <div class="actions"><button type="button" class="primary" (click)="recovery.recover(archive.key)" [disabled]="recovery.busy()">Aggiungi piani ed esercizi</button><button type="button" (click)="recovery.download(archive.key)" [disabled]="recovery.busy()">Scarica copia completa</button></div>
      </section>
    }
    @if(recovery.searched()&&!recovery.busy()&&!recovery.candidates().length){<p>Nessun altro archivio recuperabile in questa installazione. Safari e l’app nella schermata Home possono avere archivi diversi: apri anche l’altro ambiente per esportarne una copia. Gli archivi degli account richiedono l’accesso allo stesso account.</p>}
    @if(recovery.status()){<p role="status">{{recovery.status()}}</p>}
  </details>`,
  styles: [`:host{display:block;margin:0 0 16px}.archive-recovery{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--card);font-size:12px;line-height:1.6}.archive-recovery summary{cursor:pointer;min-height:30px;align-content:center;color:var(--text)}summary span{color:#72c8ff}p{color:var(--muted);margin:10px 0;overflow-wrap:anywhere}.recovery-candidate{border-top:1px solid var(--line);padding:12px 0 0;margin-top:12px}button{font-size:12px;min-height:44px}.actions{display:flex;flex-wrap:wrap;gap:8px}`],
})
export class ArchiveRecoveryComponent {
  recovery = inject(ArchiveRecoveryService);
  private store = inject(Store);
  private auth = inject(AuthService);
  private scannedScope = '';
  constructor(){effect(()=>{const ready=this.store.ready(),busy=this.recovery.busy(),scope=(this.auth.user()?.id||'')+':'+this.auth.platformOwner();if(ready&&!busy&&this.scannedScope!==scope){this.scannedScope=scope;untracked(()=>void this.recovery.scan());}});}
}
