# GymTrack — ambiente di prova ISOLATO

**Ambiente:** branch Git `qa/gymtrack-isolato`, separato dall'app pubblicata e dal branch `chore/github-publication-v74`.

**Fotografia iniziale:** commit `45b403705c2de368c781a2ca1ec52667c0a8b5da` (5 novembre 2026).
Questo SHA identifica SOLO il punto di partenza; le successive modifiche sul branch principale **non vengono incorporate automaticamente**.

## Regola UI obbligatoria: partire SEMPRE dall'app realmente esistente

**Istruzione esplicita del proprietario (5 novembre 2026).** Per ogni richiesta di miglioramenti, redesign, proposta visiva o foto/screenshot di GymTrack:

1. **Aprire la build reale del branch QA** con l'account sintetico SuperAdmin e catturare schermate autentiche dal browser prima di qualsiasi proposta. Guardare anche i sorgenti Angular e gli stili effettivamente presenti.
2. **Partire solo da quelle schermate** e proporre modifiche incrementali **sull'interfaccia esistente**, mantenendo componenti, dati, percorsi, pulsanti, comportamenti e tutte le funzionalità già implementate. Non ricreare una GymTrack immaginaria.
3. Se servono immagini che illustrino le modifiche, **annotare oppure modificare la schermata reale catturata**, dichiarando chiaramente che è una proposta e indicando le differenze dalla build attuale. Prima di mostrare come funziona oggi usare **lo screenshot originale, non un mockup**.
4. **Non generare da zero layout, schermate, collage o mockup ipotetici**, né chiamare generatori di immagini per sostituire screenshot reali, **salvo richiesta esplicita del proprietario di generare qualcosa da zero**.
5. Indicare sempre l'origine: «screenshot reale ambiente QA» con branch/commit, «proposta editata a partire dallo screenshot QA», oppure «app pubblicata» soltanto se effettivamente verificata. Non spacciare proposte per schermate distribuite.
6. Gli esperimenti e le modifiche UI restano **solo in QA**, senza sincronizzazione o pubblicazione nella versione reale finché il proprietario non ordina esplicitamente l'allineamento. Conservare e confrontare tutte le implementazioni prima di qualunque sincronizzazione.

Questa regola prevale su eventuali preferenze generiche di generare concept visuali. Gli screenshot di riferimento QA sono prodotti da `tests/runtime/qa-screenshots.mjs` e allegati al workflow `qa-visual.yml`.

## Asset visivi intoccabili senza autorizzazione esplicita

**Regola inderogabile del proprietario (5 novembre 2026):** il **logo originale dell'app GymTrack** e le **illustrazioni/omini (anche stilizzati o generati artificialmente) che rappresentano gli esercizi** non devono **mai** essere modificati, ridisegnati, rigenerati, ricolorati, sostituiti, reinterpretati o alterati nelle proposte UI, negli screenshot editati o nel codice **senza una richiesta esplicita e specifica del proprietario**. Non inventare varianti del logo né figure di esercizi durante la creazione di anteprime. Anche modifiche estetiche indirette a tali asset sono fuori ambito per impostazione predefinita. Nelle anteprime dell'interfaccia, mantenere gli elementi originali invariati e riconoscibili (o usare screenshot reali non modificati).

Gli altri miglioramenti UI devono essere incrementali, basati su screenshot reali di QA, e non alterare né gli asset protetti né le funzionalità esistenti. **Non allineare QA e produzione senza richiesta esplicita**, come specificato di seguito.

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
