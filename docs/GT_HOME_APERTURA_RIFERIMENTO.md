# Apertura Home dal riferimento

Aggiornamento della versione 71. La parte iniziale riprende l’immagine fornita: data italiana in maiuscolo, saluto con il primo nome del profilo e mano, frase “Ogni giorno, un passo avanti.”, manubrio neon e grande anello centrale.

Nome, data, percentuale e conteggi rimangono dinamici. La schermata di verifica con “Ciao Giacomo”, lunedì 2 novembre e 75% usa esclusivamente dati sintetici: tre allenamenti su un obiettivo di quattro. Nessun valore di esempio viene salvato nella produzione.

## Contenuti e personalizzazione

Tutto il template successivo al riquadro iniziale, da `<gt-status />` in poi, è identico alla versione precedente: pulsanti principali, collegamenti rapidi, calendario settimanale, statistiche, vista cliente, backup, benessere e alimentazione quando abilitata. Restano gli stessi handler, collegamenti, query e dati. La campanella rimane accessibile in alto; l’anello apre ancora gli obiettivi originali.

Gli ID `home.title`, `home.subtitle`, `home.goals`, `home.goals.edit` e `home.dumbbell` sono conservati. I testi già personalizzati mantengono la precedenza. Senza override il titolo diventa “Ciao” seguito dal primo nome; il ripristino del testo nel Design Studio torna al saluto personale. La voce “Home” nella navigazione resta indipendente. Il colore dell’anello segue la palette attiva.

Il manubrio già disponibile nell’app è riutilizzato, caricato subito e incluso nel precache offline. Nessuna nuova dipendenza o immagine remota. Identità PWA, logo GT e icone Home della versione 71 sono conservati.

## Verifiche

- Regressione completa: **89 suite, 756 test superati**.
- Regressione browser di testi e obiettivi: **11 scenari superati**, inclusi bozza privata, pubblicazione, ripristino, navigazione, titoli lunghi, dati personali invariati e icone.
- Nuova apertura: **8 scenari superati**, con profilo e data reali della fixture, 75% da tre sedute su quattro, anello centrato, contenuti sottostanti, campanella e obiettivi, misure 320/390/430 px e desktop, passaggio di data e temi blu/viola/chiaro. Nessuna eccezione JavaScript.
- Confronto esatto del template sotto il nuovo riquadro: invariato rispetto al sorgente della versione 71.
- Build produzione, verifica manifest/precache e sintassi Worker riuscite. Worker confezionato verificato con sessioni, bozze, testi, pubblicazione e rollback in SQLite isolato.

Le prove browser usano Chromium, la fixture su `http://localhost:4173` e archivi sintetici. Nessun accesso o modifica agli allenamenti di produzione e nessuna prova su iPhone fisico dichiarata.

Log e schermate: `docs/qa/home-reference/`. Runner: `tests/runtime/home-reference-browser.mjs` e `tests/runtime/logo-labels-weekly-browser.mjs`.

Ripristino del codice: versione 71, senza migrazioni inverse o cancellazioni di dati.
