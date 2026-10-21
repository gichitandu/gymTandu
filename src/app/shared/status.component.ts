import { Component, inject } from "@angular/core";
import { Store } from "../services/store";
@Component({
  selector: "gt-status",
  standalone: true,
  template: `@if (!s.ready()) {
      <div class="notice" role="status">@if(s.error()) {
        Archivio non disponibile. <button type="button" (click)="retry()">Riprova apertura</button>
      } @else {Apertura dell’archivio locale…}</div>
    }`,
})
export class StatusComponent {
  s = inject(Store);
  retry() { this.s.error.set(''); void this.s.init(); }
}
