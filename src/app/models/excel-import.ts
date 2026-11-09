/** Parsed prescriptions only; importing never creates performed workout logs. */
export interface ExcelExerciseDraft {
  sourceId: string;
  name: string;
  order: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  rest: number;
  rirMin?: number;
  rirMax?: number;
  warmupNotes?: string;
  reference?: string;
  loadUnit?: string;
  notes: string;
}

export interface ExcelSessionDraft {
  week: number;
  date: string;
  title: string;
  /** JavaScript weekday: Sunday=0, Monday=1, … Saturday=6. */
  weekday: number;
  phase: string;
  notes: string;
  exercises: ExcelExerciseDraft[];
}

export interface ExcelProgramDraft {
  name: string;
  description: string;
  weeks: number;
  startDate: string;
  endDate: string;
  sourceName: string;
  sourceKind: "original" | "GT-1";
  fileHash: string;
  sessions: ExcelSessionDraft[];
  warnings: string[];
}
