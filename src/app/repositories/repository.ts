import { InjectionToken } from "@angular/core";
import { DataSet } from "../models/domain";
import { GymDatabase } from "../core/database";
export interface GymRepository {
  read(): Promise<DataSet>;
  replace(data: DataSet): Promise<void>;
}
export class IndexedDbRepository implements GymRepository {
  readonly db = new GymDatabase();
  read() {
    return this.db.snapshot();
  }
  replace(data: DataSet) {
    return this.db.replace(data);
  }
}
export const GYM_REPOSITORY = new InjectionToken<GymRepository>(
  "GYM_REPOSITORY",
  { providedIn: "root", factory: () => new IndexedDbRepository() },
);
