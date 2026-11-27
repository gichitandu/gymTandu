import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth';
import type { CoachSetResult, CoachSuggestion, Readiness } from './coach-shadow';
import type { CoachReview } from './coach-review';

/**
 * Coach Ombra con l'AI già in uso per i pasti (Gemini dell'admin, altrimenti Workers AI) attraverso
 * il Worker dell'app. L'AI riceve solo dati dell'allenamento in forma compatta (nessun nome, email o
 * dato del profilo) e restituisce un parere scritto: carichi e ripetizioni restano quelli calcolati
 * dal Coach Ombra sul dispositivo e non vengono mai sostituiti dalla risposta.
 */
export type CoachAiKind = 'set' | 'session';
export interface CoachAiAdvice {
  kind: CoachAiKind;
  headline: string;
  advice: string;
  answer: string;
  stance: 'agree' | 'cautious';
  cues: string[];
  positives: string[];
  improvements: string[];
  focus: string;
  provider: 'gemini' | 'cloudflare';
  /** Analisi AI ancora disponibili oggi per questo account. */
  remaining?: number;
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const list = (value: unknown) => (Array.isArray(value) ? value : []).map((item) => text(item, 200)).filter(Boolean).slice(0, 3);

/** Risposta del server controllata di nuovo sul dispositivo: null se non contiene un parere. */
export function validCoachAiAdvice(value: unknown, kind: CoachAiKind): CoachAiAdvice | null {
  const data = value as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const advice = text(data['advice'], 900), answer = text(data['answer'], 600);
  if (!advice && !answer) return null;
  const remaining = Number(data['remaining']);
  return {
    kind,
    headline: text(data['headline'], 100),
    advice,
    answer,
    stance: data['stance'] === 'cautious' ? 'cautious' : 'agree',
    cues: kind === 'set' ? list(data['cues']) : [],
    positives: kind === 'session' ? list(data['positives']) : [],
    improvements: kind === 'session' ? list(data['improvements']) : [],
    focus: kind === 'session' ? text(data['focus'], 200) : '',
    provider: data['provider'] === 'gemini' ? 'gemini' : 'cloudflare',
    ...(Number.isInteger(remaining) && remaining >= 0 ? { remaining } : {}),
  };
}

const round = (value: number) => Math.round(value * 100) / 100;
const loadLabels: Record<string, string> = {
  external: 'carico esterno', bodyweight: 'corpo libero', 'weighted-bodyweight': 'corpo libero con zavorra', assisted: 'corpo libero con assistenza',
};
const readinessLabels: Record<Readiness, string> = { low: 'basso', normal: 'normale', high: 'ottimo' };

export interface CoachAiSetInput {
  exercise: string;
  muscle?: string;
  equipment?: string;
  description?: string;
  loadMode: string;
  unit: string;
  repsMin: number;
  repsMax: number;
  targetRpe?: number;
  setNumber: number;
  plannedSets: number;
  today: CoachSetResult[];
  history: { date?: string; sets: CoachSetResult[] }[];
  suggestion: CoachSuggestion | null;
  readiness?: Readiness;
  sore?: boolean;
  weeklySets?: number;
  week?: number;
  phase?: string;
  /** Conversione da kg all'unità dell'utente. */
  toUnit: (kg: number) => number;
}

/** Contesto compatto della serie in corso, con chiavi in italiano leggibili dal modello. */
export function coachAiSetContext(input: CoachAiSetInput) {
  const loaded = input.loadMode !== 'bodyweight';
  const set = (row: CoachSetResult) => ({
    ...(loaded ? { carico: round(input.toUnit(row.weight)) } : {}),
    ripetizioni: row.reps,
    ...(row.rpe !== undefined ? { rpe: row.rpe } : {}),
    ...(typeof row.rir === 'number' ? { riserva: row.rir } : {}),
    ...(row.technique === 'degraded' ? { tecnica: 'peggiorata' } : {}),
    ...(row.pain ? { dolore: true } : {}),
  });
  const s = input.suggestion;
  return {
    esercizio: input.exercise,
    ...(input.muscle ? { muscolo: input.muscle } : {}),
    ...(input.equipment ? { attrezzo: input.equipment } : {}),
    ...(input.description ? { descrizione: input.description.slice(0, 200) } : {}),
    modalitaCarico: loadLabels[input.loadMode] ?? input.loadMode,
    unita: input.unit,
    obiettivo: { ripetizioni: input.repsMin === input.repsMax ? String(input.repsMin) : `${input.repsMin}–${input.repsMax}`, ...(input.targetRpe !== undefined ? { rpe: round(input.targetRpe) } : {}) },
    serie: { numero: input.setNumber, previste: input.plannedSets },
    oggi: input.today.slice(0, 12).map(set),
    sedutePrecedenti: input.history.slice(0, 3).map((session) => ({ ...(session.date ? { data: session.date } : {}), serie: session.sets.slice(0, 8).map(set) })),
    ...(s ? {
      proposta: {
        azione: s.title,
        tipo: s.action,
        ...(loaded && s.action !== 'stop' ? { carico: round(input.toUnit(s.weight)) } : {}),
        ...(s.action !== 'stop' ? { ripetizioni: s.reps } : {}),
        motivo: s.reason,
        dati: s.evidence.slice(0, 10),
        affidabilita: s.confidence,
        ...(s.flags.length ? { segnali: s.flags } : {}),
        ...(s.restBonus ? { recuperoExtraSecondi: s.restBonus } : {}),
        ...(s.rest ? { recuperoConsigliatoSecondi: s.rest.seconds } : {}),
        ...(s.form !== undefined ? { formaOggiPercento: s.form } : {}),
      },
    } : {}),
    ...(input.readiness || input.sore ? { checkin: { ...(input.readiness ? { recupero: readinessLabels[input.readiness] } : {}), ...(input.sore ? { muscoloIndolenzito: true } : {}) } } : {}),
    ...(input.weeklySets !== undefined ? { serieSettimanaliMuscolo: round(input.weeklySets) } : {}),
    ...(input.week || input.phase ? { programma: { ...(input.week ? { settimana: input.week } : {}), ...(input.phase ? { fase: input.phase } : {}) } } : {}),
  };
}

export interface CoachAiSessionInput {
  dayName: string;
  planName?: string;
  date: string;
  duration?: number | null;
  unit: string;
  review: CoachReview;
  next: { name: string; target: string; title: string }[];
  records: { name: string; kind: 'load' | 'reps'; before: number; after: number }[];
  toUnit: (kg: number) => number;
}

/** Contesto compatto della seduta conclusa: serie in forma breve per restare entro i limiti del server. */
export function coachAiSessionContext(input: CoachAiSessionInput) {
  const r = input.review;
  const setLabel = (loaded: boolean) => (set: CoachReview['exercises'][number]['sets'][number]) =>
    (loaded ? `${round(input.toUnit(set.weight))}×${set.reps}` : `${set.reps} rip.`) + (set.effort !== undefined ? ` RPE ${set.effort}` : '');
  return {
    seduta: input.dayName,
    ...(input.planName ? { piano: input.planName } : {}),
    data: input.date,
    ...(input.duration ? { durataMinuti: input.duration } : {}),
    unita: input.unit,
    serieAllenanti: r.workingSets,
    sforzo: { conSforzoIndicato: r.declared, utili0a3Riserva: r.effective - r.failure, cedimento: r.failure, facili4piuRiserva: r.easy },
    ...(r.pain ? { serieConDolore: r.pain } : {}),
    ...(r.degraded ? { serieTecnicaPeggiorata: r.degraded } : {}),
    esercizi: r.exercises.slice(0, 12).map((exercise) => {
      const next = input.next.find((row) => row.name === exercise.name);
      return {
        nome: exercise.name,
        ...(exercise.repsMin !== undefined ? { obiettivo: exercise.repsMin === exercise.repsMax ? String(exercise.repsMin) : `${exercise.repsMin}–${exercise.repsMax}` } : {}),
        serie: exercise.sets.slice(0, 8).map(setLabel(exercise.loadMode !== 'bodyweight')).join(', '),
        ...(next ? { prossimaVolta: `${next.title}: ${next.target}` } : {}),
      };
    }),
    muscoli: r.muscles.slice(0, 8).map((muscle) => ({ nome: muscle.name, serieOggi: round(muscle.session), serie7giorni: round(muscle.weekly) })),
    ...(input.records.length ? { record: input.records.slice(0, 5).map((row) => `${row.name}: ${row.kind === 'load' ? 'carico' : 'ripetizioni'} ${row.kind === 'load' ? round(input.toUnit(row.before)) : row.before} → ${row.kind === 'load' ? round(input.toUnit(row.after)) : row.after}`) } : {}),
    valutazioneCoach: r.insights.slice(0, 8).map((item) => `${item.title}: ${item.text}`),
  };
}

@Injectable({ providedIn: 'root' })
export class CoachAiService {
  private auth = inject(AuthService);
  readonly busy = signal(false);
  private controller?: AbortController;

  /** Serve l'account online: offline il Coach Ombra resta attivo senza AI. */
  online() {
    return !!this.auth.user() && !this.auth.offlineMode() && (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  async ask(kind: CoachAiKind, context: object, question = ''): Promise<CoachAiAdvice> {
    if (this.busy()) throw Error('Il coach sta già rispondendo.');
    if (!this.online()) throw Error('Il coach AI richiede la connessione e l’accesso all’account. Il Coach Ombra funziona anche offline.');
    const controller = new AbortController();
    this.controller = controller;
    this.busy.set(true);
    let timedOut = false;
    // Gemini può riprovare più volte prima di passare a Workers AI: stesso margine della lettura dei pasti.
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 100000);
    try {
      const response = await fetch('/api/coach-ai', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, context, question: question.trim().slice(0, 300) }),
      });
      let data: any;
      try { data = await response.json(); } catch { throw Error('Coach AI non disponibile. Riprova più tardi.'); }
      if (!response.ok) throw Error(typeof data?.error === 'string' && data.error ? data.error.slice(0, 300) : 'Analisi del coach non riuscita. Riprova.');
      const advice = validCoachAiAdvice(data, kind);
      if (!advice) throw Error('Il coach AI ha risposto in un formato non valido. Riprova.');
      return advice;
    } catch (error) {
      if (timedOut) throw Error('Il coach AI sta impiegando troppo tempo. Riprova tra poco.');
      if ((error as Error)?.name === 'AbortError') throw Error('Richiesta al coach annullata.');
      throw error instanceof Error ? error : Error('Analisi del coach non riuscita. Riprova.');
    } finally {
      clearTimeout(timer);
      this.busy.set(false);
      if (this.controller === controller) this.controller = undefined;
    }
  }

  cancel() { this.controller?.abort(); }
}
