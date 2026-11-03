# PROMPT MASTER PER CODEX — GT FITNESS / DESIGN STUDIO v1

## Missione: IMPLEMENTARE, non disegnare una demo

Sei un Principal Mobile/Web Engineer, Product Designer, Software Architect e Security Reviewer. Hai accesso al vero repository di **GT Fitness — Giacomo Tanduo**. Implementa un sistema **runtime di personalizzazione dei controlli GIÀ ESISTENTI**, per il SOLO ruolo **SUPER ADMIN**, ispirato ai PNG inclusi. Devi operare sul codice reale, rispettando stack e convenzioni del progetto.

**Regola assoluta:** tutte le funzionalità già operative dell'app devono continuare a funzionare come prima (login, ruoli, allenamenti, serie, progressi, grafici, calendari, schede, notifiche, routing, pagamenti se presenti e tutti gli altri flussi). Non toccare business logic se non indispensabile per integrare token e styling. Non mentire sui test eseguiti.

### Scope di questa iterazione

**SI:** modifica aspetto a livello globale, per pagina o **per singolo controllo fisico/logico** già presente. **SI:** preset, palette personalizzate, colore, testo visualizzato, dimensione, raggio, bordi, icona, sfondo, neon, opacità, gradiente, blur, ombra, tipografia e animazioni in quanto supportato. **SI:** anteprima LIVE e salvataggio/ripristino reali. **SI:** modalità Super Admin con autorizzazione robusta, audit, rollback.

**NO:** creare, aggiungere, cancellare, duplicare, trascinare o riposizionare componenti tramite builder; non creare un sistema di action scripting; non modificare onPress, routing, query, binding, stati funzionali, permessi, ID tecnici, handlers, dati o regole operative di un controllo. La UI può mostrare «tipo/stile di bottone» (solid, outline, glass...), NON trasformare un bottone in un input o cambiare ciò che fa. Se l'immagine di riferimento mostra «Aggiungi componente», **ignoralo in questa fase**.

## Procedura obbligatoria

1. LEGGI tutti i file del pacchetto e osserva le PNG. Studia struttura del repository, framework, librerie, auth, backend, database, test e temi esistenti. Trova la schermata Profilo → Personalizzazione e i controlli nelle pagine Home, Allenamenti, Programmi (se presente), Progressi, Profilo.
2. Crea una baseline *prima di modificare*: stato Git, lista test, build, eventuali errori già presenti. Evita modifiche o reset distruttivi al codice utente. Usa branch/commit reversibili dove appropriato.
3. Identifica come il progetto distingue SUPER ADMIN da admin normale: **non indovinare** nomi dei ruoli e non attribuire a nessuno il ruolo. Se il progetto non dispone di una fonte affidabile di autorizzazione lato server, implementa un gate e policy coerenti con l'infrastruttura esistente oppure segnala e blocca la pubblicazione globale finché il backend non è pronto; non presentare un semplice controllo client come sicurezza.
4. Implementa **GT Design Studio** accessibile dal Profilo SOLO ai Super Admin (navigazione nascosta a non autorizzati + route guard + endpoint/API/RLS/security rules con controllo lato server + enforcement sulle letture e scritture privilegiate + test per 401/403). Nessuna escalation tramite local storage, parametri URL o JSON importato.
5. Implementa **design tokens** e uno schema di override versionato con eredità a tre livelli: **preset/tema globale → override pagina → override istanza specifica**. Il valore specifico vince; «ripristina ereditarietà» elimina l'override dell'istanza, non sovrascrive tutti.
6. Assegna identità STABILI ai controlli già esistenti (es. `home.quick_actions.workouts`) senza alterare le chiavi business. **Mai usare solo indice, etichetta o tipo del componente** come identificatore. Per liste dinamiche distinguere «template ripetuto» da «istanza con entity ID»; l'editor deve specificare esattamente quale. Riusa gli ID e i nomi del progetto, se disponibili.
7. Costruisci una schermata elenco pagine → **albero/overlay visuale dei controlli presenti** → selezione di un'istanza concreta → editor proprietà. Esempio principale: da Home seleziono SOLO `home.quick_actions.workouts`, cambio colore e altezza; `home.quick_actions.programs` e i bottoni altrove RESTANO invariati.
8. Implementa editor proprietà **adattivo al tipo esistente**. Coprire, secondo quanto è presente nel repository: bottoni, badge, card, text/label, input, switch, slider, progress, grafici, calendario, liste, tab, navigazione, icone, immagini, container. Per grafici/calendari cambiare SOLO caratteristiche estetiche; preservare dati, scelte, callbacks, serie, filtri e interazioni.
9. Implementa per i controlli effettivamente supportati almeno: label visualizzata quando sicura, variante di stile, dimensioni/constraints, raggio, padding, margin (ove appropriato), peso/dimensione font, testo, bg, border, opacity, shadow, blur, glow, gradienti 2+ stop, icon style e dimensione, transizioni. Applicare limiti di accessibilità e controlli responsivi; non permettere di rendere irraggiungibili i controlli critici, di annullare contrasto o di causare overflow.
10. Implementa preset da `config/PALETTE_PREDEFINITE.json`: **12 palette** mantenendo compatibilità con eventuali preset già esistenti. Il JSON è riferimento, va adattato al sistema dati reale. Permetti: applica, salva copia personalizzata, rinomina, esporta/importa in forma VALIDATA, ripristina preset originale e ripristina tutto con conferma. Non sovrascrivere la versione factory di un preset. Se utente personalizza il tema, deve poter tornare esattamente al preset originale.
11. Implementa un editor avanzato degli effetti per **tema, pagina e singola istanza**: gradiente lineare/radiale, colori HEX, stop e angolo, glow strength/blur/spread, shadow color/elevation, blur, overlay, background image (se compatibile e caricato in modo sicuro), opacità, bordi e neon. Crea preview live e fallback quando il componente/piattaforma non supporta una proprietà.
12. Implementa **bozza / anteprima / pubblicazione / rollback**. Le modifiche live devono agire sulla preview o sulla sessione editor, non su tutti gli utenti prima di «Pubblica». «Annulla» restituisce il tema pubblicato. Conferma pubblicazione globale; versiona revisioni e registra chi ha cambiato cosa. Se la piattaforma è solo locale e non dispone di backend remoto, documenta il limite: non promettere modifiche condivise cross-device inesistenti.
13. Persisti con adapter compatibile al progetto. Proteggi il backend da modifiche non autorizzate. Rendi configurazioni validate, versionate, limitate nelle dimensioni, con default sicuri e migrazioni. Non usare eval o script remoti e non eseguire azioni dal JSON.
14. Fai sì che **i componenti reali** leggano i token e gli override, senza crearne copie simulate sconnesse dalle schermate. Inserisci wrapper/adapters piccoli e composibili per le librerie esistenti. Se un componente terzo non è totalmente stilizzabile, esponi solo le proprietà sicure disponibili e documenta il limite.
15. Implementa per step, non in un unico cambio enorme. Primo vertical slice: accesso Super Admin + 1 Home button con cambio stile live + salvataggio persistente + test di nessuna regressione. Poi global/page scope, poi presets/effects, poi copertura alle altre tipologie. Dopo ogni step esegui build/test, fissa errori e misura cambi in UI e nelle funzioni.
16. Verifica baseline e post-implementazione con `docs/TEST_DI_ACCETTAZIONE_E_REGRESSIONE.md`: test autorizzazioni, una sola istanza, preview/annulla/persistenza/rollback, ruoli, dati reali, navigazione, schermi piccoli, contrasto, accessibilità, offline e migrazioni. Usa test automatizzati se possibile; manual test checklist chiara per il resto.

## UI target e fedeltà visuale

Riferimenti `assets/anteprime/` (non usare PNG come schermate statiche; ricrearle in componenti nativi): dark navy `#040C19`, ciano elettrico `#00D9FF`, blu `#0077FF`, card blu notte `#132B43`, glow misurato, bordi luminosi, font leggibili, preview istantanea, label italiane. Usa il logo come riferimento **solo se i diritti e gli asset del progetto lo consentono**, senza sovrascrivere il logo esistente a sorpresa.

Schermate proposte: **Profilo → Design Studio (Super Admin)** → `Panoramica` → `Pagine` → `Home` → selezione `Bottone: Allenamenti` → tab `Aspetto`, `Testo`, `Icona`, `Effetti`, `Avanzate` → preview live → `Salva bozza` → `Pubblica` o `Annulla`. Altre schede: `Temi e palette`, `Sfondo`, `Tipografia`, `Preset / Ripristina`, `Cronologia`.

**Azione/comportamento** della selezione resta volutamente bloccato in questa fase: nell'editor si può vedere descrittivamente «Azione esistente: apri allenamenti», ma NON riscriverla. Il caso d'uso è **editing delle proprietà visive di un'istanza**, non un builder.

## Security acceptance gates non negoziabili

- App utente: nessuna voce Design Studio visibile se non Super Admin.
- Deep link / route diretta: accesso negato a utenti normali o admin non super.
- API/read/write/exports/pubblicazione/restore/history: RBAC verificato con identità autenticata lato server; operazioni privilegiate mai autorizzate tramite flag client o ruolo dichiarato nel payload.
- Import di configurazioni: schema-validato, nessun path traversal/URL non autorizzato, no JS/espressioni eseguibili, nessuna escalation di permessi o alterazione di binding/eventi.
- Pubblicazione auditata e reversibile; gli utenti normali leggono solo tema PUBBLICATO, mai editor/bozze/segreti.
- Preservazione di stato e funzionalità: azioni `onPress`, processi di salvataggio workout, query, form, grafici e navigazione non devono perdere binding.
- Feature flag e rollback facile se editor crea problemi; fail-safe su temi invalidi.

## Consegne di Codex

Non fermarti a una descrizione: produci vere modifiche al repository. Alla fine scrivi `docs/GT_DESIGN_STUDIO_IMPLEMENTAZIONE.md` contenente: framework trovato, architettura scelta, file modificati, migrazioni, controlli/scope realmente supportati, tabelle complete dei test (pass/fail/not-run), command di build/esecuzione, screenshot reali se possibile, limitazioni e TODO della **futura** fase builder. Se una fase non è stata completata, dillo esplicitamente e non affermare che funziona.

**Priorità:** 1 Sicurezza Super Admin; 2 protezione funzionalità; 3 editor di singola istanza; 4 runtime theme/preview/persistenza; 5 preset e effects; 6 pixel-polish. **Qualità e integrità > quantità di feature.**
