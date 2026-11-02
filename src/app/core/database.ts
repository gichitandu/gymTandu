import { defaultExercises, defaultGroups } from "./default-catalog";
import { clearLegacyYoutube } from "./catalog-upgrade";
import { validateIntegrity } from "../services/integrity";
import Dexie, { Table } from "dexie";
import { DataSet, Entity, TABLES } from "../models/domain";
export class ArchiveConflictError extends Error {
  constructor(){super('L’archivio è stato aggiornato in un’altra finestra. Riapri l’app per caricare i dati più recenti prima di salvare. Nessun dato è stato sovrascritto.');this.name='ArchiveConflictError';}
}
export class GymDatabase extends Dexie {
  private revision: number | undefined;
  currentRevision(){return this.revision;}
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
    this.version(3).stores({scheduledWorkouts:"id,date,dayId,workoutId",measurements:"id,&date"});
    this.version(4).stores({}).upgrade(async tx=>{
      const exercises=tx.table('exercises');
      await exercises.toCollection().modify(e=>{clearLegacyYoutube(e);});
      const ids=new Set(await exercises.toCollection().primaryKeys());
      const groups=new Set(await tx.table('muscleGroups').toCollection().primaryKeys());
      await tx.table('muscleGroups').bulkPut(defaultGroups.filter(g=>!groups.has(g.id)));
      await exercises.bulkPut(defaultExercises.filter(e=>e.id.startsWith('variant-')&&!ids.has(e.id)));
    });
    this.version(5).stores({}).upgrade(async tx=>{
      const exercises=tx.table('exercises');
      const ids=new Set(await exercises.toCollection().primaryKeys());
      await exercises.bulkPut(defaultExercises.filter(e=>e.id.startsWith('variant-v2-')&&!ids.has(e.id)));
      const known=new Map(defaultExercises.map(e=>[e.id,e]));
      const families=new Set(['Lat machine','Chest press','Croci ai cavi','Bicipiti','Tricipiti','Avambracci']);
      await exercises.toCollection().modify(e=>{
        const tags=known.get(e.id)?.tags.filter(t=>families.has(t))||[];
        if(tags.length)e.tags=[...new Set([...(e.tags||[]),...tags])];
      });
    });
    this.version(6).stores({exercisePreferences:'id',workoutUi:'id'});
    // App releases add stores/indexes without replacing the user's archive.
    this.version(7).stores({archiveMeta:'id'});
    this.version(8).stores({wellnessLogs:'id,&date'});
  }
  entity<K extends keyof DataSet>(name: K): Table<DataSet[K][number], string> {
    return this.table(name);
  }
  async snapshot(): Promise<DataSet> {
    return this.transaction(
      "r",
      [...TABLES.map((n) => this.table(n)), this.table('archiveMeta')],
      async () => {
        this.revision = (await this.table('archiveMeta').get('revision'))?.value ?? 0;
        return Object.fromEntries(
          await Promise.all(
            TABLES.map(async (n) => [n, await this.table(n).toArray()]),
          ),
        );
      },
    ) as Promise<DataSet>;
  }
  async replace(data: DataSet): Promise<void> {
    validateIntegrity(data);
    const expectedRevision = this.revision ?? 0;
    const nextRevision = await this.transaction(
      "rw",
      [...TABLES.map((n) => this.table(n)), this.table('archiveMeta')],
      async () => {
        const revision = (await this.table('archiveMeta').get('revision'))?.value ?? 0;
        if (revision !== expectedRevision)
          throw new ArchiveConflictError();
        for (const name of TABLES) {
          await this.table<Entity, string>(name).clear();
          await this.table(name).bulkPut(data[name]);
        }
        await this.table('archiveMeta').put({id:'revision',value:revision + 1});
        return revision + 1;
      },
    );
    this.revision = nextRevision;
  }
}
