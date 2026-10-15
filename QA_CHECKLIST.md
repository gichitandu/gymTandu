# Verifiche manuali prima dell'uso sul telefono

Queste prove richiedono un browser/dispositivo reale e non sono state eseguite nell'ambiente di sviluppo qui disponibile. Le build e i test automatici sono documentati in DEVELOPMENT_PLAN.md.

- [ ] Servire la build di produzione via HTTPS o `npm run preview` su localhost.
- [ ] Su schermo 360 × 800, verificare Home, navigazione inferiore e campi delle serie senza sovrapposizioni. La colonna RPE è nelle note espandibili sugli schermi stretti.
- [ ] Creare un piano con due giorni e tre esercizi, riordinarli e duplicare un giorno. Attivare il piano e avviare una sessione.
- [ ] Modificare pesi, ripetizioni e RPE, completare serie, aggiungerne e rimuoverne una, provare il timer.
- [ ] Attendere “Salvato sul dispositivo”, chiudere il browser, riaprire e riprendere la sessione.
- [ ] Concludere, visualizzare lo storico e modificarlo. Verificare l'aggiornamento di grafici e record.
- [ ] Esportare un JSON, controllare che il download sia presente. Importarlo, annullare una prima volta e confermare una seconda volta.
- [ ] Verificare la presenza di `ngsw-worker.js` in DevTools → Application e che il precache sia completo; ricaricare, attivare modalità offline e riaprire tutte le pagine (anche quelle mai visitate).
- [ ] Registrare e concludere una sessione offline; ripetere il backup offline.
- [ ] Installare da Chromium Android; verificare avvio standalone, icone e persistenza. Provare separatamente Safari iOS → schermata Home.
- [ ] Provare kg/lb, tema chiaro/scuro, immagini WebP/PNG/JPEG e rifiuto file sopra 2 MB.
- [ ] Verificare tastiera, focus visibile, etichette dei campi e lettura dei messaggi di errore.
- [ ] Mantenere una copia di backup prima di cambiare dominio/browser o cancellare i dati del sito.
