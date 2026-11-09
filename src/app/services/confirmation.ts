import { inject, Injectable, signal } from "@angular/core";
export interface ConfirmationOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  detail?: string;
  tone?: "danger" | "info";
}
export interface ConfirmationRequest {
  message: string;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  detail?: string;
  tone: "danger" | "info";
}
@Injectable({ providedIn: "root" })
export class ConfirmationService {
  readonly current = signal<ConfirmationRequest | null>(null);
  private resolve?: (value: boolean) => void;
  ask(input: string | ConfirmationOptions): Promise<boolean> {
    // A second tap must not enqueue a duplicate destructive operation.
    if (this.current()) return Promise.resolve(false);
    const options = typeof input === "string" ? { message: input } : input;
    const danger = options.tone
      ? options.tone === "danger"
      : /eliminar|rimuover|scartar/i.test(options.message);
    const question = options.message.split("?")[0];
    this.current.set({
      ...options,
      title:
        options.title ||
        (options.message.includes("?") && question.length < 70
          ? question + "?"
          : danger
            ? "Conferma operazione"
            : "Prima di continuare"),
      confirmLabel:
        options.confirmLabel ||
        (danger
          ? /scartar/i.test(options.message)
            ? "Scarta modifiche"
            : "Conferma eliminazione"
          : "Continua"),
      tone: danger ? "danger" : "info",
    });
    return new Promise((resolve) => (this.resolve = resolve));
  }
  answer(value: boolean) {
    const resolve = this.resolve;
    this.resolve = undefined;
    this.current.set(null);
    resolve?.(value);
  }
  ngOnDestroy() {
    this.answer(false);
  }
}
// Isolated service tests have no application dialog host.
export function confirmationForContext(): Pick<ConfirmationService, "ask"> {
  const service = inject(ConfirmationService, { optional: true });
  return (
    service || {
      ask: async (input) =>
        confirm(typeof input === "string" ? input : input.message),
    }
  );
}
