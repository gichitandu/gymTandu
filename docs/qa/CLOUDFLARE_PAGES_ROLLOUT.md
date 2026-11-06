# GymTrack — Cloudflare Pages + D1 (QA, NON PUBBLICARE)

## Scelta architetturale
- Repository GitHub privato. Cloudflare Pages ospiterà gli asset Angular/PWA.
- API preferibilmente sullo **stesso origin Pages**, tramite Pages Functions con D1 binding. Evita cookie di terze parti e CORS tra pages.dev e workers.dev, soprattutto su Safari/iPhone.
- D1 staging: `gymtrack-staging-db` (`f34b436f-fe40-481d-a08c-c4df9d24aff1`). Non usare il database produzione.
- Worker `gymtrack-calendar` esterno: non modificarlo né sovrascriverlo.

## Stato verificabile
- `.github/workflows/cloudflare-pages-build.yml`: crea artefatto frontend, non pubblica.
- `tools/package-worker.mjs`: produce `dist/server/index.js` (Sites) e `dist/server/api-only.js` (candidato API).
- Il candidato API restituisce **503** su ogni `/api/` fino al completamento della migrazione. Non è una release utilizzabile.
- `worker/standalone-auth.js`: primitive cookie, sessione D1, controllo origin e limitazione login. Non collegate alle rotte pubbliche.
- `tools/check-cloudflare-d1-staging.mjs`: gate bloccante intenzionale, finché rimangono identità Sites e archivio R2.
- I workflow GitHub QA possono fallire intenzionalmente per il gate; NON interpretarli come deploy riusciti.

## Bloccanti di rilascio
1. Integrare autenticazione standalone in tutte le rotte, con bootstrap SuperAdmin tramite segreto Cloudflare **mai nel codice**; verificare cambio password, logout, ruoli e rate limit con almeno 10 utenti.
2. Migrare `archiveApi` da R2 a D1 con storage a chunk, hash SHA-256, scritture atomiche/versioni/checkpoint e retention, rispettando limiti di dimensione e quote Free. Provare salvataggio, recupero, concorrenza, corruzione e restore.
3. Realizzare Pages Functions same-origin e binding D1. Adeguare il frontend e i percorsi assoluti della PWA, con verifica iPhone offline e conservazione IndexedDB.
4. Eseguire test automatici e browser reali su staging. Non cambiare il sito ChatGPT Sites corrente.
5. Solo dopo: aggiungere workflow di deploy con ambiente GitHub protetto, segreti `CLOUDFLARE_API_TOKEN` e variabile `CLOUDFLARE_ACCOUNT_ID` impostati dall'utente in GitHub, e approvazione esplicita per la produzione.

## Sicurezza
- Un precedente token Cloudflare è stato condiviso in chat: revocarlo prima di creare un nuovo token a privilegi minimi. Non copiarlo in repository, issue, log o chat.
- Non esporre mai gli header `oai-authenticated-*` come credenziali affidabili sulla rete pubblica.
- Non dichiarare funzionanti backup o login finché non esistono test di integrazione e deploy QA verificati.
- Obiettivo costo zero, senza carta, soggetto alle quote Free reali di Pages, Workers e D1. Il limite 50 MiB per backup e la retention storica richiedono una verifica di capienza prima di promettere supporto illimitato.
