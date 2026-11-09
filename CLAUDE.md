# CLAUDE.md — GymTrack

@AGENTS.md

Sopra: architettura, comandi, regole su dati/API/sicurezza e criteri di "task completato".
Sotto: solo ciò che serve a lavorare in modo preciso e con pochi token.

## Lingua

Rispondi sempre in italiano (chat, riepiloghi, messaggi di commit). Il codice, i nomi di
variabili/funzioni e i commenti seguono la lingua già usata nel file che modifichi.

## Mappa pagina → file

Le rotte sono in `src/app/core/routes.ts` (routing hash, caricamento lazy). Ogni pagina è un
componente standalone in `src/app/features/`. Parti dal file della pagina, non cercare in tutto il progetto.

| Rotta                                          | Componente                                    |
| ---------------------------------------------- | --------------------------------------------- |
| `/` (home)                                     | `features/home.component.ts`                  |
| `/piani`, `/piano/:id`                         | `plans.component.ts`, `plan-dashboard.component.ts` |
| `/importa-excel`                               | `excel-import.component.ts`                   |
| `/allenamenti`, `/anteprima-allenamento`       | `workouts.component.ts`, `workout-preview.component.ts` |
| `/sessione` (allenamento in corso)             | `session.component.ts`                        |
| `/riepilogo/:id`                               | `workout-summary.component.ts`                |
| `/recupera-allenamenti`                        | `workout-recovery.component.ts`               |
| `/progressi`, `/analisi`, `/focus-muscolare`   | `progress.component.ts`, `training-insights.component.ts`, `muscle-focus.component.ts` |
| `/catalogo`, `/esercizio/:id`                  | `catalog.component.ts`, `exercise-detail.component.ts` |
| `/recupero`, `/sonno`, `/riposo`               | `recovery.component.ts` (stessa pagina, `data.mode`) |
| `/calendario`                                  | `calendar.component.ts` (+ `calendar-relay/`) |
| `/alimentazione`                               | `nutrition.component.ts` (protetta da guard)  |
| `/profilo`, `/utenti`                          | `profile.component.ts`, `users.component.ts`  |
| `/design-studio`                               | `src/app/design/design-studio.component.ts`   |

Shell e navigazione: `src/app/layouts/`. Componenti riusabili: `src/app/shared/`.
Logica e stato: `src/app/services/` (parti da `store.ts`, poi dal servizio specifico).

## Come lavorare per consumare meno token

1. **Leggi solo ciò che serve.** Per una pagina: il suo componente, i servizi che importa, il test
   corrispondente in `tests/`. Usa ricerca mirata (grep per simbolo) invece di aprire interi file grandi
   (`services/store.ts` ha ~900 righe: leggi solo la sezione interessata).
2. **Non aprire mai, salvo richiesta esplicita:** `docs/qa/**` (log di verifiche passate),
   `drizzle/meta/*`, `package-lock.json`, `public/vendor/**`, `public/training/vendor/**`,
   `public/*.js` di worker/service worker generati, immagini e asset binari.
3. **Docs tematici solo quando pertinenti:** i file in `docs/` (`GT_*`, `CODEX_*`) si leggono solo se il
   task tocca quell'area (Design Studio, protezione allenamenti, ecc.), non all'inizio di ogni sessione.
4. **Task grandi → prima un piano** di 5-8 righe (file da toccare, rischio, verifiche), poi attendi OK.
   Task piccoli (un bug, un testo, uno stile) → procedi direttamente.
5. **Verifiche mirate, non complete:** `npm run test:affected` + `npm run typecheck` durante il lavoro;
   `npm run quality` solo prima di una release o se si toccano Store, schema, Worker, PWA, servizi condivisi.
6. **Output compatto:** a fine task elenca file cambiati, controlli realmente eseguiti, limiti rimasti.
   Niente ricapitolazioni dei passaggi, niente incolla di codice già nel diff.
7. **Un task per sessione.** Se la conversazione cambia pagina o argomento, suggerisci di aprire una
   chat nuova invece di trascinare contesto non più utile.

## Task list per pagina

Le richieste dell'utente (bug, implementazioni, note con screenshot) vivono in `docs/tasks/<pagina>.md`,
una per pagina (es. `docs/tasks/home.md`, `docs/tasks/sessione.md`). Formato in `docs/tasks/TEMPLATE.md`.

- Quando l'utente dice "lavora sulla pagina X", leggi **solo** `docs/tasks/X.md` e il componente indicato.
- Prendi le voci con stato `da fare` nell'ordine dato; passa a `in corso` mentre lavori e a `fatto`
  (con data e riga di esito) a lavoro verificato. Non cancellare le voci fatte: spostale in fondo.
- Screenshot in `docs/tasks/img/` con nome `<pagina>-<id-voce>.png`; aprili solo se la voce lo richiede
  (costano molti token). Se la descrizione testuale basta, non aprirli.
- Se una voce è ambigua, fai al massimo una domanda; non indovinare su dati o sicurezza.

## Convenzioni da non rompere (promemoria rapido)

- Modifiche ai dati solo tramite le operazioni dello Store; mai mutare direttamente i Signals pubblicati.
- Nessuna perdita di dati: migrazioni compatibili, archivi per account separati, bozze salvate prima
  di navigare/aggiornare.
- Riusa componenti condivisi e logica già presente prima di scriverne di nuova; niente refactoring estranei al task.
- Commit, push e deploy solo su richiesta esplicita; mai push forzati.
- Nessun segreto o dato reale in codice, fixture, log, documenti.
