import { describe, expect, it } from "vitest";
import { selectTests } from "../tools/test-affected.mjs";

const files = [
  "src/app/features/calendar.component.ts",
  "src/app/features/calendar.component.css",
  "src/app/features/progress.component.ts",
  "src/app/services/store.ts",
  "tests/calendar.test.ts",
  "tests/progression.test.ts",
  "tests/ui-flows.test.ts",
  "tests/affected-selection.test.ts",
];
const graph = new Map<string, Set<string>>([
  [
    "tests/calendar.test.ts",
    new Set(["src/app/features/calendar.component.ts"]),
  ],
  [
    "tests/progression.test.ts",
    new Set(["src/app/features/progress.component.ts"]),
  ],
  ["tests/ui-flows.test.ts", new Set()],
  [
    "src/app/features/calendar.component.ts",
    new Set([
      "src/app/features/calendar.component.css",
      "src/app/services/store.ts",
    ]),
  ],
  [
    "src/app/features/progress.component.ts",
    new Set(["src/app/services/store.ts"]),
  ],
]);

describe("selezione conservativa dei test coinvolti", () => {
  it("non trascina i progressi quando cambia il CSS del calendario", () => {
    const result = selectTests(
      ["src/app/features/calendar.component.css"],
      files,
      graph,
    );
    expect(result.all).toBe(false);
    expect(result.tests).toContain("tests/calendar.test.ts");
    expect(result.tests).not.toContain("tests/progression.test.ts");
  });

  it("include i test della funzionalità modificata", () => {
    const result = selectTests(
      ["src/app/features/progress.component.ts"],
      files,
      graph,
    );
    expect(result.all).toBe(false);
    expect(result.tests).toContain("tests/progression.test.ts");
  });

  it("allarga al completo quando cambia lo Store condiviso", () => {
    const result = selectTests(["src/app/services/store.ts"], files, graph);
    expect(result.all).toBe(true);
  });

  it("allarga al completo se una nuova sorgente non è riconosciuta", () => {
    const result = selectTests(
      ["src/app/features/unknown.component.ts"],
      files,
      graph,
    );
    expect(result.all).toBe(true);
  });

  it("seleziona un test modificato senza coinvolgere gli altri", () => {
    const result = selectTests(["tests/calendar.test.ts"], files, graph);
    expect(result.all).toBe(false);
    expect(result.tests).toEqual(["tests/calendar.test.ts"]);
  });

  it("non avvia test per sole modifiche documentali", () => {
    const result = selectTests(["docs/TEST_SELETTIVI.md"], files, graph);
    expect(result.all).toBe(false);
    expect(result.tests).toEqual([]);
  });
});
