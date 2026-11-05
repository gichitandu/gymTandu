# GymTrack — ambiente di prova ISOLATO

**Ambiente:** branch Git `qa/gymtrack-isolato`, separato dall'app pubblicata e dal branch `chore/github-publication-v74`.

**Fotografia iniziale:** commit `45b403705c2de368c781a2ca1ec52667c0a8b5da` (5 novembre 2026).
Questo SHA identifica SOLO il punto di partenza; le successive modifiche sul branch principale **non vengono incorporate automaticamente**.

## Regola vincolante richiesta dal proprietario

**Non allineare, rebasare, sincronizzare, sovrascrivere o integrare l'ambiente di prova con l'app effettiva (in nessuna direzione) fino a una richiesta esplicita del proprietario.** Questo include merge da/verso il branch principale, deploy in produzione e sostituzione di dati, account, backup o screenshot.

Quando viene richiesto un allineamento:
1. verificare il diff e l'elenco delle implementazioni presenti solo in QA e solo in produzione;
2. salvaguardare tutte le modifiche e i dati esclusivi di entrambi gli ambienti;
3. eseguire test di compatibilità e regressione;
4. applicare soltanto la direzione autorizzata, senza fast-forward/force-push che scartino funzionalità.

Non collegare il database QA, un account QA o il browser QA al dominio o alle API di produzione.

## Cos'è stato predisposto

- **Frontend reale:** si compila Angular esattamente dal branch QA e lo si apre in Chromium headless con viewport iPhone da 390×844 e desktop.
- **Backend QA:** `tests/runtime/design-studio-qa-server.mjs` simula, **solo su 127.0.0.1:4173**, l'identità fidata dell'hosting; usa SQLite `':memory:'` e R2 sostituito da una `Map` in memoria.
- **Utente SuperAdmin QA:** il runner crea al suo avvio un account test con ruolo verificato `SuperAdmin` nella sola memoria del server QA, lo identifica nell'interfaccia come **AI SuperAdmin QA** e apre una sessione browser temporanea. Per rispettare il bootstrap riservato al proprietario nel Worker, il fixture usa internamente l'identificatore proprietario previsto dal codice, ma **non usa password, cookie o database reali**. Password sintetica valida soltanto per il processo QA; mai riutilizzarla nell'app pubblicata.
- **Dati:** profilo, sedute e carichi di prova. Nessun backup reale, nessuna migrazione remota.
- **Foto attendibili:** `tests/runtime/qa-screenshots.mjs` cattura gli screenshot *dal DOM Angular effettivamente eseguito*, segnala ruolo e selettori verificati; non genera illustrazioni.
- **Archivio temporaneo:** il workflow GitHub Actions `qa-visual.yml` allega PNG e risultato JSON al run; il processo perde l'account/DB alla chiusura, quindi **non è un sito QA online permanente**.

## Verifica

Nel branch QA, la workflow "GymTrack QA visuale isolata" parte solo per i push sullo stesso branch (o tramite comando/manuale). Non contiene nessun job deploy, non legge credenziali di produzione, non esegue migrazioni remote.

Per eseguire in locale (Node 24+ e browser Playwright):

```sh
npm ci
npm run build
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install chromium
node tests/runtime/design-studio-qa-server.mjs    # terminale A, loopback
node tests/runtime/qa-screenshots.mjs              # terminale B
```

Le immagini prodotte sono foto del **branch QA** e non attestano che la stessa versione sia stata distribuita su iPhone. Non vanno presentate come screenshot dell'app pubblicata.

**Nota:** se si desidera una pagina QA *persistente e accessibile da Internet*, serve configurare un hosting di staging completamente separato con una propria identità e propri D1/R2; la fixture non deve essere resa pubblica perché simula l'identità di hosting sul loopback.
