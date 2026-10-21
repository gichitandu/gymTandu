import { AuthService } from "../services/auth";
import { inject, InjectionToken } from "@angular/core";
import { DataSet } from "../models/domain";
import { GymDatabase } from "../core/database";
export interface GymRepository {
  storageKey?: string;
  read(): Promise<DataSet>;
  replace(data: DataSet): Promise<void>;
}
export class IndexedDbRepository implements GymRepository {
  readonly db: GymDatabase;
  readonly storageKey:string;
  constructor(name = "gymtrack-v1") { this.storageKey=name;this.db = new GymDatabase(name); }
  read() {
    return this.db.snapshot();
  }
  replace(data: DataSet) {
    return this.db.replace(data);
  }
}
export const GYM_REPOSITORY = new InjectionToken<GymRepository>(
  "GYM_REPOSITORY",
  { providedIn: "root", factory: () => { const u = inject(AuthService).user(); if (!u) throw new Error("Accedi prima di aprire l’archivio."); return new IndexedDbRepository(u.owner ? "gymtrack-v1" : "gymtrack-user-" + u.id); } },
);
