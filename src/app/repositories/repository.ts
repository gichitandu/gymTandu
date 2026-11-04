import { AuthService } from "../services/auth";
import { inject, InjectionToken } from "@angular/core";
import { DataSet } from "../models/domain";
import { GymDatabase, LocalArchiveCheckpoint } from "../core/database";
export interface GymRepository {
  storageKey?: string;
  revision?(): number | undefined;
  read(): Promise<DataSet>;
  replace(data: DataSet): Promise<void>;
  checkpoint?(kind: string): Promise<string>;
  recoverySnapshots?(): Promise<LocalArchiveCheckpoint[]>;
}
export class IndexedDbRepository implements GymRepository {
  readonly db: GymDatabase;
  readonly storageKey:string;
  constructor(name = "gymtrack-v1") { this.storageKey=name;this.db = new GymDatabase(name); }
  read() {
    return this.db.snapshot();
  }
  revision(){return this.db.currentRevision();}
  replace(data: DataSet) {
    return this.db.replace(data);
  }
  checkpoint(kind: string) {return this.db.checkpoint(kind);}
  recoverySnapshots() {return this.db.recoverySnapshots();}
}
export const GYM_REPOSITORY = new InjectionToken<GymRepository>(
  "GYM_REPOSITORY",
  { providedIn: "root", factory: () => { const u = inject(AuthService).user(); if (!u) throw new Error("Accedi prima di aprire l’archivio."); return new IndexedDbRepository(u.owner ? "gymtrack-v1" : "gymtrack-user-" + u.id); } },
);
