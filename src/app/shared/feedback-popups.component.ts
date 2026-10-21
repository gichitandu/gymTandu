import { Component, computed, inject } from '@angular/core';
import { FeedbackService } from '../services/feedback';

@Component({
  selector: 'gt-feedback-popups',
  standalone: true,
  template: `@for (notice of notices(); track notice.id) {
    <section class="feedback-popup" [class.feedback-error]="notice.kind==='error'"
      [attr.role]="notice.kind==='error'?'alert':'status'"
      [attr.aria-live]="notice.kind==='error'?'assertive':'polite'" aria-atomic="true">
      <span class="feedback-icon" aria-hidden="true">{{notice.kind==='error'?'!':'✓'}}</span>
      <p>{{notice.message}}</p>
      <button type="button" (click)="feedback.dismiss(notice.id)" aria-label="Chiudi notifica">×</button>
    </section>
  }`,
  styles: [`
    :host{position:fixed;z-index:10000;top:calc(var(--visible-top,0px) + max(12px,env(safe-area-inset-top,0px)));right:max(16px,env(safe-area-inset-right,0px));width:min(440px,calc(100% - 32px));pointer-events:none}
    .feedback-popup{display:flex;align-items:flex-start;gap:11px;padding:12px 10px 12px 14px;border:1px solid #55bb9d;border-radius:14px;background:#103b30;color:#f3fff9;box-shadow:0 12px 38px #0006;pointer-events:auto;animation:feedback-in .14s ease-out;max-height:min(260px,calc(var(--visible-height,100dvh) - max(12px,env(safe-area-inset-top,0px)) - 16px));overflow:auto;overscroll-behavior:contain}
    .feedback-error{border-color:#ff8796;background:#4b1f2b;color:#fff3f5}
    .feedback-icon{display:grid;place-items:center;width:26px;min-width:26px;height:26px;border-radius:50%;background:#2d916b;font-weight:750;font-size:16px;margin-top:5px}
    .feedback-error .feedback-icon{background:#bf3b51}
    p{flex:1;min-width:0;font:500 14px/1.5 system-ui;margin:5px 0;overflow-wrap:anywhere}
    button{flex:none;display:grid;place-items:center;min-width:44px;min-height:44px;width:44px;height:44px;padding:0;margin:-3px -2px -3px 0;border:0;border-radius:10px;background:transparent;color:inherit;font-size:25px;line-height:1;cursor:pointer}
    button:focus-visible{outline:2px solid currentColor;outline-offset:-4px}
    @keyframes feedback-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
    @media(prefers-reduced-motion:reduce){.feedback-popup{animation:none}}
  `],
})
export class FeedbackPopupsComponent {
  feedback = inject(FeedbackService);
  notices = computed(() => { const notice = this.feedback.current(); return notice ? [notice] : []; });
}
