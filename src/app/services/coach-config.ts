/**
 * Guida allenamento: preset e soglie del motore di regole (`coach-engine.ts`).
 *
 * Tutto ciò che decide un suggerimento è qui, in forma leggibile. Sono euristiche
 * di partenza, non promesse di risultato: i valori della scheda hanno sempre la
 * precedenza e l'utente può cambiare obiettivo, esperienza e preferenze.
 */
export type CoachGoal = 'hypertrophy' | 'strength' | 'endurance';
export type CoachExperience = 'beginner' | 'intermediate' | 'advanced';
export type CoachMovement = 'compound' | 'isolation';
/** Fase scelta dall'utente: normale, fase di spinta (RIR 0 consentito se abilitato) o scarico. */
export type CoachPhase = 'standard' | 'intensification' | 'deload';

export interface CoachPreset {
  sets: number;
  repsMin: number;
  repsMax: number;
  /** Ripetizioni in riserva obiettivo (RIR). */
  rir: number;
  /** Recupero in secondi. */
  rest: number;
}

export interface CoachConfig {
  version: number;
  presets: Record<CoachGoal, Record<CoachMovement, CoachPreset>>;
  /** Nota mostrata con i preset: nessun range è l'unico efficace. */
  presetNotes: Record<CoachGoal, string>;
  experience: Record<CoachExperience, { rirOffset: number; label: string }>;
  thresholds: {
    /** Differenza di RIR considerata "nel target" (nessuna modifica). */
    rirTolerance: number;
    /** RIR dichiarato almeno così sotto il minimo obiettivo = serie molto più dura. */
    muchHarderRir: number;
    /** RIR dichiarato almeno così sopra il massimo obiettivo = serie troppo facile. */
    tooEasyRir: number;
    /** Senza RIR: ripetizioni oltre il massimo del range per considerare la serie troppo facile. */
    tooEasyRepsOverMax: number;
    /** Calo di ripetizioni tra serie consecutive considerato fisiologico. */
    repDropTolerance: number;
    /** Variazione di carico intra-seduta massima, in rapporto al carico. */
    maxSessionChangeRatio: number;
    /** Recupero aggiuntivo proposto quando una serie è più dura del previsto. */
    extraRestSeconds: number;
    /** Incremento oltre questa frazione del carico = troppo grande per un salto diretto. */
    maxIncrementRatio: number;
    /** Ripetizioni oltre il massimo da raggiungere prima di un incremento troppo grande. */
    extraRepsWhenIncrementTooBig: Record<CoachGoal, number>;
    /** Sedute al massimo del range richieste quando il RIR non è stato registrato. */
    confirmSessionsWithoutRir: number;
    /** Sedute difficili consecutive prima di ridurre il carico. */
    difficultSessionsBeforeReduce: number;
    /** Sedute difficili consecutive prima di ridurre anche le serie. */
    difficultSessionsBeforeFewerSets: number;
    /** Sedute allo stesso carico senza miglioramento per parlare di stallo. */
    stallSessions: number;
    /** Sedute di stallo dopo cui si propone di ripartire con un carico più basso. */
    stallResetSessions: number;
    /** Riduzione del carico per ripartire dopo uno stallo o in caso di difficoltà ripetute. */
    resetLoadRatio: number;
    /** Sedute confrontabili considerate al massimo. */
    historySessions: number;
  };
  deload: { setsFactor: number; loadRatio: number; rirBonus: number };
  globalTrend: {
    /** Esercizi confrontabili minimi in una seduta per valutare la tendenza generale. */
    minExercises: number;
    /** Quota di esercizi in calo per considerare la seduta in peggioramento. */
    declineShare: number;
    /** Sedute consecutive in peggioramento prima di proporre uno scarico. */
    sessions: number;
    /** Calo di ripetizioni totali (stesso carico) considerato peggioramento. */
    repsDrop: number;
  };
  failure: {
    minExperience: CoachExperience;
    /** Solo nella fase di spinta scelta dall'utente. */
    phases: CoachPhase[];
  };
  dropset: {
    loadReduction: number;
    stopRir: number;
    /** Al massimo una dropset per esercizio, ogni N sedute confrontabili. */
    everySessions: number;
    /** Al massimo queste dropset nella stessa seduta (tutti gli esercizi). */
    maxPerWorkout: number;
    minExperience: CoachExperience;
  };
  /** Attrezzature adatte a RIR 0 e dropset (si può cambiare per esercizio). */
  safeEquipment: string[];
  /** Parole che indicano un esercizio di isolamento, se l'utente non lo ha indicato. */
  isolationKeywords: string[];
  isolationGroups: string[];
}

export const COACH_CONFIG: CoachConfig = {
  version: 1,
  presets: {
    hypertrophy: {
      compound: { sets: 3, repsMin: 6, repsMax: 10, rir: 2, rest: 150 },
      isolation: { sets: 3, repsMin: 10, repsMax: 15, rir: 1, rest: 90 },
    },
    strength: {
      compound: { sets: 4, repsMin: 3, repsMax: 6, rir: 2, rest: 180 },
      isolation: { sets: 3, repsMin: 6, repsMax: 10, rir: 2, rest: 120 },
    },
    endurance: {
      compound: { sets: 3, repsMin: 12, repsMax: 20, rir: 2, rest: 75 },
      isolation: { sets: 2, repsMin: 15, repsMax: 25, rir: 1, rest: 60 },
    },
  },
  presetNotes: {
    hypertrophy:
      'Punto di partenza: anche range più bassi o più alti (circa 5–30 ripetizioni) funzionano se le serie arrivano vicino al limite.',
    strength:
      'Punto di partenza: la forza si costruisce con carichi alti e poche ripetizioni, ma anche serie da 6–8 contribuiscono.',
    endurance:
      'Punto di partenza: range alti e recuperi brevi; puoi alternarli con serie più pesanti.',
  },
  experience: {
    beginner: { rirOffset: 1, label: 'Principiante' },
    intermediate: { rirOffset: 0, label: 'Intermedio' },
    advanced: { rirOffset: 0, label: 'Avanzato' },
  },
  thresholds: {
    rirTolerance: 1,
    muchHarderRir: 2,
    tooEasyRir: 3,
    tooEasyRepsOverMax: 3,
    repDropTolerance: 2,
    maxSessionChangeRatio: 0.1,
    extraRestSeconds: 30,
    maxIncrementRatio: 0.1,
    extraRepsWhenIncrementTooBig: { strength: 1, hypertrophy: 3, endurance: 4 },
    confirmSessionsWithoutRir: 2,
    difficultSessionsBeforeReduce: 2,
    difficultSessionsBeforeFewerSets: 3,
    stallSessions: 3,
    stallResetSessions: 4,
    resetLoadRatio: 0.1,
    historySessions: 8,
  },
  deload: { setsFactor: 0.6, loadRatio: 0.1, rirBonus: 2 },
  globalTrend: { minExercises: 3, declineShare: 0.5, sessions: 2, repsDrop: 2 },
  failure: { minExperience: 'intermediate', phases: ['intensification'] },
  dropset: { loadReduction: 0.2, stopRir: 1, everySessions: 2, maxPerWorkout: 2, minExperience: 'intermediate' },
  safeEquipment: ['macchina', 'macchina a dischi', 'cavi', 'cavo', 'macchina assistita'],
  isolationKeywords: [
    'croci', 'alzate', 'curl', 'extension', 'estension', 'pushdown', 'kickback', 'pectoral',
    'fly', 'crunch', 'scrollate', 'face pull', 'pullover', 'adductor', 'abductor', 'polpacci',
    'calf', 'extrarotazion', 'french press', 'reverse fly', 'pulldown braccia tese',
  ],
  isolationGroups: ['braccia', 'polpacci', 'core'],
};

export const EXPERIENCE_ORDER: CoachExperience[] = ['beginner', 'intermediate', 'advanced'];

export const GOAL_LABELS: Record<CoachGoal, string> = {
  hypertrophy: 'Ipertrofia',
  strength: 'Forza',
  endurance: 'Resistenza muscolare',
};
export const PHASE_LABELS: Record<CoachPhase, string> = {
  standard: 'Normale',
  intensification: 'Fase di spinta',
  deload: 'Scarico',
};

/** Impostazioni iniziali prudenti: nessun cedimento, nessuna dropset, RIR più alto. */
export const DEFAULT_COACH_SETTINGS = {
  enabled: true,
  goal: 'hypertrophy' as CoachGoal,
  experience: 'beginner' as CoachExperience,
  phase: 'standard' as CoachPhase,
  allowFailure: false,
  allowDropsets: false,
};
