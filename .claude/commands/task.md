---
description: Aggiunge una voce alla task list di una pagina partendo da una descrizione libera
argument-hint: <pagina> <descrizione libera del bug o della richiesta>
---

Input: $ARGUMENTS

Il primo argomento è la pagina (nome del file in `docs/tasks/`), il resto è la descrizione dell'utente.

1. Apri `docs/tasks/<pagina>.md`; se non esiste crealo da `docs/tasks/TEMPLATE.md` (componente e rotta
   dalla mappa in `CLAUDE.md`).
2. Aggiungi in "Da fare" una nuova voce con il primo id libero (T1, T2, …), compilando i campi del template
   a partire dalla descrizione: tipo, atteso, attuale, passi, note. Lascia vuoti i campi non deducibili,
   non inventarli. Se l'utente ha allegato un'immagine, salvala come `docs/tasks/img/<pagina>-<id>.png`.
3. Non leggere codice e non implementare nulla: questo comando registra soltanto.
4. Rispondi con una riga: id assegnato e titolo. Se manca un dato essenziale (es. come riprodurre un bug),
   fai una sola domanda.
