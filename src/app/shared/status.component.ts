import { Component, inject } from "@angular/core";
import { Store } from "../services/store";
@Component({
  selector: "gt-status",
  standalone: true,
  template: `@if (s.error()) {
      <div class="notice error" role="alert">
        {{ s.error() }}
        <button
          class="ghost"
          (click)="s.error.set('')"
          aria-label="Chiudi errore"
        >
          ×
        </button>
      </div>
    }
    @if (s.message()) {
      <div class="notice success" role="status">
        {{ s.message() }}
        <button
          class="ghost"
          (click)="s.message.set('')"
          aria-label="Chiudi messaggio"
        >
          ×
        </button>
      </div>
    }
    @if (!s.ready() && !s.error()) {
      <div class="notice" role="status">Apertura dell’archivio locale…</div>
    }`,
})
export class StatusComponent {
  s = inject(Store);
}
