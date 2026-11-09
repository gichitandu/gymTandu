/** Reviewed catalog illustrations. Keep stable IDs and exact name/equipment guards.
 * Original art and animation assets remain available as family fallbacks.
 * Artwork provenance: docs/RELEASE_2026-11-05.md.
 * Data: exercise-artwork-catalog.json (same keys and values, same order).
 */
import artwork from "./exercise-artwork-catalog.json";

export const CATALOG_EXERCISE_ARTWORK: Readonly<
  Record<string, Readonly<{ name: string; equipment: string; file: string }>>
> = artwork;
