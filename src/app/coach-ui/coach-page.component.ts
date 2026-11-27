import { CommonModule } from '@angular/common';
import { Component, HostListener, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { COACH_GATEWAY } from './coach-gateway';
import { CATALOG, DAY_FOCUS_LABELS, DEFAULT_PROFILE, REPLACEMENTS_MAX, SPLIT_LABELS, VARIANTS, compactReplacements, findVariant, generatePlan, recommendNextSet, assessRecovery, suggestReplacement, weekFocuses } from '../coach/index';
import type { ActualSet, DayFocus, Equipment, ExercisePrescription, ExerciseReplacement, Muscle, PlanSession, Profile, RestPreference, SplitMode, TrainingPlan, RecoveryAssessment, VolumeLevel } from '../coach/models';

type Tab = 'plan' | 'train' | 'profile' | 'method';
type MuscleGroup = 'upper' | 'legs' | 'core';
type MuscleTone = 'push' | 'pull' | 'legs' | 'arms' | 'core';
const MUSCLE_GROUP: Record<Muscle, MuscleGroup> = { chest: 'upper', back: 'upper', shoulders: 'upper', biceps: 'upper', triceps: 'upper', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', core: 'core' };
const MUSCLE_TONE: Record<Muscle, MuscleTone> = { chest: 'push', shoulders: 'push', back: 'pull', biceps: 'arms', triceps: 'arms', quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', core: 'core' };
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
  /** Modalità «Cambia esercizi»: la selezione è per seduta + esercizio, quindi può coprire più sedute. */
  readonly selecting = signal(false);
  readonly selected = signal<ReadonlySet<string>>(new Set());
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
  readonly splitOptions: { id: SplitMode; name: string; hint: string }[] = [
    { id: 'auto', name: 'Automatica', hint: 'Decide il coach in base alle sedute' },
    { id: 'full-body', name: 'Full body', hint: 'Tutto il corpo in ogni seduta' },
    { id: 'upper-lower', name: 'Upper / Lower', hint: 'Parte alta e gambe alternate' },
    { id: 'push-pull-legs', name: 'Push / Pull / Legs', hint: 'Spinta, tirata e gambe' },
    { id: 'body-part', name: 'Per gruppi muscolari', hint: 'Pochi muscoli per seduta' },
    { id: 'custom', name: 'Personalizzata', hint: 'Scegli tu ogni seduta' },
  ];
  readonly focusOptions = (Object.keys(DAY_FOCUS_LABELS) as DayFocus[]).map(id => ({ id, name: DAY_FOCUS_LABELS[id] }));
  readonly minuteOptions = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 120];
  readonly blockOptions = [2, 3, 4, 5, 6, 8, 10, 12, 16];
  readonly exerciseCountOptions = [3, 4, 5, 6, 7, 8, 9, 10];
  readonly volumeOptions: { id: VolumeLevel; name: string }[] = [{ id: 'low', name: 'Ridotto' }, { id: 'standard', name: 'Standard' }, { id: 'high', name: 'Alto' }];
  readonly restOptions: { id: RestPreference; name: string }[] = [{ id: 'short', name: 'Brevi' }, { id: 'standard', name: 'Standard' }, { id: 'long', name: 'Lunghi' }];
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
  /** «4 × 60 min» oppure, con durate diverse per seduta, «4 sedute · 45–90 min». */
  readonly weekSummary = computed(() => {
    const p = this.plan(), prof = this.profile();
    if (!p?.sessions.length) return '';
    const minutes = p.sessions.map((_, i) => prof.sessionMinutes?.[i] ?? prof.minutesPerSession);
    const min = Math.min(...minutes), max = Math.max(...minutes);
    return min === max ? `${p.sessions.length} × ${min} min` : `${p.sessions.length} sedute · ${min}–${max} min`;
  });
  /** Struttura scelta dall'utente; null per la proposta automatica. */
  readonly structureLabel = computed(() => {
    const split = this.profile().split ?? 'auto';
    return split === 'auto' ? null : SPLIT_LABELS[split];
  });
  readonly weeklySets = computed(() => this.volumeRows().reduce((sum, m) => sum + m.sets, 0));
  readonly volumeSorted = computed(() => [...this.volumeRows()].sort((a, b) => b.sets - a.sets));
  readonly volumeGroups = computed(() => {
    const rows = this.volumeRows(), total = Math.max(1, this.weeklySets());
    const groups: { id: MuscleGroup; label: string }[] = [{ id: 'upper', label: 'Parte alta' }, { id: 'legs', label: 'Gambe' }, { id: 'core', label: 'Core' }];
    return groups.map(g => {
      const sets = rows.filter(m => MUSCLE_GROUP[m.id] === g.id).reduce((sum, m) => sum + m.sets, 0);
      return { ...g, sets, share: sets / total * 100 };
    }).filter(g => g.sets > 0);
  });
  inputWeight: number | null = null;
  inputReps = 10;
  inputRir: number | null = null;
  inputTechnique: ActualSet['technique'] = 'unknown';
  pain = false;
  excluded = '';
  preferred = '';

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
  /** Data locale (non UTC): dopo mezzanotte in Italia toISOString darebbe ancora il giorno precedente. */
  date() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
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
      this.draft.excludedExerciseIds = [...this.draft.excludedExerciseIds, this.excluded];
      this.removePreferred(this.excluded); this.markDirty();
    }
    this.excluded = '';
  }
  removeExclusion(id: string) { this.draft.excludedExerciseIds = this.draft.excludedExerciseIds.filter(x => x !== id); this.markDirty(); }

  /* Preferenze facoltative: il valore predefinito elimina il campo, così il profilo resta quello di prima. */
  splitMode(): SplitMode { return this.draft.split ?? 'auto'; }
  /** Sedute della settimana come le genererà il motore con le scelte correnti. */
  weekPlan(): DayFocus[] { return weekFocuses(this.draft); }
  setSplit(mode: SplitMode) {
    // «Personalizzata» parte dalla proposta visibile: l'utente modifica solo ciò che vuole.
    const days = this.weekPlan();
    if (mode === 'custom') this.draft.customDays = days; else delete this.draft.customDays;
    if (mode === 'auto') delete this.draft.split; else this.draft.split = mode;
    this.markDirty();
  }
  setDayFocus(index: number, focus: DayFocus) {
    const days = this.weekPlan(); days[index] = focus;
    this.draft.split = 'custom'; this.draft.customDays = days; this.markDirty();
  }
  daysChanged() {
    if (this.draft.split === 'custom') this.draft.customDays = weekFocuses(this.draft);
    if (this.draft.sessionMinutes) this.setSessionMinutesList(this.draft.sessionMinutes.slice(0, this.draft.daysPerWeek));
    this.markDirty();
  }
  sessionMinutesAt(index: number): number | null { return this.draft.sessionMinutes?.[index] ?? null; }
  setSessionMinutes(index: number, value: number | null) {
    const list = Array.from({ length: this.draft.daysPerWeek }, (_, i) => this.sessionMinutesAt(i));
    list[index] = value;
    this.setSessionMinutesList(list); this.markDirty();
  }
  private setSessionMinutesList(list: Array<number | null>) {
    if (list.some(value => value !== null)) this.draft.sessionMinutes = list; else delete this.draft.sessionMinutes;
  }
  /** Mantiene selezionabile anche un valore importato fuori dall'elenco standard. */
  withCurrent(options: number[], current: number | null | undefined): number[] {
    return current === null || current === undefined || options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
  }
  setBlockWeeks(weeks: number) { if (weeks === 4) delete this.draft.blockWeeks; else this.draft.blockWeeks = weeks; this.markDirty(); }
  setMaxExercises(value: number | null) { if (value === null) delete this.draft.maxExercises; else this.draft.maxExercises = value; this.markDirty(); }
  setVolume(value: VolumeLevel) { if (value === 'standard') delete this.draft.volume; else this.draft.volume = value; this.markDirty(); }
  setRest(value: RestPreference) { if (value === 'standard') delete this.draft.rest; else this.draft.rest = value; this.markDirty(); }
  setVary(value: boolean) { if (value) this.draft.varyRepeatedDays = true; else delete this.draft.varyRepeatedDays; this.markDirty(); }
  /** Solo esercizi con l'attrezzatura scelta e non esclusi: gli altri non potrebbero entrare nella scheda. */
  preferredChoices() {
    return CATALOG.filter(e => this.draft.equipment.includes(e.equipment) && !this.draft.excludedExerciseIds.includes(e.id) && !this.draft.preferredExerciseIds?.includes(e.id));
  }
  addPreferred() {
    if (this.preferred && !this.draft.preferredExerciseIds?.includes(this.preferred)) {
      this.draft.preferredExerciseIds = [...this.draft.preferredExerciseIds ?? [], this.preferred];
      this.draft.excludedExerciseIds = this.draft.excludedExerciseIds.filter(x => x !== this.preferred);
      this.markDirty();
    }
    this.preferred = '';
  }
  removePreferred(id: string) {
    if (!this.draft.preferredExerciseIds?.includes(id)) return;
    const next = this.draft.preferredExerciseIds.filter(x => x !== id);
    if (next.length) this.draft.preferredExerciseIds = next; else delete this.draft.preferredExerciseIds;
    this.markDirty();
  }
  exerciseName(id: string) { return CATALOG.find(e => e.id === id)?.name || id; }
  /** Muscolo principale dal catalogo, solo per etichetta e colore della riga. */
  primaryMuscle(id: string): { name: string; tone: MuscleTone } | null {
    const muscle = CATALOG.find(e => e.id === id)?.primary[0];
    if (!muscle) return null;
    return { name: this.muscleOptions.find(m => m.id === muscle)?.name ?? muscle, tone: MUSCLE_TONE[muscle] };
  }

  regenerate(useDraft = true) {
    this.error.set('');
    try {
      const base = structuredClone(useDraft ? this.draft : this.profile());
      // Il collegamento con l'archivio sceglie la variante realmente usata e ne separa carichi e macchina.
      const nextProfile = this.gateway.bindProfile?.(base) ?? base;
      const history = this.gateway.getHistory();
      const nextPlan = generatePlan(nextProfile, history, this.date());
      const recovery = assessRecovery(nextProfile, history, this.date());
      if (useDraft) this.gateway.saveProfile(nextProfile);
      this.profile.set(nextProfile); this.plan.set(nextPlan); this.recovery.set(recovery); this.draft = structuredClone(nextProfile);
      this.dirty.set(false); this.selectedDay.set(0); this.selectedExercise.set(0); this.resetSimulation();
      this.selecting.set(false); this.selected.set(new Set());
      if (useDraft) { this.notice.set('Piano aggiornato con i tuoi parametri. Controllalo prima di salvarlo.'); this.tab.set('plan'); }
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Non è stato possibile generare il piano. Controlla i parametri.'); }
  }

  readonly selectedCount = computed(() => this.selected().size);
  readonly replacementCount = computed(() => this.profile().replacements?.length ?? 0);
  private key(day: PlanSession, e: ExercisePrescription) { return `${day.id}|${e.exerciseId}`; }
  isSelected(day: PlanSession, e: ExercisePrescription) { return this.selected().has(this.key(day, e)); }
  allSelected(day: PlanSession) { return day.exercises.length > 0 && day.exercises.every(e => this.isSelected(day, e)); }
  isReplaced(e: ExercisePrescription) { return e.decisions.some(d => d.ruleId === 'replacement'); }
  toggleSelecting() { this.selecting.update(on => !on); this.selected.set(new Set()); }
  toggleSelect(day: PlanSession, e: ExercisePrescription) {
    const next = new Set(this.selected()); const k = this.key(day, e);
    if (!next.delete(k)) next.add(k);
    this.selected.set(next);
  }
  toggleDaySelection(day: PlanSession) {
    const next = new Set(this.selected()); const all = this.allSelected(day);
    for (const e of day.exercises) { if (all) next.delete(this.key(day, e)); else next.add(this.key(day, e)); }
    this.selected.set(next);
  }

  /** Sostituisce gli esercizi selezionati con alternative scelte dal coach (simili, poi dello stesso muscolo). */
  replaceSelected() {
    const plan = this.plan();
    if (!plan || this.dirty() || this.saving() || !this.selected().size) return;
    const profile = this.profile();
    let entries: ExerciseReplacement[] = [...profile.replacements ?? []];
    const taken = new Map<string, Set<string>>();
    const changed: { dayName: string; from: string; to: string }[] = [], missing: string[] = [];
    for (const day of plan.sessions) for (const e of day.exercises) {
      if (!this.isSelected(day, e)) continue;
      const already = taken.get(day.id) ?? new Set<string>();
      const suggestion = suggestReplacement({ ...profile, replacements: entries }, plan, day.id, e.exerciseId, already);
      if (!suggestion) { missing.push(e.name); continue; }
      already.add(suggestion.exerciseId); taken.set(day.id, already);
      entries = [...entries, { session: day.name, from: e.exerciseId, to: suggestion.exerciseId, kind: suggestion.kind }];
      changed.push({ dayName: day.name, from: e.name, to: suggestion.exerciseId });
    }
    if (!changed.length) { this.error.set(`Nessun esercizio alternativo compatibile con attrezzatura, livello ed esclusioni per: ${missing.join(', ')}.`); return; }
    // Le catene (A→B, poi B→C) si riducono a una voce: il profilo salvato con la scheda ha uno spazio limitato.
    if (entries.length > 12) entries = compactReplacements(entries);
    if (entries.length > REPLACEMENTS_MAX) { this.error.set('Hai già sostituito molti esercizi: ripristina la proposta del coach prima di farne altre.'); return; }
    const day = this.selectedDay();
    this.draft.replacements = entries;
    this.regenerate(true);
    if (this.error()) { this.draft = structuredClone(this.profile()); return; }
    this.selectedDay.set(Math.min(day, (this.plan()?.sessions.length ?? 1) - 1));
    const nameOf = (c: { dayName: string; to: string }) => this.plan()?.sessions.find(s => s.name === c.dayName)?.exercises.find(e => e.exerciseId === c.to)?.name ?? this.exerciseName(c.to);
    this.notice.set(`Sostituiti ${changed.length} esercizi: ${changed.map(c => `${c.dayName}: ${c.from} → ${nameOf(c)}`).join('; ')}.${missing.length ? ` Nessuna alternativa per: ${missing.join(', ')}.` : ''} I carichi dei nuovi esercizi si calibrano con una serie di prova.`);
  }

  /** Torna alla proposta originale del coach, senza le sostituzioni. */
  resetReplacements() {
    if (this.dirty() || this.saving() || !this.replacementCount()) return;
    const day = this.selectedDay();
    delete this.draft.replacements;
    this.regenerate(true);
    if (this.error()) { this.draft = structuredClone(this.profile()); return; }
    this.selectedDay.set(Math.min(day, (this.plan()?.sessions.length ?? 1) - 1));
    this.notice.set('Sostituzioni annullate: la scheda è tornata alla proposta del coach.');
  }

  /** Varianti reali tra cui scegliere; vuoto se l'esercizio ne ha una sola. */
  variantOptions(e: ExercisePrescription) {
    const options = VARIANTS[e.exerciseId]?.options ?? [];
    return options.length > 1 ? options : [];
  }
  /** Id della variante in uso, oppure '' se la scheda usa l'esercizio generico. */
  variantValue(e: ExercisePrescription) { return findVariant(e.exerciseId, e.variantId) ? e.variantId! : ''; }
  readonly hasVariants = computed(() => !!this.plan()?.sessions.some(day => day.exercises.some(e => this.variantOptions(e).length)));
  /** Cambia la variante di un esercizio in tutta la scheda e la ricorda per i prossimi piani. */
  setVariant(e: ExercisePrescription, variantId: string) {
    if (this.dirty() || this.saving() || !findVariant(e.exerciseId, variantId)) return;
    const day = this.selectedDay();
    this.draft.variants = { ...this.draft.variants, [e.exerciseId]: variantId };
    this.regenerate(true);
    if (this.error()) { this.draft = structuredClone(this.profile()); return; }
    this.selectedDay.set(Math.min(day, (this.plan()?.sessions.length ?? 1) - 1));
    this.notice.set(`Variante cambiata: ${findVariant(e.exerciseId, variantId)!.name}. Il carico si calibra per variante: se non l’hai mai usata parti da una serie di prova.`);
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
  /** Solo l'unità accanto al numero: loadLabel contiene già il valore («20 kg sulla stessa macchina») e lo ripeterebbe. */
  loadUnit(e: ExercisePrescription) { return e.loadType === 'bodyweight' ? '' : e.loadType === 'per-dumbbell' ? 'kg per manubrio' : e.loadType === 'total' ? 'kg totali' : 'kg sulla stessa macchina'; }
  loadText(e: ExercisePrescription) { return e.loadKg === null ? (e.loadType === 'bodyweight' ? 'Corpo libero' : 'Da calibrare') : `${e.loadKg.toLocaleString('it-IT')} kg`; }
  confidenceLabel(value: string) { return ({ initial: 'Prima impostazione', limited: 'Pochi dati', established: 'Storico confrontabile' } as Record<string, string>)[value] || value; }
  actionLabel(value: string) { return ({ calibrate: 'Troviamo il tuo carico', maintain: 'Mantieni il carico', increase: 'Sali di carico, solo oggi', reduce: 'Alleggerisci la prossima', rest: 'Prenditi più recupero', stop: 'Interrompi questo esercizio', complete: 'Esercizio completato' } as Record<string, string>)[value] || value; }
  rest(seconds: number) { return seconds >= 60 ? `${Math.floor(seconds / 60)}′${seconds % 60 ? ` ${seconds % 60}″` : ''}` : `${seconds}″`; }
}
