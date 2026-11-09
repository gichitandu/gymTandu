import { Component, signal } from "@angular/core";
@Component({
  selector: "gt-install-help",
  standalone: true,
  template: `
<section class="install-help" aria-label="Icona e collegamento Home">
  <div class="install-brand"><img src="/icons/gt-modern-180.png" width="72" height="72" alt="Nuova icona GT di GymTrack"><div><h3>GymTrack sulla tua Home</h3><p>Usa il collegamento diretto dell’app per salvare il logo GT.</p></div></div>
  <label>Link di GymTrack<input type="url" readonly [value]="url" aria-label="Link diretto di GymTrack" (focus)="$any($event.target).select()"></label>
  <div class="install-actions"><button type="button" (click)="copy()">Copia link dell’app</button><a class="button primary" [href]="url" target="_top">Apri GymTrack direttamente</a></div>
  @if(message()){<p role="status">{{message()}}</p>}
  <p>Per aggiornare l’app continua a usare l’icona attuale: non occorre crearne un’altra. Prima di aprire l’app in Safari o aggiungere un nuovo collegamento, verifica che <strong>Protezione dati</strong> indichi <strong>copia server aggiornata</strong>. Le diverse installazioni iPhone possono usare archivi locali separati.</p>
  <p>Per la prima installazione apri il link in Safari e scegli <strong>Condividi → Aggiungi alla schermata Home</strong>. La pagina della chat ha un’icona diversa.</p>
  <small>Su iPhone, le icone incorporate dei siti privati richiedono Safari 26 o successivo. Conserva l’icona precedente e i suoi dati finché hai verificato allenamenti e progressi nel nuovo collegamento.</small>
</section>`,
  styles: [
    `
:host{display:block}.install-brand{display:flex;align-items:center;gap:13px}.install-brand img{flex:none;border-radius:17px}.install-brand h3{font-size:16px;margin:0 0 5px}.install-help p{font-size:12px;line-height:1.65;color:var(--muted);margin:10px 0;overflow-wrap:anywhere}.install-help label{display:block;margin:16px 0 10px;font-size:12px}.install-help input{display:block;width:100%;min-width:0;min-height:44px;font-size:14px;margin-top:6px}.install-actions{display:flex;flex-wrap:wrap;gap:10px}.install-actions>*{flex:1 1 160px;min-height:44px;font-size:12px;text-align:center;white-space:normal}.install-help small{display:block;font-size:11px;line-height:1.65;color:var(--muted);margin-top:12px}
`,
  ],
})
export class InstallHelpComponent {
  readonly url =
    typeof location !== "undefined" ? new URL("/", location.href).href : "/";
  message = signal("");
  async copy() {
    try {
      await navigator.clipboard.writeText(this.url);
      this.message.set("Link copiato. Puoi aprirlo direttamente in Safari.");
    } catch {
      this.message.set("Seleziona e copia il link dal campo qui sopra.");
    }
  }
}
