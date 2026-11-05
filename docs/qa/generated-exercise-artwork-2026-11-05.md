# Immagini specifiche per esercizi (pacchetto verificato)

Richiesta del proprietario: aggiornare le illustrazioni nel catalogo della app **senza perdere funzionalità, senza sostituire gli originali a livello file e senza sincronizzare indiscriminatamente QA/produzione**.

## Nuove immagini: 10 WebP, ~98 kB complessivi

Le immagini sono in `public/training/figures/generated/`. Sono derivate dalle dieci immagini generate e approvate in conversazione. Gli originali `public/training/figures/*-v2.png`, `atlas-*-v3.png`, `public/training/motion/*` e il logo **NON** sono stati modificati.

| Esercizio | Nuovo asset |
| --- | --- |
| Panca piana bilanciere | bench-flat-barbell.webp |
| Panca inclinata manubri 30° | bench-incline-dumbbells-30.webp |
| Panca declinata bilanciere | bench-decline-barbell.webp |
| Croci ai cavi | cable-fly.webp |
| Lat machine presa prona larga | lat-wide-pronated.webp |
| Pulley presa neutra stretta | seated-row-neutral-narrow.webp |
| T-bar row | tbar-row-supported.webp |
| Shoulder press manubri | shoulder-press-dumbbells.webp |
| Alzate laterali manubri | lateral-raise-dumbbells.webp |
| Reverse fly alla macchina | reverse-machine-fly.webp |

L'associazione è vincolata a `id + nome + attrezzo`, per evitare che un esercizio rinominato o una variante diversa mostri una figura fuorviante.

## Verifica / limiti

I test controllano presenza e firma WebP di tutti e dieci i file, associazioni esatte, e fallback delle restanti **243** voci del catalogo. Build/QA browser e pipeline devono passare prima di integrarlo. Non si afferma che siano state prodotte immagini diverse per tutti i 124 esercizi delle tre categorie.

Nota: l'illustrazione T-bar generata include supporto al petto. L'esercizio catalogato è generico «T-bar row»; se l'attrezzo dell'utente fosse diverso è preferibile una futura illustrazione dedicata alla variante specifica.

**Nessun deploy è compreso in questo branch; la pubblicazione effettiva del progetto su hosting D1/R2/Worker richiede il processo di deploy della piattaforma, non basta il merge GitHub.**
