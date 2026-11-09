---
description: Lavora sulle task aperte di una pagina leggendo solo il suo file di task e il suo componente
argument-hint: <pagina> [id task, es. T3]
---

Pagina richiesta: $ARGUMENTS

1. Leggi `docs/tasks/<pagina>.md` (il primo argomento è il nome del file, es. `home`, `sessione`).
   Se non esiste, crealo da `docs/tasks/TEMPLATE.md` compilando componente e rotta dalla mappa in
   `CLAUDE.md`, poi chiedi all'utente quali task inserire e fermati.
2. Se è indicato un id (es. `T3`) lavora solo su quella voce; altrimenti prendi la prima con stato `da fare`.
3. Leggi solo il componente della pagina (vedi mappa in `CLAUDE.md`) e, se servono, i servizi che importa
   e il test corrispondente in `tests/`. Per cercare dove è usato un simbolo nel resto del progetto
   delega all'agente `esplora` invece di aprire molti file.
4. Apri lo screenshot della voce solo se il testo non basta a capire il problema.
5. Se la modifica tocca più di 3 file o Store/schema/Worker/PWA, proponi prima un piano di 5-8 righe e attendi OK.
6. Implementa, poi esegui le verifiche come in `/verifica`.
7. Aggiorna la voce nel file di task: stato `fatto`, spostata in "Fatto" con data ed esito in una riga.
8. Rispondi in italiano con: file cambiati, controlli eseguiti, limiti rimasti. Nessun riepilogo dei passaggi.
   Non fare commit o push se non richiesto.
