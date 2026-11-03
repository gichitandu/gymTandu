# Logo GT, testi modificabili e percentuale settimanale

Aggiornamento della versione 69 di GymTrack, sorgente precedente `faaf264ce41465b38bc9e792a75b8a9eccb7206c`.

## Risultato

- Nuovo monogramma **GT**, con linee geometriche e gradiente ciano, blu e viola, nelle schermate di accesso, nel marchio dell’app, favicon, icona Apple e icone PWA.
- Nuova sezione **Testi e scritte** nel GT Design Studio, accessibile solo al Super Admin online. Sono modificabili **50 scritte statiche** fra titoli, sottotitoli, pulsanti, sezioni e navigazione delle pagine principali. Il catalogo passa da 53 a 71 controlli, mantenendo tutti gli ID esistenti.
- Percentuale settimanale nuovamente visibile **subito sotto il titolo Home**, prima dei pulsanti principali. L’accesso agli obiettivi e le informazioni sul benessere restano disponibili.

## Come modificare “Home”

1. Profilo → GT Design Studio → **Testi e scritte**.
2. Pagina **Home** → **Titolo Home** → scrivere il nuovo testo.
3. Controllare l’anteprima, quindi **Salva bozza** oppure **Pubblica**.

Per cambiare il nome nella barra di navigazione, scegliere invece la pagina **Navigazione** e la voce **Home**. Le due scritte sono indipendenti; i collegamenti continuano a usare le stesse rotte. **Ripristina testo originale** elimina solo l’override del testo. Bozze, preset, import/export e cronologia esistenti includono le scritte.

L’anteprima resta privata fino alla pubblicazione. Su telefono si apre con **Mostra anteprima live**. È possibile tornare a cambiare i nomi in ogni momento.

## Statistica recuperata

La precedente implementazione della percentuale non era stata cancellata: il riquadro si trovava nel pannello “Obiettivo e benessere”, chiuso per impostazione predefinita. È stato riportato in alto senza sostituire il calcolo o i dati.

La percentuale è `min(100, round(allenamenti completati nella settimana / obiettivo personale × 100))`. La settimana va da lunedì a domenica, secondo la data locale già gestita dall’app. Due sedute su un obiettivo di tre danno **67%**. Restano esclusi sessioni in bozza, eventi di calendario non completati e altre settimane. Il conteggio reale può superare l’obiettivo, mentre l’anello si ferma al 100%. Senza obiettivo salvato si mostra “—” e il collegamento per impostarlo, senza inventare una percentuale.

Il riquadro mantiene l’identità `home.goals`; l’immagine `home.dumbbell` è mantenuta come elemento decorativo. L’anello numerico ha un nome accessibile, valore percentuale e colori leggibili anche nei venti preset Studio.

## Compatibilità

- Nessuna migrazione, cancellazione o riscrittura dei dati di produzione. Piani, sessioni, progressi e obiettivi continuano a leggere gli archivi esistenti.
- Nessuna modifica a login, ruoli, API delle attività, handler, query, destinazioni di navigazione o sincronizzazione.
- La modifica dei testi usa lo schema Design Studio versione 1 e le API esistenti. Valori numerici, nomi dinamici delle sedute, titoli dei sottopannelli del Profilo e comandi critici mantengono i binding originali.
- Le label sono stringhe semplici fino a 60 caratteri, validate sul client e sul server; nessuna interpretazione HTML. I nomi della navigazione rimangono allineati ai nomi accessibili dei link.
- Palette, preferenze personali, preset e override esistenti sono conservati. Non viene pubblicata automaticamente una configurazione Studio di esempio.
- Identità PWA, `start_url`, `scope` e registrazione service worker restano invariati. Le nuove icone hanno percorsi nuovi e sono incluse nel precache; i vecchi percorsi PNG continuano a funzionare. I dispositivi possono mantenere in cache un’icona già installata: non è stata verificata la sua sostituzione su un iPhone fisico.
- Nessuna dipendenza aggiunta e nessun asset remoto necessario per il logo.

## Verifiche

- Baseline: **88 suite / 743 test** superati prima delle modifiche.
- Regressione completa: **89 suite / 756 test** superati.
- Verifica mirata finale di testi, anello, palette e guardie: **58 test** superati.
- Build produzione riuscita; manifest, nuovi PNG e precache PWA verificati; sintassi Worker valida.
- Worker confezionato eseguito con SQLite isolato: accesso, preferenze, nuova label di titolo, sottotitolo, navigazione, pubblicazione e rollback verificati.
- Runner di regressione Design Studio: **15 scenari** nel browser, compresi navigazione, isolamento di istanza, preset, bozza, pubblicazione, ripristino, import non valido e accessi Admin/User negati.
- Runner dedicato `tests/runtime/logo-labels-weekly-browser.mjs`: **11 scenari superati**, compresi posizione alta della statistica, obiettivo salvato e 67%, anteprima privata, nuova scritta persistente, destinazioni e sottopannelli originali, dati personali invariati, navigazione desktop/mobile, ripristino e annullamento, testi lunghi e icone. Totale: **26 scenari browser superati**, senza eccezioni applicative.

Tutte le prove browser usano Chromium e la fixture su `http://localhost:4173`, con identità e dati sintetici in SQLite/R2 in memoria e IndexedDB locale. Il confronto prima/dopo comprende tutte le tabelle dei dati personali; esclude soltanto il contatore tecnico `archiveMeta`, aggiornato dalla sincronizzazione/catalogo già esistente. Nessun test scrive negli archivi di produzione. Nessuna prova su hardware iPhone/Safari dichiarata.

Log e schermate reali: `docs/qa/gt-logo-labels-weekly/`. La build conserva gli avvisi di budget iniziale e dipendenze CommonJS già presenti; nessun controllo è stato disabilitato.

Per tornare ai testi precedenti usare il ripristino del campo o la cronologia Studio. Per ripristinare il codice precedente è disponibile la versione 69; non sono necessarie migrazioni inverse dei dati.
