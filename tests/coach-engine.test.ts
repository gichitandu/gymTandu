import { describe, expect, it } from 'vitest';
import {
  CATALOG, DEFAULT_PROFILE, assessRecovery, generatePlan, recommendExercise, recommendNextSet,
} from '../src/app/coach/index';
import type { ActualSet, ExercisePrescription, Profile, WorkoutHistory } from '../src/app/coach/models';

const AS_OF = '2026-11-13';
const profile = (patch: Partial<Profile> = {}): Profile => ({
  ...structuredClone(DEFAULT_PROFILE), ...patch,
});
const prescription = (patch: Partial<ExercisePrescription> = {}): ExercisePrescription => ({
  exerciseId: 'machine-chest-press', name: 'Chest press', equipmentKey: 'chest-press:gym-A:seat-3',
  sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 40,
  loadLabel: '40 kg', loadType: 'stack', calibration: false, confidence: 'limited',
  progression: 'maintain', decisions: [], alternatives: [], failureAllowedLastSet: false,
  ...patch,
});
const actualSet = (patch: Partial<ActualSet> = {}): ActualSet => ({
  reps: 12, loadKg: 40, rir: 2, kind: 'working', technique: 'good', pain: false, ...patch,
});
const successfulHistory = (patch: Partial<WorkoutHistory> = {}): WorkoutHistory => ({
  id: 'history-1', date: '2026-11-10', exerciseId: 'machine-chest-press',
  equipmentKey: 'chest-press:gym-A:seat-3', completed: true,
  prescribedSets: 3, repsMin: 8, repsMax: 12,
  sets: Array.from({ length: 3 }, () => actualSet()), ...patch,
});
const successPair = (): WorkoutHistory[] => [
  successfulHistory({ id: 'older', date: '2026-11-06' }),
  successfulHistory({ id: 'newer', date: '2026-11-10' }),
];
const recommend = (history: WorkoutHistory[], patch: Partial<Profile> = {}, rx = prescription()) =>
  recommendExercise({ profile: profile(patch), prescription: rx, history, asOf: AS_OF });

describe('partenza senza storico', () => {
  it('genera una scheda con carichi da calibrare, senza dedurli dal fisico', () => {
    const plan = generatePlan(profile(), [], AS_OF);
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions.flatMap(s => s.exercises).length).toBeGreaterThan(0);
    for (const exercise of plan.sessions.flatMap(s => s.exercises)) {
      if (exercise.loadType !== 'bodyweight') {
        expect(exercise.loadKg).toBeNull();
        expect(exercise.calibration).toBe(true);
      }
      expect(exercise.repsMin).toBeGreaterThan(0);
      expect(exercise.repsMax).toBeGreaterThanOrEqual(exercise.repsMin);
      expect(exercise.rir).toBeGreaterThan(0);
      expect(exercise.decisions.length).toBeGreaterThan(0);
    }
  });

  it('è deterministico anche quando lo storico arriva in ordine diverso', () => {
    const histories = successPair();
    expect(generatePlan(profile(), histories, AS_OF)).toEqual(generatePlan(profile(), [...histories].reverse(), AS_OF));
    expect(generatePlan(profile(), [], AS_OF)).toEqual(generatePlan(profile(), [], AS_OF));
  });

  it('mantiene gli input intatti', () => {
    const p = profile(); const history = successPair();
    const before = structuredClone({ p, history });
    generatePlan(p, history, AS_OF);
    recommendExercise({ profile: p, prescription: prescription(), history, asOf: AS_OF });
    expect({ p, history }).toEqual(before);
  });

  it('rispetta esclusioni esplicite', () => {
    const excluded = ['machine-chest-press', 'dumbbell-bench-press', 'machine-leg-press'];
    const plan = generatePlan(profile({ excludedExerciseIds: excluded }), [], AS_OF);
    for (const e of plan.sessions.flatMap(s => s.exercises)) expect(excluded).not.toContain(e.exerciseId);
  });

  it.each([
    { equipment: ['machine'] }, { equipment: ['dumbbell'] }, { equipment: ['bodyweight'] },
    { equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'] },
  ] as { equipment: Profile['equipment'] }[])('usa solo attrezzatura dichiarata: $equipment', ({ equipment }) => {
    const plan = generatePlan(profile({ equipment }), [], AS_OF);
    for (const e of plan.sessions.flatMap(s => s.exercises)) {
      const metadata = CATALOG.find(item => item.id === e.exerciseId);
      expect(metadata, e.exerciseId).toBeDefined();
      expect(equipment).toContain(metadata!.equipment);
    }
    if (equipment.length === 1 && equipment[0] === 'bodyweight') {
      expect([...plan.warnings, ...plan.sessions.flatMap(s => s.warnings)].length).toBeGreaterThan(0);
    }
  });

  it('non aggiunge tecniche avanzate quando sono disabilitate', () => {
    const plan = generatePlan(profile(), [], AS_OF);
    for (const e of plan.sessions.flatMap(s => s.exercises)) {
      expect(e.dropSet).toBeUndefined();
      expect(e.supersetGroup).toBeUndefined();
      expect(e.failureAllowedLastSet).toBe(false);
    }
    expect(plan.supplementalDropSets).toBe(0);
  });

  it('non attiva cedimento o dropset per un principiante anche se li seleziona', () => {
    const plan = generatePlan(profile({ allowFailure: true, allowDropSets: true }), [], AS_OF);
    expect(plan.sessions.flatMap(s => s.exercises).every(e => !e.dropSet && !e.failureAllowedLastSet)).toBe(true);
  });

  it('limita cedimento e dropset agli esercizi di isolamento stabili quando abilitati', () => {
    const plan = generatePlan(profile({ experience: 'advanced', minutesPerSession: 75, allowFailure: true, allowDropSets: true }), [], AS_OF);
    for (const rx of plan.sessions.flatMap(s => s.exercises)) {
      if (rx.dropSet || rx.failureAllowedLastSet) {
        const metadata = CATALOG.find(e => e.id === rx.exerciseId)!;
        expect(metadata.isolation).toBe(true);
        expect(metadata.stable).toBe(true);
      }
      if (rx.dropSet) {
        expect(rx.dropSet.afterSet).toBe(rx.sets);
        expect(rx.dropSet.maxDrops).toBe(1);
        expect(rx.dropSet.countsAsAdditionalWork).toBe(true);
      }
    }
    expect(plan.supplementalDropSets).toBe(plan.sessions.flatMap(s => s.exercises).filter(e => e.dropSet).length);
  });

  it('ogni superset proposto contiene esattamente due esercizi distinti', () => {
    const plan = generatePlan(profile({ experience: 'intermediate', minutesPerSession: 60, allowSupersets: true }), [], AS_OF);
    for (const session of plan.sessions) {
      const groups = new Set(session.exercises.flatMap(e => e.supersetGroup ? [e.supersetGroup] : []));
      for (const group of groups) {
        const members = session.exercises.filter(e => e.supersetGroup === group);
        expect(members).toHaveLength(2);
        expect(members[0].exerciseId).not.toBe(members[1].exerciseId);
      }
    }
  });

  it('riporta il lavoro diretto separatamente dal lavoro secondario', () => {
    const plan = generatePlan(profile(), [], AS_OF);
    for (const muscle of Object.keys(plan.weeklyVolume) as (keyof typeof plan.weeklyVolume)[]) {
      const direct = plan.sessions.flatMap(s => s.exercises).reduce((total, rx) =>
        total + (CATALOG.find(e => e.id === rx.exerciseId)!.primary.includes(muscle) ? rx.sets : 0), 0);
      expect(plan.weeklyVolume[muscle], muscle).toBe(direct);
      expect(plan.secondaryExposure[muscle]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('progressione fra sedute', () => {
  it('propone il minimo aumento dopo successi completi e confrontabili', () => {
    const result = recommend(successPair());
    expect(result.progression).toBe('increase');
    expect(result.loadKg).toBeGreaterThan(40);
    expect(result.loadKg).toBeLessThanOrEqual(44);
    expect(result.calibration).toBe(false);
    expect(result.decisions.length).toBeGreaterThan(0);
  });

  it('un solo successo non basta per aumentare', () => {
    expect(recommend([successfulHistory()]).progression).not.toBe('increase');
  });

  it('non trasferisce il carico da una macchina o regolazione diversa', () => {
    const result = recommend(successPair().map(h => ({ ...h, equipmentKey: 'another-gym:other-machine' })));
    expect(result.progression).not.toBe('increase');
    expect(result.loadKg).toBeNull();
    expect(result.calibration).toBe(true);
  });

  it('non trasferisce lo storico da un altro esercizio', () => {
    const result = recommend(successPair().map(h => ({ ...h, exerciseId: 'machine-shoulder-press' })));
    expect(result.loadKg).toBeNull();
    expect(result.calibration).toBe(true);
  });

  it('non promuove quando il RIR manca', () => {
    const result = recommend(successPair().map(h => ({ ...h, sets: h.sets.map(s => ({ ...s, rir: null })) })));
    expect(result.progression).not.toBe('increase');
    expect(result.loadKg).toBe(40);
  });

  it('non scambia due serie completate per un programma da tre serie', () => {
    expect(recommend(successPair().map(h => ({ ...h, sets: h.sets.slice(0, 2) }))).progression).not.toBe('increase');
  });

  it('non usa sedute aperte come prova di progressione', () => {
    const result = recommend(successPair().map(h => ({ ...h, completed: false })));
    expect(result.progression).not.toBe('increase');
    expect(result.loadKg).toBeNull();
  });

  it('richiede un contesto di prescrizione per aumentare', () => {
    expect(recommend(successPair().map(h => ({ ...h, prescribedSets: undefined, repsMin: undefined, repsMax: undefined }))).progression).not.toBe('increase');
  });

  it('non promuove quando il range storico è diverso', () => {
    expect(recommend(successPair().map(h => ({ ...h, repsMin: 4, repsMax: 6 }))).progression).not.toBe('increase');
  });

  it('non somma riscaldamento e dropset alle serie allenanti', () => {
    const history = successPair().map(h => ({ ...h, sets: [
      actualSet({ kind: 'warmup', reps: 20, loadKg: 20, rir: null }),
      ...h.sets,
      actualSet({ kind: 'drop', reps: 6, loadKg: 30, rir: 0 }),
    ] }));
    expect(recommend(history).progression).toBe('increase');
  });

  it('non promuove usando soltanto riscaldamento e dropset', () => {
    const history = successPair().map(h => ({ ...h, sets: h.sets.map(s => ({ ...s, kind: 'warmup' as const })) }));
    expect(recommend(history).loadKg).toBeNull();
  });

  it('richiede una nuova calibrazione quando il riferimento è vecchio', () => {
    const history = successPair().map((h, i) => ({ ...h, date: `2026-09-${String(i + 10).padStart(2, '0')}` }));
    const result = recommend(history);
    expect(result.loadKg).toBeNull();
    expect(result.calibration).toBe(true);
  });

  it('ignora risultati futuri', () => {
    expect(recommend(successPair().map(h => ({ ...h, date: '2026-12-10' }))).loadKg).toBeNull();
  });

  it('evita un incremento sproporzionato quando il gradino disponibile è grande', () => {
    const result = recommend(successPair(), { loadSettings: {
      'machine-chest-press': { incrementKg: 20, minKg: 0, equipmentKey: prescription().equipmentKey },
    } });
    expect(result.progression).not.toBe('increase');
    expect(result.loadKg).toBe(40);
  });

  it('rispetta la lista discreta dei carichi realmente disponibili', () => {
    const result = recommend(successPair(), { loadSettings: {
      'machine-chest-press': { incrementKg: 2.5, minKg: 5, availableLoadsKg: [5, 10, 20, 40, 42, 50], equipmentKey: prescription().equipmentKey },
    } });
    expect(result.loadKg).toBe(42);
  });

  it('non promuove con un peggioramento tecnico', () => {
    expect(recommend(successPair().map(h => ({ ...h, sets: h.sets.map(s => ({ ...s, technique: 'degraded' as const })) }))).progression).not.toBe('increase');
  });

  it('non applica il carico della prima serie a tutte le altre quando lo storico usa carichi diversi', () => {
    const result = recommend(successPair().map(h => ({
      ...h, sets: [actualSet({ loadKg: 40 }), actualSet({ loadKg: 37.5 }), actualSet({ loadKg: 35 })],
    })));
    expect(result.progression).not.toBe('increase');
    expect(result.calibration).toBe(true);
    expect(result.loadKg).toBeNull();
  });

  it('una singola giornata difficile non riduce automaticamente il carico', () => {
    const history = [successfulHistory({ sets: Array.from({ length: 3 }, () => actualSet({ reps: 6, rir: 0 })) })];
    expect(recommend(history).progression).not.toBe('reduce');
  });
});

describe('prescrizione della prossima serie', () => {
  it('dà precedenza al dolore su qualunque prestazione', () => {
    const result = recommendNextSet({ profile: profile(), prescription: prescription(), completedSets: [actualSet({ pain: true })] });
    expect(result.action).toBe('stop');
    expect(result.isTemporary).toBe(true);
  });

  it('non richiede altre serie dopo aver completato quelle previste', () => {
    const result = recommendNextSet({ profile: profile(), prescription: prescription(), completedSets: Array.from({ length: 3 }, () => actualSet()) });
    expect(result.action).toBe('complete');
  });

  it('non presume difficoltà precisa quando il RIR non è dichiarato', () => {
    const result = recommendNextSet({ profile: profile(), prescription: prescription(), completedSets: [actualSet({ reps: 10, rir: null })] });
    expect(result.action).toBe('maintain');
    expect(result.loadKg).toBe(40);
  });

  it('non aumenta il carico per un normale calo di ripetizioni fra serie', () => {
    const result = recommendNextSet({ profile: profile(), prescription: prescription(), completedSets: [actualSet({ reps: 12 }), actualSet({ reps: 10 })] });
    expect(result.action).toBe('maintain');
    expect(result.loadKg).toBe(40);
  });

  it('mantiene null il carico finché non è stato calibrato', () => {
    const result = recommendNextSet({ profile: profile(), prescription: prescription({ loadKg: null, calibration: true, progression: 'calibrate' }), completedSets: [] });
    expect(result.action).toBe('calibrate');
    expect(result.loadKg).toBeNull();
  });

  it('rispetta la disattivazione del cedimento anche se una vecchia prescrizione lo consentiva', () => {
    const result = recommendNextSet({
      profile: profile({ experience: 'advanced', allowFailure: false }),
      prescription: prescription({ exerciseId: 'machine-leg-extension', failureAllowedLastSet: true }),
      completedSets: [actualSet({ reps: 10, rir: 2 }), actualSet({ reps: 10, rir: 2 })],
    });
    expect(result.rir).toBeGreaterThan(0);
  });

  it('rispetta la disattivazione delle dropset anche con una vecchia prescrizione', () => {
    const result = recommendNextSet({
      profile: profile({ experience: 'advanced', allowDropSets: false }),
      prescription: prescription({ dropSet: {
        afterSet: 3, reductionPercent: 20, targetRir: 1, maxDrops: 1,
        countsAsAdditionalWork: true, instruction: 'Riduci il carico.',
      } }),
      completedSets: Array.from({ length: 3 }, () => actualSet()),
    });
    expect(result.dropSet).toBeUndefined();
  });
});

describe('valutazione dello scarico', () => {
  const difficultHistory = (exerciseId: string, equipmentKey: string): WorkoutHistory[] =>
    ['2026-11-03', '2026-11-07', '2026-11-11'].map((date, index) => successfulHistory({
      id: `${exerciseId}-${index}`, date, exerciseId, equipmentKey,
      sets: Array.from({ length: 3 }, () => actualSet({ reps: 6, rir: 0 })),
    }));

  it('non dichiara recupero fisiologico certo in assenza di dati', () => {
    const result = assessRecovery(profile(), [], AS_OF);
    expect(result.action).toBe('continue');
    expect(result.automatic).toBe(false);
  });

  it('una difficoltà locale richiede revisione locale e non scarico generalizzato', () => {
    const result = assessRecovery(profile(), difficultHistory('machine-chest-press', prescription().equipmentKey), AS_OF);
    expect(result.action).toBe('review-exercise');
    expect(result.automatic).toBe(false);
    expect(result.affectedExerciseIds).toContain('machine-chest-press');
  });

  it('propone uno scarico dopo difficoltà ripetute su più esercizi senza applicarlo automaticamente', () => {
    const result = assessRecovery(profile(), [
      ...difficultHistory('machine-chest-press', prescription().equipmentKey),
      ...difficultHistory('machine-row', 'row:gym-A'),
    ], AS_OF);
    expect(result.action).toBe('consider-deload');
    expect(result.automatic).toBe(false);
    expect(result.suggestedVolumeFactor).toBeGreaterThan(0);
    expect(result.suggestedVolumeFactor).toBeLessThan(1);
    expect(result.affectedExerciseIds).toContain('machine-row');
  });
});

describe('vincoli su molte configurazioni', () => {
  it('genera programmi compatibili o dichiara i limiti senza promettere tempi impossibili', () => {
    for (const goal of ['hypertrophy', 'strength', 'endurance'] as const) {
      for (const daysPerWeek of [2, 3, 4, 5]) {
        for (const minutesPerSession of [30, 45, 60, 75]) {
          const p = profile({ goal, daysPerWeek, minutesPerSession });
          const plan = generatePlan(p, [], AS_OF);
          expect(plan.sessions, `${goal}/${daysPerWeek}/${minutesPerSession}`).toHaveLength(daysPerWeek);
          for (const day of plan.sessions) {
            expect(day.exercises.length).toBeGreaterThan(0);
            expect(day.estimatedMinutes).toBeLessThanOrEqual(minutesPerSession);
            expect(new Set(day.exercises.map(e => e.exerciseId)).size).toBe(day.exercises.length);
          }
        }
      }
    }
  });

  it('segnala limiti espliciti su configurazioni estreme di tempo e attrezzatura', () => {
    for (const equipment of [['machine'], ['cable'], ['dumbbell'], ['bodyweight'], ['barbell']] as Profile['equipment'][]) {
      for (const daysPerWeek of [1, 6]) {
        for (const minutesPerSession of [20, 120]) {
          const p = profile({ equipment, experience: 'advanced', daysPerWeek, minutesPerSession });
          const plan = generatePlan(p, [], AS_OF);
          expect(plan.sessions).toHaveLength(daysPerWeek);
          for (const day of plan.sessions) {
            for (const rx of day.exercises) {
              expect(equipment).toContain(CATALOG.find(e => e.id === rx.exerciseId)!.equipment);
            }
            if (day.estimatedMinutes > minutesPerSession || day.exercises.length < 3) {
              expect(day.warnings.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('rifiuta una configurazione senza esercizi disponibili con un errore leggibile', () => {
    expect(() => generatePlan(profile({ excludedExerciseIds: CATALOG.map(e => e.id) }), [], AS_OF)).toThrow(/esercizio compatibile/i);
  });
});
