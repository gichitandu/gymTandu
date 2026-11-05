# GymTrack — Fase successiva delle illustrazioni (in attesa della pubblicazione attuale)

Istruzione esplicita del proprietario del 5 novembre 2026: **una volta confermata l'effettiva pubblicazione della build con le prime dieci immagini, preparare immagini specifiche per TUTTI gli altri esercizi e rilasciare un successivo aggiornamento dell'app**.

## Vincolo di avvio

**NON iniziare la fase di sostituzione/rilascio finché non è verificato, nella vera app ospitata, il deploy del commit `adfc6551d74764a52f83eaab6ad9cd2b4a070948`**. Il solo merge su GitHub, il successo della CI o il pacchetto di deploy non sono prove della pubblicazione. La verifica può essere eseguita sul sito realmente pubblicato o confermata dall'utente con evidenza dell'hosting.

## Ambito e conteggi

Catalogo predefinito verificato sul branch principale `chore/github-publication-v74`, 5 novembre 2026: **253 esercizi**. Sono già mappate **10** immagini specifiche nel servizio `src/app/services/exercise-visual.ts`; i restanti esercizi del catalogo attuale sono **243**. Ripetere l'inventario al momento della lavorazione, perché l'insieme potrebbe essere cambiato. Includere ogni variante con il proprio ID e confrontare nome, attrezzo, angolo, presa, unilateralità e configurazione reale (macchine, cavi, manubri, bilancieri ecc.).

## Metodo obbligatorio

1. Partire da asset **originali reali** in `public/training/figures/` e dalle schermate vere di GymTrack, NON da un layout immaginario.
2. Generare immagini individuali nello stile attuale (manichino anatomico metallizzato, muscoli lavorati viola, attrezzi reali, sfondo blu notte, illuminazione ciano), senza creare figure biomeccanicamente ambigue.
3. Revisionare variante per variante: biomeccanica, dettagli dell'attrezzo, prese, inclinazioni, muscoli coinvolti. Evitare immagini inappropriate e la stessa figura assegnata a varianti diverse.
4. Conservare tutti gli asset originali e introdurre nuove immagini versionate, con un mapping rigoroso per `id`, nome, attrezzo e controlli automatici che garantiscano copertura e fallback. Non modificare logo, Home o indicatore settimanale.
5. Lavorare su branch isolato, costruire screenshot/test sull'app vera in QA con SuperAdmin sintetico. **Non allineare indiscriminatamente il branch QA con produzione**: mantenere tutte le implementazioni e applicare soltanto le modifiche autorizzate, dopo diff.
6. Solo dopo revisione e CI positiva, preparare un aggiornamento separato per l'hosting **già esistente**, senza sostituire identità, D1, R2 o dati. La pubblicazione richiede capacità e autorizzazioni reali all'hosting: non dire che è stata eseguita senza prova verificabile.

## Tracciamento

- Rilascio attuale: commit `adfc6551d74764a52f83eaab6ad9cd2b4a070948` — **pubblicazione non verificata** alla registrazione di questa richiesta.
- Riferimenti: `QA_ENVIRONMENT.md`, `docs/qa/exercise-artwork-124.json` (prime tre regioni), `src/app/core/default-catalog.ts`, `src/app/services/exercise-visual.ts`.
- Prossima fase: inventario integrale dei 243 ancora senza immagine specifica, sviluppo verificato, nuovo release distinto.

Nessun codice, asset o account di produzione è alterato da questo documento.
