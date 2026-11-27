import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_PROFILE, REPLACEMENTS_MAX, VARIANTS, compactReplacements, generatePlan, suggestReplacement } from '../src/app/coach/index';
import type { ExerciseReplacement, Profile, TrainingPlan } from '../src/app/coach/models';
import { defaultExercises, defaultGroups } from '../src/app/core/default-catalog';
import { bindProfileToGymTrack, historyFromGymTrack, insertCoachPlan, profileFromSavedPlan, readCoachMetadata } from '../src/app/services/coach-expert-adapter';

const AS_OF = '2026-11-27';
const ALL: Profile['equipment'] = ['machine', 'cable', 'dumbbell', 'barbell', 'bodyweight'];
const profile = (patch: Partial<Profile> = {}): Profile => ({ ...structuredClone(DEFAULT_PROFILE), experience: 'intermediate', equipment: [...ALL], daysPerWeek: 4, minutesPerSession: 75, ...patch });
const plan = (p: Profile) => generatePlan(p, [], AS_OF);
const ids = (p: TrainingPlan, session: string) => p.sessions.find(s => s.name === session)!.exercises.map(e => e.exerciseId);
const core = (id: string) => CATALOG.find(e => e.id === id)!;
const swap = (session: string, from: string, to: string, kind: ExerciseReplacement['kind'] = 'similar'): ExerciseReplacement => ({ session, from, to, kind });

describe('proposta di sostituti', () => {
  const base = plan(profile());
  const upperA = base.sessions.find(s => s.name === 'Upper A')!;

  it('propone prima un esercizio simile: stesso movimento e stesso muscolo', () => {
    const s = suggestReplacement(profile(), base, upperA.id, 'machine-chest-press');
    expect(s).not.toBeNull();
    const ex = core(s!.exerciseId);
    expect(s!.kind).toBe('similar');
    expect(ex.movement).toBe(core('machine-chest-press').movement);
    expect(ex.primary).toContain('chest');
  });

  it('non ripropone esercizi già nella seduta, né quelli già scelti nella stessa richiesta', () => {
    const inSession = new Set(upperA.exercises.map(e => e.exerciseId));
    for (const e of upperA.exercises) {
      const s = suggestReplacement(profile(), base, upperA.id, e.exerciseId);
      if (s) { expect(inSession.has(s.exerciseId), `${e.exerciseId} → ${s.exerciseId}`).toBe(false); expect(s.exerciseId).not.toBe(e.exerciseId); }
    }
    const first = suggestReplacement(profile(), base, upperA.id, 'machine-chest-press')!;
    const second = suggestReplacement(profile(), base, upperA.id, 'machine-row', new Set([first.exerciseId]))!;
    expect(second.exerciseId).not.toBe(first.exerciseId);
  });

  it('se non c’è un simile ripiega su un altro esercizio dello stesso muscolo', () => {
    // Con le sole macchine l'unico isolamento per i quadricipiti è la leg extension: il resto è un altro movimento.
    const p = profile({ equipment: ['machine'], daysPerWeek: 4 });
    const machinePlan = plan(p);
    const lower = machinePlan.sessions.find(s => s.exercises.some(e => e.exerciseId === 'machine-leg-extension'))!;
    const s = suggestReplacement(p, machinePlan, lower.id, 'machine-leg-extension', new Set(['machine-leg-press']));
    if (s) expect(core(s.exerciseId).primary).toContain('quads');
    const sector = suggestReplacement(p, machinePlan, lower.id, 'machine-leg-extension');
    expect(sector === null || core(sector.exerciseId).primary.includes('quads')).toBe(true);
  });

  it('rispetta attrezzatura, esclusioni e livello', () => {
    const p = profile({ equipment: ['machine', 'dumbbell'], experience: 'beginner' });
    const bp = plan(p);
    const day = bp.sessions[0]!;
    for (const e of day.exercises) {
      const s = suggestReplacement(p, bp, day.id, e.exerciseId);
      if (!s) continue;
      expect(['machine', 'dumbbell']).toContain(core(s.exerciseId).equipment);
      expect(core(s.exerciseId).beginnerSuitable).toBe(true);
    }
    const top = suggestReplacement(profile(), base, upperA.id, 'machine-chest-press')!.exerciseId;
    const excluded = suggestReplacement(profile({ excludedExerciseIds: [top] }), base, upperA.id, 'machine-chest-press');
    expect(excluded?.exerciseId).not.toBe(top);
  });

  it('non rimbalza sull’esercizio appena sostituito, finché ci sono alternative', () => {
    const first = suggestReplacement(profile(), base, upperA.id, 'machine-chest-press')!;
    const p = profile({ replacements: [swap('Upper A', 'machine-chest-press', first.exerciseId)] });
    const after = plan(p);
    const next = suggestReplacement(p, after, after.sessions.find(s => s.name === 'Upper A')!.id, first.exerciseId);
    expect(next).not.toBeNull();
    expect(next!.exerciseId).not.toBe('machine-chest-press');
  });

  it('con un esercizio con carico propone alternative con carico, non a corpo libero', () => {
    const p = profile({ experience: 'beginner', equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'] });
    const bp = plan(p);
    for (const day of bp.sessions) for (const e of day.exercises) {
      if (core(e.exerciseId).loadType === 'bodyweight') continue;
      const s = suggestReplacement(p, bp, day.id, e.exerciseId);
      if (!s) continue;
      const loaded = ['machine', 'cable', 'dumbbell', 'barbell'] as const;
      // Se esiste almeno un'alternativa con carico nello stesso gruppo di ricerca, quella viene prima del corpo libero.
      const sameKind = CATALOG.filter(c => c.id !== e.exerciseId && c.primary.some(m => core(e.exerciseId).primary.includes(m)) && c.movement === core(e.exerciseId).movement
        && (loaded as readonly string[]).includes(c.equipment) && p.equipment.includes(c.equipment) && c.beginnerSuitable && !day.exercises.some(x => x.exerciseId === c.id));
      if (sameKind.length) expect(core(s.exerciseId).loadType, `${e.exerciseId} → ${s.exerciseId}`).not.toBe('bodyweight');
    }
    // Il caso segnalato: leg press → non squat a corpo libero.
    const legDay = bp.sessions.find(d => d.exercises.some(e => e.exerciseId === 'machine-leg-press'))!;
    expect(suggestReplacement(p, bp, legDay.id, 'machine-leg-press')?.exerciseId).not.toBe('bodyweight-squat');
  });

  it('restituisce null se la seduta o l’esercizio non esistono', () => {
    expect(suggestReplacement(profile(), base, 'session-99', 'machine-chest-press')).toBeNull();
    expect(suggestReplacement(profile(), base, upperA.id, 'esercizio-inventato')).toBeNull();
  });
});

describe('piano con sostituzioni', () => {
  /** Il piano riporta il profilo (e ne deriva l'id): ciò che non deve cambiare sono sedute, volumi e avvisi. */
  const content = (p: TrainingPlan) => ({ sessions: p.sessions, weeklyVolume: p.weeklyVolume, secondaryExposure: p.secondaryExposure, warnings: p.warnings, decisions: p.decisions });

  it('senza sostituzioni, o con elenco vuoto, il piano non cambia', () => {
    expect(content(plan(profile({ replacements: [] })))).toEqual(content(plan(profile())));
  });

  it('mette l’esercizio scelto al posto dell’originale, nella stessa posizione e solo in quella seduta', () => {
    const before = plan(profile());
    const index = ids(before, 'Upper A').indexOf('machine-chest-press');
    const after = plan(profile({ replacements: [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press')] }));
    expect(ids(after, 'Upper A')[index]).toBe('dumbbell-bench-press');
    expect(ids(after, 'Upper A')).not.toContain('machine-chest-press');
    expect(new Set(ids(after, 'Upper A')).size).toBe(ids(after, 'Upper A').length);
    const prescription = after.sessions.find(s => s.name === 'Upper A')!.exercises[index]!;
    expect(prescription.decisions[0]).toMatchObject({ ruleId: 'replacement', kind: 'constraint' });
    expect(prescription.decisions[0]!.message).toContain('Chest press');
    // Le altre sedute restano come proposte dal coach.
    expect(after.sessions.filter(s => s.name !== 'Upper A')).toEqual(before.sessions.filter(s => s.name !== 'Upper A').map(s => expect.objectContaining({ name: s.name })));
    expect(ids(after, 'Upper B')).toEqual(ids(before, 'Upper B'));
  });

  it('l’esercizio sostituito non rientra in un altro punto della stessa seduta', () => {
    const after = plan(profile({ replacements: [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press'), swap('Upper A', 'machine-row', 'dumbbell-row')], maxExercises: 10 }));
    expect(ids(after, 'Upper A')).not.toContain('machine-chest-press');
    expect(ids(after, 'Upper A')).not.toContain('machine-row');
  });

  it('segue le sostituzioni a catena e usa l’ultima disponibile', () => {
    const chain = [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press'), swap('Upper A', 'dumbbell-bench-press', 'barbell-bench-press')];
    expect(ids(plan(profile({ replacements: chain })), 'Upper A')).toContain('barbell-bench-press');
    // Se l'ultimo non è più disponibile (attrezzatura), vale il precedente.
    const noBarbell = plan(profile({ replacements: chain, equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'] }));
    expect(ids(noBarbell, 'Upper A')).toContain('dumbbell-bench-press');
  });

  it('se la sostituzione non è applicabile tiene l’originale e lo segnala', () => {
    const none = plan(profile({ equipment: ['machine', 'cable'], replacements: [swap('Upper A', 'machine-chest-press', 'barbell-bench-press')] }));
    const day = none.sessions.find(s => s.name === 'Upper A')!;
    expect(day.exercises.map(e => e.exerciseId)).toContain('machine-chest-press');
    expect(day.warnings.some(w => w.includes('Sostituzione non applicata'))).toBe(true);
    // Esercizio già presente nella seduta: non si duplica.
    const dup = plan(profile({ replacements: [swap('Upper A', 'machine-chest-press', 'machine-row')] }));
    expect(ids(dup, 'Upper A').filter(id => id === 'machine-row')).toHaveLength(1);
  });

  it('le sostituzioni di una seduta che non esiste più non hanno effetto', () => {
    expect(content(plan(profile({ replacements: [swap('Push Z', 'machine-chest-press', 'dumbbell-bench-press')] })))).toEqual(content(plan(profile())));
  });

  it('il piano resta nel tempo disponibile e il volume tiene conto della sostituzione', () => {
    const p = profile({ replacements: [swap('Upper A', 'machine-chest-press', 'barbell-bench-press'), swap('Lower A', 'machine-leg-press', 'barbell-squat')], minutesPerSession: 45 });
    const after = plan(p);
    for (const day of after.sessions) expect(day.estimatedMinutes).toBeLessThanOrEqual(45);
    expect(ids(after, 'Lower A')).toContain('barbell-squat');
    expect(after.weeklyVolume.quads).toBeGreaterThan(0);
  });

  it('rifiuta sostituzioni non valide', () => {
    const bad: unknown[] = [
      'x', [{ session: 1, from: 'a', to: 'b', kind: 'similar' }], [{ session: 'A', from: 'a', to: 'b', kind: 'altro' }], [null],
      Array.from({ length: REPLACEMENTS_MAX + 1 }, () => swap('Upper A', 'a', 'b')),
    ];
    for (const replacements of bad) expect(() => plan(profile({ replacements: replacements as ExerciseReplacement[] })), JSON.stringify(replacements).slice(0, 40)).toThrow(RangeError);
  });
});

describe('compattazione delle sostituzioni', () => {
  it('riduce le catene a una sola voce senza cambiare il risultato', () => {
    const list = [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press'), swap('Upper A', 'dumbbell-bench-press', 'barbell-bench-press', 'muscle'), swap('Upper A', 'machine-row', 'dumbbell-row')];
    const compact = compactReplacements(list);
    expect(compact).toEqual([swap('Upper A', 'machine-chest-press', 'barbell-bench-press', 'muscle'), swap('Upper A', 'machine-row', 'dumbbell-row')]);
    expect(compactReplacements(compact)).toEqual(compact);
    const content = (r: ExerciseReplacement[]) => ids(plan(profile({ replacements: r })), 'Upper A');
    expect(content(compact)).toEqual(content(list));
  });

  it('una catena che torna all’esercizio di partenza non lascia nulla; sedute diverse restano separate', () => {
    expect(compactReplacements([swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press'), swap('Upper A', 'dumbbell-bench-press', 'machine-chest-press')])).toEqual([]);
    const two = [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press'), swap('Upper B', 'dumbbell-bench-press', 'barbell-bench-press')];
    expect(compactReplacements(two)).toEqual(two);
    expect(compactReplacements([])).toEqual([]);
  });
});

describe('selezione di più esercizi, come fa la pagina', () => {
  it('sostituisce un’intera seduta con esercizi diversi, dello stesso settore', () => {
    const p = profile();
    const first = plan(p);
    const day = first.sessions[0]!;
    const taken = new Set<string>();
    const entries: ExerciseReplacement[] = [];
    for (const e of day.exercises) {
      const s = suggestReplacement({ ...p, replacements: entries }, first, day.id, e.exerciseId, taken);
      if (!s) continue;
      taken.add(s.exerciseId);
      entries.push(swap(day.name, e.exerciseId, s.exerciseId, s.kind));
    }
    expect(entries.length).toBeGreaterThan(0);
    const after = plan({ ...p, replacements: entries });
    const afterIds = ids(after, day.name);
    for (const entry of entries) {
      expect(afterIds, `${entry.from} → ${entry.to}`).toContain(entry.to);
      expect(afterIds).not.toContain(entry.from);
      expect(core(entry.to).primary.some(m => core(entry.from).primary.includes(m))).toBe(true);
    }
    expect(new Set(afterIds).size).toBe(afterIds.length);
  });
});

describe('salvataggio con sostituzioni', () => {
  it('la scheda salvata contiene gli esercizi sostituiti e il profilo con le sostituzioni resta nei limiti', () => {
    const data = {
      wellnessLogs: [], exercisePreferences: [], workoutUi: [], profiles: [{ id: 'p', name: 'Test', role: 'User' }], roles: [], plans: [], days: [], planExercises: [],
      exercises: structuredClone(defaultExercises), muscleGroups: structuredClone(defaultGroups), workouts: [], workoutExercises: [], sets: [], settings: [], meals: [],
      scheduledWorkouts: [], measurements: [],
    } as unknown as Parameters<typeof historyFromGymTrack>[0];
    const small = bindProfileToGymTrack(profile({ replacements: [swap('Upper A', 'machine-chest-press', 'dumbbell-bench-press')] }), data);
    const planId = insertCoachPlan(data, plan(small));
    const day = data.days.find(row => row.planId === planId && row.name === 'Upper A')!;
    const rows = data.planExercises.filter(row => row.dayId === day.id);
    expect(rows.some(row => row.notes?.includes('Scelto da te al posto di «Chest press»'))).toBe(true);

    // Caso estremo: tutte le varianti scelte, preferenze e il massimo di sostituzioni.
    const variants = Object.fromEntries(Object.entries(VARIANTS).map(([coreId, group]) => [coreId, group.options.at(-1)!.id]));
    const many = Array.from({ length: REPLACEMENTS_MAX }, (_, i) => swap(['Upper A', 'Lower A', 'Upper B', 'Lower B'][i % 4]!, CATALOG[i % CATALOG.length]!.id, CATALOG[(i + 7) % CATALOG.length]!.id, i % 2 ? 'similar' : 'muscle'));
    const heavy = bindProfileToGymTrack(profile({ variants, replacements: many, daysPerWeek: 6, split: 'custom', customDays: ['push', 'pull', 'lower', 'upper', 'glutes-hamstrings', 'shoulders-arms'], sessionMinutes: [45, 60, 75, 90, 30, null], preferredExerciseIds: CATALOG.slice(0, 8).map(e => e.id), blockWeeks: 12 }), data);
    // Oltre il limite dei metadati si omettono solo i dati ricalcolabili dall'archivio: la scheda si salva comunque.
    const heavyId = insertCoachPlan(data, generatePlan(heavy, [], '2026-11-28'));   // salvata dopo la prima
    const stored = readCoachMetadata<{ profile: Profile }>(data.plans.find(row => row.id === heavyId)!.description)!.profile;
    expect(stored.replacements).toHaveLength(REPLACEMENTS_MAX);
    expect(stored.variants).toEqual(variants);
    expect(stored.loadSettings).toBeUndefined();
    // Rileggendola, il collegamento con l'archivio ricostruisce carichi, macchina e variante.
    const reread = profileFromSavedPlan(data)!;
    expect(reread.replacements).toHaveLength(REPLACEMENTS_MAX);
    expect(reread.loadSettings?.['machine-chest-press']?.variantId).toBe(variants['machine-chest-press']);
  });
});
