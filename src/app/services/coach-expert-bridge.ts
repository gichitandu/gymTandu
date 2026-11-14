import { Injectable, inject } from '@angular/core';
import { Store } from './store';
import { DEFAULT_PROFILE, generatePlan, recommendExercise, recommendNextSet } from '../coach/index';
import type { ExercisePrescription, Profile, SetRecommendation, TrainingPlan } from '../coach/models';
import type { CoachGateway } from '../coach-ui/coach-gateway';
import {
  actualSetFromNative, annotateSetNotes, bindProfileToGymTrack, equipmentIdentity,
  getWorkoutPrescription, historyFromGymTrack, initialGymTrackProfile,
  insertCoachPlan, profileFromSavedPlan, readCoachMetadata, type SetFeedback,
} from './coach-expert-adapter';

/** Integrates the pure coach into the real archive, using the existing write queue. */
@Injectable({ providedIn: 'root' })
export class CoachExpertBridge implements CoachGateway {
  readonly mode = 'gymtrack' as const;
  private readonly store = inject(Store);

  private profileKey(): string { return `gymtrack:coach-profile:v1:${this.store.archiveKey()}`; }
  displayName(): string { return this.store.profile()?.name || 'Atleta'; }
  completedWorkoutCount(): number { return this.store.data().workouts.filter(row => row.status === 'completed').length; }
  getHistory() { return historyFromGymTrack(this.store.data()); }

  loadProfile(): Profile | null {
    const fallback = () => {
      try {
        const saved = profileFromSavedPlan(this.store.data());
        if (saved) { generatePlan(saved, [], new Date().toISOString()); return saved; }
      } catch { /* Invalid imported metadata must not prevent the questionnaire from opening. */ }
      return initialGymTrackProfile(this.store.data());
    };
    try {
      const saved = localStorage.getItem(this.profileKey());
      if (!saved) return fallback();
      const envelope = JSON.parse(saved);
      if (envelope?.schema !== 1 || !envelope.profile) return fallback();
      // Reuse the engine's validation boundary before consuming untrusted persisted preferences.
      const profile = bindProfileToGymTrack(envelope.profile as Profile, this.store.data());
      generatePlan(profile, [], new Date().toISOString());
      return profile;
    } catch { return fallback(); }
  }

  saveProfile(profile: Profile): void {
    const bound = bindProfileToGymTrack(profile, this.store.data());
    generatePlan(bound, [], new Date().toISOString());
    try { localStorage.setItem(this.profileKey(), JSON.stringify({ schema: 1, profile: bound })); }
    catch { throw Error('Preferenze del coach non salvate sul dispositivo. Esporta il piano per conservarle.'); }
  }

  async savePlan(plan: TrainingPlan): Promise<{ ok: boolean; message: string }> {
    try {
      // Validation is side-effect free. Persistence stays in a single atomic queued change.
      generatePlan(plan.profile, [], plan.createdAt);
      const ok = await this.store.change(data => { insertCoachPlan(data, plan); }, 'Scheda Coach salvata. Le altre schede e lo storico sono conservati.');
      return { ok, message: ok ? 'Scheda salvata in Le mie schede.' : this.store.error() || 'Salvataggio non riuscito. Riprova dopo aver verificato l’archivio.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Piano del coach non valido.';
      this.store.error.set(message);
      return { ok: false, message };
    }
  }

  /** Read-only proposal for the native workout editor. Existing handlers record actual data. */
  prescriptionForWorkout(workoutExerciseId: string): ExercisePrescription | null {
    const exercise = this.store.data().workoutExercises.find(row => row.id === workoutExerciseId);
    return exercise ? getWorkoutPrescription(exercise) : null;
  }

  liveSuggestion(workoutExerciseId: string, currentSetId: string): SetRecommendation | null {
    return this.suggestForSet(workoutExerciseId, currentSetId);
  }

  suggestForSet(workoutExerciseId: string, currentSetId: string): SetRecommendation | null {
    const data = this.store.data();
    const exercise = data.workoutExercises.find(row => row.id === workoutExerciseId);
    const current = data.sets.find(row => row.id === currentSetId && row.workoutExerciseId === workoutExerciseId);
    if (!exercise || !current || current.completed || current.kind === 'warmup') return null;
    const snapshot = getWorkoutPrescription(exercise);
    if (!snapshot) return null; // Leave legacy and externally authored plans on their existing coach.
    const workout = data.workouts.find(row => row.id === exercise.workoutId);
    if (!workout || workout.status !== 'draft') return null;
    try {
      const nativePlan = data.plans.find(row => row.id === workout.planId);
      const savedPlanProfile = readCoachMetadata<{ schema: number; profile?: Profile }>(nativePlan?.description);
      const profile = bindProfileToGymTrack(savedPlanProfile?.schema === 1 && savedPlanProfile.profile ? savedPlanProfile.profile : this.loadProfile() ?? structuredClone(DEFAULT_PROFILE), data);
      const key = equipmentIdentity(exercise.exerciseId, exercise.machineSetup);
      if (profile.loadSettings?.[snapshot.exerciseId]) profile.loadSettings[snapshot.exerciseId].equipmentKey = key;
      const working = data.sets.filter(row => row.workoutExerciseId === exercise.id && row.kind !== 'warmup');
      const prescription = { ...snapshot, equipmentKey: key, sets: working.length,
        repsMin: exercise.repsMin ?? snapshot.repsMin, repsMax: exercise.repsMax ?? snapshot.repsMax,
        restSeconds: exercise.rest, rir: exercise.rirMin ?? snapshot.rir };
      if (snapshot.equipmentKey !== key) {
        prescription.loadKg = null;
        prescription.calibration = true;
      }
      const today = new Date().toISOString();
      const nextPrescription = recommendExercise({ profile, prescription, history: this.getHistory(), asOf: today });
      const done = working.filter(row => row.completed && row.number < current.number).sort((a, b) => a.number - b.number).map(row => actualSetFromNative(row));
      return recommendNextSet({ profile, prescription: nextPrescription, completedSets: done });
    } catch { return null; }
  }

  /** Optional structured self-report; never infer technique or pain from free text. */
  async saveSetFeedback(setId: string, feedback: SetFeedback): Promise<boolean> {
    const row = this.store.data().sets.find(item => item.id === setId);
    if (!row) return false;
    try { return await this.store.updateSet(setId, { notes: annotateSetNotes(row.notes, feedback) }); }
    catch (error) { this.store.error.set(error instanceof Error ? error.message : 'Feedback non salvato.'); return false; }
  }
}
