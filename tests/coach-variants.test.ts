import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_PROFILE, VARIANTS, findVariant, generatePlan } from '../src/app/coach/index';
import type { Profile } from '../src/app/coach/models';
import { defaultExercises, defaultGroups } from '../src/app/core/default-catalog';
import {
  NATIVE_CATALOG_MAP, bindProfileToGymTrack, coreToNative, equipmentIdentity, historyFromGymTrack, insertCoachPlan, nativeToCore,
} from '../src/app/services/coach-expert-adapter';

type NativeData = Parameters<typeof historyFromGymTrack>[0];
const AS_OF = '2026-11-27';
const CHEST = 'machine-chest-press';
const FLY = 'cable-fly';

/** Archivio sintetico con il catalogo reale dell'app. */
const archive = (): NativeData => ({
  wellnessLogs: [], exercisePreferences: [], workoutUi: [], profiles: [{ id: 'p', name: 'Test', role: 'User' }], roles: [],
  plans: [], days: [], planExercises: [], exercises: structuredClone(defaultExercises), muscleGroups: structuredClone(defaultGroups),
  workouts: [], workoutExercises: [], sets: [], settings: [], meals: [], scheduledWorkouts: [], measurements: [],
} as unknown as NativeData);

/** Un allenamento concluso con tre serie su un esercizio dell'archivio. */
function logWorkout(data: NativeData, id: string, nativeId: string, date: string, machine?: string) {
  data.workouts.push({ id: `w-${id}`, userId: 'p', planId: 'old', dayId: 'old-day', planName: 'Vecchio', dayName: 'A', date,
    startedAt: `${date}T10:00:00Z`, endedAt: `${date}T11:00:00Z`, duration: 60, notes: '', status: 'completed' } as never);
  data.workoutExercises.push({ id: `we-${id}`, workoutId: `w-${id}`, exerciseId: nativeId, name: 'x', loadMode: 'external', order: 0, rest: 120, notes: '',
    repsMin: 8, repsMax: 10, ...(machine ? { machineSetup: { machine } } : {}) } as never);
  for (let n = 1; n <= 3; n++) data.sets.push({ id: `s-${id}-${n}`, workoutExerciseId: `we-${id}`, number: n, weight: 40, reps: 10, completed: true } as never);
}
const profile = (patch: Partial<Profile> = {}): Profile => ({ ...structuredClone(DEFAULT_PROFILE), experience: 'intermediate', minutesPerSession: 90, ...patch });
const bound = (data: NativeData, patch: Partial<Profile> = {}) => bindProfileToGymTrack(profile(patch), data);
const plannedChest = (p: Profile) => generatePlan(p, [], AS_OF).sessions.flatMap(s => s.exercises).find(e => e.exerciseId === CHEST)!;

describe('tabella delle varianti', () => {
  it('usa solo esercizi del coach e voci del catalogo reale con lo stesso nome e attrezzo', () => {
    const real = new Map(defaultExercises.map(row => [row.id, row]));
    for (const [coreId, group] of Object.entries(VARIANTS)) {
      expect(CATALOG.some(row => row.id === coreId), coreId).toBe(true);
      expect(group.options.some(option => option.id === group.defaultId), `${coreId} predefinita`).toBe(true);
      expect(group.options.length, coreId).toBeGreaterThan(1);
      for (const option of group.options) {
        const row = real.get(option.id);
        expect(row, `${option.id} manca dal catalogo`).toBeDefined();
        expect(row!.name, option.id).toBe(option.name);
        expect(row!.equipment, option.id).toBe(option.equipment);
      }
    }
  });

  it('assegna ogni voce del catalogo a un solo esercizio del coach e non contraddice la mappa esistente', () => {
    const owners = new Map<string, string>();
    for (const [coreId, group] of Object.entries(VARIANTS)) for (const option of group.options) {
      expect(owners.get(option.id), `${option.id} in due esercizi`).toBeUndefined();
      owners.set(option.id, coreId);
    }
    for (const row of NATIVE_CATALOG_MAP) if (owners.has(row.nativeId)) expect(owners.get(row.nativeId), row.nativeId).toBe(row.coreId);
  });

  it('esclude unilaterali, a bracci indipendenti, a dischi e assistite', () => {
    for (const group of Object.values(VARIANTS)) for (const option of group.options) {
      expect(option.name, option.id).not.toMatch(/unilateral|bracci indipendenti|a dischi|assistit|una gamba/i);
      expect(option.equipment, option.id).not.toMatch(/dischi|assist/i);
    }
  });
});

describe('piano con varianti (solo motore)', () => {
  it('propone una variante precisa e la indica nel nome', () => {
    const e = plannedChest(profile());
    expect(e.variantId).toBe('variant-v2-chest-orizzontale');
    expect(e.name).toBe('Chest press orizzontale presa prona');
    expect(e.decisions.find(d => d.ruleId === 'variant-choice')).toMatchObject({ kind: 'heuristic' });
    const fly = generatePlan(profile({ equipment: ['cable'], priorities: ['chest'] }), [], AS_OF).sessions.flatMap(s => s.exercises).find(x => x.exerciseId === FLY);
    expect(fly?.name).toBe('Croci ai cavi all’altezza delle spalle');
  });

  it('rispetta la scelta dell’utente e ignora gli id sconosciuti', () => {
    const chosen = plannedChest(profile({ variants: { [CHEST]: 'variant-incline-chest-machine' } }));
    expect(chosen).toMatchObject({ variantId: 'variant-incline-chest-machine', name: 'Chest press inclinata alla macchina' });
    expect(chosen.decisions.find(d => d.ruleId === 'variant-choice')).toMatchObject({ kind: 'constraint' });
    // Un id che non esiste (catalogo cambiato) torna alla proposta del coach, senza errori.
    expect(plannedChest(profile({ variants: { [CHEST]: 'variant-inesistente', 'esercizio-inventato': 'x' } })).variantId).toBe('variant-v2-chest-orizzontale');
    expect(() => generatePlan(profile({ variants: [] as unknown as Record<string, string> }), [], AS_OF)).toThrow(RangeError);
    expect(() => generatePlan(profile({ variants: { [CHEST]: 5 as unknown as string } }), [], AS_OF)).toThrow(RangeError);
  });

  it('gli esercizi senza varianti restano invariati', () => {
    const plan = generatePlan(profile({ equipment: ['bodyweight'] }), [], AS_OF);
    for (const e of plan.sessions.flatMap(s => s.exercises)) {
      expect(e.variantId).toBeUndefined();
      expect(e.name).toBe(CATALOG.find(row => row.id === e.exerciseId)!.name);
    }
  });
});

describe('collegamento con l’archivio', () => {
  it('riconosce una variante solo se id, nome e attrezzo coincidono', () => {
    const data = archive();
    const row = data.exercises.find(x => x.id === 'variant-incline-chest-machine')!;
    expect(nativeToCore(row)).toBe(CHEST);
    expect(nativeToCore({ ...row, name: 'Chest press inclinata (rinominata)' })).toBeNull();
    expect(nativeToCore({ ...row, equipment: 'Manubri' })).toBeNull();
  });

  it('l’esercizio generico non dipende dall’ordine dell’archivio e la variante si ottiene solo se richiesta', () => {
    const data = archive();
    // Variante prima dell'esercizio generico: prima poteva essere scambiata per l'esercizio principale.
    const moved = data.exercises.filter(x => x.id === 'variant-incline-chest-machine');
    data.exercises = [...moved, ...data.exercises.filter(x => x.id !== 'variant-incline-chest-machine')];
    expect(coreToNative(data, CHEST)?.id).toBe('exercise-3');
    expect(coreToNative(data, CHEST, 'variant-incline-chest-machine')?.id).toBe('variant-incline-chest-machine');
    // Variante non presente (o disattivata): si torna all'esercizio generico.
    data.exercises.find(x => x.id === 'variant-incline-chest-machine')!.active = false;
    expect(coreToNative(data, CHEST, 'variant-incline-chest-machine')?.id).toBe('exercise-3');
  });

  it('senza storico sceglie la variante proposta e separa carichi e macchina per variante', () => {
    const data = archive();
    data.exercisePreferences.push({ id: 'variant-v2-chest-orizzontale', weightStep: 5, machineSetup: { machine: 'Technogym', seat: '4' } } as never);
    const p = bound(data);
    expect(p.loadSettings?.[CHEST]).toMatchObject({ variantId: 'variant-v2-chest-orizzontale', incrementKg: 5, equipmentKey: equipmentIdentity('variant-v2-chest-orizzontale', { machine: 'Technogym', seat: '4' }) });
    expect(plannedChest(p).name).toBe('Chest press orizzontale presa prona');
  });

  it('chi ha già usato un esercizio resta su quello: le progressioni non si perdono', () => {
    const data = archive();
    logWorkout(data, 'a', 'exercise-3', '2026-11-10', 'Gym A');
    // L'app registra la macchina anche tra le preferenze dell'esercizio: da lì il coach ricava la chiave.
    data.exercisePreferences.push({ id: 'exercise-3', machineSetup: { machine: 'Gym A' } } as never);
    const p = bound(data);
    expect(p.loadSettings?.[CHEST]).toMatchObject({ variantId: 'exercise-3', equipmentKey: equipmentIdentity('exercise-3', { machine: 'Gym A' }) });
    const planned = plannedChest(p);
    expect(planned.name).toBe('Chest press');
    // Lo storico sull'esercizio generico viene ritrovato e il carico non torna «da calibrare».
    const withHistory = generatePlan(p, historyFromGymTrack(data), AS_OF).sessions.flatMap(s => s.exercises).find(e => e.exerciseId === CHEST)!;
    expect(withHistory.loadKg).toBe(40);
    expect(withHistory.calibration).toBe(false);
  });

  it('vince l’ultima variante usata; la scelta esplicita ha la precedenza e va ricalibrata', () => {
    const data = archive();
    logWorkout(data, 'a', 'exercise-3', '2026-11-01');
    logWorkout(data, 'b', 'variant-v2-chest-neutra', '2026-11-12');
    expect(bound(data).loadSettings?.[CHEST]?.variantId).toBe('variant-v2-chest-neutra');
    const chosen = bound(data, { variants: { [CHEST]: 'variant-incline-chest-machine' } });
    expect(chosen.loadSettings?.[CHEST]?.variantId).toBe('variant-incline-chest-machine');
    // Variante mai usata: lo storico delle altre non conta, quindi parte da una serie di prova.
    const planned = generatePlan(chosen, historyFromGymTrack(data), AS_OF).sessions.flatMap(s => s.exercises).find(e => e.exerciseId === CHEST)!;
    expect(planned).toMatchObject({ name: 'Chest press inclinata alla macchina', calibration: true });
    expect(planned.loadKg).toBeNull();
  });

  it('se la variante scelta non è nell’archivio ripiega su un’altra, senza indicare ciò che non c’è', () => {
    const data = archive();
    data.exercises.find(x => x.id === 'variant-incline-chest-machine')!.active = false;
    const p = bound(data, { variants: { [CHEST]: 'variant-incline-chest-machine' } });
    expect(p.loadSettings?.[CHEST]?.variantId).toBe('variant-v2-chest-orizzontale');
    data.exercises = data.exercises.filter(x => !(VARIANTS[CHEST]!.options.some(o => o.id === x.id)));
    const none = bound(data);
    expect(none.loadSettings?.[CHEST]?.variantId).toBe('coach-exercise-machine-chest-press');
    expect(plannedChest(none).name).toBe('Chest press');
  });

  it('lo storico su una variante entra nel coach con la chiave della variante', () => {
    const data = archive();
    logWorkout(data, 'a', 'variant-v2-croci-spalle', '2026-11-10', 'Cavi A');
    const history = historyFromGymTrack(data);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ exerciseId: FLY, equipmentKey: equipmentIdentity('variant-v2-croci-spalle', { machine: 'Cavi A' }) });
  });
});

describe('salvataggio nelle schede', () => {
  const save = (data: NativeData, p: Profile) => {
    const planId = insertCoachPlan(data, generatePlan(p, [], AS_OF));
    const items = data.planExercises.filter(row => row.dayId.startsWith(`${planId}-day-`));
    return { planId, items, byCore: (coreId: string) => items.find(row => row.exerciseId === (coreToNative(data, coreId, p.variants?.[coreId]) ?? { id: '' }).id) };
  };

  it('aggiunge alla scheda l’esercizio della variante scelta, non quello generico', () => {
    const data = archive();
    const p = bound(data, { variants: { [CHEST]: 'variant-incline-chest-machine' } });
    const { items } = save(data, p);
    expect(items.some(row => row.exerciseId === 'variant-incline-chest-machine')).toBe(true);
    expect(items.some(row => row.exerciseId === 'exercise-3')).toBe(false);
    // Nessun esercizio duplicato creato dal coach quando la variante esiste già nel catalogo.
    expect(data.exercises.some(row => row.id.startsWith('coach-exercise-machine-chest'))).toBe(false);
  });

  it('con la proposta del coach salva la variante proposta', () => {
    const data = archive();
    const { items } = save(data, bound(data));
    expect(items.some(row => row.exerciseId === 'variant-v2-chest-orizzontale')).toBe(true);
  });

  it('se la variante manca all’archivio non scrive un nome che non corrisponde e lo segnala', () => {
    const data = archive();
    const p = bound(data);                                  // collegato con tutto il catalogo
    data.exercises = data.exercises.filter(row => row.id !== 'variant-v2-chest-orizzontale');
    const { planId } = save(data, p);
    const item = data.planExercises.find(row => row.dayId.startsWith(`${planId}-day-`) && row.exerciseId === 'exercise-3');
    expect(item?.notes).toContain('non è nel tuo catalogo');
  });

  it('un piano con tutte le scelte rientra nel limite dei metadati', () => {
    const data = archive();
    const variants = Object.fromEntries(Object.entries(VARIANTS).map(([coreId, group]) => [coreId, group.options.at(-1)!.id]));
    const p = bound(data, { variants, equipment: ['machine', 'cable', 'dumbbell', 'barbell', 'bodyweight'], split: 'custom', daysPerWeek: 6,
      customDays: ['push', 'pull', 'lower', 'upper', 'glutes-hamstrings', 'shoulders-arms'], sessionMinutes: [45, 60, 75, 90, 30, null],
      preferredExerciseIds: CATALOG.slice(0, 8).map(e => e.id), excludedExerciseIds: [], blockWeeks: 12, volume: 'high', rest: 'long' });
    expect(() => insertCoachPlan(data, generatePlan(p, [], AS_OF))).not.toThrow();
    expect(findVariant(CHEST, p.loadSettings?.[CHEST]?.variantId)).toBeDefined();
  });
});
