# GymTrack senza backend

`dist/gymtrack/browser` è una build statica completa. Non richiede database remoto, endpoint AI a pagamento o server applicativo per allenamenti e alimentazione.

- Pubblicare i file nella radice di un hosting statico HTTPS (o usare `npm run preview` su localhost per sviluppo). Non aprire `index.html` con file://: Safari non installa service worker da file locali.
- Aprire “Usa GymTrack senza account”. I dati rimangono in Dexie su questo browser/dispositivo e non si mescolano con l’archivio dell’account condiviso.
- Attendere il precache e installare dalla condivisione di Safari. Il primo caricamento necessita internet.
- Le funzioni personali funzionano offline dopo l’installazione delle risorse. Video YouTube, login e catalogo condivisi richiedono servizi online facoltativi.
- L’AI è facoltativa: il primo download dei pesi gratuiti richiede internet; dopo il salvataggio in IndexedDB il calcolo è locale. Se il browser non lo consente, usare il modulo manuale.
- Esportare regolarmente un JSON in File. Importarlo nella PWA se Safari usa un archivio distinto. Riferimento: IPHONE_QA.md.

La versione ospitata su Sites conserva le impostazioni private esistenti. Questa cartella statica è utilizzabile anche indipendentemente da Sites e dagli account online.
