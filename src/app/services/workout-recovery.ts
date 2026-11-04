import {inject, Injectable, signal} from '@angular/core';
import {DataSet} from '../models/domain';
import {Store} from './store';
import {AuthService} from './auth';
import {ArchiveSyncService} from './archive-sync';
import {allowedArchiveNames, readExistingArchive} from './archive-recovery';
import {recoverWorkout, workoutGraph, workoutSignature} from './workout-safety';
import {validateIntegrity} from './integrity';

export interface WorkoutRecoveryCandidate {
  key: string; workoutId: string; date: string; dayName: string; planName: string; source: string;
  completed: number; warmups: number; finished: boolean; currentCompleted: number;
  exercises: {name: string; sets: {number: number; weight: number; reps: number; completed: boolean; kind?: string}[]}[];
}
@Injectable({providedIn: 'root'})
export class WorkoutRecoveryService {
  private store = inject(Store); private auth = inject(AuthService); private cloud = inject(ArchiveSyncService, {optional: true});
  readonly busy = signal(false); readonly candidates = signal<WorkoutRecoveryCandidate[]>([]); readonly message = signal(''); readonly searched = signal(false);
  private sources = new Map<string, {data: DataSet; workoutId: string; currentGraph: string}>();
  private archive = ''; private actor = '';
  async scan(date: string, imported?: DataSet) {
    if (this.busy() || !this.auth.canManageBackups() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    this.busy.set(true); this.message.set('Cerco le serie nelle copie locali e nelle versioni server…'); this.searched.set(false); this.candidates.set([]); this.sources.clear();
    this.archive = this.store.archiveKey(); this.actor = this.auth.user()!.id;
    const seen = new Set<string>(), candidates: WorkoutRecoveryCandidate[] = [];
    let checked = 0, failures = 0;
    const add = (data: DataSet, source: string) => {
      if (this.archive !== this.store.archiveKey() || this.actor !== this.auth.user()?.id) return;
      const reset = this.store.settings().archiveResetId;
      if (reset && data.settings[0].archiveResetId && reset !== data.settings[0].archiveResetId) return;
      for (const workout of data.workouts.filter(row => row.date === date)) {
        const graph = workoutGraph(data, workout.id), current = workoutGraph(this.store.data(), workout.id), signature = workoutSignature(data, workout.id);
        if (workout.status !== 'completed' && !graph.sets.some(row => row.completed) || signature === workoutSignature(this.store.data(), workout.id) || seen.has(signature)) continue;
        seen.add(signature); const key = crypto.randomUUID();
        this.sources.set(key, {data, workoutId: workout.id, currentGraph: workoutSignature(this.store.data(), workout.id)});
        candidates.push({key, workoutId: workout.id, date: workout.date, dayName: workout.dayName, planName: workout.planName, source,
          completed: graph.sets.filter(row => row.completed && row.kind !== 'warmup').length, warmups: graph.sets.filter(row => row.completed && row.kind === 'warmup').length,
          finished: workout.status === 'completed', currentCompleted: current.sets.filter(row => row.completed && row.kind !== 'warmup').length,
          exercises: graph.exercises.sort((a,b) => a.order - b.order).map(exercise => ({name: exercise.name, sets: graph.sets.filter(row => row.workoutExerciseId === exercise.id).sort((a,b) => a.number - b.number)}))});
      }
    };
    try {
      await this.store.settled();
      if (imported) {add(imported, 'Backup selezionato da File'); checked++;}
      for (const snapshot of await this.store.recoverySnapshots()) {add(snapshot.data, 'Copia sul dispositivo · ' + new Date(snapshot.createdAt).toLocaleString('it-IT')); checked++;}
      for (const name of allowedArchiveNames(this.auth.user(), this.auth.platformOwner()).filter(name => name !== this.archive)) {
        try {const data = await readExistingArchive(name); if (data) {add(data, 'Altro archivio presente su questo dispositivo'); checked++;}} catch {failures++;}
      }
      if (this.cloud?.currentScope() && navigator.onLine !== false) {
        try {
          const versions = await this.cloud.history(date);
          const selected = versions.slice(0, 40);
          for (const version of selected) {
            try {add(await this.cloud.readVersion(version.revision), 'Copia server ' + version.revision + ' · ' + new Date(version.updatedAt).toLocaleString('it-IT')); checked++;}
            catch {failures++;}
          }
        } catch {failures++;}
      }
      if (this.archive !== this.store.archiveKey() || this.actor !== this.auth.user()?.id) {this.sources.clear();return;}
      this.candidates.set(candidates.sort((a,b) => b.completed - a.completed || Number(b.finished) - Number(a.finished) || b.warmups - a.warmups));
      this.searched.set(true);
      this.message.set(`${checked} copie controllate. ${candidates.length ? 'Controlla i carichi e scegli la seduta da recuperare.' : 'Non ho trovato progressi diversi da quelli attuali per questa data. Controlla anche la data e l’icona iPhone usata per registrare.'}${failures ? ' Alcune copie non sono raggiungibili: riprova online.' : ''}`);
    } catch(error) {this.message.set(error instanceof Error ? error.message : 'Ricerca non completata. Nessun dato modificato.');}
    finally {this.busy.set(false);}
  }
  async recover(key: string): Promise<boolean> {
    const source = this.sources.get(key);
    if (!source || this.busy() || !this.auth.canManageBackups() || this.archive !== this.store.archiveKey() || this.actor !== this.auth.user()?.id) return false;
    this.busy.set(true);
    try {
      await this.store.createRecoveryCheckpoint('before-workout-recovery');
      const saved = await this.store.change(current => {
        if (this.archive !== this.store.archiveKey() || this.actor !== this.auth.user()?.id) throw Error('Account cambiato. Nessun recupero applicato.');
        if (workoutSignature(current, source.workoutId) !== source.currentGraph) throw Error('La seduta è cambiata durante la ricerca. Controlla di nuovo le copie prima di recuperarla.');
        const next = recoverWorkout(current, source.data, source.workoutId); validateIntegrity(next); Object.assign(current, next);
      }, 'Seduta recuperata. Gli altri allenamenti e il piano sono conservati.', false);
      if (!saved) {this.message.set(this.store.error());return false;}
      const synced = this.cloud ? await this.cloud.syncRecoveredArchive() : true;
      this.message.set(synced ? 'Seduta recuperata e copia server confermata.' : 'Seduta recuperata su questo dispositivo. La copia server resta da completare: conserva questa icona e attendi la sincronizzazione.');
      this.sources.delete(key); this.candidates.update(rows => rows.filter(row => row.key !== key)); return true;
    } catch(error) {this.message.set(error instanceof Error ? error.message : 'Recupero non completato. Le copie originali sono conservate.');return false;}
    finally {this.busy.set(false);}
  }
}
