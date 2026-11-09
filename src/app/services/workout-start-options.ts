import { Injectable, signal } from "@angular/core";

export interface WorkoutStartRequest {
  dayName: string;
  planName: string;
  previousDate: string;
  defaultReuse: boolean;
}
@Injectable({ providedIn: "root" })
export class WorkoutStartOptionsService {
  readonly current = signal<WorkoutStartRequest | null>(null);
  private resolve?: (reuse: boolean | null) => void;
  choose(request: WorkoutStartRequest): Promise<boolean | null> {
    if (this.current()) return Promise.resolve(null);
    this.current.set(request);
    return new Promise((resolve) => (this.resolve = resolve));
  }
  answer(reuse: boolean | null) {
    const resolve = this.resolve;
    this.resolve = undefined;
    this.current.set(null);
    resolve?.(reuse);
  }
  ngOnDestroy() {
    this.answer(null);
  }
}
