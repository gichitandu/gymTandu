# Piano di sviluppo e stato verifiche

Stato al 15 ottobre 2026. Le sei fasi sono implementate; la verifica su browser/telefono reale rimane aperta e non è dichiarata completata.

## Fase 1 — Inizializzazione e interfaccia

Implementati Angular standalone, TypeScript strict, lazy loading, routing hash, shell desktop e navigazione inferiore a cinque sezioni. Tema scuro con blu elettrico, componenti responsive e icone SVG locali. Nessun asset remoto obbligatorio.

File: `angular.json`, `tsconfig*.json`, `src/main.ts`, `src/index.html`, `src/styles.css`, `layouts/app.component.ts`, `core/routes.ts`, `shared/icon.component.ts`.

Verifica: build Angular di sviluppo passata. Il compilatore Sass embedded inizialmente non funzionava nel runtime: adottato CSS personalizzato, consentito dai requisiti, con tema Material precompilato. La lettura delle statistiche di memoria Node nell'ambiente ristretto richiede l'helper opzionale `tools/sandbox-compat.cjs`; non modifica il runtime dell'app.

Aperto: prova visiva a 360/390 px su un browser reale.

## Fase 2 — Dati e catalogo

Implementati 12 modelli/tabelle, chiavi e indici Dexie, repository iniettabile, profilo locale SuperAdmin, ruoli e interfaccia permessi. Seed eseguito solo su archivio vuoto, senza allenamenti o piani demo. Catalogo dinamico con ricerca, filtri, creazione/modifica/disattivazione, gruppi muscolari principali e secondari, tag, attrezzatura e immagini Blob validate.

File: `models/domain.ts`, `core/database.ts`, `core/seed.ts`, `repositories/repository.ts`, `guards/permissions.ts`, `services/store.ts`, `services/integrity.ts`, `features/catalog.component.ts`.

Verifica: build strict passata; test finali su riapertura IndexedDB, integrità e persistenza. Scelta: disattivazione anziché cancellazione fisica degli esercizi, per preservare riferimenti e storico.

## Fase 3 — Piani e giorni

Implementati creazione/modifica, piano attivo, archivio/ripristino, duplicazione del piano e del giorno, CRUD dei giorni e degli esercizi del piano, riordino con pulsanti accessibili, campi serie/ripetizioni/recupero/peso/RPE/note. Rotazione libera con giorno settimanale opzionale. Rimozione del giorno e archiviazione del piano non eliminano i log.

File: `features/plans.component.ts`, metodi di dominio in `services/store.ts`.

Verifica: build strict passata; test su creazione, modifica, rotazione, duplicazione, ID indipendenti e validazione del nome. Nessun problema bloccante rilevato dai test.

## Fase 4 — Registrazione

Implementati avvio da piano/giorno, snapshot dello storico, serie dinamiche, completamento, valori precedenti, copia e precompilazione opzionale, note/RPE/recupero per serie, note generali, timer di recupero, salvataggio automatico serializzato su IndexedDB, ripresa della singola sessione in corso e conclusione.

File: `features/session.component.ts`, `shared/workout-editor.component.ts`, `services/store.ts`.

Verifica: build strict passata; test su sessione interrotta e rilettura da IndexedDB, completamento obbligatorio di almeno una serie, calcolo del volume, cancellazione in cascata, errore di scrittura senza perdita dei dati precedenti e modifiche ravvicinate. Il test usa fake-indexeddb: la chiusura fisica del browser resta una prova manuale.

## Fase 5 — Storico e progressi

Implementati storico filtrabile per piano/giorno/esercizio/date, dettagli modificabili, eliminazione con conferma, statistiche Home, grafici Chart.js per peso massimo, volume, Epley, ripetizioni e volume settimanale, record per esercizio/carico e confronto ultime due sessioni. Dati esclusivamente reali, empty state iniziali. Nessun volume artificiale per corpo libero.

File: `features/home.component.ts`, `features/workouts.component.ts`, `features/progress.component.ts`, `shared/progress-chart.component.ts`, `services/statistics.ts`.

Verifica: build strict passata dopo correzione di un blocco template dello storico; test su formule, filtri, aggregazioni settimanali, serie incomplete, record aggiornati, esercizi ripetuti e separazione tra modalità di carico. La card Home riporta quanti esercizi hanno un record, non inventa un numero di nuovi trofei.

## Fase 6 — Profilo, backup, PWA e consegna

Implementati profilo personale, unità kg/lb, tema chiaro/scuro e preferenza precompilazione con Angular Material. Backup JSON schema v1 completo di immagini, validazione con Zod e controlli referenziali, anteprima/conferma e sostituzione atomica con rollback. Predisposto registro delle migrazioni; non esistono versioni precedenti da migrare. Manifest, icone, service worker Angular e precache dei chunk lazy. Installazione via prompt supportato o istruzioni browser, richiesta opzionale di storage persistente.

File: `features/profile.component.ts`, `services/backup.ts`, `services/pwa.ts`, `public/manifest.webmanifest`, `public/icons/`, `ngsw-config.json`, `tests/`, `tools/verify-build.mjs`, `README.md`, `QA_CHECKLIST.md`, `.github/workflows/pages.yml`.

Verifiche finali:

- 22 test Vitest passati su 2 file: logica di dominio, backup, immagini, rifiuto dati invalidi, IndexedDB, rollback e Store.
- Build Angular production passata, con compilazione strict dei template e chunk lazy.
- Manifest, icone, service worker e inclusione dei bundle JavaScript nel precache verificati da `node tools/verify-build.mjs`.
- Nessuna verifica visiva/browser o installazione PWA eseguita: l'ambiente non dispone del controllo browser previsto per queste prove.
- Nessun deploy esterno eseguito. Sorgenti, workflow e build statica pronta vengono consegnati insieme.

## Limiti e passi successivi

1. Eseguire `QA_CHECKLIST.md` su Android e iOS: responsive, tastiera, persistenza dopo chiusura effettiva, installazione e navigazione offline dopo il precache.
2. L'archivio personale usa snapshot completi per scritture atomiche: per dataset molto grandi ottimizzare le transazioni; per modifiche simultanee da più schede aggiungere coordinamento. Usare una scheda alla volta.
3. Ruoli e interfacce non costituiscono sicurezza multiutente. Backend, sincronizzazione, JWT e gestione utenti remoti restano fuori scope come richiesto.
4. Confermare il download dei backup sul dispositivo. Nessun sistema locale protegge dalla cancellazione dei dati del browser senza una copia esportata.
