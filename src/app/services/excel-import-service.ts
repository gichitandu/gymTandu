import { inject, Injectable, signal } from "@angular/core";
import { AuthService } from "./auth";
import { Store } from "./store";
import { ArchiveSyncService } from "./archive-sync";
import { ExcelProgramDraft } from "../models/excel-import";

export const EXCEL_FILE_LIMIT = 10 * 1024 * 1024;
export interface ExcelImportEntry {
  id: string;
  planId: string;
  sourceName: string;
  fileHash: string;
  planName: string;
  startDate: string;
  endDate: string;
  weeks: number;
  importedAt: number;
  confirmedAt?: number;
  status: "active" | "completed" | "unavailable";
}
interface CachedExcel extends ExcelImportEntry {
  key: string;
  accountId: string;
  file: Blob;
  pending: boolean;
}
const CACHE_DB = "gymtrack-excel-files-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(Error("Il dispositivo non consente di conservare il file Excel."));
      return;
    }
    const job = indexedDB.open(CACHE_DB, 1);
    job.onupgradeneeded = () => {
      if (!job.result.objectStoreNames.contains("files")) {
        const store = job.result.createObjectStore("files", { keyPath: "key" });
        store.createIndex("accountId", "accountId");
      }
    };
    job.onsuccess = () => resolve(job.result);
    job.onerror = () =>
      reject(job.error || Error("Archivio Excel non disponibile."));
    job.onblocked = () =>
      reject(Error("Archivio Excel occupato da un’altra finestra."));
  });
}
async function cacheRead(accountId: string): Promise<CachedExcel[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly"),
      job = tx.objectStore("files").index("accountId").getAll(accountId);
    let rows: CachedExcel[] = [];
    job.onsuccess = () => (rows = job.result);
    tx.oncomplete = () => {
      db.close();
      resolve(rows);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || Error("Lettura file non riuscita."));
    };
  });
}
async function cachePut(record: CachedExcel) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || Error("Salvataggio file non riuscito."));
    };
  });
}
async function fileBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function sha256(value: string | ArrayBuffer) {
  const buffer =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function excelImportIdentity(
  accountId: string,
  fileHash: string,
  startDate: string,
) {
  return (
    "excel-" + (await sha256(accountId + "\n" + fileHash + "\n" + startDate))
  );
}
function publicEntry(row: CachedExcel): ExcelImportEntry {
  const { key, accountId, file, pending, ...entry } = row;
  return entry;
}

@Injectable({ providedIn: "root" })
export class ExcelImportService {
  private auth = inject(AuthService);
  private store = inject(Store);
  private cloud = inject(ArchiveSyncService);
  readonly files = signal<ExcelImportEntry[]>([]);
  readonly pending = signal<ExcelImportEntry[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly notice = signal("");
  private loadGeneration = 0;
  private syncJob?: Promise<void>;
  private committing = false;
  private disposed = false;
  private retry = () => {
    if (!this.disposed && this.online()) void this.completePending();
  };
  private visible = () => {
    if (document.visibilityState === "visible") this.retry();
  };
  constructor() {
    if (typeof window !== "undefined")
      window.addEventListener("online", this.retry);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", this.visible);
  }
  private online() {
    return (
      navigator.onLine !== false &&
      !this.auth.offlineMode() &&
      !!this.auth.user()
    );
  }
  private current(accountId: string) {
    return !this.disposed && this.auth.user()?.id === accountId;
  }
  private planFor(id: string) {
    return this.store
      .data()
      .plans.find((plan) => plan.program?.importId === id);
  }
  private async records(accountId: string) {
    const records = await cacheRead(accountId);
    return records.map((record) => {
      const plan = this.planFor(record.id);
      return plan
        ? {
            ...record,
            planId: plan.id,
            planName: plan.name,
            status: plan.completedAt
              ? ("completed" as const)
              : ("active" as const),
          }
        : { ...record, status: "unavailable" as const };
    });
  }
  async load() {
    const user = this.auth.user();
    if (!user) {
      this.files.set([]);
      this.pending.set([]);
      return;
    }
    const accountId = user.id,
      generation = ++this.loadGeneration;
    this.loading.set(true);
    this.notice.set("");
    try {
      let cached: CachedExcel[] = [];
      try {
        cached = await this.records(accountId);
      } catch {
        /* Server files remain accessible when device caching is restricted. */
      }
      if (!this.current(accountId) || generation !== this.loadGeneration)
        return;
      this.files.set(
        cached
          .filter((row) => !row.pending)
          .map(publicEntry)
          .sort((a, b) => b.importedAt - a.importedAt),
      );
      this.pending.set(
        cached
          .filter((row) => row.pending && this.planFor(row.id))
          .map(publicEntry),
      );
      if (!this.online()) return;
      const response = await this.auth.request("excel-imports");
      if (!this.current(accountId) || generation !== this.loadGeneration)
        return;
      const remote = (
        Array.isArray(response) ? response : response.imports
      ) as ExcelImportEntry[];
      if (!Array.isArray(remote))
        throw Error("Archivio Excel non leggibile. Riprova.");
      const merged = new Map(this.files().map((row) => [row.id, row]));
      for (const row of remote) {
        if (
          !row ||
          typeof row.id !== "string" ||
          typeof row.planId !== "string" ||
          typeof row.sourceName !== "string"
        )
          continue;
        merged.set(row.id, row);
        const local = cached.find((record) => record.id === row.id);
        if (local) await cachePut({ ...local, ...row, pending: false });
      }
      if (this.current(accountId) && generation === this.loadGeneration) {
        this.files.set(
          [...merged.values()].sort((a, b) => b.importedAt - a.importedAt),
        );
        this.pending.set(
          this.pending().filter(
            (row) => !remote.some((record) => record.id === row.id),
          ),
        );
      }
    } catch (error) {
      if (this.current(accountId) && generation === this.loadGeneration)
        this.notice.set(
          error instanceof Error
            ? error.message
            : "Collegamento all’archivio Excel non riuscito.",
        );
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }
  async import(
    draft: ExcelProgramDraft,
    file: File,
    matches?: Record<string, string>,
  ): Promise<{ planId: string; synced: boolean }> {
    if (this.committing) throw Error("Importazione già in corso.");
    const account = this.auth.user();
    if (!account) throw Error("Accedi al tuo account prima di importare.");
    if (!this.online())
      throw Error(
        "Collegati per confermare il piano e verificare le sovrapposizioni con la copia online.",
      );
    if (file.size > EXCEL_FILE_LIMIT)
      throw Error("Il file supera il limite di 10 MB.");
    if (!draft.startDate) throw Error("Scegli prima la data di inizio.");
    this.committing = true;
    this.notice.set("");
    try {
      const accountId = account.id,
        id = await excelImportIdentity(
          accountId,
          draft.fileHash,
          draft.startDate,
        );
      if (!this.current(accountId))
        throw Error("Accesso cambiato. Riapri l’importazione.");
      let old: CachedExcel | undefined;
      try {
        old = (await cacheRead(accountId)).find((row) => row.id === id);
      } catch {}
      const existing = this.planFor(id);
      if (!existing && this.online() && !(await this.cloud.flush()))
        throw Error(
          "La copia online deve essere aggiornata prima di controllare le sovrapposizioni. Risolvi la sincronizzazione e riprova.",
        );
      if (!this.current(accountId))
        throw Error("Accesso cambiato. Riapri l’importazione.");
      const conflicts = existing ? [] : this.store.excelProgramConflicts(draft);
      if (conflicts.length)
        throw Error("Importazione bloccata: " + conflicts.join(" "));
      // Keep the original durable before committing a real plan. A prepared file is
      // hidden until its plan exists and server confirmation succeeds.
      let record: CachedExcel = old || {
        key: accountId + "|" + id,
        accountId,
        id,
        planId: "excel-plan-" + id,
        sourceName: draft.sourceName,
        fileHash: draft.fileHash,
        planName: draft.name,
        startDate: draft.startDate,
        endDate: draft.endDate,
        weeks: draft.weeks,
        importedAt: Date.now(),
        status: "active",
        file,
        pending: true,
      };
      record = { ...record, planId: existing?.id || "excel-plan-" + id };
      await cachePut(record);
      // The server checks its latest snapshot before a local plan is created.
      // A rejected preflight only leaves a hidden prepared source on this device.
      try {
        await this.stageRecord(record);
      } catch (error) {
        if (
          existing &&
          record.pending &&
          (error as { code?: string })?.code === "PLAN_OVERLAP"
        )
          await this.store.removeUnconfirmedExcelImport(record.id);
        throw error;
      }
      if (!this.current(accountId))
        throw Error("Accesso cambiato. Riapri l’importazione.");
      const importDraft =
        record.sourceName === draft.sourceName
          ? draft
          : { ...draft, sourceName: record.sourceName };
      const planId =
        existing?.id ||
        (await this.store.importExcelProgram(importDraft, id, matches));
      if (!planId)
        throw Error(
          this.store.error() ||
            "Importazione non riuscita. Nessun allenamento aggiunto.",
        );
      record = { ...record, planId, pending: record.pending || !existing };
      try {
        await cachePut(record);
      } catch {
        this.notice.set(
          "Piano salvato. Il file originale è conservato e verrà ricollegato alla prossima sincronizzazione.",
        );
      }
      const synced = await this.syncRecord(record, true);
      await this.load();
      return { planId, synced };
    } finally {
      this.committing = false;
    }
  }
  private async json(path: string, body: unknown, timeout = 15000) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch("/api/" + path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let value: any;
      try {
        value = await response.json();
      } catch {
        throw Error("Archivio Excel momentaneamente non disponibile.");
      }
      if (!response.ok)
        throw Object.assign(
          Error(value?.error || "Salvataggio Excel non riuscito."),
          { status: response.status, code: value?.code },
        );
      return value;
    } finally {
      clearTimeout(timer);
    }
  }
  private async stageRecord(record: CachedExcel) {
    const fileBase64Value = await fileBase64(record.file);
    if (!this.current(record.accountId) || !this.online())
      throw Error(
        "Collegati per verificare e salvare il file nel tuo account.",
      );
    return this.json(
      "excel-imports",
      {
        id: record.id,
        planId: record.planId,
        sourceName: record.sourceName,
        fileHash: record.fileHash,
        fileBase64: fileBase64Value,
        planName: this.planFor(record.id)?.name || record.planName,
        startDate: record.startDate,
        endDate: record.endDate,
        weeks: record.weeks,
      },
      60000,
    );
  }
  private async syncRecord(
    record: CachedExcel,
    alreadyStaged = false,
  ): Promise<boolean> {
    if (!record.pending) return true;
    const accountId = record.accountId;
    if (!this.current(accountId) || !this.online()) return false;
    const plan = this.planFor(record.id);
    if (!plan) return false;
    try {
      if (!alreadyStaged) await this.stageRecord(record);
      if (!this.current(accountId) || !this.online()) return false;
      const saved = await this.cloud.flush();
      // An explicit server overlap is different from an ambiguous save timeout:
      // recheck after a conflict so only that narrowly confirmed rejection rolls back.
      if (
        !saved &&
        this.cloud.status?.() !== "conflict" &&
        this.cloud.lastErrorCode?.() !== "PLAN_OVERLAP"
      )
        return false;
      if (!this.current(accountId)) return false;
      await this.json(
        "excel-imports/" + encodeURIComponent(record.id) + "/confirm",
        { planId: plan.id },
      );
      if (!this.current(accountId)) return false;
      await cachePut({
        ...record,
        planId: plan.id,
        pending: false,
        confirmedAt: Date.now(),
      });
      return true;
    } catch (error) {
      if (
        this.current(accountId) &&
        (error as { code?: string })?.code === "PLAN_OVERLAP"
      ) {
        await this.store.removeUnconfirmedExcelImport(record.id);
        await this.load();
        throw error;
      }
      if (this.current(accountId))
        this.notice.set(
          "Piano salvato sul dispositivo. Il file resta da sincronizzare: " +
            (error instanceof Error
              ? error.message
              : "riprova quando torna la connessione."),
        );
      return false;
    }
  }
  completePending(): Promise<void> {
    if (this.syncJob) return this.syncJob;
    const user = this.auth.user();
    if (!user || !this.online()) return Promise.resolve();
    const accountId = user.id;
    this.syncing.set(true);
    let job!: Promise<void>;
    job = (async () => {
      try {
        for (const row of await this.records(accountId)) {
          if (!this.current(accountId)) return;
          if (row.pending && this.planFor(row.id)) await this.syncRecord(row);
        }
        await this.load();
      } catch (error) {
        if (this.current(accountId))
          this.notice.set(
            error instanceof Error
              ? error.message
              : "Sincronizzazione Excel non riuscita.",
          );
      } finally {
        this.syncing.set(false);
        if (this.syncJob === job) this.syncJob = undefined;
      }
    })();
    this.syncJob = job;
    return job;
  }
  async download(entry: ExcelImportEntry) {
    const user = this.auth.user();
    if (!user) throw Error("Accedi per scaricare il file.");
    const accountId = user.id;
    let cached: CachedExcel | undefined;
    try {
      cached = (await cacheRead(accountId)).find(
        (row) => row.id === entry.id && !row.pending,
      );
    } catch {}
    let file = cached?.file;
    if (!file) {
      if (!this.online())
        throw Error(
          "Collegati a Internet per scaricare questo Excel sul dispositivo.",
        );
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(
          "/api/excel-imports/" + encodeURIComponent(entry.id) + "/file",
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          let message = "Download non riuscito.";
          try {
            message = (await response.json()).error || message;
          } catch {}
          throw Error(message);
        }
        file = await response.blob();
      } finally {
        clearTimeout(timer);
      }
      if (
        file.size > EXCEL_FILE_LIMIT ||
        (await sha256(await file.arrayBuffer())) !== entry.fileHash
      )
        throw Error("Il file scaricato non ha superato la verifica. Riprova.");
      if (!this.current(accountId)) throw Error("Accesso cambiato.");
      try {
        await cachePut({
          ...entry,
          key: accountId + "|" + entry.id,
          accountId,
          file,
          pending: false,
        });
      } catch {
        /* Download can still finish without retaining another device copy. */
      }
    }
    if (!this.current(accountId)) throw Error("Accesso cambiato.");
    const filename = entry.sourceName
        .replace(/[\\/:*?"<>|]/g, "_")
        .slice(0, 180),
      url = URL.createObjectURL(file),
      link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  ngOnDestroy() {
    this.disposed = true;
    this.loadGeneration++;
    if (typeof window !== "undefined")
      window.removeEventListener("online", this.retry);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", this.visible);
  }
}
