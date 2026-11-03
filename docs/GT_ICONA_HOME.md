# Icona GT sulla schermata Home

L’icona del nuovo collegamento usa il logo GT introdotto nella versione 70.

- Safari riceve riferimenti espliciti alle icone Apple PNG 180×180, con percorso assoluto.
- I percorsi standard `/apple-touch-icon.png`, `/apple-touch-icon-precomposed.png` e `/favicon.ico` restituiscono lo stesso nuovo marchio.
- Anche il precedente percorso SVG mostra il nuovo logo GT.
- Le icone sono comprese nel precache offline. Manifest, identità PWA, dati, login, navigazione e funzioni dell’app restano invariati.

Per aggiungere il collegamento su iPhone: aprire GymTrack aggiornata in Safari, quindi **Condividi → Aggiungi alla schermata Home**. L’immagine di un collegamento già creato può restare nella cache di iOS; l’app non forza la reinstallazione né modifica gli archivi locali.

Verifiche: build produzione, verifica manifest/precache e risposte del Worker confezionato per tutti i percorsi delle icone, con MIME, dimensioni PNG e contenuto GT. Nessuna prova su iPhone fisico dichiarata.
