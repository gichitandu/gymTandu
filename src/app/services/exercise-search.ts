import { Exercise } from '../models/domain';

export function searchWords(value: string): string[] {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim().split(/\s+/).filter(Boolean);
}

// Each typed word can appear anywhere, in any order, including within a name.
export function matchesExercise(exercise: Exercise, query: string, nameOnly = false): boolean {
  const text = searchWords(nameOnly ? exercise.name : `${exercise.name} ${exercise.equipment} ${exercise.tags.join(' ')}`).join(' ');
  return searchWords(query).every(word => text.includes(word));
}
