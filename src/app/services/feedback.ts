import { inject, Injectable, signal, WritableSignal } from '@angular/core';

export type FeedbackKind = 'success' | 'error';
export interface FeedbackNotice { id: number; kind: FeedbackKind; message: string }
export const FEEDBACK_DURATION = 3000;

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  readonly current = signal<FeedbackNotice | null>(null);
  private sequence = 0;
  private timeout?: ReturnType<typeof setTimeout>;

  show(kind: FeedbackKind, message: string) {
    if (!message.trim()) return;
    clearTimeout(this.timeout);
    const id = ++this.sequence;
    this.current.set({ id, kind, message });
    this.timeout = setTimeout(() => this.dismiss(id), FEEDBACK_DURATION);
  }

  dismiss(id = this.current()?.id) {
    if (id !== this.current()?.id) return;
    clearTimeout(this.timeout);
    this.timeout = undefined;
    this.current.set(null);
  }

  ngOnDestroy() { this.dismiss(); }
}

// Some device checks construct services directly, outside Angular's injector.
export function feedbackForContext(): FeedbackService {
  try { return inject(FeedbackService, { optional: true }) || new FeedbackService(); }
  catch { return new FeedbackService(); }
}

// Notification visibility is separate from application state: dismissing an
// error must never remove the error used to protect a pending save or update.
export function feedbackSignal(kind: FeedbackKind, feedback: FeedbackService): WritableSignal<string> {
  const state = signal('');
  const set = state.set.bind(state);
  state.set = value => { set(value); if (value) feedback.show(kind, value); };
  state.update = update => state.set(update(state()));
  return state;
}
