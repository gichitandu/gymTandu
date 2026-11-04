# Preparazione della pubblicazione GitHub privata

Destinazione richiesta: `https://github.com/gichitandu/gymTandu.git`.

L’utente ha autorizzato esplicitamente i commit e il push sul branch dedicato dopo aver esaminato il piano. Questo rapporto documenta i controlli e la procedura autorizzata; gli SHA finali dei commit e dei riferimenti remoti vengono verificati durante la pubblicazione.

## Versione e integrità

- Versione pubblicata dell’app: **74**, verificata tramite Sites.
- Sorgente pubblicato e HEAD locale: `5738928e1c5e44761105fa26398eb6cf3af57763`.
- Il fetch del repository di origine ha confermato lo stesso SHA su `origin/main`.
- La versione dell’app comprende 76 commit. Il repository non è shallow e non contiene submodule o puntatori Git LFS.
- `git fsck --full --no-reflogs` non ha segnalato corruzione. È stato individuato anche un precedente commit senza branch, `bc79b90e3abbfa23d2d81605a9fd23cec06f9249`, ora protetto dal nuovo branch locale `archive/pre-github-unreferenced-bc79b90`. Il totale delle revisioni preservate è 77.
- Gli otto branch locali originali mantengono i loro SHA. Il branch locale `main` è una versione precedente; la pubblicazione proposta usa il branch aggiornato dedicato.

Il remote `origin` rimane associato al repository Sites già usato dall’app. È stato aggiunto il remote locale `github` con l’URL richiesto. Il branch di preparazione è `chore/github-publication-v74`.

## Copie di sicurezza locali

Sono conservate fuori dalla directory del progetto, quindi non entrano nel push:

| Copia | Percorso | SHA-256 |
| --- | --- | --- |
| Directory Git completa, con oggetti non referenziati e metadati locali | `/workspace/gymtrack-before-github-2026-11-04.git.tar.gz` | `ba7dc08a85e7d39e304019217de0bbde9f9806ebf935ea2a6498741a94db235e` |
| Bundle Git autonomo con tutti i riferimenti e la storia completa | `/workspace/gymtrack-v74-full-history-2026-11-04.bundle` | `e49d192ae5d4be2df827ade8fea2daef42480e03543d563f8e5b242c90fadbc4` |

Il bundle è stato verificato con `git bundle verify`. La copia completa della directory Git è stata estratta in una directory temporanea e verificata con `git fsck`; contiene HEAD, gli otto branch originali e gli oggetti precedentemente non referenziati. Queste copie precedono i commit proposti e non includono ancora le modifiche locali di preparazione.

## Controlli su segreti e dati

È stato usato **Gitleaks v8.30.1**, scaricato dal repository ufficiale e verificato contro il checksum della release, con risultati redatti al 100%.

| Controllo | Esito |
| --- | --- |
| File versionati della versione attuale | Nessun segreto rilevato |
| Storia Git, incluso il commit recuperato: 77 commit | Nessun segreto rilevato |
| Analisi dei blob raggiungibili: 1.455 oggetti | Nessun archivio personale JSON completo, database SQLite binario o file di credenziali con nome convenzionale trovato |
| File superiori al limite GitHub di 100 MiB | Nessuno; il più grande è il modello locale `public/vendor/food-model/weights.bin`, circa 1,9 MB |

La scansione automatica non equivale a una garanzia assoluta di assenza di dati riservati. Il progetto contiene ancora riferimenti all’email del proprietario, identificativi di account/progetto e metadati degli autori Git. Sono configurazione e storia esistenti, non password o token rilevati. Compaiono, fra gli altri, in `worker/index.js`, `AUTHENTICATION.md`, configurazione del relay e fixture di test. Non sono stati anonimizzati o rimossi dalla cronologia; l’approvazione della pubblicazione deve tenere conto della loro presenza nel repository privato.

I dati degli allenamenti reali restano negli archivi dell’app: IndexedDB, D1 e R2. La pubblicazione dei sorgenti non trasferisce quei database e non richiede di esportarli nel repository. Template Excel, dati sintetici dei test e schermate QA documentate sono conservati con il progetto.

## Modifiche `.gitignore` predisposte

Le nuove regole escludono file ambiente reali, chiavi private, directory di credenziali, stato locale Wrangler, database locali, esportazioni personali, bundle, archivi di deploy e file temporanei. I template `.env.example` e `.dev.vars.example`, anche con suffisso di ambiente, rimangono pubblicabili.

Verifica eseguita su 32 percorsi privati/temporanei e 18 percorsi essenziali. Nessuno dei 599 file già versionati è stato escluso da una nuova regola. Rimangono inclusi codice, lockfile, configurazioni, workflow, backend Worker, schema, tutte le migrazioni, asset, modello AI, licenze e fixture Excel. I nove log QA già versionati continuano a essere tracciati, pur corrispondendo alla precedente regola `*.log`; `.gitignore` non rimuove file già presenti nella storia.

L’enumerazione dei file non generati non ha trovato altro codice locale non tracciato o nascosto dalle esclusioni prima della creazione di questo rapporto.

## Accesso GitHub verificato

Il primo controllo aveva restituito 404 tramite API e 403 tramite Git. Dopo l’aggiornamento delle autorizzazioni, il connettore riconosce `gichitandu/gymTandu` come repository **privato**, con permessi di lettura, scrittura e amministrazione. La lettura Git dei riferimenti è riuscita.

Prima della pubblicazione il repository risulta vuoto: nessun branch o tag remoto e dimensione dichiarata zero. La configurazione indica `main` come nome predefinito, ma quel riferimento non è ancora presente. La pubblicazione prevista crea riferimenti nuovi.

## Commit autorizzati

1. `chore: protect local secrets, backups and generated files` — solo `.gitignore`.
2. `docs: document private GitHub publication and history preservation` — questo rapporto.

I due commit vengono aggiunti sul branch `chore/github-publication-v74`, discendente diretto della versione 74. Gli SHA precedenti rimangono invariati. Il codice applicativo, la configurazione dell’hosting attuale e i dati dell’app non vengono modificati da questi commit.

## Procedura di pubblicazione autorizzata

1. Leggere nuovamente repository e riferimenti GitHub; confermare la visibilità privata.
2. Pubblicare il nuovo branch `chore/github-publication-v74` con tutti i suoi antenati. Se il nome esiste già, fermarsi e proporre un nome libero.
3. Preservare anche i riferimenti storici come nuovi branch di archivio, dopo aver controllato che ogni destinazione sia libera:

| Branch locale originale | Destinazione GitHub proposta |
| --- | --- |
| `main` | `archive/sites/main` |
| `feat/approved-palettes` | `archive/sites/feat/approved-palettes` |
| `feat/gt-design-studio` | `archive/sites/feat/gt-design-studio` |
| `feat/gt-logo-editable-labels-weekly-goal` | `archive/sites/feat/gt-logo-editable-labels-weekly-goal` |
| `feat/reference-home-welcome` | `archive/sites/feat/reference-home-welcome` |
| `feat/training-series-weekly-reuse-and-replacements` | `archive/sites/feat/training-series-weekly-reuse-and-replacements` |
| `fix/gt-home-screen-icons` | `archive/sites/fix/gt-home-screen-icons` |
| `fix/durable-workout-checkpoints-and-recovery` | `archive/sites/fix/durable-workout-checkpoints-and-recovery` |
| Commit recuperato senza branch originale | `archive/pre-github-unreferenced-bc79b90` |

4. Verificare dopo il push gli SHA remoti, i file della versione corrente e la raggiungibilità dei 77 commit originari. Qualsiasi contenuto remoto già presente resta conservato; un’eventuale integrazione con il branch principale remoto richiede un piano successivo basato sulla sua storia effettiva.

La procedura usa push ordinari verso riferimenti nuovi. Non usa `--force`, non riscrive la storia e non cancella branch. Il workflow esistente `.github/workflows/pages.yml` pubblica su GitHub Pages in caso di push su `main`: il branch dedicato evita quel trigger. Nessun deploy su Pages o cambio dell’indirizzo dell’app è previsto da questa pubblicazione del codice.
