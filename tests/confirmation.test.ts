import "@angular/compiler";
import { expect, it } from "vitest";
import { ConfirmationService } from "../src/app/services/confirmation";
it("waits for an explicit choice and does not approve duplicate taps", async () => {
  const service = new ConfirmationService();
  let settled = false;
  const first = service
    .ask({
      title: "Eliminare il piano?",
      message: "Lo storico resta conservato.",
      detail: "Piano Tandu",
      tone: "danger",
      confirmLabel: "Elimina piano",
    })
    .then((ok) => {
      settled = true;
      return ok;
    });
  expect(service.current()).toMatchObject({
    title: "Eliminare il piano?",
    detail: "Piano Tandu",
    tone: "danger",
  });
  expect(settled).toBe(false);
  expect(await service.ask("Secondo tocco")).toBe(false);
  expect(settled).toBe(false);
  service.answer(false);
  expect(await first).toBe(false);
  expect(service.current()).toBeNull();
  const next = service.ask({
    title: "Terminare?",
    message: "Conserva le serie.",
    tone: "info",
  });
  service.answer(true);
  expect(await next).toBe(true);
});
it("cancels pending operations if the host is destroyed", async () => {
  const service = new ConfirmationService();
  const pending = service.ask("Eliminare?");
  service.ngOnDestroy();
  expect(await pending).toBe(false);
  expect(service.current()).toBeNull();
});
