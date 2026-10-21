import { setupKey,setupSummary,hasSetup } from "./training-flow";
import { weightProgression } from "./progression";
import { MachineSetup,WorkoutUiState } from "../models/domain";
import { weeklyDates } from "./calendar";
import { ThemeService } from "./theme";
import { AuthService } from "./auth";
import { computed, inject, Injectable, signal } from "@angular/core";
import { GYM_REPOSITORY } from "../repositories/repository";
import {
  DataSet,
  Exercise,
  TrainingPlanExercise,
  WorkoutLogSet,
  localDate,
  now,
  uid,
} from "../models/domain";
import { seed } from "../core/seed";
import { ArchiveConflictError } from "../core/database";
import { WorkoutResumeService } from "./workout-resume";
import { sessionVolume, exerciseRecords } from "./statistics";
import { feedbackForContext, feedbackSignal } from "./feedback";
import { AcceptedCatalogChanges, mergeCatalog } from "./catalog-merge";
import { ArchiveSyncService, archiveFingerprint } from "./archive-sync";
import { exportBackup } from "./backup";
import { TodayService } from "./today";
@Injectable({ providedIn: "root" })
export class Store {
  private theme = inject(ThemeService, { optional: true });
  private auth = inject(AuthService, { optional: true });
  private repo = inject(GYM_REPOSITORY);
  private cloud = inject(ArchiveSyncService,{optional:true});
  private today = inject(TodayService,{optional:true});
  private resume = inject(WorkoutResumeService,{optional:true})||new WorkoutResumeService();
  data = signal<DataSet>(seed());
  archiveKey(){return this.repo.storageKey||this.auth?.user()?.id||'local';}
  archiveRevision(){return this.repo.revision?.();}
  conflicted=signal(false);
  private rejectStaleArchive(error:unknown){if(error instanceof ArchiveConflictError){this.conflicted.set(true);this.resume.invalidate(this.archiveKey(),this.archiveRevision());}}
  recentExerciseIds=computed(()=>{const times=new Map(this.data().workouts.map(w=>[w.id,w.startedAt]));return [...new Set([...this.data().workoutExercises].filter(e=>times.has(e.workoutId)).sort((a,b)=>(times.get(b.workoutId)||'').localeCompare(times.get(a.workoutId)||'')||a.order-b.order).map(e=>e.exerciseId))].slice(0,30);});
  preference(id:string){return this.data().exercisePreferences.find(p=>p.id===id);}
  isFavorite(id:string){return this.preference(id)?.favorite||false;}
  toggleFavorite(id:string){return this.change(d=>{if(!d.exercises.some(e=>e.id===id))throw Error('Esercizio non trovato.');const p=d.exercisePreferences.find(p=>p.id===id);if(p)p.favorite=!p.favorite;else d.exercisePreferences.push({id,favorite:true});},'',false);}
  saveMachineSetup(id:string,setup:MachineSetup,workoutExerciseId?:string){return this.change(d=>{if(!d.exercises.some(e=>e.id===id))throw Error('Esercizio non trovato.');const clean=Object.fromEntries(Object.entries(setup).map(([key,value])=>[key,value?.trim()||undefined]));const p=d.exercisePreferences.find(p=>p.id===id);if(p)p.machineSetup=clean;else d.exercisePreferences.push({id,favorite:false,machineSetup:clean});if(workoutExerciseId){const e=d.workoutExercises.find(e=>e.id===workoutExerciseId&&e.exerciseId===id);if(e&&!d.sets.some(s=>s.workoutExerciseId===e.id&&s.completed))e.machineSetup=structuredClone(clean);}},'Configurazione personale salvata. Le serie già registrate conservano la configurazione precedente.',false);}
  rememberWorkout(state:WorkoutUiState){return this.change(d=>{if(!d.workouts.some(w=>w.id===state.id&&w.status==='draft'))return;d.workoutUi=[structuredClone(state)];},'',false);}

  ready = signal(false);
  private feedback = feedbackForContext();
  error = feedbackSignal('error', this.feedback);
  message = feedbackSignal('success', this.feedback);
  busy = signal(false);
  profile = computed(() => this.data().profiles[0]);
  settings = computed(() => this.data().settings[0]);
  completed = computed(() =>
    this.data()
      .workouts.filter((w) => w.status === "completed")
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.startedAt.localeCompare(a.startedAt),
      ),
  );
  draft = computed(() =>
    this.data().workouts.find((w) => w.status === "draft"),
  );
  activePlan = computed(() =>
    this.data().plans.find((p) => p.active && !p.archived),
  );
  totalVolume = computed(() =>
    this.completed().reduce((v, w) => v + sessionVolume(this.data(), w), 0),
  );
  recordCount = computed(
    () =>
      new Set(
        this.data()
          .workoutExercises.filter(
            (e) =>
              this.completed().some((w) => w.id === e.workoutId) &&
              this.data().sets.some(
                (s) => s.workoutExerciseId === e.id && s.completed && s.kind!=="warmup",
              ),
          )
          .map((e) => e.exerciseId),
      ).size,
  );
  week = computed(() => {
    const d = new Date((this.today?.date()||localDate())+'T00:00:00');
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return this.completed().filter((w) => new Date(w.date + "T12:00:00") >= d);
  });
  nextDay = computed(() => {
    const p = this.activePlan();
    if (!p) return undefined;
    const days = this.days(p.id);
    const last = this.completed().find((w) => w.planId === p.id);
    const index = days.findIndex((d) => d.id === last?.dayId);
    return days[(index + 1) % days.length];
  });
  private queue: Promise<unknown> = Promise.resolve();
  private catalogRequest = 0;
  private initialization = 0;
  settled(){return this.queue;}
  constructor() {
    void this.init();
  }
  async init() {
    const initialization = ++this.initialization;
    try {
      await this.queue;
      let d = await this.repo.read();
      if(initialization!==this.initialization)return;
      this.conflicted.set(false);
      this.resume.rebase(this.archiveKey(),this.archiveRevision(),this.archiveRevision());
      if (!d.profiles.length || !d.settings.length || !d.roles.length) {
        // Repair missing bootstrap records additively. An incomplete archive
        // must never be mistaken for a new installation and reset to seed data.
        const defaults = seed();
        d = {...d,profiles:d.profiles.length?d.profiles:defaults.profiles,
          settings:d.settings.length?d.settings:defaults.settings,
          roles:d.roles.length?d.roles:defaults.roles};
        const exerciseIds=new Set(d.exercises.map(e=>e.id)),groupIds=new Set(d.muscleGroups.map(g=>g.id));
        d.exercises.push(...defaults.exercises.filter(e=>!exerciseIds.has(e.id)));
        d.muscleGroups.push(...defaults.muscleGroups.filter(g=>!groupIds.has(g.id)));
        const revision=this.archiveRevision();await this.repo.replace(d);this.resume.rebase(this.archiveKey(),revision,this.archiveRevision());
      }
      if (this.auth?.user()) d.profiles[0].role = this.auth.user()!.role;
      this.data.set(d);
      this.applyTheme();
      this.ready.set(true);
      // The local archive is immediately usable. Slow network checks must not
      // make existing plans appear empty or hold the save buttons disabled.
      const local = d, localRevision = this.archiveRevision();
      void (async()=>{
        if(this.cloud){
          await this.cloud.open(this.archiveKey(),local,true,async recovered=>{
            // A user may have saved a plan while the remote copy was loading.
            // Serialize restoration with those writes and reject a stale
            // snapshot before either the database or the cloud baseline moves.
            const job=this.queue.then(async()=>{
              if(initialization!==this.initialization)return false;
              if(this.data()!==local||this.archiveRevision()!==localRevision){
                // A catalog receipt is bookkeeping, not a personal edit. It
                // may arrive from another open section during the GET.
                const current=await archiveFingerprint(await exportBackup(this.data()),true);
                if(current!==await archiveFingerprint(await exportBackup(local),true))return false;
              }
              if(this.auth?.user())recovered.profiles[0].role=this.auth.user()!.role;
              try{await this.repo.replace(recovered);this.resume.clear(this.archiveKey());this.data.set(recovered);return true;}
              catch(error){this.rejectStaleArchive(error);this.error.set(error instanceof Error?error.message:'Copia server non ripristinata. I dati locali sono conservati.');return false;}
            });
            this.queue=job;
            return job;
          });
          if(initialization!==this.initialization)return;
          this.cloud.changed(this.data());
        }
        if (this.auth?.user() && !this.auth.offlineMode() && navigator.onLine) {
          try {await this.refreshCatalog();} catch {this.message.set("Catalogo online non raggiungibile: uso la copia locale. Allenamenti e pasti restano disponibili.");}
        }
      })().catch(()=>{this.message.set('Copia online momentaneamente non disponibile. L’archivio locale resta utilizzabile.');});
      void this.theme?.load().then(()=>{if(initialization===this.initialization)this.applyTheme();}).catch(()=>{});
    } catch (e) {
      if(initialization!==this.initialization)return;
      this.error.set(
        e instanceof Error ? e.message : "Impossibile aprire l’archivio. Controlla la connessione e ricarica la pagina.",
      );
    }
  }
  private applyTheme() {
    document.body.classList.toggle("light", this.settings().theme === "light");
    this.theme?.apply();
  }
  async change(
    fn: (d: DataSet) => void | Promise<void>,
    message = "",
    touchPlans = true,
  ): Promise<boolean> {
    const job = this.queue.then(async () => {
      this.busy.set(true);
      try {
        if (!this.ready()) throw Error("Archivio non ancora pronto");
        if(this.conflicted())throw new ArchiveConflictError();
        const next = structuredClone(this.data());
        await fn(next);
        // Local recovery and backup import preserve their complete catalog.
        // Editing this private archive never grants write access to the shared API.
        if(this.auth?.user()&&next.profiles[0])next.profiles[0].role=this.auth.user()!.role;
        if (touchPlans) {
          for (const plan of next.plans) {
            if (
              this.data().plans.some((p) => p.id === plan.id) &&
              this.planSignature(next, plan.id) !==
                this.planSignature(this.data(), plan.id)
            ) {
              plan.updatedAt = now();
            }
          }
        }
        const revision=this.archiveRevision();await this.repo.replace(next);this.resume.rebase(this.archiveKey(),revision,this.archiveRevision());
        this.data.set(next);
        this.cloud?.changed(next);
        this.applyTheme();
        this.error.set("");
        if (message) this.message.set(message);
        return true;
      } catch (e) {
        this.rejectStaleArchive(e);
        this.error.set(
          e instanceof Error
            ? e.name === "QuotaExceededError"
              ? "Spazio locale esaurito. Esporta un backup e libera spazio prima di riprovare."
              : e.message
            : "Salvataggio non riuscito. I dati precedenti sono stati conservati.",
        );
        return false;
      } finally {
        this.busy.set(false);
      }
    });
    this.queue = job;
    return job;
  }
  // Keep the plan timestamp in sync with day/exercise edits, not just renaming.
  private planSignature(d: DataSet, id: string) {
    const plan = d.plans.find((p) => p.id === id);
    const days = d.days.filter((day) => day.planId === id);
    const ids = new Set(days.map((day) => day.id));
    return JSON.stringify({
      plan,
      days,
      exercises: d.planExercises.filter((e) => ids.has(e.dayId)),
    });
  }
  days(planId: string) {
    return this.data()
      .days.filter((d) => d.planId === planId)
      .sort((a, b) => a.order - b.order);
  }
  planExercises(dayId: string) {
    return this.data()
      .planExercises.filter((e) => e.dayId === dayId)
      .sort((a, b) => a.order - b.order);
  }
  workoutExercises(id: string) {
    return this.data()
      .workoutExercises.filter((e) => e.workoutId === id)
      .sort((a, b) => a.order - b.order);
  }
  sets(id: string) {
    return this.data()
      .sets.filter((s) => s.workoutExerciseId === id)
      .sort((a, b) => a.number - b.number);
  }
  exercise(id: string) {
    return this.data().exercises.find((e) => e.id === id);
  }
  muscle(id: string) {
    return this.data().muscleGroups.find((g) => g.id === id)?.name || "";
  }
  volume(id: string) {
    const w = this.data().workouts.find((w) => w.id === id);
    return w ? sessionVolume(this.data(), w) : 0;
  }
  configurations(id:string){return [...new Map(this.data().workoutExercises.filter(e=>e.exerciseId===id&&this.completed().some(w=>w.id===e.workoutId)).map(e=>[setupKey(e.machineSetup),{key:setupKey(e.machineSetup),label:setupSummary(e.machineSetup)||"Configurazione non registrata"}])).values()];}
  records(id: string,machine?:string) {
    return exerciseRecords(this.data(), id,machine);
  }
  weight(kg: number) {
    return this.settings().unit === "lb" ? kg * 2.2046226218 : kg;
  }
  kg(display: number) {
    return this.settings().unit === "lb" ? display / 2.2046226218 : display;
  }
  formatWeight(kg: number) {
    return this.weight(kg).toLocaleString("it-IT", {
      maximumFractionDigits: 1,
    });
  }
  previous(exerciseId: string, exclude?: string, machineSetup?:MachineSetup) {
    for (const w of this.completed()) {
      if (w.id === exclude) continue;
      const e = this.data().workoutExercises.find(
        (e) =>
          e.workoutId === w.id &&
          e.exerciseId === exerciseId &&
          (!hasSetup(machineSetup)||setupKey(e.machineSetup)===setupKey(machineSetup)) &&
          e.loadMode === (this.exercise(exerciseId)?.loadMode ?? e.loadMode),
      );
      if (e) {const sets=this.sets(e.id).filter((s) => s.completed&&s.kind!=="warmup");if(sets.length)return sets;}
    }
    return [];
  }
  progression(workoutExerciseId: string, incrementKg: number) {
    return weightProgression(this.data(), workoutExerciseId, incrementKg);
  }
  applyProgression(workoutExerciseId: string, incrementKg: number) {
    return this.change(d => {
      // Re-evaluate inside the write queue, so an older on-screen proposal cannot
      // overwrite data after a setup, history or session change.
      const proposal = weightProgression(d, workoutExerciseId, incrementKg);
      if (!proposal.eligible || proposal.nextWeight === undefined) throw Error(proposal.reason);
      for (const set of d.sets) {
        if (set.workoutExerciseId === workoutExerciseId && !set.completed && set.kind !== "warmup")
          set.weight = proposal.nextWeight;
      }
    }, "Carico proposto applicato alle serie di lavoro da completare. Puoi modificarlo in ogni momento.", false);
  }
  async savePlan(id: string, name: string, description: string) {
    return this.change((d) => {
      if (!name.trim()) throw Error("Il nome del piano è obbligatorio");
      const p = d.plans.find((x) => x.id === id);
      if (p) {
        p.name = name.trim();
        p.description = description.trim();
        p.updatedAt = now();
      } else
        d.plans.push({
          id,
          userId: "local",
          name: name.trim(),
          description: description.trim(),
          createdAt: now(),
          updatedAt: now(),
          active: !d.plans.some((p) => p.active && !p.archived),
          archived: false,
        });
    }, "Piano salvato.");
  }
  async saveDay(id: string, planId: string, name: string, weekday?: number) {
    return this.change((d) => {
      const p = d.plans.find((p) => p.id === planId);
      if (!p) throw Error("Piano non trovato");
      if (!name.trim()) throw Error("Il nome del giorno è obbligatorio");
      if (
        weekday !== undefined &&
        (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
      )
        throw Error("Giorno della settimana non valido");
      const day = d.days.find((x) => x.id === id);
      if (day) {
        day.name = name.trim();
        day.weekday = weekday;
      } else
        d.days.push({
          id,
          planId,
          name: name.trim(),
          weekday,
          order: d.days.filter((x) => x.planId === planId).length,
        });
      p.updatedAt = now();
    }, "Giorno salvato.");
  }
  async duplicatePlan(id: string) {
    await this.change((d) => {
      const source = d.plans.find((p) => p.id === id);
      if (!source) return;
      const pid = uid();
      d.plans.push({
        ...source,
        id: pid,
        name: source.name + " · copia",
        active: false,
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      });
      for (const day of [...d.days].filter((x) => x.planId === id)) {
        const did = uid();
        d.days.push({ ...day, id: did, planId: pid });
        d.planExercises.push(
          ...d.planExercises
            .filter((e) => e.dayId === day.id)
            .map((e) => ({ ...e, id: uid(), dayId: did })),
        );
      }
    }, "Piano duplicato.");
  }
  async duplicateDay(id: string) {
    await this.change((d) => {
      const source = d.days.find((x) => x.id === id);
      if (!source) return;
      const did = uid();
      d.days.push({
        ...source,
        id: did,
        name: source.name + " · copia",
        order: d.days.filter((x) => x.planId === source.planId).length,
      });
      d.planExercises.push(
        ...d.planExercises
          .filter((e) => e.dayId === id)
          .map((e) => ({ ...e, id: uid(), dayId: did })),
      );
    }, "Giorno duplicato.");
  }
  async start(dayId: string) {
    if (this.draft()) return true;
    return this.change((d) => {
      const day = d.days.find((x) => x.id === dayId);
      const plan = d.plans.find((x) => x.id === day?.planId);
      const entries = d.planExercises
        .filter((e) => e.dayId === dayId)
        .sort((a, b) => a.order - b.order);
      if (d.workouts.some((w) => w.status === "draft")) return;
      if (!day || !plan || !entries.length)
        throw Error(
          "Aggiungi almeno un esercizio al giorno prima di iniziare.",
        );
      const wid = uid();
      d.workouts.push({
        id: wid,
        userId: "local",
        planId: plan.id,
        dayId,
        planName: plan.name,
        dayName: day.name,
        date: localDate(),
        startedAt: now(),
        duration: 0,
        notes: "",
        status: "draft",
        bodyWeight: d.profiles[0].bodyWeight,
      });
      for (const item of entries) {
        const ex = d.exercises.find((e) => e.id === item.exerciseId);
        if (!ex) throw Error("Esercizio del piano non trovato");
        const weid = uid();
        d.workoutExercises.push({
          id: weid,
          workoutId: wid,
          exerciseId: ex.id,
          superset:item.superset,
          machineSetup:structuredClone(d.exercisePreferences.find(p=>p.id===ex.id)?.machineSetup),
          name: ex.name,
          loadMode: ex.loadMode,
          order: item.order,
          rest: item.rest,
          notes: item.notes,
        });
        const prev = this.settings().prefill ? this.previous(ex.id,undefined,d.exercisePreferences.find(p=>p.id===ex.id)?.machineSetup) : [];
        const warmups=item.warmupSets||0;
        for(let i=0;i<warmups;i++)d.sets.push({id:uid(),workoutExerciseId:weid,number:i+1,kind:'warmup',weight:0,reps:item.repsMin,rest:item.rest,notes:'',completed:false});
        for (let i = 0; i < item.sets; i++) {
          const p = prev[i];
          d.sets.push({
            id: uid(),
            workoutExerciseId: weid,
            number: i + 1 + warmups,
            kind:"work",
            weight: p?.weight ?? item.targetWeight ?? 0,
            reps: p?.reps ?? item.repsMin,
            rpe: item.rpe,
            rest: item.rest,
            notes: "",
            completed: false,
          });
        }
      }
    });
  }
  updateSet(id: string, patch: Partial<WorkoutLogSet>) {
    return this.change((d) => {
      const s = d.sets.find((x) => x.id === id);
      if (!s) throw Error("Serie non trovata");
      Object.assign(s, patch);
      if (
        (s.kind!==undefined&&!["warmup","work"].includes(s.kind)) ||
        s.weight < 0 ||
        s.reps < 1 ||
        !Number.isInteger(s.reps) ||
        !Number.isFinite(s.weight) ||
        (s.rpe !== undefined && (s.rpe < 1 || s.rpe > 10))
      )
        throw Error(
          "Inserisci peso positivo, ripetizioni intere e RPE tra 1 e 10.",
        );
    });
  }
  private pendingSetAdds = new Map<string, Promise<boolean>>();
  addSet(id:string,kind:'work'|'warmup'='work'){
    const key=id+':'+kind, pending=this.pendingSetAdds.get(key);
    if(pending)return pending;
    const job=this.change(d=>{const list=d.sets.filter(s=>s.workoutExerciseId===id).sort((a,b)=>a.number-b.number),prev=list.at(-1);if(!d.workoutExercises.some(e=>e.id===id))throw Error('Esercizio non trovato.');if(list.length>=60)throw Error('Limite di serie per esercizio raggiunto.');const entry:WorkoutLogSet={id:uid(),workoutExerciseId:id,number:list.length+1,kind,weight:kind==='warmup'?0:prev?.weight||0,reps:prev?.reps||8,rpe:kind==='warmup'?undefined:prev?.rpe,rest:prev?.rest,notes:'',completed:false};d.sets.push(entry);if(kind==='warmup'){const ordered=[...list.filter(s=>s.kind==='warmup'),entry,...list.filter(s=>s.kind!=='warmup')];ordered.forEach((s,i)=>s.number=i+1);}});
    this.pendingSetAdds.set(key,job);
    void job.finally(()=>{if(this.pendingSetAdds.get(key)===job)this.pendingSetAdds.delete(key);});
    return job;
  }
  async removeSet(id: string) {
    return this.change((d) => {
      const s = d.sets.find((s) => s.id === id);
      if (!s) return;
      d.sets = d.sets.filter((s) => s.id !== id);
      d.sets
        .filter((x) => x.workoutExerciseId === s.workoutExerciseId)
        .sort((a, b) => a.number - b.number)
        .forEach((x, i) => (x.number = i + 1));
    });
  }
  async copyPrevious(id: string) {
    const ex = this.data().workoutExercises.find((e) => e.id === id);
    if (!ex) return;
    const prev = this.previous(ex.exerciseId, ex.workoutId,ex.machineSetup);
    if (!prev.length) return;
    return this.change((d) => {
      const historical=d.workouts.find(workout=>workout.id===ex.workoutId)?.status==='completed';
      const existing=d.sets.filter(set=>set.workoutExerciseId===id&&set.kind!=='warmup').sort((a,b)=>a.number-b.number);
      const warmups=d.sets.filter(set=>set.workoutExerciseId===id&&set.kind==='warmup').sort((a,b)=>a.number-b.number);
      d.sets = d.sets.filter((s) => s.workoutExerciseId !== id||s.kind==='warmup');
      warmups.forEach((s,i)=>s.number=i+1);
      d.sets.push(
        ...prev.map((s, i) => ({
          ...s,
          id: uid(),
          workoutExerciseId: id,
          number: i + 1+warmups.length,
          kind:"work" as const,
          completed: historical?(existing[i]?.completed??true):false,
        })),
      );
    }, "Valori precedenti copiati.");
  }
  async finish() {
    return this.change((d) => {
      const w = d.workouts.find((w) => w.status === "draft");
      if (!w) return;
      const ids = new Set(
        d.workoutExercises.filter((e) => e.workoutId === w.id).map((e) => e.id),
      );
      if (!d.sets.some((s) => ids.has(s.workoutExerciseId) && s.completed))
        throw Error("Completa almeno una serie prima di concludere.");
      w.status = "completed";
      d.workoutUi=d.workoutUi.filter(x=>x.id!==w.id);
      w.endedAt = now();
      w.duration = Math.max(
        1,
        Math.round((Date.now() - new Date(w.startedAt).getTime()) / 60000),
      );
    }, "Allenamento salvato. Ottimo lavoro!");
  }
  async deleteWorkout(id: string) {
    return this.change((d) => {
      const ids = new Set(
        d.workoutExercises.filter((e) => e.workoutId === id).map((e) => e.id),
      );
      d.sets = d.sets.filter((s) => !ids.has(s.workoutExerciseId));
      d.workoutExercises = d.workoutExercises.filter((e) => e.workoutId !== id);
      d.workouts = d.workouts.filter((w) => w.id !== id);
      d.workoutUi=d.workoutUi.filter(x=>x.id!==id);
      for(const event of d.scheduledWorkouts)if(event.workoutId===id)delete event.workoutId;
    }, "Allenamento eliminato.");
  }
  sharedCatalog() { return !!this.auth?.user() && !this.auth.offlineMode(); }
  canEditCatalog() { return !this.sharedCatalog() || ["Admin","SuperAdmin"].includes(this.auth!.user()!.role); }
  async refreshCatalog(accepted: AcceptedCatalogChanges = {}) {
    if (!this.auth?.user() || this.auth.offlineMode()) return;
    const request = ++this.catalogRequest;
    const catalog=await this.auth.request('catalog');
    const exercises: Exercise[]=await Promise.all(catalog.exercises.map(async (e:any)=>{
      const {imageData,...item}=e;
      if(imageData) item.image=await (await fetch(imageData)).blob();
      return item;
    }));
    // Catalog refreshes share the same write queue as personal changes. Build
    // the snapshot when this job runs so a slow catalog request cannot restore
    // older weights, plans or meals over a concurrent save.
    const job=this.queue.then(async()=>{
      if(request!==this.catalogRequest)return;
      const next=await mergeCatalog(this.data(),{exercises,muscleGroups:catalog.muscleGroups},accepted);
      if(this.conflicted())throw new ArchiveConflictError();
      try{const revision=this.archiveRevision();await this.repo.replace(next);this.resume.rebase(this.archiveKey(),revision,this.archiveRevision());this.data.set(next);this.cloud?.changed(next);}catch(error){this.rejectStaleArchive(error);throw error;}
    });
    this.queue=job.catch(()=>{});
    await job;
  }
  async saveExercise(e: Exercise) {
    if (this.sharedCatalog()) {
      if(!this.canEditCatalog()) {this.error.set('Solo Admin e Super Admin possono modificare il catalogo.');return false;}
      try {
        const {image,...item}=e;let imageData='';
        if(image) imageData=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(Error('Immagine non leggibile.'));r.readAsDataURL(image);});
        await this.auth!.request('catalog/exercise',{...item,imageData});await this.refreshCatalog({exercises:[e.id]});this.message.set('Esercizio salvato nel catalogo condiviso.');this.error.set('');return true;
      } catch(error){this.error.set((error as Error).message);return false;}
    }
    return this.change((d) => {
      if (!d.muscleGroups.some((g) => g.id === e.muscleGroupId)) throw Error("Gruppo muscolare non valido");
      const i = d.exercises.findIndex((x) => x.id === e.id);
      if (i >= 0) d.exercises[i] = e; else d.exercises.push(e);
    }, "Esercizio salvato.");
  }
  async saveMuscleGroup(id:string,name:string) {
    if(!this.canEditCatalog()) {this.error.set('Operazione riservata agli admin.');return false;}
    if(!this.sharedCatalog())return this.change(d=>{const group=d.muscleGroups.find(group=>group.id===id);if(group)group.name=name.trim();else d.muscleGroups.push({id,name:name.trim()});},'Gruppo personale salvato.',false);
    try{await this.auth!.request('catalog/group',{id,name});await this.refreshCatalog({groups:[id]});this.message.set('Gruppo salvato.');return true;}catch(e){this.error.set((e as Error).message);return false;}
  }
  async scheduleWorkout(date:string,dayId:string,notes='',id:string=uid(),repeatCount=1) {
    return this.change(d=>{
      const day=d.days.find(x=>x.id===dayId),plan=d.plans.find(p=>p.id===day?.planId);
      if(!day||!plan||plan.archived)throw Error('Seleziona un giorno valido di un piano disponibile.');
      const dates=weeklyDates(date,repeatCount);
      const index=d.scheduledWorkouts.findIndex(e=>e.id===id);
      if(index>=0&&d.scheduledWorkouts[index].workoutId)throw Error('Una programmazione già avviata non può essere modificata.');
      if(index>=0&&repeatCount!==1)throw Error('Per ripetere l’allenamento crea una nuova programmazione.');
      if(notes.length>2000)throw Error('Le note possono contenere al massimo 2000 caratteri.');
      if(dates.some(value=>d.scheduledWorkouts.some(e=>e.date===value&&e.dayId===dayId&&e.id!==id)))throw Error('Questo allenamento è già programmato in una delle date scelte. Nessuna nuova programmazione è stata aggiunta.');
      const events=dates.map((value,i)=>({id:i===0?id:uid(),date:value,dayId,planId:plan.id,planName:plan.name,dayName:day.name,notes:notes.trim()}));
      if(index>=0)d.scheduledWorkouts[index]=events[0];else d.scheduledWorkouts.push(...events);
    },repeatCount>1?'Allenamenti programmati per '+repeatCount+' settimane.':'Allenamento programmato.',false);
  }
  async startScheduled(id:string) {
    const event=this.data().scheduledWorkouts.find(e=>e.id===id);if(!event)return false;
    const linked=this.data().workouts.find(w=>w.id===event.workoutId);if(linked?.status==='completed'){this.error.set('Questa sessione è già stata completata.');return false;}
    if(this.draft()&&this.data().scheduledWorkouts.some(e=>e.id!==id&&e.workoutId===this.draft()!.id)){this.error.set('La sessione in corso è già associata a un’altra programmazione.');return false;}
    if(this.draft()&&this.draft()!.id!==event.workoutId&&this.draft()!.dayId!==event.dayId){this.error.set('Concludi o riprendi prima la sessione già in corso.');return false;}
    if(!await this.start(event.dayId))return false;
    return this.change(d=>{const e=d.scheduledWorkouts.find(e=>e.id===id)!;const w=d.workouts.find(w=>w.status==='draft');if(w&&w.dayId===e.dayId)e.workoutId=w.id;},'',false);
  }
  async savePlanExercise(e: TrainingPlanExercise) {
    if(this.auth?.user() && !this.auth.offlineMode()) {try{await this.refreshCatalog();}catch{this.message.set('Modalità offline: scelta dal catalogo salvato su questo dispositivo.');}}
    if(!this.exercise(e.exerciseId)?.active) {this.error.set('Questo esercizio non è attivo nel catalogo.');return false;}
    return this.change((d) => {
      if (
        !d.days.some((x) => x.id === e.dayId) ||
        !d.exercises.some((x) => x.id === e.exerciseId)
      )
        throw Error("Riferimenti non validi");
      if(e.superset&&!['A','B','C','D'].includes(e.superset))throw Error('Gruppo superset non valido.');
      if(e.superset&&d.planExercises.filter(x=>x.dayId===e.dayId&&x.id!==e.id&&x.superset===e.superset).length>=2)throw Error('Un superset può contenere due esercizi. Scegli un altro gruppo.');
      if(e.warmupSets!==undefined&&(!Number.isInteger(e.warmupSets)||e.warmupSets<0||e.warmupSets>5))throw Error('Scegli da 0 a 5 serie di riscaldamento.');
      const i = d.planExercises.findIndex((x) => x.id === e.id);
      if (i < 0) d.planExercises.push(e);
      else d.planExercises[i] = e;
    }, "Esercizio del piano salvato.");
  }
}
