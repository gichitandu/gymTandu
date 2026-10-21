import { validateIntegrity } from "../services/integrity";
import Dexie, { Table } from "dexie";
import { DataSet, Entity, TABLES } from "../models/domain";
export class GymDatabase extends Dexie {
  constructor(name = "gymtrack-v1") {
    super(name);
    this.version(1).stores({
      profiles: "id,role",
      roles: "id,&name",
      plans: "id,userId,active,archived",
      days: "id,planId,order",
      planExercises: "id,dayId,exerciseId",
      exercises: "id,name,muscleGroupId,equipment,active",
      muscleGroups: "id,&name",
      workouts: "id,userId,planId,dayId,date,status",
      workoutExercises: "id,workoutId,exerciseId",
      sets: "id,workoutExerciseId",
      settings: "id",
    });
    this.version(2).stores({meals: "id,date,name"});
  }
  entity<K extends keyof DataSet>(name: K): Table<DataSet[K][number], string> {
    return this.table(name);
  }
  async snapshot(): Promise<DataSet> {
    return this.transaction(
      "r",
      TABLES.map((n) => this.table(n)),
      async () =>
        Object.fromEntries(
          await Promise.all(
            TABLES.map(async (n) => [n, await this.table(n).toArray()]),
          ),
        ),
    ) as Promise<DataSet>;
  }
  async replace(data: DataSet): Promise<void> {
    validateIntegrity(data);
    await this.transaction(
      "rw",
      TABLES.map((n) => this.table(n)),
      async () => {
        for (const name of TABLES) {
          await this.table<Entity, string>(name).clear();
          await this.table(name).bulkPut(data[name]);
        }
      },
    );
  }
}
