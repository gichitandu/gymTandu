import {
  Component,
  afterRenderEffect,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import { ConfirmationService } from "../services/confirmation";
@Component({
  selector: "gt-confirmation-dialog",
  standalone: true,
  template: `
<dialog #panel (cancel)="cancel($event)" (click)="backdrop($event)" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" [class.destructive]="confirmation.current()?.tone==='danger'">
@if(confirmation.current();as request){
<div class="sheet-handle" aria-hidden="true"></div>
<div class="dialog-symbol" aria-hidden="true">{{request.tone==='danger'?'!':'✓'}}</div>
<p class="dialog-eyebrow">GYMTRACK · {{request.tone==='danger'?'CONFERMA':'IL TUO ALLENAMENTO'}}</p>
<h2 id="confirmation-title">{{request.title}}</h2>
@if(request.detail){<div class="dialog-detail">{{request.detail}}</div>}
<p id="confirmation-message">{{request.message}}</p>
<div class="dialog-actions"><button class="dialog-primary" (click)="confirmation.answer(true)">{{request.confirmLabel}}</button><button class="dialog-cancel" autofocus (click)="confirmation.answer(false)">{{request.cancelLabel||'Annulla'}}</button></div>
}</dialog>`,
  styles: [
    `
:host{display:contents}dialog{--accent:var(--blue,#367dff);color:var(--text,#f1f5fc);background:linear-gradient(145deg,var(--raised,#19212e),var(--card,#131923));border:1px solid var(--line,#252e3c);border-radius:26px;padding:30px;width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow:auto;overscroll-behavior:contain;box-shadow:0 28px 100px #0009;margin:auto;font-family:inherit}dialog[open]{animation:dialog-in .2s ease-out}dialog.destructive{--accent:#ff6976}dialog::backdrop{background:#030914b8;backdrop-filter:blur(7px)}.sheet-handle{display:none}.dialog-symbol{display:grid;place-items:center;width:56px;height:56px;margin:0 auto 20px;border-radius:19px;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:26px;font-weight:700;box-shadow:0 0 28px color-mix(in srgb,var(--accent) 12%,transparent)}.dialog-eyebrow{text-align:center;font-size:10px!important;font-weight:700;letter-spacing:1.7px;color:var(--muted,#8e9bad)}h2{font-size:24px;line-height:1.2;letter-spacing:-.7px;text-align:center;margin:12px 0 20px}.dialog-detail{padding:16px;border:1px solid var(--line,#252e3c);border-radius:16px;background:var(--bg,#0b0f17);font-size:15px;font-weight:650;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}p{font-size:14px;line-height:1.65;color:var(--muted,#8e9bad);overflow-wrap:anywhere}.dialog-actions{display:grid;gap:10px;margin-top:24px}button{width:100%;min-height:52px;border-radius:14px;font-family:inherit;font-weight:650;font-size:15px;line-height:1.3;padding:12px 18px;cursor:pointer}.dialog-primary{background:var(--accent);border:1px solid var(--accent);color:white}.destructive .dialog-primary{color:#1e0710}.dialog-cancel{color:var(--text,#f1f5fc);background:transparent;border:1px solid var(--line,#252e3c)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@keyframes dialog-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@media(max-width:600px){dialog{width:100%;max-width:none;margin:auto 0 0;border-radius:26px 26px 0 0;padding:12px 24px calc(24px + env(safe-area-inset-bottom,0px));max-height:calc(100dvh - max(24px,env(safe-area-inset-top,0px)))}.sheet-handle{display:block;margin:0 auto 22px;width:40px;height:4px;border-radius:4px;background:var(--muted,#8e9bad)}h2{font-size:23px}}@media(prefers-reduced-motion:reduce){dialog[open]{animation:none}}
`,
  ],
})
export class ConfirmationDialogComponent {
  confirmation = inject(ConfirmationService);
  panel = viewChild<ElementRef<HTMLDialogElement>>("panel");
  constructor() {
    afterRenderEffect(() => {
      const request = this.confirmation.current(),
        panel = this.panel()?.nativeElement;
      if (!panel) return;
      if (request && !panel.open) panel.showModal();
      else if (!request && panel.open) panel.close();
    });
  }
  cancel(event: Event) {
    event.preventDefault();
    this.confirmation.answer(false);
  }
  backdrop(event: MouseEvent) {
    if (event.target !== event.currentTarget) return;
    const rect = this.panel()!.nativeElement.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      this.confirmation.answer(false);
  }
  ngOnDestroy() {
    this.confirmation.answer(false);
  }
}
