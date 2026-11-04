# Protezione e recupero degli allenamenti

Intervento sul sorgente della versione 73 dopo la segnalazione di una seduta conclusa non più visibile nei progressi dell’app iPhone. Piano e altri allenamenti risultano presenti secondo la descrizione dell’utente.

## Accertamenti e limite del recupero

Nel controllo iniziale il database di produzione conteneva la testa dell’archivio e dieci revisioni recenti, non un archivio azzerato. I log interrogati non mostravano errori Worker. Questi controlli riguardano metadati: non dimostrano che le serie della seduta segnalata siano presenti nelle copie.

Due limiti del codice erano verificabili: la pulizia conservava solo gli ultimi dieci salvataggi ordinari e l’aggiornamento non creava una copia protetta confermata sul server. Mancava inoltre un controllo che impedisse a un archivio meno completo, ma con revisione valida, di togliere progressi già registrati. Non è stata stabilita una causa unica dell’incidente reale. Archivi separati tra installazioni iPhone restano una possibilità da verificare, non una conclusione.

**La seduta reale dell’utente non è stata dichiarata recuperata.** L’archivio locale dell’iPhone non è accessibile dal workspace. Per verificarla occorre consultare le copie dall’account autenticato nell’app, l’icona originale o un backup esportato. Le prove documentate usano soltanto dati sintetici; i carichi delle schermate QA non sono dati recuperati dell’utente.

## Protezioni implementate

- L’archivio locale salva una copia della seduta conclusa nella stessa transazione IndexedDB dei dati. Prima di modificare uno storico concluso conserva anche la situazione precedente. Un errore nella scrittura della copia annulla la transazione senza cancellare i dati già salvati.
- Le copie locali restano fuori dalle tabelle dell’archivio attuale, nel metadato dello stesso database. Nessun cambio di nome del database, azzeramento o migrazione distruttiva. Una sostituzione automatica dal server conserva prima una copia locale.
- Prima di applicare un aggiornamento vengono salvate bozze e scritture pendenti e verificata una copia locale. Per un account online si attende anche la conferma della copia protetta sul server; un errore rimanda l’attivazione. L’uso locale/offline mantiene il percorso con copia sul dispositivo.
- Il ripristino automatico rifiuta una revisione server inferiore a una già confermata e una copia che perderebbe serie registrate o i loro carichi/ripetizioni.
- Il server rifiuta copie che rimuovono sedute concluse o flag di serie completate senza un’intenzione esplicita riferita a quegli ID. Le modifiche effettive dell’utente generano una ricevuta persistente fino alla conferma del server: eliminazione di serie, riapertura e cancellazione autorizzata continuano a funzionare. La revisione rimane controllata atomicamente.
- La nuova tabella D1 `archive_checkpoints` conserva i riferimenti agli oggetti R2 immutabili di sedute concluse e aggiornamenti. La pulizia delle dieci revisioni ordinarie non elimina gli oggetti protetti. Il primo salvataggio dopo la correzione protegge anche la finestra di copie esistente. La migrazione aggiunge soltanto tabella e indici; non modifica dati applicativi esistenti.

## Recupero nell’app

In **Profilo → Dati e backup → Recupera una singola seduta · progressi e serie**, oppure nella pagina interna `#/recupera-allenamenti`, si sceglie la data dell’allenamento. La ricerca confronta copie locali, altri archivi consentiti sul dispositivo e versioni server dello stesso account. È possibile selezionare anche un file backup GymTrack validato.

Ogni risultato mostra seduta, data, serie completate, riscaldamenti e anteprima di esercizi, carichi e ripetizioni. La conferma recupera soltanto la seduta selezionata, conserva una copia della situazione attuale e lascia invariati gli altri allenamenti, il piano, il profilo e le preferenze. Le serie aggiuntive attuali rimangono conservate. Se il server contiene ulteriori progressi non inclusi nel risultato, entrambe le copie restano conservate e la sincronizzazione richiede un confronto.

Le istruzioni sull’icona ora precisano di continuare a usare il collegamento attuale per gli aggiornamenti e verificare la sincronizzazione prima di passare a Safari o a un’altra installazione iPhone. Non viene richiesto di eliminare dati Safari, icone o archivi.

## Verifiche

- **91 suite, 801 test superati**: transazioni e riapertura del database, rifiuto di copie regressive, ricevute delle modifiche intenzionali, aggiornamenti, recupero selettivo, account/reset e tutte le funzionalità esistenti.
- **8 scenari browser di recupero superati**: copia protetta oltre dieci salvataggi, anteprima, recupero e sincronizzazione della singola seduta, altre sedute invariate, copie locali prima/dopo, riapertura e percentuale Home, recupero da File, larghezze 320–430 px. Nessuna eccezione applicativa.
- **10 scenari browser di regressione allenamenti superati**: carichi e riscaldamento settimanali, sostituzione nel piano su otto settimane, eliminazione di serie completate, pulsante Salva/Aggiorna, preferenze, icone e storico.
- Worker confezionato verificato con SQLite/R2 isolati: autenticazione, Design Studio, preferenze, blocco delle copie regressive, copie protette e icone. Build produzione, manifest/precache e sintassi Worker verificati.

Runner: `tests/runtime/workout-data-safety-browser.mjs`, `tests/runtime/training-upgrades-browser.mjs`, `tests/runtime/packaged-training-upgrades.mjs`. Log e schermate: `docs/qa/workout-data-safety/`.

L’helper di manutenzione una tantum, escluso dal deployment, dichiara ora esplicitamente le riduzioni dello storico già previste dalla sua operazione autorizzata; i test di audit e idempotenza rimangono attivi. Nessuna operazione di reset è stata eseguita durante questo intervento.
