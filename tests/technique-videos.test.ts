import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultExercises } from '../src/app/core/default-catalog';
import { TECHNIQUE_VIDEO_IDS, techniqueVideoFor } from '../src/app/services/technique-videos';

describe('video tecnici', () => {
  it('collega 12 esercizi del catalogo per ID, nome e attrezzo, con tutti i file presenti', () => {
    expect(TECHNIQUE_VIDEO_IDS).toHaveLength(12);
    for (const id of TECHNIQUE_VIDEO_IDS) {
      const exercise = defaultExercises.find(item => item.id === id);
      expect(exercise, id).toBeTruthy();
      const video = techniqueVideoFor(exercise!);
      expect(video, id).not.toBeNull();
      for (const url of [video!.video, video!.poster, video!.subtitles]) expect(existsSync('public' + url), url).toBe(true);
    }
  });
  it('non associa il video a esercizi rinominati, con altro attrezzo o con ID diverso', () => {
    const squat = defaultExercises.find(item => item.id === 'exercise-11')!;
    expect(techniqueVideoFor({ ...squat, name: 'Squat personalizzato' })).toBeNull();
    expect(techniqueVideoFor({ ...squat, equipment: 'Manubri' })).toBeNull();
    expect(techniqueVideoFor({ ...squat, id: 'custom-squat' })).toBeNull();
    expect(techniqueVideoFor({ ...squat, id: 'constructor' })).toBeNull();
    expect(techniqueVideoFor(undefined)).toBeNull();
  });
});
