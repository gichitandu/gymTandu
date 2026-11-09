import "@angular/compiler";
import { expect, it, vi } from "vitest";
import {
  DateFieldComponent,
  dateFieldLabel,
} from "../src/app/shared/date-field.component";
it("displays calendar dates consistently without timezone conversion", () => {
  expect(dateFieldLabel("2026-10-26")).toBe("26/10/2026");
  expect(dateFieldLabel("2024-02-29")).toBe("29/02/2024");
  expect(dateFieldLabel("2026-02-30")).toBe("Data non valida");
  expect(dateFieldLabel("")).toBe("gg/mm/aaaa");
});
it("writes existing form values without emitting edits and sends changes in the original storage format", () => {
  const field = new DateFieldComponent(),
    change = vi.fn(),
    touch = vi.fn();
  field.registerOnChange(change);
  field.registerOnTouched(touch);
  field.writeValue("2026-10-26");
  expect(change).not.toHaveBeenCalled();
  expect(field.label()).toBe("26/10/2026");
  field.choose({ target: { value: "2026-10-25" } } as unknown as Event);
  expect(change).toHaveBeenCalledExactlyOnceWith("2026-10-25");
  expect(touch).toHaveBeenCalledOnce();
  field.setDisabledState(true);
  field.choose({ target: { value: "2026-10-24" } } as unknown as Event);
  expect(change).toHaveBeenCalledOnce();
  expect(field.value()).toBe("2026-10-25");
  field.setDisabledState(false);
  field.choose({ target: { value: "" } } as unknown as Event);
  expect(change).toHaveBeenLastCalledWith("");
});
