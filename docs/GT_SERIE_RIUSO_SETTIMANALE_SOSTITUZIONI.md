# Serie, riuso settimanale, sostituzioni nel piano e icona Home

Aggiornamento sul sorgente della versione 72. Le modifiche conservano il repository, l’identità PWA, l’accesso privato del Site e gli archivi esistenti. Non richiedono azzeramenti o migrazioni distruttive.

## Come usare le nuove funzioni

- **Eliminare una serie:** usa il cestino accanto alla serie nel dettaglio dell’esercizio oppure in alto nella registrazione. Funziona per serie allenanti e riscaldamento. Una serie completata richiede conferma. Le altre serie vengono conservate e rinumerate; nella seduta aperta rimane disponibile l’annullamento esistente. Anche l’editor dello storico può eliminare una singola serie senza abilitare l’eliminazione dell’intero allenamento. Il pulsante −1 continua a ridurre le ripetizioni della serie.
- **Registrare e rivedere:** il pulsante mostra “Salva serie” per una serie da completare e “Aggiorna serie” per una già registrata. Aggiornare una serie completata mantiene la selezione e il recupero in corso. La registrazione viene ricreata per l’ID della serie selezionata; testo, icona e contrasto del pulsante hanno uno stile stabile.
- **Ripartire dalla settimana prima:** quando esiste una seduta compatibile, prima di iniziare compare “Prepara la seduta”. La scelta è attiva per impostazione predefinita; si può cambiare ogni volta. In **Profilo → Impostazioni → Unità e allenamento** puoi disattivarla per impostazione predefinita. La preferenza è inclusa in salvataggio locale, copia account, importazione ed esportazione backup.
- **Sostituire un esercizio:** premi “Sostituisci esercizio” nella seduta aperta oppure nel menu ⋯ dell’esercizio in “I miei piani”. Puoi scegliere la sola seduta aperta, una sola voce del piano, tutte le occorrenze nel piano oppure gli allenamenti selezionati. I giorni sono raggruppati per settimana, anche per un programma di otto settimane.
- **Salvare il logo sulla Home:** in **Profilo → Impostazioni → Icona e collegamento Home** trovi il collegamento diretto di GymTrack. Aprilo nel browser prima di aggiungerlo alla Home.

## Protezione di prescrizioni e storico

Il riuso cerca lo stesso giorno/slot nella settimana precedente del programma e nello stesso piano. Per giorni ordinari cerca nella precedente settimana di calendario. Usa solo serie completate, con lo stesso esercizio, modalità di carico e configurazione macchina compatibile. Distingue anche più occorrenze dello stesso esercizio nella seduta.

I riscaldamenti personali vengono copiati con carico, ripetizioni e recupero. Le serie allenanti mantengono numero, ripetizioni e indicazioni della nuova settimana: si copiano i carichi corrispondenti, estendendo l’ultimo carico disponibile quando la nuova prescrizione aggiunge serie. Ogni nuova serie ha un nuovo ID e deve essere confermata. La scelta di non copiare prevale sulla vecchia precompilazione quando esiste un riferimento settimanale.

Le sostituzioni conservano serie, ripetizioni, recupero, RIR e riscaldamento prescritto. Eliminano i carichi e riferimenti della macchina precedente dalla programmazione sostituita. Una seduta aperta senza serie eseguite può aggiornarsi insieme al piano; una con serie già eseguite conserva il proprio esercizio e i propri valori. Gli snapshot degli allenamenti completati restano invariati. Validazione e scrittura avvengono nello stesso aggiornamento atomico dell’archivio: un errore non applica metà sostituzione.

## Perché l’icona richiedeva un’altra correzione

Il file GT corretto era già presente, ma le richieste anonime alle icone del Site privato potevano ricevere la pagina HTML di accesso. Il sistema che crea un collegamento può richiedere l’icona separatamente dalla pagina autenticata.

Il confezionamento incorpora i PNG GT nei link Apple/favicon dell’HTML e nelle icone del manifest. Aggiorna gli hash offline dopo l’incorporamento ed è ripetibile senza cambiare l’identità della build. Nessuna credenziale viene inserita nelle risorse del client; la configurazione privata del Site rimane invariata.

Safari supporta le icone con URL `data:` dalla versione 26: [note ufficiali Safari 26](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes) e [WebKit in Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). I precedenti file PNG e favicon restano disponibili. I collegamenti già salvati possono conservare l’icona nella cache del sistema; il codice non può imporre l’aggiornamento di quella cache. Non è necessario cancellare dati Safari, archivi o allenamenti. Nessuna verifica su iPhone fisico dichiarata.

## Verifiche

- 90 suite, **784 test automatici superati**, con casi nuovi su riuso, preferenze, sostituzioni atomiche, cancellazione attiva/storica e navigazione durante salvataggi lenti.
- **10 scenari browser nuovi superati**: scelta settimanale, default persistente, riscaldamenti, giorni selezionati nelle otto settimane, pulsante a 320/390 px, cancellazione di singole serie, sostituzione globale, storico invariato e icone con richieste di rete bloccate dall’accesso privato.
- **11 scenari browser di regressione superati**: Home e percentuale settimanale, testi personalizzati, bozze, pubblicazione e ripristino nel Design Studio, navigazione mobile/desktop e archivio personale invariato.
- Worker effettivamente confezionato verificato in SQLite/R2 isolati: login, accesso Super Admin, backup della nuova preferenza, rifiuto delle scritture malformate e icone incorporate.
- Build di produzione, sintassi Worker, hash offline, identità PWA e verifica del manifest riusciti.

Runner browser: `tests/runtime/training-upgrades-browser.mjs`. Runner Worker: `tests/runtime/packaged-training-upgrades.mjs`. Log e schermate in `docs/qa/training-upgrades/`. Tutte le prove usano dati sintetici e fixture locali, senza scritture sugli allenamenti di produzione.

Ripristino del solo codice: versione 72; gli archivi non richiedono migrazioni inverse.
