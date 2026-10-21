# Matrice Safari iOS e PWA Home

Stato: **da eseguire su iPhone reale**. Il container di sviluppo non fornisce un dispositivo iOS né il browser previsto dalle istruzioni di Sites. I test Node/fake-indexeddb non certificano Safari.

## Preparazione

1. Prima dell’aggiornamento, esportare l’archivio esistente in File. Non cancellare i dati del sito.
2. Aprire la versione aggiornata online; attendere il precache. In Profilo → iPhone controllare Service worker attivo.
3. Eseguire “Test su questo dispositivo”. Il database di prova è separato dai dati personali e viene eliminato dopo la prova.
4. Se si usa l’account, abilitare esplicitamente l’archivio offline. In alternativa provare l’archivio separato senza account.
5. In Safari → Condividi → Aggiungi alla schermata Home. Se la PWA non mostra i dati di Safari, importare il JSON da File. Ripetere i test nella PWA.

| Prova | Safari verticale | Safari orizzontale | PWA Home | Esito atteso |
|---|---|---|---|---|
| iPhone con Dynamic Island/notch | Da provare | Da provare | Da provare | Titoli, pulsanti e modali fuori dalle zone occupate |
| Home indicator e barra inferiore | Da provare | Da provare | Da provare | 5 destinazioni, target almeno 44px, niente sotto l’indicatore |
| Tastiera su pesi, grammi, note e login | Da provare | Da provare | Da provare | Campo raggiungibile, nessuno zoom forzato, nav nascosta durante tastiera |
| Fotocamera | Da provare | Da provare | Da provare | Foto JPEG compressa ≤1280px e ≤500KB; nessun upload per i pasti |
| Galleria, JPEG/PNG/HEIC | Da provare | Da provare | Da provare | Formato compatibile compresso; fallback esplicito se HEIC illeggibile |
| Annullamento/negazione accesso foto | Da provare | Da provare | Da provare | Modulo manuale sempre utilizzabile |
| Foto molto grande / 48MP | Da provare | Da provare | Da provare | Richiesta immagine ridotta, nessun dato preesistente perso |
| File JSON v1/v2 | Da provare | Da provare | Da provare | Download/condivisione su File e selezione JSON da File; anteprima e conferma |
| Modalità aereo dopo precache | Da provare | Da provare | Da provare | Riapertura archivio locale, piano, serie, timer, storico, grafici e pasti funzionanti |
| Chiusura completa e riapertura offline | Da provare | Da provare | Da provare | Sessione draft, pasti/foto e tema presenti |
| Admin offline | Da provare | Da provare | Da provare | Nessuna modifica catalogo/utenti remoti; dati personali disponibili |
| Modello AI primo download | Da provare | Da provare | Da provare | Solo su richiesta; tempi reali CPU mostrati, nessuna foto inviata |
| AI dopo download in modalità aereo | Da provare | Da provare | Da provare | Pesi/runtime locali oppure chiaro fallback manuale, nessun valore auto-salvato |
| AI con WebGPU non disponibile | Da provare | Da provare | Da provare | CPU in Worker, nessuna dipendenza WebGPU |
| Interruzione, timeout e RAM limitata | Da provare | Da provare | Da provare | Worker terminato e modulo manuale funzionante |
| Rimuovi modello | Da provare | Da provare | Da provare | Soltanto modello eliminato, allenamenti e pasti conservati |
| Quota IndexedDB esaurita | Da provare | Da provare | Da provare | Messaggio leggibile e rollback senza perdita dei dati precedenti |
| Aggiornamento PWA durante una sessione | Da provare | Da provare | Da provare | Aggiornamento solo su azione esplicita, dopo salvataggio |

Annotare modello iPhone, versione iOS, Safari/PWA, tempi CPU, output del test locale e problemi. Non trasformare le righe “Da provare” in “Superato” senza prova reale.

## Riscontri eseguiti in sviluppo

- 37 test automatici di dominio, permessi, backup, migrazione e percorso locale.
- Inferenza reale MobileNet v1 0.25 su CPU Node (non Safari): output 1000 classi valido. Il tempo di Node non rappresenta quello di un iPhone.
- Build strict Angular, produzione e controllo del service worker/manifest passati; runtime AI incluso come risorsa facoltativa.

## Riferimenti primari

- [Apple: configurazione web app](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [WebKit: policy di archiviazione](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit: Safari 17.2 e differenze degli archivi Home](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- [TensorFlow.js: salvataggio modelli in IndexedDB](https://www.tensorflow.org/js/guide/save_load)
