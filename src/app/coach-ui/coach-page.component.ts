import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { COACH_GATEWAY } from './coach-gateway';
import { CATALOG, DEFAULT_PROFILE, generatePlan, recommendNextSet, assessRecovery } from '../coach/index';
import type { ActualSet, Equipment, ExercisePrescription, Muscle, Profile, TrainingPlan, RecoveryAssessment } from '../coach/models';

type Tab = 'plan' | 'train' | 'profile' | 'method';
interface Source { id: string; title: string; authors?: string; year: number; url: string; principle: string; limitations: string; }

@Component({
  selector: 'gt-coach-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  // Shadow DOM: i temi globali dell'app (pulsanti, campi, schede) non devono alterare la veste chiara del coach.
  encapsulation: ViewEncapsulation.ShadowDom,
  templateUrl: './coach-page.component.html',
  styleUrl: './coach-page.component.css',
})
export class CoachPageComponent {
  readonly gateway = inject(COACH_GATEWAY);
  readonly tab = signal<Tab>('plan');
  readonly plan = signal<TrainingPlan | null>(null);
  readonly recovery = signal<RecoveryAssessment | null>(null);
  readonly profile = signal<Profile>(structuredClone(DEFAULT_PROFILE));
  draft: Profile = structuredClone(DEFAULT_PROFILE);
  readonly dirty = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly saving = signal(false);
  readonly selectedDay = signal(0);
  readonly selectedExercise = signal(0);
  readonly done = signal<ActualSet[]>([]);
  readonly sources = signal<Source[]>([]);
  readonly sourceError = signal(false);
  readonly catalog = CATALOG;
  readonly nav: { id: Tab; label: string; number: string }[] = [
    { id: 'plan', label: 'Il tuo piano', number: '01' },
    { id: 'train', label: 'Allenati', number: '02' },
    { id: 'profile', label: 'Il tuo profilo', number: '03' },
    { id: 'method', label: 'Metodo e fonti', number: '04' },
  ];
  readonly equipmentOptions: { id: Equipment; name: string }[] = [
    { id: 'machine', name: 'Macchine' }, { id: 'cable', name: 'Cavi' },
    { id: 'dumbbell', name: 'Manubri' }, { id: 'barbell', name: 'Bilanciere' },
    { id: 'bodyweight', name: 'Corpo libero' },
  ];
  readonly muscleOptions: { id: Muscle; name: string }[] = [
    { id: 'chest', name: 'Petto' }, { id: 'back', name: 'Dorso' }, { id: 'quads', name: 'Quadricipiti' },
    { id: 'hamstrings', name: 'Femorali' }, { id: 'glutes', name: 'Glutei' }, { id: 'shoulders', name: 'Spalle' },
    { id: 'biceps', name: 'Bicipiti' }, { id: 'triceps', name: 'Tricipiti' }, { id: 'calves', name: 'Polpacci' }, { id: 'core', name: 'Core' },
  ];
  readonly goalLabels = { hypertrophy: 'Crescita muscolare', strength: 'Forza', endurance: 'Resistenza muscolare' };
  readonly experienceLabels = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzato' };
  readonly session = computed(() => this.plan()?.sessions[this.selectedDay()] ?? null);
  readonly exercise = computed(() => this.session()?.exercises[this.selectedExercise()] ?? null);
  readonly recommendation = computed(() => {
    const prescription = this.exercise();
    if (!prescription) return null;
    try { return recommendNextSet({ profile: this.profile(), prescription, completedSets: this.done() }); }
    catch { return null; }
  });
  readonly totalSets = computed(() => this.plan()?.sessions.reduce((sum, day) => sum + day.exercises.reduce((n, e) => n + e.sets, 0), 0) ?? 0);
  readonly totalExercises = computed(() => this.plan()?.sessions.reduce((sum, day) => sum + day.exercises.length, 0) ?? 0);
  readonly volumeRows = computed(() => this.muscleOptions.map(m => ({ ...m, sets: this.plan()?.weeklyVolume[m.id] ?? 0 })).filter(m => m.sets > 0));
  readonly maxVolume = computed(() => Math.max(1, ...this.volumeRows().map(m => m.sets)));
  readonly workingDone = computed(() => this.done().filter(s => s.kind === 'working').length);
  inputWeight: number | null = null;
  inputReps = 10;
  inputRir: number | null = null;
  inputTechnique: ActualSet['technique'] = 'unknown';
  pain = false;
  excluded = '';

  constructor() {
    try {
      const saved = this.gateway.loadProfile();
      if (saved) { this.profile.set(structuredClone(saved)); this.draft = structuredClone(saved); }
    } catch { this.notice.set('Il profilo non è stato letto: puoi impostarlo da qui.'); }
    this.regenerate(false);
    void this.loadSources();
  }

  canLeave(): boolean {
    return !this.dirty() || window.confirm('Hai modificato i parametri senza aggiornare il piano. Vuoi uscire e scartare queste modifiche?');
  }
  @HostListener('window:beforeunload', ['$event'])
  protectDraft(event: BeforeUnloadEvent) {
    if (this.dirty()) { event.preventDefault(); event.returnValue = ''; }
  }

  private async loadSources() {
    try {
      const response = await fetch('/coach/sources.json');
      if (!response.ok) throw Error('Fonti non disponibili');
      const body = await response.json();
      if (!Array.isArray(body.sources)) throw Error('Formato fonti non valido');
      this.sources.set(body.sources);
    } catch { this.sourceError.set(true); }
  }

  get name() { return this.gateway.displayName()?.trim().split(' ')[0] || 'Coach'; }
  get historyCount() { return this.gateway.completedWorkoutCount(); }
  get todayLabel() { return new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }); }
  date() { return new Date().toISOString().slice(0, 10); }
  setTab(tab: Tab) { this.tab.set(tab); this.error.set(''); }
  markDirty() { this.dirty.set(true); this.notice.set(''); }

  toggleEquipment(id: Equipment) {
    this.draft.equipment = this.draft.equipment.includes(id) ? this.draft.equipment.filter(x => x !== id) : [...this.draft.equipment, id];
    this.markDirty();
  }
  toggleMuscle(id: Muscle) {
    this.draft.priorities = this.draft.priorities.includes(id) ? this.draft.priorities.filter(x => x !== id) : [...this.draft.priorities, id];
    this.markDirty();
  }
  addExclusion() {
    if (this.excluded && !this.draft.excludedExerciseIds.includes(this.excluded)) {
      this.draft.excludedExerciseIds = [...this.draft.excludedExerciseIds, this.excluded]; this.markDirty();
    }
    this.excluded = '';
  }
  removeExclusion(id: string) { this.draft.excludedExerciseIds = this.draft.excludedExerciseIds.filter(x => x !== id); this.markDirty(); }
  exerciseName(id: string) { return CATALOG.find(e => e.id === id)?.name || id; }

  regenerate(useDraft = true) {
    this.error.set('');
    try {
      const nextProfile = structuredClone(useDraft ? this.draft : this.profile());
      const history = this.gateway.getHistory();
      const nextPlan = generatePlan(nextProfile, history, this.date());
      const recovery = assessRecovery(nextProfile, history, this.date());
      if (useDraft) this.gateway.saveProfile(nextProfile);
      this.profile.set(nextProfile); this.plan.set(nextPlan); this.recovery.set(recovery); this.draft = structuredClone(nextProfile);
      this.dirty.set(false); this.selectedDay.set(0); this.selectedExercise.set(0); this.resetSimulation();
      if (useDraft) { this.notice.set('Piano aggiornato con i tuoi parametri. Controllalo prima di salvarlo.'); this.tab.set('plan'); }
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Non è stato possibile generare il piano. Controlla i parametri.'); }
  }

  selectDay(index: number) { this.selectedDay.set(index); this.selectedExercise.set(0); this.resetSimulation(); }
  selectExercise(index: number) { this.selectedExercise.set(Number(index)); this.resetSimulation(); }
  startTraining(index = 0) { this.selectedExercise.set(index); this.resetSimulation(); this.tab.set('train'); }
  resetSimulation() {
    this.done.set([]); this.inputWeight = this.exercise()?.loadKg ?? null;
    this.inputReps = this.exercise()?.repsMin ?? 10; this.inputRir = null;
    this.inputTechnique = 'unknown'; this.pain = false; this.error.set('');
  }
  recordSet() {
    const e = this.exercise(), r = this.recommendation();
    if (!e || !r || ['stop', 'complete'].includes(r.action)) return;
    const weight = e.loadType === 'bodyweight' ? null : this.inputWeight;
    if (!Number.isInteger(this.inputReps) || this.inputReps < 1 || this.inputReps > 100) { this.error.set('Inserisci da 1 a 100 ripetizioni intere.'); return; }
    if (e.loadType !== 'bodyweight' && (weight === null || !Number.isFinite(weight) || weight < 0)) { this.error.set('Inserisci il carico realmente usato nella serie di prova.'); return; }
    if (this.inputRir !== null && (!Number.isFinite(this.inputRir) || this.inputRir < 0 || this.inputRir > 10)) { this.error.set('Il margine deve essere tra 0 e 10, oppure non indicato.'); return; }
    this.done.update(sets => [...sets, { reps: this.inputReps, loadKg: weight, rir: this.inputRir, kind: 'working', technique: this.inputTechnique, pain: this.pain, targetRir: r.rir }]);
    this.error.set('');
    const next = this.recommendation();
    if (next?.loadKg !== null && next?.loadKg !== undefined) this.inputWeight = next.loadKg;
    this.inputReps = next?.repsMin ?? e.repsMin;
  }

  async savePlan() {
    const p = this.plan(); if (!p || this.saving() || this.dirty()) return;
    this.saving.set(true); this.error.set(''); this.notice.set('');
    try {
      const result = await this.gateway.savePlan(structuredClone(p));
      if (result.ok) this.notice.set(result.message); else this.error.set(result.message);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Salvataggio non riuscito. Il piano resta disponibile qui.'); }
    finally { this.saving.set(false); }
  }

  exportPlan() {
    const p = this.plan(); if (!p) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `gymtrack-coach-${this.date()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  loadText(e: ExercisePrescription) { return e.loadKg === null ? (e.loadType === 'bodyweight' ? 'Corpo libero' : 'Da calibrare') : `${e.loadKg.toLocaleString('it-IT')} kg`; }
  confidenceLabel(value: string) { return ({ initial: 'Prima impostazione', limited: 'Pochi dati', established: 'Storico confrontabile' } as Record<string, string>)[value] || value; }
  actionLabel(value: string) { return ({ calibrate: 'Troviamo il tuo carico', maintain: 'Mantieni il carico', reduce: 'Alleggerisci la prossima', rest: 'Prenditi più recupero', stop: 'Interrompi questo esercizio', complete: 'Esercizio completato' } as Record<string, string>)[value] || value; }
  rest(seconds: number) { return seconds >= 60 ? `${Math.floor(seconds / 60)}′${seconds % 60 ? ` ${seconds % 60}″` : ''}` : `${seconds}″`; }
}
