---
description: Verifiche mirate sulle modifiche correnti, con esito compatto
argument-hint: [completa]
---

Modalità: $ARGUMENTS

- Se l'argomento è `completa`: esegui `npm run quality`.
- Altrimenti: esegui `npm run test:affected` e, se il diff (`git status --short`) tocca file `.ts` o
  template Angular, anche `npm run typecheck`. Se il diff tocca Store, schema (`db/`, `drizzle/`),
  `worker/`, `src/app/services/pwa.ts` o servizi condivisi, segnala che serve `/verifica completa`.

Non incollare l'output dei comandi. Rispondi in italiano con massimo 5 righe:
- comandi eseguiti ed esito (passati / falliti);
- per ogni fallimento: test o file, riga e causa in una frase;
- cosa resta da verificare a mano (browser, iPhone), se pertinente.
