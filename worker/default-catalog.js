// Catalogo predefinito del server: i dati sono in default-catalog.json (stesso contenuto, stesso ordine).
// Nel pacchetto distribuito tools/package-worker.mjs incorpora direttamente il JSON.
import catalog from "./default-catalog.json" with { type: "json" };

export const defaultGroups = catalog.defaultGroups;
export const defaultExercises = catalog.defaultExercises;
