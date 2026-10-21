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
import { sessionVolume, exerciseRecords } from "./statistics";
@Injectable({ providedIn: "root" })
export class Store {
  private theme = inject(ThemeService, { optional: true });
  private auth = inject(AuthService, { optional: true });
  private repo = inject(GYM_REPOSITORY);
  data = signal<DataSet>(seed());
  ready = signal(false);
  error = signal("");
  message = signal("");
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
                (s) => s.workoutExerciseId === e.id && s.completed,
              ),
          )
          .map((e) => e.exerciseId),
      ).size,
  );
  week = computed(() => {
    const d = new Date();
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
  constructor() {
    void this.init();
  }
  async init() {
    try {
      let d = await this.repo.read();
      if (!d.profiles.length) {
        d = seed();
        await this.repo.replace(d);
      }
      if (this.auth?.user()) d.profiles[0].role = this.auth.user()!.role;
      this.data.set(d);
      if (this.auth?.user() && !this.auth.offlineMode() && navigator.onLine) {
        try {await this.refreshCatalog();} catch {this.message.set("Catalogo online non raggiungibile: uso la copia locale. Allenamenti e pasti restano disponibili.");}
      }
      await this.theme?.load();
      this.applyTheme();
      this.ready.set(true);
    } catch (e) {
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
        const next = structuredClone(this.data());
        await fn(next);
        if(this.auth?.user()) {
          const current=this.data(), ids=new Set(current.exercises.map(e=>e.id)), groups=new Map(next.muscleGroups.map(g=>[g.id,g]));
          next.exercises=[...current.exercises,...next.exercises.filter(e=>!ids.has(e.id)).map(e=>({...e,active:false}))];
          for(const g of current.muscleGroups) groups.set(g.id,g);
          next.muscleGroups=[...groups.values()];next.profiles[0].role=this.auth.user()!.role;
        }
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
        await this.repo.replace(next);
        this.data.set(next);
        this.applyTheme();
        this.error.set("");
        if (message) this.message.set(message);
        return true;
      } catch (e) {
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
  records(id: string) {
    return exerciseRecords(this.data(), id);
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
  previous(exerciseId: string, exclude?: string) {
    for (const w of this.completed()) {
      if (w.id === exclude) continue;
      const e = this.data().workoutExercises.find(
        (e) =>
          e.workoutId === w.id &&
          e.exerciseId === exerciseId &&
          e.loadMode === (this.exercise(exerciseId)?.loadMode ?? e.loadMode),
      );
      if (e) return this.sets(e.id).filter((s) => s.completed);
    }
    return [];
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
          name: ex.name,
          loadMode: ex.loadMode,
          order: item.order,
          rest: item.rest,
          notes: item.notes,
        });
        const prev = this.settings().prefill ? this.previous(ex.id) : [];
        for (let i = 0; i < item.sets; i++) {
          const p = prev[i];
          d.sets.push({
            id: uid(),
            workoutExerciseId: weid,
            number: i + 1,
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
  async addSet(id: string) {
    return this.change((d) => {
      const list = d.sets.filter((s) => s.workoutExerciseId === id);
      const prev = list.at(-1);
      d.sets.push({
        id: uid(),
        workoutExerciseId: id,
        number: list.length + 1,
        weight: prev?.weight || 0,
        reps: prev?.reps || 8,
        rpe: prev?.rpe,
        rest: prev?.rest,
        notes: "",
        completed: false,
      });
    });
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
    const prev = this.previous(ex.exerciseId, ex.workoutId);
    if (!prev.length) return;
    return this.change((d) => {
      d.sets = d.sets.filter((s) => s.workoutExerciseId !== id);
      d.sets.push(
        ...prev.map((s, i) => ({
          ...s,
          id: uid(),
          workoutExerciseId: id,
          number: i + 1,
          completed: false,
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
      for(const event of d.scheduledWorkouts)if(event.workoutId===id)delete event.workoutId;
    }, "Allenamento eliminato.");
  }
  canEditCatalog() { return !!this.auth?.user() && !this.auth.offlineMode() && ["Admin","SuperAdmin"].includes(this.auth.user()!.role); }
  async refreshCatalog() {
    if (!this.auth?.user() || this.auth.offlineMode()) return;
    const catalog=await this.auth.request('catalog');
    const exercises: Exercise[]=await Promise.all(catalog.exercises.map(async (e:any)=>{
      const {imageData,...item}=e;
      if(imageData) item.image=await (await fetch(imageData)).blob();
      return item;
    }));
    const next=structuredClone(this.data());
    // Retain local references for past plans/workouts, never offer them as choices.
    const remoteIds=new Set(exercises.map(e=>e.id));
    next.exercises=[...exercises,...next.exercises.filter(e=>!remoteIds.has(e.id)).map(e=>({...e,active:false}))];
    const groups=new Map(next.muscleGroups.map(g=>[g.id,g]));
    for(const g of catalog.muscleGroups) groups.set(g.id,g);
    next.muscleGroups=[...groups.values()];
    await this.repo.replace(next);this.data.set(next);
  }
  async saveExercise(e: Exercise) {
    if (this.auth?.user()) {
      if(!this.canEditCatalog()) {this.error.set('Solo Admin e Super Admin possono modificare il catalogo.');return false;}
      try {
        const {image,...item}=e;let imageData='';
        if(image) imageData=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(Error('Immagine non leggibile.'));r.readAsDataURL(image);});
        await this.auth.request('catalog/exercise',{...item,imageData});await this.refreshCatalog();this.message.set('Esercizio salvato nel catalogo condiviso.');this.error.set('');return true;
      } catch(error){this.error.set((error as Error).message);return false;}
    }
    return this.change((d) => {
      if (!d.muscleGroups.some((g) => g.id === e.muscleGroupId)) throw Error("Gruppo muscolare non valido");
      const i = d.exercises.findIndex((x) => x.id === e.id);
      if (i >= 0) d.exercises[i] = e; else d.exercises.push(e);
    }, "Esercizio salvato.");
  }
  async saveMuscleGroup(id:string,name:string) {
    if(!this.canEditCatalog()) {this.error.set('Operazione riservata agli admin.');return;}
    try{await this.auth!.request('catalog/group',{id,name});await this.refreshCatalog();this.message.set('Gruppo salvato.');}catch(e){this.error.set((e as Error).message);}
  }
  async scheduleWorkout(date:string,dayId:string,notes='',id:string=uid()) {
    return this.change(d=>{
      const day=d.days.find(x=>x.id===dayId),plan=d.plans.find(p=>p.id===day?.planId);
      const parsed=new Date(date+'T12:00:00');
      if(!day||!plan||plan.archived||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||localDate(parsed)!==date)throw Error('Seleziona un giorno valido di un piano disponibile.');
      if(d.scheduledWorkouts.some(e=>e.date===date&&e.dayId===dayId&&e.id!==id))throw Error('Questo allenamento è già programmato per la data scelta.');
      const event={id,date,dayId,planId:plan.id,planName:plan.name,dayName:day.name,notes:notes.trim()};
      const index=d.scheduledWorkouts.findIndex(e=>e.id===id);if(index>=0){const old=d.scheduledWorkouts[index];if(old.workoutId)throw Error('Un allenamento già avviato non può essere riprogrammato.');d.scheduledWorkouts[index]=event;}else d.scheduledWorkouts.push(event);
    },'Allenamento programmato.',false);
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
      const i = d.planExercises.findIndex((x) => x.id === e.id);
      if (i < 0) d.planExercises.push(e);
      else d.planExercises[i] = e;
    }, "Esercizio del piano salvato.");
  }
}
