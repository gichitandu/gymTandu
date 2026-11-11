import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '../services/store';
import { MobileNavigationService } from '../services/mobile-navigation';
import { HubShellComponent } from './hub-shell.component';

/** Contenitore di GT Hub, al posto della cornice di GymTrack (stili e barra separati). */
@Component({
  selector: 'gt-hub-host', standalone: true, imports: [RouterOutlet, HubShellComponent],
  template: `<gt-hub-shell [url]="navigation.url()">@if(s.ready()){<router-outlet/>}@else{<p class="hb-empty" role="status">Apertura dei tuoi dati…</p>}</gt-hub-shell>`,
})
export class HubHostComponent {
  readonly navigation = inject(MobileNavigationService);
  readonly s = inject(Store);
  constructor() {
    effect(onCleanup => { document.body.classList.add('hub-mode'); onCleanup(() => document.body.classList.remove('hub-mode')); });
  }
}

