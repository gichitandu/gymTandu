# Piano refactoring — fasi 3, 4, 5

Obiettivo: codice più economico da leggere e modificare per Claude, **senza cambiare comportamento,
dati o formato dell'archivio**. Fasi 1, 2 e 6 in PR #20, #21, #22. Questo file è il riferimento per
le sessioni che eseguiranno le fasi successive: si esegue solo ciò che l'utente ha approvato.

## Fase 3 — Spezzare i file giganti (in attesa di OK)

### 3.1 `src/app/services/store.ts` (75,7 KB, 2215 righe, una classe con 75 metodi)

**Tecnica proposta:** `Store` resta l'unica classe e l'unico punto di ingresso (`inject(Store)`
invariato in tutti i componenti). I metodi si spostano per area in `src/app/services/store/<area>.ts`
come oggetti di funzioni con `this: Store`. Vengono riattaccati al prototipo con
`Object.assign(Store.prototype, …)` subito dopo la classe, e i tipi si uniscono con
`export interface Store extends …Methods {}`. Così ogni metodo resta su `Store.prototype` con lo
stesso `this`; i test che usano `Store.prototype.canEditCatalog.call(...)` continuano a funzionare.
I moduli importano `Store` solo come tipo (`import type`), quindi nessun ciclo a runtime.

Alternativa scartata: servizi Angular separati con `Store` come facciata. Sposterebbe la proprietà
dei signal e l'ordine degli `inject()`, con un rischio maggiore.

**Nucleo che resta in `store.ts`, invariato:** campi, signal, `computed`, `inject()`, `queue`,
`init`, `applyTheme`, `change` (coda di scrittura, validazione, revisioni), `rejectStaleArchive`,
`settled`, `createRecoveryCheckpoint`, `recoverySnapshots`, `planSignature`, campi privati di stato
(`pendingSetAdds`, stato undo). Stima: circa 480 righe.

| PR | File nuovo | Metodi | Righe circa | Rischio |
| --- | --- | --- | --- | --- |
| 3a | `store/letture.ts` (+ infrastruttura mixin) | days, planExercises, workoutExercises, sets, exercise, muscle, volume, configurations, records, weightInput, weight, kg, formatWeight, previous, progression, recentExerciseIds, preference, isFavorite, openSessionMessage, plannedEventsOf, orphanPlannedEvents, excelProgramConflicts, sharedCatalog, canEditCatalog | 220 | basso (sola lettura) |
| 3b | `store/preferenze.ts`, `store/catalogo.ts` | saveWellness, removeWellness, toggleFavorite, saveMachineSetup, rememberWorkout, saveWeightStep; refreshCatalog, saveExercise, saveMuscleGroup | 210 | basso |
| 3c | `store/calendario.ts` | scheduleWorkout, scheduleCalendarActivity, moveCalendarEvent, removeCalendarEvent, toggleCalendarActivity, startScheduled, removeOrphanPlannedEvents | 320 | medio |
| 3d | `store/piani.ts`, `store/import-excel.ts` | savePlan, applyProgression, finishPlan, saveDay, deletePlan, duplicatePlan, duplicateDay, restoreProgramSchedule, replacePlanExercise, savePlanExercise; importExcelProgram, removeUnconfirmedExcelImport | 550 | medio |
| 3e | `store/allenamenti.ts`, `store/serie.ts` | start, finish, reopenWorkout, cancelWorkout, deleteWorkout, substituteWorkoutExercise; updateSet, gymEdit, gymSnapshot, undoGymAction, addSet, removeSet, copyPrevious | 660 | alto (seduta in corso, undo) |

**Rischi e mitigazioni**

- I membri `private` usati dai moduli diventano non privati: è solo un cambio di tipo, a runtime
  non cambia nulla. Li segno `/** @internal */` e aggiungo in CLAUDE.md la regola "i componenti non
  li usano".
- Campi inizializzati (`computed`, `signal`, `inject`, `undoLabel`) non possono andare sul
  prototipo: restano nel nucleo.
- `Object.assign` va eseguito prima di qualunque istanza: subito dopo la classe, nello stesso
  file.

**Verifiche per ogni PR**

1. Script che confronta il testo di ogni metodo spostato con l'originale (uguale salvo indentazione
   e parametro `this`).
2. Elenco di `Object.getOwnPropertyNames(Store.prototype)` identico prima e dopo.
3. `quality` completo (lo Store è critico: `test:affected` esegue comunque tutto).

### 3.2 `plans.component.ts` (53,8 KB) e `profile.component.ts` (55,7 KB)

Metà di ogni file è template (24-25 KB, non formattato: escluso da Prettier).

| Passo | Cosa | Rischio | Verifica |
| --- | --- | --- | --- |
| A | `template:` inline → `plans.component.html` / `profile.component.html` con `templateUrl`, contenuto byte per byte identico | basso | bundle compilato confrontato con la build precedente |
| B | Logica non visiva in file affiancati come funzioni pure: in piani i `computed` "today*" (programma, durata, titolo); in profilo le firme dei form e i calcoli delle misurazioni | basso | test esistenti + confronto testo spostato |
| C | Sottocomponenti per sezione, **solo dopo la fase 5** | medio-alto | screenshot prima/dopo, mobile e desktop |

Sottocomponenti candidati, una PR per sezione:

- **Piani:** hub "Oggi", elenco piani e giorni (`details.simple-day`), modale editor
  piano/giorno/esercizio, avviso "Piani sovrapposti".
- **Profilo:** identità + obiettivi + misurazioni, aspetto (`appearance-card`), impostazioni (4
  `settings-disclosure`), "Porta GymTrack con te", backup e ripristino (+ modale), account e
  sicurezza (+ logout).

Rischi del passo C:

- **Stili incapsulati (Emulated):** le regole nei `plans-*.css` / `profile-*.css` non raggiungono i
  figli. Bisogna spostare le regole con la sezione, e `feature-polish.css` / `account-polish.css`
  sono condivisi con altre pagine.
- Selettori con `>` che attraversano il nuovo elemento host. Mitigazione parziale con
  `:host { display: contents }`.
- Form e bozze condivise (`FormBuilder`, `FormDraftService`, `draftSession`) tra più sezioni:
  vanno passati come input oppure lasciati nel genitore.

## Fase 4 — Cartelle per funzionalità (solo piano)

Struttura: `src/app/features/<pagina>/` con `<pagina>.component.ts|html|css` e i CSS usati solo da
quella pagina. I CSS condivisi (`account-polish.css`: catalogo, profilo, utenti, allenamenti;
`feature-polish.css`: alimentazione, piani, progressi; `wellness-design.css`: focus muscolare,
recupero) vanno in `src/app/features/_condivisi/`.

Proposta: lasciare i test in `tests/`. Spostarli vicino ai componenti richiederebbe di cambiare
`vitest.config.ts`, le regole di `tools/test-affected.mjs` e i percorsi citati nei documenti, con
poco guadagno.

Passi incrementali, una PR per pagina o gruppo piccolo, dalle pagine piccole alle grandi:

1. Recupero, focus muscolare, utenti, recupera-allenamenti.
2. Catalogo + dettaglio esercizio.
3. Calendario, alimentazione, progressi + analisi.
4. Allenamenti, anteprima, riepilogo, sessione.
5. Home, piani + dashboard piano, import Excel.
6. Profilo (dopo la fase 3).

Per ogni PR:

- `git mv` (la cronologia resta seguibile con `--follow`);
- aggiornare `loadComponent` in `src/app/core/routes.ts` (22 rotte lazy), gli import relativi
  (`../services` → `../../services`), `templateUrl`/`styleUrls`;
- aggiornare i 22 test che importano o leggono file di `features/`, oltre a
  `src/app/design/design-preview.component.ts`;
- aggiornare la mappa in CLAUDE.md e i percorsi in `docs/tasks/`.

Verifiche: `quality` + confronto del bundle con la build precedente (atteso uguale salvo nomi dei
chunk).

Rischi: import relativi dimenticati (li intercetta `typecheck`), test che leggono il sorgente con
percorsi fissi (li intercetta `npm test`), link nei documenti.

## Fase 5 — Verifica visiva autonoma (solo proposta, niente installazioni senza OK)

**Cosa c'è già:** i runner browser in `tests/runtime/*-browser.mjs` usano Playwright (modulo da
`GYMTRACK_PLAYWRIGHT_MODULE`, Chromium da `GYMTRACK_CHROMIUM`, predefinito `/usr/bin/chromium`).
Playwright però **non è tra le dipendenze del progetto**. I runner usano viewport iPhone
(430×932), service worker bloccati, dati sintetici, schermate in `docs/qa/` (ora ignorata da git).
`tests/runtime/design-studio-qa-server.mjs` serve la build insieme al Worker impacchettato su SQLite
in memoria, quindi offre login e API reali con dati finti.

**Prova eseguita (9 novembre 2026):** con il Playwright 1.63 e il Chromium già presenti nell'ambiente cloud di
Claude ho aperto l'anteprima (`npm run preview`) e salvato due schermate in pochi secondi, senza
errori JavaScript. Mancavano solo le `/api` (anteprima statica), da qui la necessità del server QA
per entrare nell'app.

**Proposta**

1. Dipendenza: `@playwright/test` come devDependency (un solo pacchetto, include il confronto
   screenshot). Browser:
   - sul tuo PC: `channel: "chrome"` usa Chrome già installato, nessun download;
   - nel cloud: il Chromium preinstallato via `PLAYWRIGHT_BROWSERS_PATH`;
   - altrimenti `npx playwright install chromium` (~150 MB).
2. Script `tests/runtime/visual-check.mjs` + `npm run visual -- --route /piani [--desktop]`:
   - avvia il server QA;
   - crea un account sintetico (come fanno i runner esistenti) e carica un archivio di prova;
   - apre la rotta in viewport mobile e desktop;
   - salva le schermate in `docs/qa/visual/` e riporta gli errori di console.
3. Confronto prima/dopo: `npm run visual -- --route /piani --baseline` salva le immagini di
   riferimento; senza flag confronta e salva un'immagine delle differenze. Serve per il passo C
   della fase 3 e per riprodurre i bug grafici delle task in `docs/tasks/`.
4. Fixture: un solo archivio sintetico condiviso (`tests/fixtures/archivio-visivo.json`) con piani,
   sedute, misurazioni e calendario, così ogni pagina ha contenuti.

Costo stimato: 1 PR. Nessun impatto su build e deploy (solo devDependency e script).
