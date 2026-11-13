import { InjectionToken } from '@angular/core';
import type { Profile, TrainingPlan, WorkoutHistory } from '../coach/models';

export interface CoachGateway {
  readonly mode: 'demo' | 'gymtrack';
  displayName(): string;
  getHistory(): WorkoutHistory[];
  completedWorkoutCount(): number;
  loadProfile(): Profile | null;
  saveProfile(profile: Profile): void;
  savePlan(plan: TrainingPlan): Promise<{ ok: boolean; message: string }>;
}

export const COACH_GATEWAY = new InjectionToken<CoachGateway>('GYMTRACK_COACH_GATEWAY');
