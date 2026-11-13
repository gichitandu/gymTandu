import { cloneForEdit } from './edit-snapshot';
import { AlignRow, GROUP_PLAN_ID, GroupExercise, alignedOrder, ensureGroupExercise, groupDayId } from './group-workout';
import {historyReductions} from './workout-safety';
import { previousWeekWorkout, reusableExerciseSets } from './weekly-reuse';
import { WorkoutStartOptionsService } from './workout-start-options';
import { PlanReplacementRequest, PlanReplacementResult, replacePlanExercise, replaceWorkoutExercise } from './exercise-replacement';
import { setupKey,setupSummary,hasSetup } from "./training-flow";
import { weightProgression } from "./progression";
import { MachineSetup,WorkoutUiState,WorkoutLogExercise,CalendarActivityInput,CalendarEventOptions,ScheduledWorkout } from "../models/domain";
import {calendarEventOptions,calendarWorkoutDuplicate,existingCalendarOptions,validateCalendarEvent} from './calendar-event-data';
import { parseLocalDate, weeklyDates } from "./calendar";
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
import { CREATINE_MAX_DAILY_GRAMS, roundGrams } from "./creatine";
import { ExcelProgramDraft } from '../models/excel-import';
import { autoCompletePlan,effectiveProgramRange,excelProgramConflicts,missingProgramEvents,normalizedExerciseName,prescriptionDetails,scheduleConflicts,validateExcelProgram } from './plan-program';
@Injectable({ providedIn: "root" })
export class Store {
  saveWellness(row:import('../models/domain').WellnessLog){return this.change(d=>{const existing=d.wellnessLogs.find(v=>v.date===row.date);const next={...structuredClone(row),id:existing?.id||row.id};d.wellnessLogs=d.wellnessLogs.filter(v=>v.date!==row.date);d.wellnessLogs.push(next);},'Diario recupero salvato',false);}
  /** Aggiunge (o toglie, con un valore negativo) grammi di creatina al totale del giorno; a 0 il record sparisce. */
  addCreatine(date:string,deltaGrams:number){return this.change(d=>{const existing=d.creatineLogs.find(v=>v.date===date),next=roundGrams((existing?.grams??0)+deltaGrams);if(!Number.isFinite(next)||next<0||next>CREATINE_MAX_DAILY_GRAMS)throw Error('Inserisci un totale tra 0 e '+CREATINE_MAX_DAILY_GRAMS+' g di creatina.');d.creatineLogs=d.creatineLogs.filter(v=>v.date!==date);if(next>0)d.creatineLogs.push({id:existing?.id||'creatine-'+date,date,grams:next});},'',false);}
  /** Imposta il totale di creatina del giorno; 0 lo azzera. */
  setCreatine(date:string,grams:number){return this.change(d=>{const next=roundGrams(grams);if(!Number.isFinite(next)||next<0||next>CREATINE_MAX_DAILY_GRAMS)throw Error('Inserisci un totale tra 0 e '+CREATINE_MAX_DAILY_GRAMS+' g di creatina.');const existing=d.creatineLogs.find(v=>v.date===date);d.creatineLogs=d.creatineLogs.filter(v=>v.date!==date);if(next>0)d.creatineLogs.push({id:existing?.id||'creatine-'+date,date,grams:next});},'',false);}
  removeWellness(id:string){return this.change(d=>{d.wellnessLogs=d.wellnessLogs.filter(v=>v.id!==id);},'Voce rimossa',false);}

  private theme = inject(ThemeService, { optional: true });
  private auth = inject(AuthService, { optional: true });
  private repo = inject(GYM_REPOSITORY);
  private cloud = inject(ArchiveSyncService,{optional:true});
  private today = inject(TodayService,{optional:true});
  private startOptions = inject(WorkoutStartOptionsService,{optional:true});
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

  lastLocalSave=signal<number|null>(null);localSaveFailed=signal(false);
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
  openWorkouts = computed(() => this.data().workouts.filter(w=>w.status==='draft'));
  draft = computed(() => this.openWorkouts()[0]);
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
  // Remains latched after an authoritative reset until a fresh document opens.
  // Old component callbacks must never write themselves into the clean archive.
  private resetInProgress=false;
  settled(){return this.queue;}
  async createRecoveryCheckpoint(kind = 'before-update') {
    await this.settled();
    if (this.repo.checkpoint) await this.repo.checkpoint(kind);
  }
  recoverySnapshots() {return this.repo.recoverySnapshots?.() || Promise.resolve([]);}
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
            if(initialization!==this.initialization)return false;
            const accountReset=!!recovered.settings[0]?.archiveResetId&&recovered.settings[0].archiveResetId!==this.data().settings[0]?.archiveResetId;
            if(accountReset)this.resetInProgress=true;
            // A user may have saved a plan while the remote copy was loading.
            // Serialize restoration with those writes and reject a stale
            // snapshot before either the database or the cloud baseline moves.
            const job=this.queue.then(async()=>{
              if(initialization!==this.initialization)return false;
              if(!accountReset&&(this.data()!==local||this.archiveRevision()!==localRevision)){
                // A catalog receipt is bookkeeping, not a personal edit. It
                // may arrive from another open section during the GET.
                const current=await archiveFingerprint(await exportBackup(this.data()),true);
                if(current!==await archiveFingerprint(await exportBackup(local),true))return false;
              }
              if(this.auth?.user())recovered.profiles[0].role=this.auth.user()!.role;
              let committed=false;
              try{await this.repo.checkpoint?.('before-server-restore');await this.repo.replace(recovered);committed=true;this.resume.clear(this.archiveKey());this.data.set(recovered);return true;}
              catch(error){if(accountReset&&!committed)this.resetInProgress=false;this.rejectStaleArchive(error);this.error.set(error instanceof Error?error.message:'Copia server non ripristinata. I dati locali sono conservati.');return false;}
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
        if(initialization===this.initialization)await this.restoreProgramSchedule();
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
    document.body.style?.setProperty('--neon-glow',String((this.settings().neonGlow??55)/100));
    document.body.classList.toggle('dynamic-background',this.settings().dynamicBackground??true);
  }
  async change(
    fn: (d: DataSet) => void | Promise<void>,
    message = "",
    touchPlans = true,
  ): Promise<boolean> {
    if(this.resetInProgress){this.error.set('Il nuovo archivio è in apertura. Riapri l’app per continuare.');return false;}
    const job = this.queue.then(async () => {
      this.busy.set(true);
      try {
        if(this.resetInProgress)throw Error('Il nuovo archivio è in apertura. Riapri l’app per continuare.');
        if (!this.ready()) throw Error("Archivio non ancora pronto");
        if(this.conflicted())throw new ArchiveConflictError();
        const previous = this.data(), next = cloneForEdit(previous);
        await fn(next);
        if(this.resetInProgress)throw Error('Il nuovo archivio è in apertura. Riapri l’app per continuare.');
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
        this.data.set(next);this.lastLocalSave.set(Date.now());this.localSaveFailed.set(false);
        this.cloud?.changed(next, historyReductions(previous, next));
        this.applyTheme();
        this.error.set("");
        if (message) this.message.set(message);
        return true;
      } catch (e) {
        this.localSaveFailed.set(true);this.rejectStaleArchive(e);
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
  /** Valore per i campi di inserimento: stessa conversione di weight(), ma senza decimali spuri. */
  weightInput(kg: number) {
    return +this.weight(kg).toFixed(2);
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
  previous(exerciseId: string, exclude?: string, machineSetup?:MachineSetup, latestDate?:string) {
    const cutoff=latestDate||this.data().workouts.find(w=>w.id===exclude)?.date;
    for (const w of this.completed()) {
      if (w.id === exclude || cutoff&&w.date>cutoff) continue;
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
  excelProgramConflicts(draft:ExcelProgramDraft){
    try{validateExcelProgram(draft);const existing=this.data().plans.find(plan=>plan.program?.fileHash===draft.fileHash&&plan.program.startDate===draft.startDate);return existing?[]:excelProgramConflicts(this.data(),draft);}
    catch(error){return[error instanceof Error?error.message:'Programma non valido.'];}
  }
  async importExcelProgram(draft:ExcelProgramDraft,importId:string,exerciseMatches:Record<string,string>={}):Promise<string|null>{
    const account=this.auth?.user()?.id;
    let planId:string|null=null;
    const accepted=await this.change(d=>{
      if(this.auth?.user()?.id!==account)throw Error('L’account è cambiato durante l’importazione. Riapri il file nel tuo account.');
      validateExcelProgram(draft);
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(importId))throw Error('Identificativo dell’importazione non valido.');
      const existing=d.plans.find(plan=>plan.program&&(plan.program.importId===importId||plan.program.fileHash===draft.fileHash&&plan.program.startDate===draft.startDate));
      if(existing){
        if(existing.program!.fileHash!==draft.fileHash||existing.program!.startDate!==draft.startDate)throw Error('Questo identificativo di importazione appartiene a un altro file o a un’altra data. Riapri la procedura.');
        planId=existing.id;return;
      }
      const conflicts=excelProgramConflicts(d,draft);
      if(conflicts.length)throw Error('Importazione bloccata: i piani non possono sovrapporsi. '+conflicts.slice(0,5).join(' ')+(conflicts.length>5?` Altri ${conflicts.length-5} conflitti.`:''));
      const at=now(),pid='excel-plan-'+importId,createdExerciseIds:string[]=[],createdGroupIds:string[]=[];
      if(d.plans.some(plan=>plan.id===pid))throw Error('Identificativo piano già utilizzato.');
      const plan={id:pid,userId:'local',name:draft.name.trim(),description:draft.description.trim(),createdAt:at,updatedAt:at,active:!d.plans.some(plan=>plan.active&&!plan.archived),archived:false,program:{importId,sourceName:draft.sourceName,sourceKind:draft.sourceKind,startDate:draft.startDate,endDate:draft.endDate,weeks:draft.weeks,fileHash:draft.fileHash,importedAt:at,sessionCount:draft.sessions.length,createdExerciseIds,createdGroupIds}};
      const personal=new Map<string,string>();
      d.plans.push(plan);
      for(const [index,session] of draft.sessions.entries()){
        const did=uid();
        d.days.push({id:did,planId:pid,name:session.title,order:index,weekday:(session.weekday+6)%7,week:session.week,sessionDate:session.date,phase:session.phase,notes:session.notes});
        for(const item of session.exercises){
          const key=normalizedExerciseName(item.name),chosen=Object.hasOwn(exerciseMatches,item.sourceId)?exerciseMatches[item.sourceId]:undefined;
          let exercise=chosen?d.exercises.find(ex=>ex.id===chosen&&ex.active):d.exercises.find(ex=>ex.active&&normalizedExerciseName(ex.name)===key);
          if(chosen&&!exercise)throw Error(`L’associazione per “${item.name}” non è più disponibile. Controlla il catalogo.`);
          if(!exercise){
            const previous=personal.get(key);exercise=previous?d.exercises.find(ex=>ex.id===previous):undefined;
            if(!exercise){
              let group=d.muscleGroups.find(group=>group.name==='Da classificare (Excel)');
              if(!group){group={id:uid(),name:'Da classificare (Excel)'};d.muscleGroups.push(group);createdGroupIds.push(group.id);}
              exercise={id:uid(),name:item.name.trim(),muscleGroupId:group.id,secondaryMuscleIds:[],description:'Esercizio personale importato. Verifica attrezzatura e modalità di carico prima di confrontare i risultati.',equipment:'Da verificare',tags:['Importato da Excel','Da verificare'],active:true,createdAt:at,loadMode:'external'};
              d.exercises.push(exercise);createdExerciseIds.push(exercise.id);personal.set(key,exercise.id);
            }
          }
          const details=prescriptionDetails(item);
          if(!details.loadUnit&&exercise.tags.includes('Da verificare'))details.loadUnit='Da verificare';
          d.planExercises.push({id:uid(),dayId:did,exerciseId:exercise.id,sets:item.sets,repsMin:item.repsMin,repsMax:item.repsMax,rest:item.rest,notes:item.notes,order:item.order,...details});
        }
        d.scheduledWorkouts.push({id:uid(),date:session.date,planId:pid,dayId:did,planName:plan.name,dayName:session.title,notes:session.notes});
      }
      planId=pid;
    },'Piano importato e calendario programmato.',false);
    return accepted?planId:null;
  }
  async removeUnconfirmedExcelImport(importId:string){
    return this.change(d=>{
      const plan=d.plans.find(plan=>plan.id==='excel-plan-'+importId&&plan.program?.importId===importId);
      if(!plan)return;
      if(d.workouts.some(workout=>workout.planId===plan.id)||d.scheduledWorkouts.some(event=>event.planId===plan.id&&event.workoutId))throw Error('L’importazione contiene già allenamenti registrati e non può essere annullata automaticamente.');
      const days=new Set(d.days.filter(day=>day.planId===plan.id).map(day=>day.id));
      d.planExercises=d.planExercises.filter(item=>!days.has(item.dayId));d.days=d.days.filter(day=>day.planId!==plan.id);d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>event.planId!==plan.id);d.plans=d.plans.filter(item=>item.id!==plan.id);
      const createdExercises=new Set(plan.program?.createdExerciseIds||[]),createdGroups=new Set(plan.program?.createdGroupIds||[]);
      const usedExercises=new Set([...d.planExercises.map(item=>item.exerciseId),...d.workoutExercises.map(item=>item.exerciseId),...d.exercisePreferences.map(item=>item.id)]);
      d.exercises=d.exercises.filter(item=>!createdExercises.has(item.id)||usedExercises.has(item.id));
      const usedGroups=new Set(d.exercises.flatMap(item=>[item.muscleGroupId,...item.secondaryMuscleIds]));
      d.muscleGroups=d.muscleGroups.filter(item=>!createdGroups.has(item.id)||usedGroups.has(item.id));
    },'',false);
  }
  async finishPlan(id:string,cancelFuture=true){
    return this.change(d=>{
      const plan=d.plans.find(plan=>plan.id===id);if(!plan)throw Error('Piano non trovato.');
      if(plan.completedAt)return;
      if(d.workouts.some(workout=>workout.planId===id&&workout.status==='draft'))throw Error('Termina la sessione aperta di questo piano prima di concluderlo. Le serie registrate sono conservate.');
      if(cancelFuture)d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>event.planId!==id||!!event.workoutId||event.date<localDate());
      plan.completedAt=now();plan.completionReason='manual';plan.active=false;plan.archived=true;plan.updatedAt=plan.completedAt;
    },'Piano concluso. Allenamenti e statistiche sono conservati.',false);
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
      } else {
        d.days.push({
          id,
          planId,
          name: name.trim(),
          weekday,
          order: d.days.filter((x) => x.planId === planId).length,
        });
      }
      p.updatedAt = now();
    }, "Allenamento del piano salvato.");
  }
  /** Sedute ancora in programma (non avviate) collegate a un piano: sono quelle che si possono togliere dal calendario. */
  plannedEventsOf(planId:string){return this.data().scheduledWorkouts.filter(event=>event.planId===planId&&(event.kind??'workout')==='workout'&&!event.workoutId);}
  /** Sedute in programma (mai avviate) il cui piano non esiste più. */
  orphanPlannedEvents(){const plans=new Set(this.data().plans.map(plan=>plan.id));return this.data().scheduledWorkouts.filter(event=>(event.kind??'workout')==='workout'&&!event.workoutId&&!plans.has(event.planId));}
  async removeOrphanPlannedEvents(){
    return this.change(d=>{const plans=new Set(d.plans.map(plan=>plan.id));d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>!((event.kind??'workout')==='workout'&&!event.workoutId&&!plans.has(event.planId)));},'Sedute senza piano eliminate dal calendario. Gli allenamenti registrati sono conservati.',false);
  }
  async deletePlan(id:string,options:{removePlannedEvents?:boolean}={}){
    return this.change(d=>{
      if(!d.plans.some(plan=>plan.id===id))throw Error('Piano non trovato.');
      if(d.workouts.some(workout=>workout.planId===id&&workout.status==='draft'))throw Error('Concludi o riprendi la sessione aperta di questo piano prima di eliminarlo.');
      const days=new Set(d.days.filter(day=>day.planId===id).map(day=>day.id));
      // Recorded sessions have their own snapshots. Never cascade into logs,
      // sets, calendar snapshots, the exercise catalog or another plan.
      d.planExercises=d.planExercises.filter(exercise=>!days.has(exercise.dayId));
      d.days=d.days.filter(day=>!days.has(day.id));
      d.plans=d.plans.filter(plan=>plan.id!==id);
      // Solo su richiesta: le sedute in programma (mai avviate) spariscono dal calendario; quelle già registrate restano.
      if(options.removePlannedEvents)d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>!(event.planId===id&&(event.kind??'workout')==='workout'&&!event.workoutId));
    },options.removePlannedEvents?'Piano eliminato insieme alle sedute in programma. Gli allenamenti registrati sono conservati.':'Piano eliminato. Gli allenamenti registrati e il calendario sono conservati.',false);
  }
  async duplicatePlan(id: string) {
    await this.change((d) => {
      const source = d.plans.find((p) => p.id === id);
      if (!source) return;
      const pid = uid();
      d.plans.push({
        ...source,
        program:undefined,completedAt:undefined,completionReason:undefined,
        id: pid,
        name: source.name + " · copia",
        active: false,
        archived: false,
        createdAt: now(),
        updatedAt: now(),
      });
      for (const day of [...d.days].filter((x) => x.planId === id)) {
        const did = uid();
        d.days.push({ ...day, id: did, planId: pid,week:undefined,sessionDate:undefined });
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
  /** Aggiunge al calendario le sedute del piano attivo rimaste senza evento. Solo aggiunte, mai sovrascritture. */
  async restoreProgramSchedule() {
    const plan=this.activePlan();
    if(!plan?.program||!this.ready()||this.conflicted()||!missingProgramEvents(this.data(),[plan.id]).length)return false;
    return this.change(d=>{d.scheduledWorkouts.push(...missingProgramEvents(d,[plan.id]));},'Calendario del piano attivo ripristinato.',false);
  }
  openSessionMessage(workout: {planName:string;dayName:string;date:string}) {
    const date=parseLocalDate(workout.date).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});
    return `Hai una sessione aperta: ${workout.planName} · ${workout.dayName} · ${date}. Apri “Sessione” e premi “Termina allenamento” prima di registrare un altro giorno.`;
  }
  async start(dayId: string, date?:string, options: {reusePreviousWeek?: boolean} = {}) {
    const workoutDate=date??localDate();
    try{parseLocalDate(workoutDate);if(workoutDate>localDate())throw Error('Per registrare un allenamento scegli oggi o una data passata.');}
    catch(error){this.error.set(error instanceof Error?error.message:'Data non valida.');return false;}
    if (this.draft()) {
      const open=this.draft()!;if(open.dayId!==dayId||date!==undefined&&open.date!==workoutDate){this.error.set(this.openSessionMessage(open));return false;}
      return true;
    }
    const previousWeek = previousWeekWorkout(this.data(), dayId, workoutDate);
    let reuse = options.reusePreviousWeek ?? (this.settings().reusePreviousWeek !== false);
    if (previousWeek && options.reusePreviousWeek === undefined && this.startOptions) {
      const day = this.data().days.find(row => row.id === dayId)!, plan = this.data().plans.find(row => row.id === day.planId);
      const archive = this.archiveKey(), actor = this.auth?.user()?.id;
      const answer = await this.startOptions.choose({dayName: day.name, planName: plan?.name || '', previousDate: previousWeek.date, defaultReuse: reuse});
      if (answer === null || archive !== this.archiveKey() || actor !== this.auth?.user()?.id) return false;
      reuse = answer;
    }
    return this.change((d) => {
      const day = d.days.find((x) => x.id === dayId);
      const plan = d.plans.find((x) => x.id === day?.planId);
      const entries = d.planExercises
        .filter((e) => e.dayId === dayId)
        .sort((a, b) => a.order - b.order);
      const open=d.workouts.find(w=>w.status==='draft');
      if(open){if(open.dayId!==dayId||date!==undefined&&open.date!==workoutDate)throw Error(this.openSessionMessage(open));return;}
      if (!day || !plan || !entries.length)
        throw Error(
          "Aggiungi almeno un esercizio al giorno prima di iniziare.",
        );
      if(plan.completedAt)throw Error('Questo piano è concluso. Puoi consultare le sue sedute nello storico.');
      // Il piano attivo è quello in uso: un altro piano aperto ma non attivo non ne blocca l'avvio.
      const conflicts=plan.program?scheduleConflicts(d,[workoutDate],plan.id,undefined,{onlyActivePlans:plan.active}):d.plans.filter(other=>other.id!==plan.id&&other.program&&!other.archived&&!other.completedAt&&(!plan.active||other.active)).flatMap(other=>{
        const range=effectiveProgramRange(d,other);
        return range&&workoutDate>=range.startDate&&workoutDate<=range.endDate?[`Il periodo è già occupato dal piano “${other.name}”.`]:[];
      });
      if(conflicts.length)throw Error('Data occupata da un altro piano. '+conflicts[0]);
      const programEvent=plan.program?d.scheduledWorkouts.find(event=>event.dayId===dayId&&event.planId===plan.id):undefined;
      if(programEvent?.workoutId)throw Error('Questa seduta del programma è già stata registrata. Riaprila dallo storico per modificarla.');
      const reference = reuse && previousWeek ? previousWeekWorkout(d, dayId, workoutDate) : undefined;
      if (reuse && previousWeek && reference?.id !== previousWeek.id) throw Error('I riferimenti della settimana precedente sono cambiati. Riapri la seduta e controlla la scelta.');
      const wid = uid();
      d.workouts.push({
        id: wid,
        userId: "local",
        planId: plan.id,
        dayId,
        planName: plan.name,
        dayName: day.name,
        date: workoutDate,
        startedAt: now(),
        duration: 0,durationUnknown:workoutDate<localDate(),
        notes: day.notes||"",
        status: "draft",
        bodyWeight: d.profiles[0].bodyWeight,
        programWeek:day.week,programPhase:day.phase,
      });
      if(programEvent)programEvent.workoutId=wid;
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
          repsMin:item.repsMin,repsMax:item.repsMax,
          ...prescriptionDetails(item),
        });
        const prior = reference ? reusableExerciseSets(d, reference, item, d.exercisePreferences.find(p => p.id === ex.id)?.machineSetup) : {work: [], warmup: []};
        // An explicit opt-out from the weekly reference must also beat legacy prefill.
        const prev = !previousWeek && d.settings[0].prefill ? this.previous(ex.id,undefined,d.exercisePreferences.find(p=>p.id===ex.id)?.machineSetup,workoutDate) : [];
        const copiedWarmups = prior.warmup.slice(0, Math.max(0, 60 - item.sets));
        const warmups = copiedWarmups.length || item.warmupSets || 0;
        for(let i=0;i<warmups;i++) {
          const source = copiedWarmups[i];
          d.sets.push({id:uid(),workoutExerciseId:weid,number:i+1,kind:'warmup',weight:source?.weight ?? 0,reps:source?.reps ?? item.repsMin,rest:source?.rest ?? item.rest,notes:source?.notes || '',completed:false});
        }
        for (let i = 0; i < item.sets; i++) {
          const p = prev[i];
          d.sets.push({
            id: uid(),
            workoutExerciseId: weid,
            number: i + 1 + warmups,
            kind:"work",
            weight: prior.work[i]?.weight ?? prior.work.at(-1)?.weight ?? p?.weight ?? item.targetWeight ?? 0,
            // Schede normali: le ripetizioni della settimana prima; nei programmi a settimane le ripetizioni previste restano quelle del programma.
            reps: (day.week === undefined ? prior.work[i]?.reps ?? prior.work.at(-1)?.reps : undefined) ?? p?.reps ?? item.repsMin,
            rpe: item.rpe,
            rest: item.rest,
            notes: "",
            completed: false,
          });
        }
      }
    });
  }
  /** Allenamento in gruppo, «stessi esercizi»: apre una seduta di oggi con gli esercizi ricevuti. I carichi partono dal mio storico, mai da quelli degli altri. */
  startGroupWorkout(source: {sessionId: string; dayName: string; exercises: GroupExercise[]}) {
    return this.change((d) => {
      const open=d.workouts.find(w=>w.status==='draft');
      if(open){if(open.dayId===groupDayId(source.sessionId))return;throw Error(this.openSessionMessage(open));}
      if(!source.exercises.length)throw Error('Chi ha creato il gruppo non ha ancora esercizi nella seduta.');
      const wid=uid(),date=localDate();
      d.workouts.push({id:wid,userId:"local",planId:GROUP_PLAN_ID,dayId:groupDayId(source.sessionId),planName:'Allenamento in gruppo',dayName:source.dayName.trim()||'Allenamento in gruppo',date,startedAt:now(),duration:0,notes:"",status:"draft",bodyWeight:d.profiles[0].bodyWeight});
      source.exercises.forEach((item,order)=>{
        const ex=ensureGroupExercise(d,item),weid=uid(),setup=d.exercisePreferences.find(p=>p.id===ex.id)?.machineSetup;
        d.workoutExercises.push({id:weid,workoutId:wid,exerciseId:ex.id,superset:item.superset,machineSetup:structuredClone(setup),name:ex.name,loadMode:ex.loadMode,order,rest:item.rest,notes:"",repsMin:item.repsMin,repsMax:item.repsMax});
        const prev=d.settings[0].prefill?this.previous(ex.id,undefined,setup,date):[];
        for(let i=0;i<item.warmupSets;i++)d.sets.push({id:uid(),workoutExerciseId:weid,number:i+1,kind:'warmup',weight:0,reps:item.repsMin,rest:item.rest,notes:'',completed:false});
        for(let i=0;i<item.sets;i++)d.sets.push({id:uid(),workoutExerciseId:weid,number:i+1+item.warmupSets,kind:"work",weight:prev[i]?.weight??prev.at(-1)?.weight??0,reps:prev[i]?.reps??item.repsMin,rest:item.rest,notes:"",completed:false});
      });
      // Un superset rimasto senza compagno (elenco tagliato o esercizio duplicato) torna un esercizio singolo.
      const rows=d.workoutExercises.filter(e=>e.workoutId===wid);
      for(const row of rows)if(row.superset&&rows.filter(e=>e.superset===row.superset).length!==2)delete row.superset;
    },'',false);
  }
  /** Allenamento in gruppo, «il mio allenamento»: sposta gli esercizi in comune nello stesso momento della seduta di riferimento. Cambia solo l'ordine. */
  alignGroupWorkout(workoutId: string, reference: GroupExercise[]) {
    return this.change((d) => {
      if(!d.workouts.some(w=>w.id===workoutId&&w.status==='draft'))throw Error('La seduta non è più aperta.');
      const rows=d.workoutExercises.filter(e=>e.workoutId===workoutId);
      const input:AlignRow[]=rows.map(e=>({id:e.id,exerciseId:e.exerciseId,name:e.name,order:e.order,superset:e.superset,started:d.sets.some(s=>s.workoutExerciseId===e.id&&s.completed)}));
      alignedOrder(input,reference).forEach((id,order)=>{rows.find(e=>e.id===id)!.order=order;});
    },'',false);
  }
  updateSet(id: string, patch: Partial<WorkoutLogSet>,undo=false) {
    const exerciseId=this.data().sets.find(set=>set.id===id)?.workoutExerciseId||'';
    const save=(fn:(d:DataSet)=>void)=>undo?this.gymEdit(exerciseId,fn,patch.completed!==undefined?'conferma serie':'modifica serie',id):this.change(fn);
    return save((d) => {
      const s = d.sets.find((x) => x.id === id);
      if (!s) throw Error("Serie non trovata");
      Object.assign(s, patch);
      if (
        (s.kind!==undefined&&!["warmup","work"].includes(s.kind)) ||
        s.weight < 0 ||
        s.reps < 1 ||
        !Number.isInteger(s.reps) ||
        !Number.isFinite(s.weight) ||
        (s.rpe !== undefined && (s.rpe < 1 || s.rpe > 10)) ||
        (s.drop!==undefined&&(!Number.isFinite(s.drop.weight)||s.drop.weight<0||!Number.isInteger(s.drop.reps)||s.drop.reps<1||s.drop.reps>999))
      )
        throw Error(
          "Inserisci peso positivo, ripetizioni intere e RPE tra 1 e 10.",
        );
    });
  }
  private gymUndo=signal<{id:string;label:string;exerciseId:string;workoutId:string;targetId?:string;before:{exercise:WorkoutLogExercise;sets:WorkoutLogSet[]};after:string}|null>(null);
  private gymSequence=0;
  private gymSnapshot(d:DataSet,id:string){const exercise=d.workoutExercises.find(e=>e.id===id);return exercise?{exercise:structuredClone(exercise),sets:structuredClone(d.sets.filter(s=>s.workoutExerciseId===id).sort((a,b)=>a.id.localeCompare(b.id)))}:null;}
  readonly undoLabel=computed(()=>{const receipt=this.gymUndo();if(!receipt)return '';const d=this.data();return d.workouts.some(w=>w.id===receipt.workoutId&&w.status==='draft')&&JSON.stringify(this.gymSnapshot(d,receipt.exerciseId))===receipt.after?receipt.label:'';});
  private async gymEdit(id:string,fn:(d:DataSet)=>void,label:string,targetId?:string){
    let receipt:NonNullable<ReturnType<typeof this.gymUndo>>|null=null,sequence=0;
    const ok=await this.change(d=>{const before=this.gymSnapshot(d,id);if(!before||!d.workouts.some(w=>w.id===before.exercise.workoutId&&w.status==='draft'))throw Error('La seduta non è più aperta.');fn(d);const after=this.gymSnapshot(d,id);if(JSON.stringify(before)===JSON.stringify(after))return;const prior=this.gymUndo(),baseline=label==='conferma serie'&&prior?.label==='modifica serie'&&prior.targetId===targetId&&prior.after===JSON.stringify(before)?prior.before:before;receipt={id:uid(),label,exerciseId:id,workoutId:before.exercise.workoutId,targetId,before:baseline,after:JSON.stringify(after)};sequence=++this.gymSequence;},'',false);
    if(ok&&receipt&&sequence===this.gymSequence)this.gymUndo.set(receipt);return ok;
  }
  async undoGymAction(){const receipt=this.gymUndo();if(!receipt)return false;const ok=await this.change(d=>{if(this.gymUndo()?.id!==receipt.id||JSON.stringify(this.gymSnapshot(d,receipt.exerciseId))!==receipt.after||!d.workouts.some(w=>w.id===receipt.workoutId&&w.status==='draft'))throw Error('La serie è cambiata: l’annullamento non sovrascrive le modifiche successive.');const i=d.workoutExercises.findIndex(e=>e.id===receipt.exerciseId);d.workoutExercises[i]=structuredClone(receipt.before.exercise);d.sets=d.sets.filter(s=>s.workoutExerciseId!==receipt.exerciseId).concat(structuredClone(receipt.before.sets));},'Ultima azione annullata.',false);if(ok&&this.gymUndo()?.id===receipt.id)this.gymUndo.set(null);return ok;}
  saveWeightStep(exerciseId:string,step:number){return this.change(d=>{if(!d.exercises.some(e=>e.id===exerciseId)||!Number.isFinite(step)||step<=0||step>50)throw Error('Scegli un incremento da 0,1 a 50.');const p=d.exercisePreferences.find(p=>p.id===exerciseId);if(p)p.weightStep=step;else d.exercisePreferences.push({id:exerciseId,favorite:false,weightStep:step});},'Incremento salvato.',false);}
  /** Abbina (o separa) due esercizi della seduta aperta come superset: stesso gruppo A–D, ognuno conserva le proprie serie. */
  pairWorkoutSuperset(id:string,partnerId:string){return this.change(d=>{
    const row=d.workoutExercises.find(e=>e.id===id);
    if(!row||!d.workouts.some(w=>w.id===row.workoutId&&w.status==='draft'))throw Error('L’allenamento non è più aperto.');
    const same=d.workoutExercises.filter(e=>e.workoutId===row.workoutId);
    const clear=(group?:string)=>{if(group)for(const e of same)if(e.superset===group)delete e.superset;};
    clear(row.superset);
    if(!partnerId)return;
    const partner=same.find(e=>e.id===partnerId&&e.id!==id);
    if(!partner)throw Error('Esercizio non trovato in questo allenamento.');
    clear(partner.superset);
    const used=new Set(same.map(e=>e.superset).filter(Boolean));
    const group=(['A','B','C','D'] as const).find(g=>!used.has(g));
    if(!group)throw Error('Puoi avere al massimo 4 superset in un allenamento.');
    row.superset=group;partner.superset=group;
  },partnerId?'Superset creato.':'Superset rimosso.',false);}
  substituteWorkoutExercise(id:string,replacementId:string,expectedExerciseId?:string){return this.gymEdit(id,d=>{
    if(expectedExerciseId&&d.workoutExercises.find(row=>row.id===id)?.exerciseId!==expectedExerciseId)throw Error('L’esercizio è cambiato. Riapri la sostituzione.');
    replaceWorkoutExercise(d,id,replacementId);
  },'sostituzione esercizio');}
  async replacePlanExercise(request: PlanReplacementRequest): Promise<PlanReplacementResult | null> {
    let result: PlanReplacementResult | null = null;
    const saved = await this.change(data => {result = replacePlanExercise(data, request);}, '', false);
    if (!saved || !result) return null;
    const applied = result as PlanReplacementResult;
    this.message.set(`${applied.changed} occorrenze sostituite in ${applied.days} allenamenti. Le sedute già registrate restano conservate.${applied.activePreserved ? ' Le serie di questa seduta mantengono l’esercizio già eseguito.' : ''}`);
    return applied;
  }
  private pendingSetAdds = new Map<string, Promise<boolean>>();
  addSet(id:string,kind:'work'|'warmup'='work'){
    const key=id+':'+kind, pending=this.pendingSetAdds.get(key);
    if(pending)return pending;
    const job=this.gymEdit(id,d=>{const list=d.sets.filter(s=>s.workoutExerciseId===id).sort((a,b)=>a.number-b.number),prev=list.at(-1);if(!d.workoutExercises.some(e=>e.id===id))throw Error('Esercizio non trovato.');if(list.length>=60)throw Error('Limite di serie per esercizio raggiunto.');const entry:WorkoutLogSet={id:uid(),workoutExerciseId:id,number:list.length+1,kind,weight:kind==='warmup'?0:prev?.weight||0,reps:prev?.reps||8,rpe:kind==='warmup'?undefined:prev?.rpe,rest:prev?.rest,notes:'',completed:false};d.sets.push(entry);if(kind==='warmup'){const ordered=[...list.filter(s=>s.kind==='warmup'),entry,...list.filter(s=>s.kind!=='warmup')];ordered.forEach((s,i)=>s.number=i+1);}},'aggiunta serie');
    this.pendingSetAdds.set(key,job);
    void job.finally(()=>{if(this.pendingSetAdds.get(key)===job)this.pendingSetAdds.delete(key);});
    return job;
  }
  async removeSet(id: string) {
    const exerciseId=this.data().sets.find(set=>set.id===id)?.workoutExerciseId||'';
    const exercise=this.data().workoutExercises.find(row=>row.id===exerciseId);
    const historical=this.data().workouts.some(row=>row.id===exercise?.workoutId&&row.status==='completed');
    const remove=(d:DataSet) => {
      const s = d.sets.find((s) => s.id === id);
      if (!s) return;
      d.sets = d.sets.filter((s) => s.id !== id);
      d.sets
        .filter((x) => x.workoutExerciseId === s.workoutExerciseId)
        .sort((a, b) => a.number - b.number)
        .forEach((x, i) => (x.number = i + 1));
    };
    return historical?this.change(remove,'Serie eliminata. Le altre serie restano conservate.',false):this.gymEdit(exerciseId,remove,'eliminazione serie');
  }
  async copyPrevious(id: string) {
    const ex = this.data().workoutExercises.find((e) => e.id === id);
    if (!ex) return;
    const prev = this.previous(ex.exerciseId, ex.workoutId,ex.machineSetup);
    if (!prev.length) return;
    const save=(fn:(d:DataSet)=>void)=>this.data().workouts.some(w=>w.id===ex.workoutId&&w.status==='draft')?this.gymEdit(id,fn,'copia valori'):this.change(fn,'Valori precedenti copiati.');
    return save((d) => {
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
    });
  }
  async finish(allowWithoutCompletedSets = false, workoutId = this.draft()?.id) {
    return this.change((d) => {
      const w = d.workouts.find((w) => w.id === workoutId && w.status === "draft");
      if (!w) return;
      const ids = new Set(
        d.workoutExercises.filter((e) => e.workoutId === w.id).map((e) => e.id),
      );
      if (!allowWithoutCompletedSets && !d.sets.some((s) => ids.has(s.workoutExerciseId) && s.completed))
        throw Error("Completa almeno una serie prima di concludere.");
      w.status = "completed";
      d.workoutUi=d.workoutUi.filter(x=>x.id!==w.id);
      w.endedAt = now();
      w.duration = w.duration>0?w.duration:w.durationUnknown||w.date<localDate(new Date(w.startedAt))?0:Math.max(
        1,
        Math.round((Date.now() - new Date(w.startedAt).getTime()) / 60000),
      );
      autoCompletePlan(d,d.plans.find(plan=>plan.id===w.planId));
    }, "Allenamento salvato. Ottimo lavoro!");
  }
  async reopenWorkout(id:string){
    return this.change(d=>{
      const workout=d.workouts.find(w=>w.id===id);
      if(!workout)throw Error('Allenamento non trovato.');
      if(workout.status==='draft')return;
      if(d.workouts.some(w=>w.status==='draft'))throw Error('Termina la sessione già aperta prima di riaprire questo allenamento.');
      if(workout.duration<=0)workout.durationUnknown=true;workout.status='draft';delete workout.endedAt;
      const plan=d.plans.find(plan=>plan.id===workout.planId);
      if(plan?.completionReason==='automatic'){delete plan.completedAt;delete plan.completionReason;plan.archived=false;}
    },'Allenamento riaperto. Serie e data sono conservate.',false);
  }
  /**
   * Annulla un allenamento iniziato e non ancora terminato: elimina la seduta aperta e le sue serie,
   * ma la seduta del calendario o del programma torna "in programma" invece di sparire.
   */
  async cancelWorkout(id: string) {
    if(this.data().workouts.find(workout=>workout.id===id)?.status!=='draft'){this.error.set('Si può annullare solo un allenamento ancora in corso.');return false;}
    const ok=await this.change(d=>{
      const workout=d.workouts.find(w=>w.id===id);
      if(workout?.status!=='draft')throw Error('Si può annullare solo un allenamento ancora in corso.');
      const ids=new Set(d.workoutExercises.filter(e=>e.workoutId===id).map(e=>e.id));
      d.sets=d.sets.filter(s=>!ids.has(s.workoutExerciseId));
      d.workoutExercises=d.workoutExercises.filter(e=>e.workoutId!==id);
      d.workouts=d.workouts.filter(w=>w.id!==id);
      d.workoutUi=d.workoutUi.filter(x=>x.id!==id);
      for(const event of d.scheduledWorkouts)if(event.workoutId===id)delete event.workoutId;
    },'Allenamento annullato. La seduta resta in programma.');
    if(ok)this.resume.clear(this.archiveKey());
    return ok;
  }
  async deleteWorkout(id: string, options?:{confirmedCompleted?:boolean}) {
    if(this.data().workouts.find(workout=>workout.id===id)?.status==='completed'&&(!this.settings().allowCompletedWorkoutDeletion||options?.confirmedCompleted!==true)){this.error.set('Per eliminare un allenamento terminato abilita l’opzione nelle impostazioni e conferma l’eliminazione.');return false;}
    return this.change((d) => {
      const workout=d.workouts.find(w=>w.id===id);
      if(workout?.status==='completed'&&(!d.settings[0].allowCompletedWorkoutDeletion||options?.confirmedCompleted!==true))throw Error('Per eliminare un allenamento terminato abilita l’opzione nelle impostazioni e conferma l’eliminazione.');
      const plan=d.plans.find(plan=>plan.id===workout?.planId);
      if(workout?.status==='completed'&&plan?.completionReason==='automatic'){delete plan.completedAt;delete plan.completionReason;plan.archived=false;}
      const ids = new Set(
        d.workoutExercises.filter((e) => e.workoutId === id).map((e) => e.id),
      );
      d.sets = d.sets.filter((s) => !ids.has(s.workoutExerciseId));
      d.workoutExercises = d.workoutExercises.filter((e) => e.workoutId !== id);
      d.workouts = d.workouts.filter((w) => w.id !== id);
      d.workoutUi=d.workoutUi.filter(x=>x.id!==id);
      // Delete the linked appointment atomically with the log. Unlinking it
      // would make the deleted workout reappear as a planned calendar entry.
      d.scheduledWorkouts=d.scheduledWorkouts.filter(event=>event.workoutId!==id);
    }, "Allenamento eliminato.");
  }
  sharedCatalog() { return !!this.auth?.user() && !this.auth.offlineMode(); }
  canEditCatalog() { return !this.auth?.viewAsClient?.() && (!this.sharedCatalog() || ["Admin","SuperAdmin"].includes(this.auth!.user()!.role)); }
  async refreshCatalog(accepted: AcceptedCatalogChanges = {}) {
    if (this.resetInProgress||!this.auth?.user() || this.auth.offlineMode()) return;
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
      if(this.resetInProgress||request!==this.catalogRequest)return;
      const next=await mergeCatalog(this.data(),{exercises,muscleGroups:catalog.muscleGroups},accepted);
      if(this.resetInProgress)return;
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
  async scheduleWorkout(date:string,dayId:string,notes='',id:string=uid(),repeatCount=1,options?:CalendarEventOptions) {
    return this.change(d=>{
      const day=d.days.find(x=>x.id===dayId),plan=d.plans.find(p=>p.id===day?.planId);
      if(!day||!plan||plan.archived)throw Error('Seleziona un giorno valido di un piano disponibile.');
      const dates=weeklyDates(date,repeatCount);
      const index=d.scheduledWorkouts.findIndex(e=>e.id===id);
      const previous=d.scheduledWorkouts[index];
      if(previous&&(previous.kind??'workout')!=='workout')throw Error('Questa voce è un’attività personale, non un allenamento del piano.');
      if(plan.program&&(repeatCount!==1||d.scheduledWorkouts.some(event=>event.id!==id&&event.planId===plan.id&&event.dayId===dayId))||previous&&d.plans.some(item=>item.id===previous.planId&&item.program)&&previous.dayId!==dayId)throw Error('Questa seduta del piano importato è già programmata. Usa Sposta per cambiare data o ora.');
      if(index>=0&&d.scheduledWorkouts[index].workoutId)throw Error('Una programmazione già avviata non può essere modificata.');
      if(index>=0&&repeatCount!==1)throw Error('Per ripetere l’allenamento crea una nuova programmazione.');
      const conflicts=scheduleConflicts(d,dates,plan.id,id);
      if(conflicts.length)throw Error('Programmazione bloccata: data occupata da un altro piano. '+conflicts[0]);
      if(typeof notes!=='string')throw Error('Le note non sono valide.');
      if(notes.length>2000&&notes!==previous?.notes)throw Error('Le note possono contenere al massimo 2000 caratteri.');
      const metadata=options===undefined?existingCalendarOptions(previous):calendarEventOptions(options);
      const events:ScheduledWorkout[]=dates.map((value,i)=>({id:i===0?id:uid(),date:value,dayId,planId:plan.id,planName:plan.name,dayName:day.name,notes:notes===previous?.notes?notes:notes.trim(),...(previous?.kind?{kind:previous.kind}:{}),...metadata}));
      for(const event of events)validateCalendarEvent(event);
      if(events.some(event=>calendarWorkoutDuplicate(d.scheduledWorkouts,event)))throw Error('Questo allenamento è già programmato in una delle date scelte. Scegli un orario diverso per una seconda seduta. Nessuna nuova programmazione è stata aggiunta.');
      if(index>=0)d.scheduledWorkouts[index]=events[0];else d.scheduledWorkouts.push(...events);
    },repeatCount>1?'Allenamenti programmati per '+repeatCount+' settimane.':'Allenamento programmato.',false);
  }
  async scheduleCalendarActivity(input:CalendarActivityInput,repeatCount=1) {
    return this.change(d=>{
      if(!input||typeof input!=='object'||!['cardio','mobility','rest','other'].includes(input.kind))throw Error('Scegli un tipo di attività valido.');
      if(typeof input.title!=='string'||typeof input.notes!=='undefined'&&typeof input.notes!=='string')throw Error('Titolo o note dell’attività non validi.');
      const id=input.id||uid(),dates=weeklyDates(input.date,repeatCount),index=d.scheduledWorkouts.findIndex(event=>event.id===id),previous=d.scheduledWorkouts[index];
      if(previous&&(previous.kind??'workout')==='workout')throw Error('Un allenamento del piano non può essere sostituito con un’attività personale.');
      if(previous?.workoutId||previous?.done)throw Error('Segna l’attività come da fare prima di modificarla.');
      if(previous&&repeatCount!==1)throw Error('Per ripetere l’attività crea una nuova programmazione.');
      const metadata=calendarEventOptions({time:input.time,durationMinutes:input.durationMinutes,estimatedCalories:input.estimatedCalories});
      const events:ScheduledWorkout[]=dates.map((date,i)=>({id:i===0?id:uid(),date,kind:input.kind,dayName:input.title.trim(),planId:'',dayId:'',planName:'',notes:(input.notes||'').trim(),...metadata,...(input.done!==undefined?{done:input.done}:{})}));
      for(const event of events)validateCalendarEvent(event);
      if(events.some(event=>d.scheduledWorkouts.some(other=>other.id!==id&&other.kind===event.kind&&other.date===event.date&&other.dayName.toLocaleLowerCase('it')===event.dayName.toLocaleLowerCase('it')&&(!other.time||!event.time||other.time===event.time))))throw Error('Questa attività è già presente nella data scelta. Scegli un orario diverso per una seconda attività.');
      if(previous)d.scheduledWorkouts[index]=events[0];else d.scheduledWorkouts.push(...events);
    },repeatCount>1?'Attività programmate per '+repeatCount+' settimane.':'Attività salvata nel calendario.',false);
  }
  async moveCalendarEvent(id:string,date:string,time?:string) {
    return this.change(d=>{
      const event=d.scheduledWorkouts.find(item=>item.id===id);if(!event)throw Error('Voce del calendario non trovata.');
      if(event.workoutId||event.done)throw Error('Puoi spostare soltanto una programmazione non ancora iniziata.');
      const candidate:ScheduledWorkout={...event,date};if(time!==undefined){if(time)candidate.time=time;else delete candidate.time;}
      validateCalendarEvent(candidate);
      if((event.kind??'workout')==='workout'){
        const plan=d.plans.find(plan=>plan.id===event.planId);if(!plan||plan.archived||!d.days.some(day=>day.id===event.dayId&&day.planId===plan.id))throw Error('Il giorno del piano non è più disponibile. La programmazione è conservata.');
        const conflicts=scheduleConflicts(d,[date],event.planId,id);if(conflicts.length)throw Error('Spostamento bloccato: '+conflicts[0]);
        if(calendarWorkoutDuplicate(d.scheduledWorkouts,candidate))throw Error('Questo allenamento è già programmato nella data e nell’orario scelti.');
      }else if(d.scheduledWorkouts.some(other=>other.id!==id&&other.kind===candidate.kind&&other.date===candidate.date&&other.dayName.toLocaleLowerCase('it')===candidate.dayName.toLocaleLowerCase('it')&&(!other.time||!candidate.time||other.time===candidate.time)))throw Error('Questa attività è già presente nella data scelta.');
      Object.assign(event,candidate);if(candidate.time===undefined)delete event.time;
    },'Programmazione spostata.',false);
  }
  async removeCalendarEvent(id:string) {
    return this.change(d=>{
      const event=d.scheduledWorkouts.find(item=>item.id===id);if(!event)throw Error('Voce del calendario non trovata.');
      if(event.done||d.workouts.some(workout=>workout.id===event.workoutId&&workout.status==='completed'))throw Error('Le attività completate restano nel calendario e nello storico.');
      d.scheduledWorkouts=d.scheduledWorkouts.filter(item=>item.id!==id);
    },'Programmazione rimossa. Gli allenamenti registrati restano conservati.',false);
  }
  async toggleCalendarActivity(id:string) {
    return this.change(d=>{
      const event=d.scheduledWorkouts.find(item=>item.id===id);if(!event)throw Error('Voce del calendario non trovata.');
      if(!['cardio','mobility','other'].includes(event.kind||'workout')||event.workoutId)throw Error('Per completare un allenamento usa la registrazione delle serie.');
      event.done=!event.done;validateCalendarEvent(event);
    },'Stato dell’attività aggiornato.',false);
  }
  async startScheduled(id:string,date?:string,options: {reusePreviousWeek?: boolean} = {}) {
    const event=this.data().scheduledWorkouts.find(e=>e.id===id);if(!event)return false;
    if((event.kind??'workout')!=='workout'){this.error.set('Questa è un’attività personale del calendario. Usa il comando per segnarla come completata.');return false;}
    const linked=this.data().workouts.find(w=>w.id===event.workoutId);if(linked?.status==='completed'){this.error.set('Questa sessione è già stata completata.');return false;}
    if(this.draft()&&this.data().scheduledWorkouts.some(e=>e.id!==id&&e.workoutId===this.draft()!.id)){this.error.set('La sessione in corso è già associata a un’altra programmazione.');return false;}
    if(this.draft()&&this.draft()!.id!==event.workoutId&&this.draft()!.dayId!==event.dayId){this.error.set('Concludi o riprendi prima la sessione già in corso.');return false;}
    if(!await this.start(event.dayId,date,options))return false;
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
