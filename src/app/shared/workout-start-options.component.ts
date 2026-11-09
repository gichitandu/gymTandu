import {
  Component,
  ElementRef,
  afterRenderEffect,
  effect,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { WorkoutStartOptionsService } from "../services/workout-start-options";

@Component({
  selector: "gt-workout-start-options",
  standalone: true,
  template: `
<dialog #panel (cancel)="cancel($event)" aria-labelledby="workout-start-title">
@if(options.current(); as request){
  <p class="eyebrow">IL TUO ALLENAMENTO</p><h2 id="workout-start-title">Prepara la seduta</h2>
  <p><strong>{{request.dayName}}</strong><br>{{request.planName}}</p>
  <label class="reuse-choice"><input type="checkbox" [checked]="reuse()" (change)="reuse.set($any($event.target).checked)"><span><strong>Riparti dalla settimana precedente</strong><small>Stessi carichi e serie di riscaldamento della seduta del {{date(request.previousDate)}}.</small></span></label>
  <p class="help">Le serie allenanti e le ripetizioni previste restano quelle di questa settimana. Ogni serie sarà da confermare. Puoi cambiare la scelta predefinita nelle Impostazioni.</p>
  <div class="actions"><button type="button" class="primary" (click)="options.answer(reuse())">Inizia allenamento</button><button type="button" autofocus (click)="options.answer(null)">Annulla</button></div>
}</dialog>`,
  styles: [
    `
:host{display:contents}dialog{width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;margin:auto;padding:24px;border:1px solid var(--line);border-radius:22px;background:var(--card);color:var(--text);font-family:inherit;box-shadow:0 24px 80px #0008}dialog::backdrop{background:#030914b8;backdrop-filter:blur(5px)}h2{font-size:24px;margin:8px 0 18px}.eyebrow{font-size:10px;letter-spacing:1.5px;color:var(--accent-text)}p{line-height:1.6;font-size:14px;overflow-wrap:anywhere}.reuse-choice{display:flex;align-items:flex-start;gap:12px;margin:20px 0;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--bg);cursor:pointer}.reuse-choice input{flex:none;width:22px;height:22px;min-height:22px;margin:1px 0 0;accent-color:var(--accent)}.reuse-choice strong,.reuse-choice small{display:block;line-height:1.5}.reuse-choice strong{font-size:14px}.reuse-choice small,.help{font-size:12px;color:var(--muted)}.actions{display:grid;gap:10px;margin-top:22px}.actions button{min-height:48px;width:100%;font-family:inherit;font-weight:600;font-size:14px;line-height:1.4;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--raised);color:var(--text)}.actions .primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}button:focus-visible,input:focus-visible{outline:2px solid var(--accent-text);outline-offset:3px}
`,
  ],
})
export class WorkoutStartOptionsComponent {
  options = inject(WorkoutStartOptionsService);
  reuse = signal(true);
  private panel = viewChild<ElementRef<HTMLDialogElement>>("panel");
  constructor() {
    effect(() => {
      const request = this.options.current();
      if (request) this.reuse.set(request.defaultReuse);
    });
    afterRenderEffect(() => {
      const panel = this.panel()?.nativeElement;
      if (!panel) return;
      if (this.options.current() && !panel.open) panel.showModal();
      else if (!this.options.current() && panel.open) panel.close();
    });
  }
  date(value: string) {
    return new Date(value + "T12:00:00").toLocaleDateString("it-IT");
  }
  cancel(event: Event) {
    event.preventDefault();
    this.options.answer(null);
  }
  ngOnDestroy() {
    this.options.answer(null);
  }
}
