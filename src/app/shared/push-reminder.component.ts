import { Component, effect, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../services/auth";
import {
  PushReminderService,
  PushReminderState,
} from "../services/push-reminder";
@Component({
  selector: "gt-push-reminder",
  standalone: true,
  imports: [FormsModule],
  template: `
<details class="card push-reminder" (toggle)="opened($event)"><summary>Promemoria allenamento</summary>
 @if(!auth.user()||auth.offlineMode()){<p>Accedi online per gestire le notifiche.</p>}
 @else if(!push.supported()||push.homeRequired()){<p>Su iPhone usa GymTrack dall’icona nella Home, con iOS 16.4 o successivo.</p>}
 @else{
  @if(state();as settings){
   @if(!settings.available){<p role="status">Il servizio notifiche non è ancora attivo. @if(auth.uiRole()==='SuperAdmin'){Aggiorna il servizio Cloudflare con il pacchetto notifiche.}@else{L’amministratore deve completarne l’attivazione.}</p>}
   @else{
    <p>Un promemoria nei giorni con allenamenti programmati, anche con l’app chiusa.</p>
    <label>Orario<input type="time" [(ngModel)]="time" [disabled]="busy()"/></label>
    <label>Fuso orario<select [(ngModel)]="timezone" [disabled]="busy()">@for(zone of zones();track zone){<option [value]="zone">{{zone==='Europe/Rome'?'Roma · ora italiana':zone}}</option>}</select></label>
    <label class="push-daily"><input type="checkbox" [(ngModel)]="everyDay" [disabled]="busy()"/>Avvisami anche nei giorni senza allenamenti programmati</label>
    <p class="subtle">Orario e giorni valgono per il tuo account. Il consenso si attiva su ogni dispositivo. Il logout disattiva gli avvisi su questo dispositivo; chiudere l’app li mantiene attivi. iOS può ritardare gli avvisi in base a rete e Full immersion.</p>
    @if(settings.deviceEnabled){<p role="status">Notifiche attive su questo dispositivo.</p><div class="actions"><button class="primary" type="button" (click)="save()" [disabled]="busy()">Salva preferenze</button><button type="button" (click)="test()" [disabled]="busy()">Invia prova</button><button type="button" (click)="disable()" [disabled]="busy()">Disattiva qui</button></div>}
    @else{<button class="primary" type="button" (click)="enable()" [disabled]="busy()">Attiva su questo dispositivo</button>}
   }
  }
  @if(busy()){<p role="status">Attendi…</p>}
  @if(notice()){<p role="status">{{notice()}}</p>}
  @if(failed()){<button type="button" (click)="load()" [disabled]="busy()">Riprova</button>}
 }
</details>`,
  styles: [
    `.push-reminder{padding:16px;margin-top:16px;min-width:0}.push-reminder summary{font-weight:650;cursor:pointer;min-height:32px;align-content:center}.push-reminder p{color:var(--muted);font-size:13px;line-height:1.6;margin:12px 0}.push-reminder label{display:block;margin:12px 0;font-size:13px}.push-reminder input[type=time],.push-reminder select{display:block;box-sizing:border-box;min-width:0;max-width:100%;width:100%;margin-top:7px;min-height:46px}.push-reminder .push-daily{display:flex;align-items:center;gap:10px;line-height:1.5}.push-daily input{width:20px;height:20px;flex:none}.push-reminder .subtle{font-size:12px}.push-reminder .actions{display:flex;flex-wrap:wrap;gap:8px}.push-reminder button{min-height:44px;white-space:normal}`,
  ],
})
export class PushReminderComponent {
  auth = inject(AuthService);
  push = inject(PushReminderService);
  state = signal<PushReminderState | null>(null);
  busy = signal(false);
  notice = signal("");
  failed = signal(false);
  time = "08:30";
  timezone = "Europe/Rome";
  everyDay = false;
  private generation = 0;
  constructor() {
    effect(() => {
      this.auth.user()?.id;
      this.auth.offlineMode();
      this.generation++;
      this.state.set(null);
      this.busy.set(false);
      this.notice.set("");
    });
  }
  zones() {
    return [
      ...new Set([
        "Europe/Rome",
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        "UTC",
        this.timezone,
      ]),
    ];
  }
  prefs() {
    return {
      time: this.time,
      timezone: this.timezone,
      everyDay: this.everyDay,
    };
  }
  private async run(
    operation: () => Promise<PushReminderState | void>,
    success = "",
  ) {
    if (this.busy() || !this.auth.user() || this.auth.offlineMode()) return;
    const generation = ++this.generation;
    this.busy.set(true);
    this.notice.set("");
    this.failed.set(false);
    try {
      const state = await operation();
      if (generation !== this.generation) return;
      if (state) {
        this.state.set(state);
        this.time = state.time;
        this.timezone = state.timezone;
        this.everyDay = state.everyDay;
      }
      this.notice.set(success);
    } catch (error) {
      if (generation === this.generation) {
        this.failed.set(true);
        this.notice.set(
          error instanceof Error ? error.message : "Notifiche non disponibili.",
        );
      }
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  opened(event: Event) {
    if ((event.target as HTMLDetailsElement).open && !this.state())
      void this.load();
  }
  load() {
    return this.run(() => this.push.load());
  }
  enable() {
    const state = this.state();
    if (state)
      return this.run(
        () => this.push.enable(state, this.prefs()),
        "Promemoria attivato. Puoi inviare una prova.",
      );
    return Promise.resolve();
  }
  save() {
    return this.run(() => this.push.save(this.prefs()), "Preferenze salvate.");
  }
  disable() {
    return this.run(
      () => this.push.disable(),
      "Notifiche disattivate su questo dispositivo.",
    );
  }
  test() {
    return this.run(
      () => this.push.test(),
      "Invio accettato. Controlla le notifiche del dispositivo.",
    );
  }
}
