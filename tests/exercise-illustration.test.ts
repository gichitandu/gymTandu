import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { defaultExercises } from '../src/app/core/default-catalog';
import { exerciseIllustration } from '../src/app/services/exercise-illustration';

const exercise = (name: string) => ({ name, equipment: '', muscleGroupId: '', tags: [] });

it('ships a local, accessible movement image for every built-in exercise', () => {
  for (const item of defaultExercises) {
    const image = exerciseIllustration(item);
    expect(image, item.name).not.toBe('/exercises/movement.svg');
    expect(existsSync('public' + image), item.name).toBe(true);
    const svg = readFileSync('public' + image, 'utf8');
    expect(svg).toContain('<title');
    expect(svg).toContain('<desc');
    expect(svg).not.toMatch(/(?:https?:\/\/|href=)[^>]*\.(?:png|jpg|webp)/);
  }
});

it('distinguishes similar exercise names before broad curl, bench and triceps matches', () => {
  for (const [name, movement] of [
    ['Leg curl seduto', 'leg-curl-seated'],
    ['Leg curl sdraiato', 'leg-curl'],
    ['Curl panca Scott', 'preacher-curl'],
    ['Wrist curl avambracci', 'wrist-curl'],
    ['Calf press alla leg press', 'calf-press'],
    ['Calf raise seduto', 'calf-seated'],
    ['Panca inclinata con manubri a 30°', 'bench-incline'],
    ['Panca declinata con manubri a −15°', 'bench-decline'],
    ['Croci ai cavi all’altezza delle spalle', 'cable-fly'],
    ['Croci ai cavi su panca inclinata a 30°', 'bench-fly'],
    ['French press sopra la testa da seduto', 'overhead-triceps'],
    ['French press su panca piana', 'french-press'],
    ['Pushdown con barra a V', 'triceps-pushdown'],
    ['Pullover manubrio', 'pullover'],
    ['Pullover al cavo alto con corda', 'cable-pullover'],
  ]) expect(exerciseIllustration(exercise(name))).toBe(`/exercises/${movement}.svg`);
});

it('uses a neutral custom-exercise illustration for an unknown movement', () => {
  expect(exerciseIllustration()).toBe('/exercises/movement.svg');
  expect(exerciseIllustration(exercise('Esercizio personale'))).toBe('/exercises/movement.svg');
});
