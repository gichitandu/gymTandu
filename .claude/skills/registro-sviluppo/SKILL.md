---
name: registro-sviluppo
description: Legge e aggiorna il Registro sviluppo di GymTrack (errori registrati in automatico dall'app, bug, migliorie, idee) e chiude le correzioni confermate dalla nuova versione. Usala all'inizio di ogni lavoro sull'app, quando l'utente chiede cosa c'è da correggere o migliorare, quando dice di aver pubblicato/aggiornato l'app, quando chiede di verificare le correzioni, e prima di chiudere un task che corregge una voce GT-n.
---

# Registro sviluppo

Il registro è la memoria condivisa delle correzioni: ogni voce `GT-n` ha stato, priorità,
ultimi casi dell'errore e cronologia (chi ha fatto cosa, con quale commit e quali test).
Dettagli tecnici e regole: `docs/REGISTRO_SVILUPPO.md`.

Tutti i comandi passano da `npm run devlog -- <comando>` (script `tools/dev-log.mjs`).
Richiedono `DEVLOG_URL`; il token arriva da `DEVLOG_TOKEN` o dalla credenziale dell'ambiente.

## 1. Prima di lavorare

1. `npm run devlog -- pull` → salva `.cache/dev-log.md` (ignorato da git) e stampa le voci aperte.
2. Leggi `.cache/dev-log.md`, compresa la sezione **Risolti**: lì c'è ciò che è già stato fatto.
3. Per una voce con **REGRESSIONE** leggi la correzione precedente nella cronologia: non riproporre
   la stessa soluzione, capisci perché non è bastata.
4. Se il registro non è raggiungibile (variabile mancante, host bloccato, 403/503) dillo
   all'utente con il messaggio esatto e continua il task senza registro. Non inventare voci.
   Nelle sessioni cloud: per l'host bloccato o il token mancante segui la documentazione
   dell'ambiente (credenziale con il modulo sicuro, mai il token in chat).

## 2. Mentre correggi

- `npm run devlog -- start GT-n` quando inizi una voce.
- Lavora secondo `AGENTS.md` (diff limitato, test pertinenti, `npm run typecheck`).
- Se trovi un problema nuovo non legato al task: `npm run devlog -- add --kind bug --title "…" --details "…" [--route /pagina]`
  invece di correggerlo di nascosto.
- Nel messaggio di commit cita la voce: `… (GT-n)`.

## 3. Quando la correzione è fatta

Solo dopo test reali e commit:

```sh
npm run devlog -- fixed GT-n --summary "cosa è cambiato e perché" --commit HEAD --tests "test eseguiti, con esito"
```

La voce diventa **Da verificare**. Non dichiararla risolta: la conferma arriva dall'uso della
nuova versione pubblicata.

## 4. Dopo un aggiornamento dell'app (verifica e chiusura)

Quando l'utente dice di aver pubblicato una nuova versione, o chiede di verificare:

1. `npm run devlog -- verify` → per ogni voce *da verificare* mostra se è **PRONTA** e perché.
   La regola è calcolata dal Worker: build pubblicata dopo la correzione aperta almeno 2 volte,
   pagina interessata visitata almeno 2 volte, nessuna ricaduta.
2. Per le voci pronte controlla che il commit della correzione sia davvero nel codice
   pubblicato (`git branch -r --contains <commit>` sul branch distribuito; se non sai quale
   branch viene distribuito, chiedilo all'utente).
3. Se entrambe le condizioni valgono: `npm run devlog -- verify --apply`. Il Worker chiude le
   voci confermate e salva la prova nella cronologia.
4. Riporta all'utente: voci chiuse (con la prova), voci ancora in attesa (con cosa manca, per
   esempio «apri la pagina /progressi un paio di volte»), regressioni comparse.

Non forzare mai la chiusura di una voce che il Worker non conferma, e non scartare voci:
scartare spetta solo all'utente dalla pagina Registro.

## 5. Riepilogo finale del task

Nel resoconto all'utente elenca le voci toccate (`GT-n` → nuovo stato) separando:
test sintetici eseguiti, verifica del registro dopo il deploy, prova sul dispositivo (se fatta
dall'utente).
