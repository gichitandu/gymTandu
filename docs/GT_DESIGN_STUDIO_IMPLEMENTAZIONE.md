# GT Design Studio — implementazione fase 1

Data: 3 novembre 2026. Progetto reale: GymTrack, Site `appgprj_6ad0da45e6e8819182b84e5e2932f5ba`, versione di partenza 67. Repository recuperato dal progetto Sites collegato dopo aver verificato che il primo ZIP conteneva soltanto specifiche. Base Git: `9277e6c2d92b0271fc05356c74e336e82e05b505`; branch di lavoro `feat/gt-design-studio`.

## Stato della consegna

Implementato nel codice dell’app, senza creare un’app parallela. L’accesso è **Profilo → GT Design Studio**, solo Super Admin online. La migrazione mantiene l’aspetto precedente come revisione 0: nessuna nuova palette viene applicata automaticamente agli utenti. Il consueto comando “Distribuisci ultima versione” rimane invariato e serve ad attivare il codice già pubblicato sui dispositivi.

Sono implementati ambiti globale, pagina e singola istanza, 12 palette factory esatte, anteprima privata su componenti reali, bozze persistenti, copie personali dei preset, rinomina, import/export JSON validato, pubblicazione confermata, cronologia con autore/delta/checksum e rollback. Non è stato implementato il futuro builder.

## Stack e analisi iniziale

- Angular 22 standalone, signal, router hash, form esistenti e Chart.js.
- Dexie/IndexedDB per archivi personali e preferenze; gli allenamenti non vengono spostati né migrati dal Design Studio.
- Cloudflare Worker con D1 per account, sessioni e configurazioni condivise; binding R2 esistente mantenuto.
- Identità Sites verificata dalla piattaforma e sessione applicativa HttpOnly, legata al visitatore; ruolo autorevole `SuperAdmin` già presente. Non sono stati creati account, ruoli o password in produzione.
- Temi personali e relativi backup preesistenti mantenuti. La revisione Studio 0 ripristina la loro presentazione.
- Baseline prima delle modifiche: working tree pulito, 84 suite / **687 test passati**, build produzione e verifica PWA riuscite. Avvisi preesistenti: budget iniziale di avviso 1 MB ed ExcelJS/JSZip CommonJS.

La Home reale contiene programmazione, scorciatoie, calendario settimanale e riepiloghi; non coincide con la griglia dei concept. Il primo caso implementato è il collegamento **Allenamenti nel riepilogo della Home**, ID `home.stats.workouts`. Conteggio dinamico e destinazione `/allenamenti` sono preservati; è personalizzabile la sola etichetta decorativa. Non sono stati inventati controlli “Allenamenti/Programmi” assenti dalla Home reale.

## Architettura e confini

`factory → global → pages[pageId] → instances[stableId]`. Rimuovere una proprietà elimina l’override; non copia un valore né azzera le altre istanze. `app_default` è una base vuota compatibile con i temi personali precedenti.

`shared/design-system.js` e relativa dichiarazione TypeScript costituiscono il contratto comune al browser e al Worker. La validazione rifiuta versioni sconosciute, ID non registrati, proprietà operative, ruoli, script, URL, CSS arbitrario, valori fuori limite e oggetti non conformi. Configurazione massima 64 KiB; lettura HTTP limitata durante lo streaming. Gradienti: 2–5 stop ordinati, estremi 0/1, angolo 0–360. I factory sono profondamente immutabili e provengono dal JSON approvato, conservato in `docs/gt-design-studio/`.

Gli adapter Angular aggiungono solo presentazione agli elementi esistenti. Memorizzano e ripristinano gli stili inline originali, senza cambiare handler, routerLink, query, formControl, stati disabled o valori dinamici. Il testo è editabile solo su etichette statiche esplicitamente registrate; logout, avvio/ripresa delle sedute e valori calcolati sono bloccati. Le icone modificabili provengono dalla libreria locale esistente.

L’anteprima monta le vere Home, Allenamenti, Storico, Progressi e Profilo con il medesimo Store in lettura, contesto di stile isolato, contenuto `inert` e servizio bozze dei form disabilitato soltanto nel sottoalbero preview. La navigazione inferiore è stata estratta in un componente condiviso, conservando destinazioni e stato attivo, e riutilizzata nella preview. Selezionare un elemento apre i relativi pannelli di presentazione quando disponibili; azioni o scritture non vengono eseguite. I controlli condizionali assenti mostrano una spiegazione.

Gli utenti leggono solo configurazione pubblicata. I client autenticati la ricaricano all’avvio, al ritorno in primo piano, alla riconnessione e ogni 60 secondi mentre visibili; una risposta vecchia non può sostituire una revisione più recente. La cache per account contiene solo configurazione pubblicata validata. La modifica live dell’editor non tocca questa cache.

## Sicurezza e persistenza

La voce Profilo è condizionata dal ruolo effettivo online, dalla vista non-cliente e dal flag server. La guardia della route attende il caricamento della sessione e verifica un endpoint privilegiato prima dell’apertura. Anche entrando direttamente o manipolando localStorage/payload, il Worker verifica il ruolo corrente della sessione sul server. Il gate Sites e i controlli origin/Content-Type esistenti rimangono attivi.

| Endpoint | Accesso |
| --- | --- |
| `GET /api/design/published` | Account autenticati; solo versione pubblicata e flag disponibilità editor |
| `GET /api/design/studio` | Solo Super Admin; propria bozza, propri preset e cronologia |
| `POST /api/design/draft`, `discard` | Solo Super Admin; bozza privata e controllo versione |
| `POST /api/design/publish`, `rollback` | Solo Super Admin; conferma e revisione attesa obbligatorie |
| `POST /api/design/presets`, `rename`, `export` | Solo Super Admin; validazione e proprietà del record |

Gli anonimi ricevono 401; Admin e User ricevono 403 sulle operazioni privilegiate. Le bozze e i preset sono filtrati per ID dell’account autenticato, mai per ID dichiarato nel payload. La fonte di autorità non è il profilo Dexie né un ruolo importato.

Migrazione additiva `drizzle/0010_gt_design_studio.sql`, schema e snapshot Drizzle aggiornati:

| Tabella | Scopo |
| --- | --- |
| `design_state` | Revisione e tema pubblicati; inizializzazione al default compatibile |
| `design_drafts` | Bozza privata, revisione base, versione e timestamp per Super Admin |
| `design_presets` | Copie personali, nome e versione; massimo 40 per account |
| `design_revisions` | Snapshot immutabile, autore, data, tipo, origine rollback e SHA-256 |
| `design_audit` | Delta prima/dopo associato alla revisione e all’autore |

Pubblicazione e rollback sono batch D1 atomici con controllo della revisione corrente. Pubblicare verifica anche la versione della bozza nel batch: un cambiamento concorrente non può creare una revisione o un audit orfano. Conflitti: 409, conservando i dati e richiedendo ricaricamento. Il rollback crea una nuova revisione; non riscrive la cronologia.

Il Worker è confezionato con il contratto e i factory, senza import residui o dipendenze remote. L’identità build include anche i tre sorgenti Design Studio. Le migrazioni rimangono alla radice dell’artefatto e nella posizione richiesta da Wrangler. La policy di accesso del Site resta quella del progetto esistente.

## Copertura effettiva e proprietà

**53 controlli registrati**, inventario completo in [GT_DESIGN_STUDIO_CONTROLLI.md](GT_DESIGN_STUDIO_CONTROLLI.md).

| Tipo | Numero | Supporto reale |
| --- | ---: | --- |
| Bottoni/collegamenti | 24 | Aspetto, min-height, spaziature, bordo/raggio, testo statico e icona dove consentiti, effetti |
| Testi | 4 | Colore, tipografia, spaziatura; contenuti dinamici preservati |
| Card | 6 | Superficie, bordo/raggio, padding/margine, tipografia ed effetti |
| Input/select | 3 | Aspetto; ricerca, opzioni, valori e binding invariati |
| Tab/navigazione | 6 | Aspetto; route, selezione e azioni originali |
| Grafici | 2 | Contenitore e token cromatici; dataset, filtri e interazioni invariati |
| Calendario | 1 | Contenitore settimanale; date, classi di stato e query invariati |
| Progress | 1 | Contenitore dell’obiettivo; percentuale e binding originali |
| Immagine | 1 | Presentazione dell’immagine esistente; sorgente invariata |
| Switch | 1 | Contenitore; stato e onChange invariati |
| Slider | 1 | Aspetto/accento del controllo glow; valore e salvataggio originali |
| Badge | 1 | Aspetto del badge di riepilogo; significato e contenuto preservati |
| Lista e contenitore | 2 | Stile del contenitore; elementi e dati invariati |

Proprietà: colori HEX, pieno/outline/glass/neon/gradiente quando applicabile, gradienti lineari e radiali, angolo/stop, ombre, glow con intensità/blur/spread, blur dello sfondo, opacità limitata, font locali, dimensione/peso/interlinea/letter spacing, bordo, raggio, padding, margine verticale, dimensione delle icone e transizioni. L’altezza è **minima**, per evitare troncamenti; i comandi interattivi mantengono almeno 44 px. Contrasto: adeguamento del testo e fallback pieno se il gradiente non offre un contrasto valido. La preferenza reduced motion prevale sulle transizioni. Gli stati disabled mantengono la propria presentazione funzionale.

## Verifiche e prove

Ambiente: Node 24, Linux; SQLite reale con adapter D1 per i test backend; Chromium headless contro un server QA solo loopback con identità e database **di prova in memoria**. Nessun accesso ai dati personali di produzione per i test. Screenshot reali della fixture, non dei dati dell’utente.

| Verifica | Esito | Evidenza |
| --- | --- | --- |
| Baseline Git, test e build prima delle modifiche | PASS | 84 suite / 687 test; log baseline in `docs/qa/` |
| Regressione completa | PASS | `npm test`: 87 suite / **726 test**, inclusi tutti i 687 originali |
| Contratto, cascade, sicurezza e client Studio | PASS | 39 nuovi test in tre suite; rieseguiti dopo le ultime correzioni |
| Build produzione Angular strict e packaging Worker | PASS | `npm run build` |
| Manifest, offline precache, build identity e asset PWA | PASS | `npm run verify:build`: 48 bundle JavaScript verificati |
| Sintassi del Worker autosufficiente | PASS | `node --check dist/server/index.js` |
| API del Worker già confezionato | PASS | Fixture SQLite isolata: sessione, migrazione, bozza, pubblicazione, lettura e rollback sull’effettivo `dist/server/index.js` |
| Anonimo 401; User/Admin 403; ruolo contraffatto; sessione revocata | PASS | Suite Worker e guardia client |
| Origine esterna, import malizioso, schema sconosciuto, dimensioni e input invalidi | PASS | Suite contratto e Worker; import provato anche nel browser |
| Deep link Super Admin durante caricamento iniziale della sessione | PASS | Test client e browser |
| Voce nascosta e route/API negate ad Admin e User | PASS | Browser con sessioni distinte e API 403 |
| Isolamento di una sola istanza Home; sibling e app pubblicata invariati durante preview | PASS | Browser con due schede e confronti di stile |
| Etichetta statica, bozza, ricaricamento, pubblicazione, destinazione originale del link | PASS | Browser, percorso `/allenamenti` conservato |
| Ereditarietà/rimozione override | PASS | Contratto unitario e adapter con ripristino stili originali |
| Dodici factory, valori esatti e immutabilità | PASS | Confronto integrale con JSON approvato e scelta di tutte le palette nel browser |
| Salva copia preset, rinomina, export validato, restore factory/default | PASS | Suite Worker/contratto; copia, import invalido e default anche nel browser |
| Revisioni, checksum, audit, CAS e bozza cambiata durante commit | PASS | SQLite reale, transazioni e test negativi |
| Rollback A → B → A e cancellazione bozza | PASS | Suite Worker e browser; ripristino degli stili confrontato col default iniziale |
| Login/logout, ruoli, archivio, serie, dati progressi e preferenze preesistenti | PASS automatico | Suite originali; nessuna mutazione delle tabelle account/preferenze nei test Studio |
| Navigazione Home, Allenamenti, Storico, Progressi e Profilo | PASS | Browser e suite esistenti |
| Preview reale delle quattro pagine richieste e navigazione | PASS | Screenshot e test browser |
| Reduced motion e controlli responsive a 390 px | PASS | Browser; nessun overflow orizzontale |
| Nessuna eccezione applicativa nel browser | PASS | 15 verifiche browser completate senza pageerror |
| Config invalida/obsoleta, cache, tema personale e compatibilità backup | PASS automatico | Nuove suite più suite tema/backup originali |
| Disattivazione server dell’editor senza disattivare app/lettura tema | PASS | Test `DESIGN_STUDIO_DISABLED=1` |
| Uso offline su dispositivo fisico, Safari/PWA iPhone, tastiera e screen reader reali | NON ESEGUITO | Richiede dispositivo e tecnologie assistive reali |
| Tutte le palette su tutte le pagine in Safari/landscape/tablet fisico | NON ESEGUITO | Verificati renderer, browser desktop e viewport mobile; nessuna prova hardware dichiarata |
| Profilazione RAM/FPS con archivi grandi, liste e grafici pieni su iPhone | NON ESEGUITO | Nessun benchmark hardware disponibile |

I 15 scenari browser sono in `tests/runtime/design-studio-browser.mjs`; il server locale è in `tests/runtime/design-studio-qa-server.mjs`. Questi file non sono inclusi nell’artefatto di distribuzione. I fallimenti intermedi della prova browser dovuti ad attese del router/render sono stati risolti nel runner; il difetto effettivo della guardia iniziale è stato corretto e coperto da un test dedicato.

Comandi:

```sh
npm ci --cache /tmp/gymtrack-npm-cache --no-audit --no-fund
npm test
npm run build
npm run verify:build
node --check dist/server/index.js
node tests/runtime/design-studio-package-check.mjs
npm run package:deploy -- /workspace/gymtrack-design-studio-deploy.tar.gz

# QA facoltativa, solo localhost, in un processo separato:
node tests/runtime/design-studio-qa-server.mjs
# Richiede Playwright e Chromium locali, senza modificare le dipendenze dell’app:
GYMTRACK_PLAYWRIGHT_MODULE=/percorso/playwright/index.mjs node tests/runtime/design-studio-browser.mjs
```

Build iniziale: circa 1,38 MB; con Studio circa 1,41 MB. Il limite di errore 2 MB rimane rispettato. L’avviso a 1 MB e i due avvisi CommonJS erano già presenti; non sono stati nascosti né alzati i limiti.

## File principali modificati

- `shared/design-system.js`, `.d.ts`, `design-presets.js`: contratto, validazione, registry, cascade e renderer.
- `src/app/design/`: runtime, adapter, guardia, editor, CSS e preview reale.
- `src/app/features/home.component.{ts,html}`, `plans.component.ts`, `workouts.component.ts`, `progress.component.ts`, `profile.component.ts`: annotazioni visive dei controlli; voce Studio nel Profilo.
- `src/app/core/routes.ts`, `src/app/layouts/shell.component.ts`, `src/app/shared/bottom-navigation.component.ts`: route protetta e navigazione condivisa.
- `src/app/shared/icon.component.ts`, `progress-chart.component.ts`: override decorativo delle icone e aggiornamento colori dai token sugli antenati.
- `src/design-runtime.css`, `angular.json`: stili degli adapter e inclusione build.
- `worker/design-studio.js`, `worker/index.js`, `tools/package-worker.mjs`: API autorizzate e Worker autosufficiente.
- `db/schema.ts`, migrazione, journal e snapshot Drizzle 0010: cinque tabelle additive.
- `tests/design-*.test.ts`, `tests/runtime/design-studio-*.mjs`: nuove verifiche automatiche e browser.
- `docs/gt-design-studio/`, questo report, inventario e prove in `docs/qa/`.

## Limiti espliciti e ripristino

- La personalizzazione di singola istanza copre i **53 ID registrati**, non ogni elemento dell’app. I token globali si propagano per ereditarietà CSS; componenti terzi con stili propri non sono dichiarati completamente configurabili.
- Per liste dinamiche è registrato il contenitore/template, esplicitamente etichettato: non è implementato un override per entity ID di un singolo piano/esercizio.
- Grafici, calendario, ring, slider e switch espongono proprietà del contenitore o token supportati; non vengono sostituiti renderer, forme, date, serie o scale funzionali.
- Non sono disponibili URL arbitrari, upload di sfondi, font remoti, larghezze assolute/posizionamento, builder, aggiunta/duplicazione/rimozione/riordino controlli o scripting di azioni. Gli sfondi sono solidi o gradienti; le immagini esistenti conservano la sorgente.
- I factory mantengono i valori originali; il rendering può correggere il testo o usare un pieno per tutelare il contrasto. Non è dichiarato un audit completo di accessibilità di tutte le schermate su ogni combinazione possibile.
- La cronologia UI mostra le ultime 30 revisioni, senza cancellare quelle precedenti dal database. I preset personali sono privati al Super Admin che li ha salvati.
- Offline viene usata l’ultima configurazione pubblicata validata, quando presente; editor e scritture richiedono la sessione online. Nessuna promessa di sincronizzazione delle bozze senza rete.
- Al bootstrap il default è compatibile con l’aspetto precedente. Per spegnere lo stile: disattivare “Applica il sistema di stile Studio” e pubblicare, oppure ripristinare revisione 0. Per disabilitare il solo editor dal server: impostare `DESIGN_STUDIO_DISABLED=1`; lettura del tema e resto dell’app rimangono attivi.
- Ripristino del codice: ridistribuire la versione Sites 67. Le nuove tabelle sono additive e possono restare nel database; non serve cancellare dati o archivi personali.

La futura fase builder richiederà un progetto separato per struttura delle pagine e azioni. Non viene attivata da questo schema.

## Screenshot della verifica browser

- [Palette e Home reale](qa/gt-studio-home-desktop.png)
- [Allenamenti](qa/gt-studio-training-desktop.png)
- [Progressi](qa/gt-studio-progress-desktop.png)
- [Profilo](qa/gt-studio-profile-desktop.png)
- [Navigazione condivisa](qa/gt-studio-navigation-desktop.png)
- [Viewport mobile 390 px](qa/gt-studio-mobile.png)

Sono immagini della fixture locale con dati dimostrativi e gli stessi componenti dell’app. Non sono una prova su Safari o un iPhone fisico.
