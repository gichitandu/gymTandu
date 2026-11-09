import type { Cell, Worksheet, Workbook } from "exceljs";
import type {
  ExcelExerciseDraft,
  ExcelProgramDraft,
  ExcelSessionDraft,
} from "../models/excel-import";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 20000,
  MAX_SESSIONS = 10000,
  MAX_PRESCRIPTIONS = 100000;
const DAY_NAMES = [
  "Domenica",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
];
const DAYS: Record<string, number> = {
  dom: 0,
  domenica: 0,
  sunday: 0,
  lun: 1,
  lunedi: 1,
  monday: 1,
  mar: 2,
  martedi: 2,
  tuesday: 2,
  mer: 3,
  mercoledi: 3,
  wednesday: 3,
  gio: 4,
  giovedi: 4,
  thursday: 4,
  ven: 5,
  venerdi: 5,
  friday: 5,
  sab: 6,
  sabato: 6,
  saturday: 6,
};
const PROGRAM_HEADERS = [
  "ID esercizio",
  "Allenamento",
  "Giorno",
  "Ordine",
  "Esercizio",
  "Serie",
  "Rep min",
  "Rep max",
  "Recupero sec",
  "RIR min",
  "RIR max",
  "Riscaldamento",
  "Carico di riferimento",
  "Unità del carico",
  "Note e consigli",
];
const VAR_HEADERS = [
  "Dalla settimana",
  "Alla settimana",
  "Allenamento",
  "ID esercizio",
  "Serie",
  "Rep min",
  "Rep max",
  "Recupero sec",
  "RIR min",
  "RIR max",
  "Riscaldamento",
  "Note e consigli",
];
const PROVA_HEADERS = [
  "ID esercizio",
  "S1 kg",
  "S1 rep",
  "S2 kg",
  "S2 rep",
  "S3 kg",
  "S3 rep",
  "Note sulla prova",
];
const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const join = (...parts: (string | undefined)[]) =>
  [
    ...new Set(parts.map((v) => v?.trim()).filter((v): v is string => !!v)),
  ].join("\n");
const where = (sheet: Worksheet, row: number, column?: number) =>
  `${sheet.name}!${column ? sheet.getCell(row, column).address : "riga " + row}`;
function invalid(location: string, message: string): never {
  throw Error(`${location}: ${message}`);
}

/** Scalar values only. Excel formulas, hyperlinks and rich text are never executed. */
function scalar(
  cell: Cell,
  literal = true,
): string | number | Date | undefined {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string")
    return (
      value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() ||
      undefined
    );
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      if (literal)
        invalid(
          `${cell.worksheet.name}!${cell.address}`,
          "inserisci un valore, non una formula. Le formule Excel non vengono eseguite.",
        );
      return undefined;
    }
    if ("richText" in value)
      return (
        value.richText
          .map((part) => part.text)
          .join("")
          .trim() || undefined
      );
    if ("text" in value) return String(value.text).trim() || undefined;
  }
  invalid(`${cell.worksheet.name}!${cell.address}`, "valore non leggibile.");
}
function text(
  sheet: Worksheet,
  row: number,
  col: number,
  required = false,
  max = 10000,
): string {
  const value = scalar(sheet.getCell(row, col));
  if (value instanceof Date)
    invalid(where(sheet, row, col), "inserisci testo, non una data.");
  const result = value === undefined ? "" : String(value).trim();
  if (required && !result)
    invalid(where(sheet, row, col), "campo obbligatorio mancante.");
  if (result.length > max)
    invalid(
      where(sheet, row, col),
      `testo troppo lungo (massimo ${max} caratteri).`,
    );
  return result;
}
function number(
  sheet: Worksheet,
  row: number,
  col: number,
  min: number,
  max: number,
  required = true,
  integer = true,
): number | undefined {
  const raw = scalar(sheet.getCell(row, col));
  if (raw === undefined) {
    if (required)
      invalid(where(sheet, row, col), "numero obbligatorio mancante.");
    return undefined;
  }
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && /^-?\d+(?:[.,]\d+)?$/.test(raw)
        ? Number(raw.replace(",", "."))
        : NaN;
  if (
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    value > max
  )
    invalid(
      where(sheet, row, col),
      `inserisci ${integer ? "un intero" : "un numero"} tra ${min} e ${max}.`,
    );
  return value;
}
function isoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error(
      "Scegli una data di inizio valida prima di selezionare il file Excel.",
    );
  const date = new Date(value + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw Error("La data di inizio non è valida.");
  return date;
}
function offset(start: string, days: number): string {
  const date = isoDate(start);
  date.setUTCDate(date.getUTCDate() + days);
  const value = date.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error("Il programma supera l’intervallo di date supportato.");
  return value;
}
function weekday(value: string, location: string): number {
  const result = DAYS[norm(value)];
  if (result === undefined)
    invalid(location, "scegli un giorno della settimana valido.");
  return result;
}
function sourceDate(sheet: Worksheet, row: number, col: number): string {
  const raw = scalar(sheet.getCell(row, col));
  const value =
    raw instanceof Date
      ? raw.toISOString().slice(0, 10)
      : typeof raw === "string"
        ? raw
        : "";
  try {
    isoDate(value);
  } catch {
    invalid(
      where(sheet, row, col),
      "data del foglio mancante o non valida; usa una data Excel o AAAA-MM-GG.",
    );
  }
  return value;
}
function headers(sheet: Worksheet, expected: string[]): number[] {
  const found = new Map<string, number>();
  sheet.getRow(5).eachCell((cell, col) => {
    const value = scalar(cell);
    if (value !== undefined) found.set(norm(String(value)), col);
  });
  return expected.map((name) => {
    const col = found.get(norm(name));
    if (!col)
      invalid(sheet.name, `intestazione “${name}” mancante nella riga 5.`);
    return col;
  });
}
function active(sheet: Worksheet, row: number, columns: number[]): boolean {
  return columns.some((col) => scalar(sheet.getCell(row, col)) !== undefined);
}
function sheetRows(sheet: Worksheet) {
  if (sheet.rowCount > MAX_ROWS)
    invalid(sheet.name, `il foglio supera ${MAX_ROWS} righe.`);
  return Math.max(5, sheet.rowCount);
}
function validateExercise(exercise: ExcelExerciseDraft, location: string) {
  if (exercise.repsMin > exercise.repsMax)
    invalid(location, "il massimo delle ripetizioni è inferiore al minimo.");
  if (
    exercise.rirMin !== undefined &&
    exercise.rirMax !== undefined &&
    exercise.rirMin > exercise.rirMax
  )
    invalid(location, "il RIR massimo è inferiore al minimo.");
  if (
    exercise.notes.length > 10000 ||
    (exercise.reference && exercise.reference.length > 10000)
  )
    invalid(location, "note o riferimenti troppo lunghi.");
}
function rir(
  sheet: Worksheet,
  row: number,
  col: number,
): { rirMin?: number; rirMax?: number } {
  const value = text(sheet, row, col);
  if (!value) return {};
  const found = /^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/.exec(value);
  if (
    !found ||
    Number(found[1]) > 10 ||
    Number(found[2] || found[1]) > 10 ||
    Number(found[1]) > Number(found[2] || found[1])
  )
    invalid(
      where(sheet, row, col),
      "RIR non valido: usa ad esempio 3 oppure 1–3.",
    );
  return { rirMin: Number(found[1]), rirMax: Number(found[2] || found[1]) };
}
function loadUnit(value: string): string | undefined {
  if (/verificar|confermar|non testat|per lato o totale/i.test(value))
    return "Da verificare";
  if (/per manubrio/i.test(value)) return "Per manubrio";
  if (/per lato|a lato/i.test(value)) return "Per lato";
  if (/totali|totale/i.test(value)) return "Totale";
  if (/carico macchina|kg macchina/i.test(value)) return "Macchina";
  return undefined;
}

/** Reject oversized/inflated archives before the XLSX library allocates worksheet data. */
function inspectContainer(bytes: Uint8Array) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (data.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw Error("Il file non è un Excel .xlsx leggibile.");
  const entries = data.getUint16(eocd + 10, true),
    start = data.getUint32(eocd + 16, true);
  if (
    entries === 0 ||
    entries > 2000 ||
    entries === 65535 ||
    start >= bytes.length
  )
    throw Error("Struttura Excel non supportata o troppo grande.");
  let cursor = start,
    total = 0;
  const names = new Set<string>();
  for (let entry = 0; entry < entries; entry++) {
    if (
      cursor + 46 > bytes.length ||
      data.getUint32(cursor, true) !== 0x02014b50
    )
      throw Error("L’archivio Excel è danneggiato.");
    const flags = data.getUint16(cursor + 8, true),
      size = data.getUint32(cursor + 24, true),
      nameLength = data.getUint16(cursor + 28, true),
      extra = data.getUint16(cursor + 30, true),
      comment = data.getUint16(cursor + 32, true);
    if (flags & 1 || size === 0xffffffff)
      throw Error("I file Excel cifrati o ZIP64 non sono supportati.");
    if (cursor + 46 + nameLength + extra + comment > bytes.length)
      throw Error("L’archivio Excel è danneggiato.");
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (/vbaProject\.bin$/i.test(name))
      throw Error("Usa un file .xlsx senza macro.");
    if (names.has(name))
      throw Error(
        "L’archivio Excel contiene parti duplicate. Salvalo nuovamente prima di importare.",
      );
    total += size;
    if (size > 16 * 1024 * 1024 || total > MAX_UNCOMPRESSED_BYTES)
      throw Error("Il contenuto del file Excel è troppo grande.");
    names.add(name);
    cursor += 46 + nameLength + extra + comment;
  }
  if (!names.has("xl/workbook.xml") || !names.has("[Content_Types].xml"))
    throw Error("Il file non contiene una cartella Excel valida.");
}

// ExcelJS4 assumes particular XML prefixes and package paths for comments,
// drawings and tables. Normalize these serializations in a temporary parsing
// copy only: the uploaded/downloaded bytes and their hash remain unchanged.
export async function readWorkoutWorkbook(
  bytes: Uint8Array,
): Promise<Workbook> {
  const imported = await import("exceljs");
  const module = imported as unknown as {
    Workbook?: new () => Workbook;
    default?: { Workbook: new () => Workbook };
  };
  const Constructor = module.Workbook || module.default?.Workbook;
  if (!Constructor)
    throw Error(
      "Lettore Excel non disponibile. Riapri l’app online e riprova.",
    );
  let workbook = new Constructor();
  try {
    await workbook.xlsx.load(
      bytes as unknown as Parameters<Workbook["xlsx"]["load"]>[0],
    );
    return workbook;
  } catch {
    /* Try equivalent XML/package serialization. */
  }
  try {
    const importedZip = await import("jszip"),
      Zip = importedZip.default;
    const zip = await Zip.loadAsync(bytes);
    let changed = false;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/^xl\/.*\.xml$/.test(path)) continue;
      const xml = await entry.async("string");
      const prefixes = new Set(
        [
          ...xml.matchAll(
            /xmlns:([A-Za-z_][\w.-]*)\s*=\s*["']http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main["']/g,
          ),
        ].map((match) => match[1]),
      );
      if (!prefixes.size) continue;
      const normalized = xml.replace(
        /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([A-Za-z_][\w.-]*):([A-Za-z_][\w.-]*)(?=[\s/>])/g,
        (token: string, prefix: string | undefined) =>
          prefix && prefixes.has(prefix)
            ? token.replace(prefix + ":", "")
            : token,
      );
      if (normalized !== xml) {
        zip.file(path, normalized);
        changed = true;
      }
    }
    // openpyxl, Excel and other conforming producers can use absolute OPC targets
    // or comments/comment1.xml instead of ExcelJS's expected ../comments1.xml.
    // Resolve only internal worksheet comment/VML/table relationships. External
    // links are neither rewritten nor fetched by this reader.
    const renamed = new Map<string, string>();
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !/^xl\/worksheets\/_rels\/[^/]+\.xml\.rels$/.test(path))
        continue;
      const xml = await entry.async("string");
      const tokens =
        xml.match(
          /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[A-Za-z_][\w.-]*:)?Relationship\b[^>]*\/>/g,
        ) || [];
      let normalized = xml;
      for (const token of tokens) {
        if (token.startsWith("<!")) continue;
        const attributes = new Map(
          [
            ...token.matchAll(
              /\b(Type|Target|TargetMode)\s*=\s*(["'])(.*?)\2/g,
            ),
          ].map((match) => [match[1], match[3]]),
        );
        if (attributes.get("TargetMode") === "External") continue;
        const type = attributes.get("Type")?.split("/").at(-1),
          target = attributes.get("Target");
        if (
          !target ||
          !["comments", "vmlDrawing", "table"].includes(type || "")
        )
          continue;
        const segments = (
            target.startsWith("/") ? target.slice(1) : "xl/worksheets/" + target
          ).split("/"),
          resolved: string[] = [];
        for (const segment of segments) {
          if (segment === "..") {
            if (!resolved.length) throw Error("Invalid package target");
            resolved.pop();
          } else if (segment && segment !== ".") resolved.push(segment);
        }
        const source = resolved.join("/");
        let destination = renamed.get(source);
        if (!destination) {
          const part = zip.file(source);
          if (!part) throw Error("Missing package part");
          let contents: string | Uint8Array = await part.async("uint8array");
          if (type === "comments") {
            const commentXml = await part.async("string");
            // ExcelJS also expects comment text as rich-text runs. Plain <t> is an
            // equivalent SpreadsheetML representation emitted by openpyxl.
            const richComments = commentXml.replace(
              /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|(<text\b[^>]*>)\s*(<t\b[^>]*>[\s\S]*?<\/t>)\s*(<\/text>)/g,
              (
                token: string,
                open: string | undefined,
                value: string,
                close: string,
              ) => (open ? open + "<r>" + value + "</r>" + close : token),
            );
            if (richComments !== commentXml) {
              contents = richComments;
              zip.file(source, contents);
              changed = true;
            }
          }
          const [folder, prefix, suffix] =
            type === "comments"
              ? ["xl/", "comments", ".xml"]
              : type === "vmlDrawing"
                ? ["xl/drawings/", "vmlDrawing", ".vml"]
                : ["xl/tables/", "table", ".xml"];
          const canonical = new RegExp(
            "^" + folder + prefix + "\\d+\\" + suffix + "$",
          );
          destination = source;
          if (!canonical.test(source)) {
            let index = 1;
            while (zip.file(folder + prefix + index + suffix)) index++;
            destination = folder + prefix + index + suffix;
            zip.file(destination, contents);
            changed = true;
          }
          renamed.set(source, destination);
        }
        const relative = "../" + destination.slice("xl/".length);
        if (target !== relative) {
          normalized = normalized.replace(
            token,
            token.replace(
              /\bTarget\s*=\s*(["'])(.*?)\1/,
              (_match, quote: string) => "Target=" + quote + relative + quote,
            ),
          );
          changed = true;
        }
      }
      if (normalized !== xml) zip.file(path, normalized);
    }
    if (!changed) throw Error("No supported serialization repair");
    workbook = new Constructor();
    const normalized = await zip.generateAsync({
      type: "uint8array",
      compression: "STORE",
    });
    await workbook.xlsx.load(
      normalized as unknown as Parameters<Workbook["xlsx"]["load"]>[0],
    );
    return workbook;
  } catch {
    throw Error(
      "Il file Excel non è leggibile. Controlla che non sia cifrato e salvalo nuovamente come .xlsx.",
    );
  }
}

type BaseExercise = ExcelExerciseDraft & {
  title: string;
  weekday: number;
  location: string;
};
type Override = Partial<
  Pick<
    ExcelExerciseDraft,
    | "sets"
    | "repsMin"
    | "repsMax"
    | "rest"
    | "rirMin"
    | "rirMax"
    | "warmupNotes"
    | "notes"
  >
> & {
  from: number;
  to: number;
  title: string;
  sourceId: string;
  location: string;
};
function gt1(
  workbook: Workbook,
  startDate: string,
): Pick<
  ExcelProgramDraft,
  "name" | "description" | "weeks" | "sessions" | "warnings"
> {
  const plan = workbook.getWorksheet("PIANO")!,
    program = workbook.getWorksheet("PROGRAMMA");
  if (!program) throw Error("Il modello GT-1 richiede il foglio PROGRAMMA.");
  if (text(plan, 12, 2) !== "GT-1")
    throw Error(
      "Versione del modello Excel non riconosciuta. Usa il modello GT-1.",
    );
  const name = text(plan, 4, 2, true, 200),
    weeks = number(plan, 5, 2, 1, 10000)!;
  const description = join(text(plan, 6, 2), text(plan, 7, 2));
  const cols = headers(program, PROGRAM_HEADERS),
    base: BaseExercise[] = [],
    ids = new Map<string, BaseExercise>();
  const groupOrders = new Map<string, Set<number>>();
  for (let row = 6; row <= sheetRows(program); row++) {
    if (!active(program, row, cols)) continue;
    const sourceId = text(program, row, cols[0], true, 150);
    if (ids.has(sourceId))
      invalid(where(program, row, cols[0]), `ID “${sourceId}” duplicato.`);
    const title = text(program, row, cols[1], true, 200),
      day = weekday(
        text(program, row, cols[2], true),
        where(program, row, cols[2]),
      ),
      order = number(program, row, cols[3], 1, 10000)! - 1;
    const groupKey = title + "|" + day,
      orders = groupOrders.get(groupKey) || new Set<number>();
    if (orders.has(order))
      invalid(
        where(program, row, cols[3]),
        "ordine duplicato nello stesso allenamento.",
      );
    orders.add(order);
    groupOrders.set(groupKey, orders);
    const min = number(program, row, cols[9], 0, 10, false),
      max = number(program, row, cols[10], 0, 10, false);
    const exercise: BaseExercise = {
      sourceId,
      title,
      weekday: day,
      location: where(program, row),
      name: text(program, row, cols[4], true, 200),
      order,
      sets: number(program, row, cols[5], 1, 30)!,
      repsMin: number(program, row, cols[6], 1, 999)!,
      repsMax: number(program, row, cols[7], 1, 999)!,
      rest: number(program, row, cols[8], 0, 7200)!,
      rirMin: min ?? max,
      rirMax: max ?? min,
      warmupNotes: text(program, row, cols[11]) || undefined,
      reference: text(program, row, cols[12]) || undefined,
      loadUnit: text(program, row, cols[13], false, 100) || undefined,
      notes: text(program, row, cols[14]),
    };
    validateExercise(exercise, exercise.location);
    base.push(exercise);
    ids.set(sourceId, exercise);
  }
  if (!base.length)
    throw Error(
      "PROGRAMMA: inserisci almeno un esercizio prima di importare il modello.",
    );
  if (
    groupOrders.size * weeks > MAX_SESSIONS ||
    base.length * weeks > MAX_PRESCRIPTIONS
  )
    throw Error(
      "Il programma supera il limite di 10.000 sedute o 100.000 prescrizioni. Riduci le settimane o dividi il file.",
    );
  const proof = workbook.getWorksheet("PROVA");
  if (proof) {
    const p = headers(proof, PROVA_HEADERS);
    const seen = new Set<string>();
    for (let row = 6; row <= sheetRows(proof); row++) {
      if (!active(proof, row, p)) continue;
      const id = text(proof, row, p[0], true, 150),
        exercise = ids.get(id);
      if (!exercise)
        invalid(where(proof, row, p[0]), `ID “${id}” assente da PROGRAMMA.`);
      if (seen.has(id))
        invalid(where(proof, row, p[0]), `ID prova “${id}” duplicato.`);
      seen.add(id);
      const parts: string[] = [];
      for (let set = 0; set < 3; set++) {
        const kg = number(proof, row, p[1 + set * 2], 0, 3000, false, false),
          reps = number(proof, row, p[2 + set * 2], 1, 999, false);
        if (kg !== undefined || reps !== undefined)
          parts.push(
            `S${set + 1}: ${kg === undefined ? "carico non indicato" : kg + " kg"}${reps === undefined ? "" : " × " + reps}`,
          );
      }
      exercise.reference =
        join(
          exercise.reference,
          parts.length ? "Prova precedente: " + parts.join("; ") : "",
          text(proof, row, p[7]),
        ) || undefined;
    }
  }
  const rules: Override[] = [],
    variations = workbook.getWorksheet("VARIAZIONI");
  if (variations) {
    const v = headers(variations, VAR_HEADERS);
    for (let row = 6; row <= sheetRows(variations); row++) {
      if (!active(variations, row, v)) continue;
      const from = number(variations, row, v[0], 1, weeks)!,
        to = number(variations, row, v[1], 1, weeks)!;
      if (to < from)
        invalid(
          where(variations, row),
          "la settimana finale precede quella iniziale.",
        );
      const title = text(variations, row, v[2], false, 200),
        id = text(variations, row, v[3], false, 150),
        exercise = id ? ids.get(id) : undefined;
      if (id && !exercise)
        invalid(
          where(variations, row, v[3]),
          `ID “${id}” assente da PROGRAMMA.`,
        );
      if (title && !base.some((e) => e.title === title))
        invalid(
          where(variations, row, v[2]),
          `allenamento “${title}” non presente in PROGRAMMA.`,
        );
      if (title && exercise && exercise.title !== title)
        invalid(
          where(variations, row),
          "ID esercizio e allenamento non corrispondono.",
        );
      const rule: Override = {
        from,
        to,
        title,
        sourceId: id,
        location: where(variations, row),
      };
      for (const [index, key, min, max] of [
        [4, "sets", 1, 30],
        [5, "repsMin", 1, 999],
        [6, "repsMax", 1, 999],
        [7, "rest", 0, 7200],
        [8, "rirMin", 0, 10],
        [9, "rirMax", 0, 10],
      ] as const) {
        const value = number(variations, row, v[index], min, max, false);
        if (value !== undefined) rule[key] = value;
      }
      const warmup = text(variations, row, v[10]),
        notes = text(variations, row, v[11]);
      if (warmup) rule.warmupNotes = warmup;
      if (notes) rule.notes = notes;
      if (
        !Object.keys(rule).some(
          (key) =>
            !["from", "to", "title", "sourceId", "location"].includes(key),
        )
      )
        invalid(rule.location, "specifica almeno una variazione.");
      rules.push(rule);
      if (rules.length > 1000) throw Error("VARIAZIONI: troppe regole.");
    }
  }
  const sessions: ExcelSessionDraft[] = [],
    warnings = new Set<string>();
  for (let week = 1; week <= weeks; week++) {
    const groups = new Map<string, ExcelSessionDraft>();
    for (const item of base) {
      const { title, weekday: day, location, ...plain } = item,
        exercise: ExcelExerciseDraft = { ...plain };
      const matches = rules.filter(
        (rule) =>
          week >= rule.from &&
          week <= rule.to &&
          (!rule.title || rule.title === title) &&
          (!rule.sourceId || rule.sourceId === item.sourceId),
      );
      const applied = new Map<string, { value: unknown; location: string }>(),
        noteParts = [plain.notes];
      matches.sort(
        (a, b) =>
          (a.sourceId ? 2 : a.title ? 1 : 0) -
          (b.sourceId ? 2 : b.title ? 1 : 0),
      );
      for (const rule of matches) {
        const priority = rule.sourceId ? 2 : rule.title ? 1 : 0;
        for (const key of [
          "sets",
          "repsMin",
          "repsMax",
          "rest",
          "rirMin",
          "rirMax",
          "warmupNotes",
          "notes",
        ] as const) {
          const value = rule[key];
          if (value === undefined) continue;
          const previous = applied.get(priority + ":" + key);
          if (previous && previous.value !== value)
            invalid(
              rule.location,
              `regola incompatibile con ${previous.location} per ${item.name}, settimana ${week} (${key}).`,
            );
          applied.set(priority + ":" + key, { value, location: rule.location });
          if (key === "notes") noteParts.push(String(value));
          else Object.assign(exercise, { [key]: value });
        }
      }
      exercise.notes = join(...noteParts);
      validateExercise(exercise, `${location}, settimana ${week}`);
      const key = title + "|" + day;
      let session = groups.get(key);
      if (!session) {
        session = {
          week,
          date: offset(startDate, (week - 1) * 7 + ((day + 6) % 7)),
          title,
          weekday: day,
          phase: `Settimana ${week}`,
          notes: description,
          exercises: [],
        };
        groups.set(key, session);
      }
      if (/rientro/i.test(exercise.notes)) session.phase = "Rientro";
      session.exercises.push(exercise);
      if (exercise.loadUnit === "Da verificare")
        warnings.add(
          `${exercise.name}: verifica l’unità del carico prima di confrontare i pesi.`,
        );
    }
    for (const session of groups.values()) {
      session.exercises.sort((a, b) => a.order - b.order);
      sessions.push(session);
    }
  }
  return { name, description, weeks, sessions, warnings: [...warnings] };
}

function original(
  workbook: Workbook,
  startDate: string,
): Pick<
  ExcelProgramDraft,
  "name" | "description" | "weeks" | "sessions" | "warnings"
> {
  const readme = workbook.getWorksheet("LEGGIMI");
  if (!readme)
    throw Error(
      "Formato Excel non riconosciuto. Usa il modello GT-1 oppure la scheda originale con il foglio LEGGIMI.",
    );
  const title = text(readme, 1, 1, true, 200),
    parts: string[] = [],
    phases: { from: number; to: number; notes: string }[] = [];
  for (let row = 4; row <= sheetRows(readme); row++) {
    const label = text(readme, row, 1),
      value = text(readme, row, 2);
    if (!value) continue;
    if (/^(obiettivo|durata seduta|attenzione|\d+\s*[•·-])/i.test(label))
      parts.push(label + ": " + value);
    const match = /^settimane?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(label);
    if (match)
      phases.push({
        from: Number(match[1]),
        to: Number(match[2] || match[1]),
        notes: value,
      });
  }
  const description = join(...parts),
    sessions: ExcelSessionDraft[] = [],
    warnings = new Set<string>();
  const sheets = workbook.worksheets.filter(
    (sheet) =>
      norm(text(sheet, 5, 1)) === "sett" &&
      norm(text(sheet, 5, 3)) === "esercizio",
  );
  if (!sheets.length)
    throw Error(
      "Non sono stati trovati fogli di allenamento con le intestazioni della scheda originale.",
    );
  let sourceMonday = "",
    weeks = 0;
  const sourceDates = new Map<ExcelSessionDraft, string>();
  for (const [sheetIndex, sheet] of sheets.entries()) {
    headers(sheet, [
      "Sett.",
      "Data",
      "Esercizio",
      "Serie target",
      "Rep min",
      "Rep max",
      "Riposo sec",
      "Riscaldamento",
      "RIR target",
    ]);
    const guide = new Map<string, string>();
    for (let row = 6; row <= sheetRows(sheet); row++) {
      const name = text(sheet, row, 18),
        value = text(sheet, row, 19);
      if (name && value) guide.set(norm(name), value);
    }
    const byWeek = new Map<number, ExcelSessionDraft>(),
      sourceIds = new Map<string, string>(),
      occurrences = new Map<string, number>();
    for (let row = 6; row <= sheetRows(sheet); row++) {
      if (!active(sheet, row, [1, 2, 3, 4, 5, 6, 7, 8, 9])) continue;
      const week = number(sheet, row, 1, 1, 10000)!,
        date = sourceDate(sheet, row, 2),
        day = isoDate(date).getUTCDay(),
        name = text(sheet, row, 3, true, 200),
        key = week + "|" + norm(name),
        count = (occurrences.get(key) || 0) + 1;
      occurrences.set(key, count);
      const stable = norm(name) + "|" + count;
      if (!sourceIds.has(stable))
        sourceIds.set(stable, `O${sheetIndex + 1}-E${sourceIds.size + 1}`);
      const reference = guide.get(norm(name));
      const exercise: ExcelExerciseDraft = {
        sourceId: sourceIds.get(stable)!,
        name,
        order: byWeek.get(week)?.exercises.length || 0,
        sets: number(sheet, row, 4, 1, 30)!,
        repsMin: number(sheet, row, 5, 1, 999)!,
        repsMax: number(sheet, row, 6, 1, 999)!,
        rest: number(sheet, row, 7, 0, 7200)!,
        warmupNotes: text(sheet, row, 8) || undefined,
        ...rir(sheet, row, 9),
        reference,
        loadUnit: loadUnit(reference || ""),
        notes: "",
      };
      validateExercise(exercise, where(sheet, row));
      let session = byWeek.get(week);
      if (!session) {
        const phase = phases.find((p) => week >= p.from && week <= p.to),
          notes = phase?.notes || "";
        session = {
          week,
          date: offset(startDate, (week - 1) * 7 + ((day + 6) % 7)),
          title: sheet.name,
          weekday: day,
          phase: /rientro/i.test(notes)
            ? "Rientro"
            : notes
              ? "Progressione"
              : `Settimana ${week}`,
          notes: join(description, notes),
          exercises: [],
        };
        byWeek.set(week, session);
        sourceDates.set(session, date);
      } else if (sourceDates.get(session) !== date)
        invalid(
          where(sheet, row, 2),
          "gli esercizi della stessa seduta devono avere la stessa data.",
        );
      session.exercises.push(exercise);
      weeks = Math.max(weeks, week);
      if (exercise.loadUnit === "Da verificare")
        warnings.add(`${name}: ${reference}`);
      const monday = offset(date, -((day + 6) % 7) - (week - 1) * 7);
      if (!sourceMonday) sourceMonday = monday;
      else if (sourceMonday !== monday)
        invalid(
          where(sheet, row, 2),
          "data non coerente con la settimana indicata e con gli altri fogli.",
        );
    }
    if (!byWeek.size) invalid(sheet.name, "nessun esercizio da importare.");
    sessions.push(...byWeek.values());
  }
  const declared = /\b(\d+)\s+settimane\b/i.exec(title);
  if (declared && Number(declared[1]) !== weeks)
    throw Error(
      `LEGGIMI indica ${declared[1]} settimane, ma gli allenamenti arrivano alla settimana ${weeks}.`,
    );
  for (const sheet of sheets)
    for (let week = 1; week <= weeks; week++)
      if (!sessions.some((s) => s.title === sheet.name && s.week === week))
        invalid(sheet.name, `allenamento della settimana ${week} mancante.`);
  const prova = workbook.getWorksheet("SETTIMANA PROVA");
  if (prova) {
    const refs = new Map<string, string>();
    for (let row = 2; row <= sheetRows(prova); row++) {
      const sessionTitle = text(prova, row, 1),
        name = text(prova, row, 2);
      if (!sessionTitle && !name) continue;
      if (!name) invalid(where(prova, row, 2), "nome esercizio mancante.");
      const parts: string[] = [];
      for (let set = 0; set < 3; set++) {
        const kg = text(prova, row, 3 + set * 2),
          reps = text(prova, row, 4 + set * 2);
        if (kg || reps)
          parts.push(
            `S${set + 1}: ${kg ? kg + " kg" : "carico non indicato"}${reps ? " × " + reps : ""}`,
          );
      }
      if (parts.length)
        refs.set(
          norm(sessionTitle) + "|" + norm(name),
          "Prova precedente: " + parts.join("; "),
        );
    }
    for (const session of sessions)
      for (const exercise of session.exercises)
        exercise.reference =
          join(
            exercise.reference,
            refs.get(norm(session.title) + "|" + norm(exercise.name)),
          ) || undefined;
  }
  if (sessions.some((s) => s.exercises.some((e) => e.sets > 3)))
    warnings.add(
      "Alcuni esercizi prevedono più di 3 serie: verranno create tutte le serie target, anche se il foglio offre solo tre colonne per registrarle.",
    );
  warnings.add(
    "La settimana di prova è usata solo come riferimento: non vengono creati allenamenti già completati.",
  );
  return { name: title, description, weeks, sessions, warnings: [...warnings] };
}

/** Read locally. This function never mutates Store, archives, calendar or account data. */
export async function parseWorkoutExcel(
  file: File,
  startDate: string,
): Promise<ExcelProgramDraft> {
  const start = isoDate(startDate);
  if (start.getUTCDay() !== 1)
    throw Error(
      `Scegli un lunedì come data di inizio per mantenere i giorni del programma. La data scelta è ${DAY_NAMES[start.getUTCDay()].toLowerCase()}.`,
    );
  if (!file || !/\.xlsx$/i.test(file.name))
    throw Error("Seleziona un file Excel .xlsx.");
  if (file.name.length > 255)
    throw Error(
      "Il nome del file è troppo lungo: rinominalo prima di importarlo.",
    );
  if (!file.size || file.size > MAX_FILE_BYTES)
    throw Error("Il file Excel deve essere leggibile e non superare 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  inspectContainer(bytes);
  const workbook = await readWorkoutWorkbook(bytes);
  if (workbook.worksheets.length > 50)
    throw Error("Il file contiene troppi fogli.");
  const sourceKind = workbook.getWorksheet("PIANO") ? "GT-1" : "original";
  const result =
    sourceKind === "GT-1"
      ? gt1(workbook, startDate)
      : original(workbook, startDate);
  if (
    result.description.length > 10000 ||
    result.sessions.some((session) => session.notes.length > 10000)
  )
    throw Error(
      "Le note generali del programma superano 10.000 caratteri. Riducile prima di importare.",
    );
  if (
    result.sessions.length > MAX_SESSIONS ||
    result.sessions.reduce((n, s) => n + s.exercises.length, 0) >
      MAX_PRESCRIPTIONS
  )
    throw Error("Il programma contiene troppe sedute o prescrizioni.");
  if (!result.sessions.length)
    throw Error("Il file non contiene sedute programmabili.");
  const dates = new Map<string, string>();
  for (const session of result.sessions) {
    const previous = dates.get(session.date);
    if (previous)
      throw Error(
        `Nel file ci sono due allenamenti il ${session.date}: “${previous}” e “${session.title}”. Correggi la sovrapposizione prima di importare.`,
      );
    dates.set(session.date, session.title);
  }
  result.sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
  const hash = await crypto.subtle.digest("SHA-256", bytes),
    fileHash = [...new Uint8Array(hash)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  return {
    ...result,
    startDate,
    endDate: result.sessions.at(-1)!.date,
    sourceName: file.name,
    sourceKind,
    fileHash,
  };
}
