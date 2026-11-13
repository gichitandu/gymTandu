import { Pipe, PipeTransform } from '@angular/core';
import { coachVisibleText } from '../services/coach-expert-adapter';

/** Keep versioned coach metadata out of user-facing program text. */
@Pipe({ name: 'coachText', standalone: true })
export class CoachVisibleTextPipe implements PipeTransform {
  transform(value: string | null | undefined): string { return coachVisibleText(value ?? undefined); }
}
