// Definizione dei video tecnici GT: posa 3D, testi italiani e sottotitoli.
// ID, nome e attrezzo devono coincidere con src/app/core/default-catalog.ts
// (e con src/app/services/technique-videos.ts, che applica la stessa protezione).
const cam = (target, distance, height) => ({ target, distance, height });
const THREE_Q = { yaw: .9, label: 'VISTA A TRE QUARTI' };
const SIDE = { yaw: 1.5, label: 'VISTA LATERALE' };
const FRONT = { yaw: .06, label: 'VISTA FRONTALE' };
const BENCH_CAM = cam([0, .68, .1], 3.5, 1.2);
const INCLINE_CAM = cam([0, .85, .05], 3.7, .75);
const MACHINE_CAM = cam([0, .85, .1], 4.0, .45);

export const SPECS = [
  {
    id: 'exercise-3', name: 'Chest press', equipment: 'Macchina',
    kind: 'press', back: 82, implement: 'machine', camera: MACHINE_CAM, views: [THREE_Q, SIDE],
    labels: ['RITORNO CONTROLLATO', 'SPINTA CONTROLLATA'],
    prep: ['Regola la macchina', 'Imposta il sedile con le maniglie all’altezza del petto. Schiena appoggiata, piedi stabili, scapole indietro e basse.'],
    exec: ['Spingi in modo fluido', ['Spingi le maniglie in avanti tenendo i polsi sopra gli avambracci.', 'Estendi le braccia senza scattare in blocco sui gomiti.', 'Torna lentamente fino a sentire il petto in allungamento.']],
    err: ['Mantieni il controllo', ['Staccare la schiena dallo schienale.', 'Alzare le spalle verso le orecchie.', 'Lasciar cadere il carico nel ritorno.']],
    breath: ['Respira con ritmo', 'Espira durante la spinta e inspira nel ritorno, senza perdere l’appoggio sul sedile.'],
    vtt: [['Sedile regolato, schiena appoggiata.', 'Scapole indietro e piedi stabili.'], ['Spingi senza bloccare i gomiti.', 'Torna lentamente, senza rimbalzi.'], ['Non staccare la schiena.', 'Non alzare le spalle.'], ['Espira nella spinta.', 'Inspira nel ritorno.']],
  },
  {
    id: 'variant-incline-chest-machine', name: 'Chest press inclinata alla macchina', equipment: 'Macchina',
    kind: 'press', back: 52, implement: 'machine', camera: MACHINE_CAM, views: [THREE_Q, SIDE],
    labels: ['RITORNO CONTROLLATO', 'SPINTA CONTROLLATA'],
    prep: ['Regola la macchina', 'Sedile regolato in modo che le maniglie partano all’altezza della parte alta del petto. Schiena ben appoggiata.'],
    exec: ['Spingi verso l’alto e in avanti', ['Spingi le maniglie lungo la traiettoria obliqua della macchina.', 'Mantieni le spalle basse e stabili sullo schienale.', 'Ritorna con controllo, senza far toccare i pesi.']],
    err: ['Mantieni il controllo', ['Sollevare le spalle verso le orecchie.', 'Inarcare la zona lombare.', 'Distendere i gomiti con scatto.']],
    breath: ['Respira con ritmo', 'Espira durante la spinta e inspira nel ritorno mantenendo il busto stabile.'],
    vtt: [['Maniglie all’altezza dell’alto petto.', 'Schiena appoggiata e spalle basse.'], ['Spingi lungo la traiettoria della macchina.', 'Ritorna lentamente e con controllo.'], ['Non alzare le spalle.', 'Non inarcare la schiena.'], ['Espira nella spinta.', 'Inspira nel ritorno.']],
  },
  {
    id: 'library-dumbbells_dumbbell_bench_press', name: 'Panca piana con manubri (0°)', equipment: 'Manubri',
    kind: 'press', back: 0, implement: 'dumbbell', camera: BENCH_CAM, views: [THREE_Q, SIDE],
    labels: ['DISCESA CONTROLLATA', 'SPINTA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Testa, dorso e glutei sulla panca, piedi appoggiati, scapole indietro. Parti con i manubri sopra il petto.'],
    exec: ['Segui un ritmo controllato', ['Abbassa i manubri ai lati del petto, con gomiti non completamente aperti.', 'Mantieni i polsi sopra i gomiti per tutta la corsa.', 'Spingi verso l’alto riavvicinando i manubri sopra il petto.']],
    err: ['Mantieni il controllo', ['Scendere oltre quanto le spalle tollerano.', 'Far sbattere i manubri tra loro in alto.', 'Sollevare i glutei dalla panca.']],
    breath: ['Respira senza perdere stabilità', 'Inspira nella discesa ed espira nella spinta mantenendo il tronco stabile.'],
    vtt: [['Testa, dorso e glutei sulla panca.', 'Piedi stabili e scapole indietro.'], ['Scendi ai lati del petto senza rimbalzi.', 'Spingi tenendo i polsi sopra i gomiti.'], ['Non sollevare i glutei.', 'Non far sbattere i manubri.'], ['Inspira nella discesa.', 'Espira nella spinta.']],
  },
  {
    id: 'variant-db-bench-45', name: 'Panca inclinata con manubri a 45°', equipment: 'Manubri',
    kind: 'press', back: 45, implement: 'dumbbell', camera: INCLINE_CAM, views: [THREE_Q, SIDE],
    labels: ['DISCESA CONTROLLATA', 'SPINTA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Schienale a 45°, glutei in fondo alla seduta, piedi a terra e scapole indietro. Manubri sopra la parte alta del petto.'],
    exec: ['Segui un ritmo controllato', ['Abbassa i manubri ai lati della parte alta del petto.', 'Spingi verso l’alto mantenendo i polsi sopra i gomiti.', 'Non cercare una profondità che porti le spalle in avanti.']],
    err: ['Mantieni il controllo', ['Alzare le spalle verso le orecchie.', 'Scivolare in avanti sulla panca.', 'Aprire troppo i gomiti in discesa.']],
    breath: ['Respira senza perdere stabilità', 'Inspira nella discesa ed espira nella spinta mantenendo il busto appoggiato.'],
    vtt: [['Schienale a 45°, glutei in fondo.', 'Piedi stabili e scapole indietro.'], ['Scendi ai lati dell’alto petto.', 'Spingi con i polsi sopra i gomiti.'], ['Non alzare le spalle.', 'Non scivolare in avanti.'], ['Inspira nella discesa.', 'Espira nella spinta.']],
  },
  {
    id: 'library-barbell_incline_bench_press', name: 'Panca inclinata bilanciere', equipment: 'Bilanciere',
    kind: 'press', back: 40, implement: 'barbell', camera: INCLINE_CAM, views: [THREE_Q, SIDE],
    labels: ['DISCESA CONTROLLATA', 'SPINTA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Schiena e glutei sulla panca inclinata, piedi a terra, scapole indietro. Presa appena più larga delle spalle.'],
    exec: ['Segui un ritmo controllato', ['Abbassa il bilanciere verso la parte alta del petto.', 'Mantieni i polsi sopra gli avambracci e i gomiti non troppo aperti.', 'Spingi con controllo fino alla posizione iniziale.']],
    err: ['Mantieni il controllo', ['Rimbalzare il bilanciere sul petto.', 'Sollevare i glutei dalla panca.', 'Piegare molto i polsi all’indietro.']],
    breath: ['Respira senza perdere stabilità', 'Inspira nella discesa ed espira nella spinta con il tronco stabile.'],
    vtt: [['Schiena e glutei sulla panca.', 'Presa appena più larga delle spalle.'], ['Scendi verso l’alto petto senza rimbalzi.', 'Spingi con polsi sopra gli avambracci.'], ['Non sollevare i glutei.', 'Non piegare i polsi.'], ['Inspira nella discesa.', 'Espira nella spinta.']],
  },
  {
    id: 'exercise-2', name: 'Croci ai cavi', equipment: 'Cavi',
    kind: 'fly', camera: cam([0, 1.04, .1], 4.2, .33), views: [{ yaw: .5, label: 'VISTA A TRE QUARTI' }, FRONT],
    labels: ['CHIUSURA CONTROLLATA', 'APERTURA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Cavi all’altezza delle spalle, un piede avanti, busto leggermente inclinato e gomiti appena flessi.'],
    exec: ['Segui un ritmo controllato', ['Porta le mani davanti al petto con un arco ampio.', 'Mantieni i gomiti leggermente flessi e fissi nell’angolo.', 'Riapri lentamente, fino a sentire il petto in allungamento.']],
    err: ['Mantieni il controllo', ['Trasformare il movimento in una spinta.', 'Aprire oltre il comfort delle spalle.', 'Dondolare il busto per prendere slancio.']],
    breath: ['Respira con ritmo', 'Espira nella chiusura e inspira nell’apertura, con il busto fermo.'],
    vtt: [['Cavi all’altezza delle spalle.', 'Un piede avanti e gomiti appena flessi.'], ['Chiudi con un arco ampio.', 'Riapri lentamente, senza forzare.'], ['Non spingere con le braccia.', 'Non dondolare il busto.'], ['Espira nella chiusura.', 'Inspira nell’apertura.']],
  },
  {
    id: 'library-dumbbells_dumbbell_flyes', name: 'Croci manubri', equipment: 'Manubri',
    kind: 'dbfly', back: 0, implement: 'dumbbell', camera: BENCH_CAM, views: [{ yaw: .75, label: 'VISTA A TRE QUARTI' }, FRONT],
    labels: ['APERTURA CONTROLLATA', 'CHIUSURA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Sdraiato sulla panca, manubri sopra il petto con le palme una verso l’altra e gomiti appena flessi.'],
    exec: ['Segui un ritmo controllato', ['Apri le braccia in un arco ampio fino a sentire il petto allungarsi.', 'Mantieni l’angolo dei gomiti costante, senza trasformarlo in una spinta.', 'Richiudi riportando i manubri sopra il petto.']],
    err: ['Mantieni il controllo', ['Scendere oltre il comfort delle spalle.', 'Piegare e stendere i gomiti a ogni ripetizione.', 'Usare un carico troppo pesante.']],
    breath: ['Respira senza perdere stabilità', 'Inspira nell’apertura ed espira nella chiusura mantenendo il tronco appoggiato.'],
    vtt: [['Manubri sopra il petto.', 'Gomiti appena flessi.'], ['Apri in un arco ampio.', 'Richiudi sopra il petto.'], ['Non scendere troppo.', 'Non trasformarlo in una spinta.'], ['Inspira nell’apertura.', 'Espira nella chiusura.']],
  },
  {
    id: 'exercise-12', name: 'Leg press', equipment: 'Macchina',
    kind: 'legpress', camera: cam([0, .72, .22], 3.9, .5), views: [{ yaw: .9, label: 'VISTA A TRE QUARTI' }, SIDE],
    labels: ['FLESSIONE CONTROLLATA', 'SPINTA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Schiena e bacino appoggiati, piedi alla larghezza delle spalle a metà piattaforma, ginocchia in linea con i piedi.'],
    exec: ['Segui un ritmo controllato', ['Piega le ginocchia con controllo, senza staccare il bacino dal sedile.', 'Spingi sull’intero piede mantenendo le ginocchia in linea con le punte.', 'Estendi senza bloccare le ginocchia in iperestensione.']],
    err: ['Mantieni il controllo', ['Staccare il bacino dal sedile in basso.', 'Far collassare le ginocchia verso l’interno.', 'Bloccare le ginocchia in alto.']],
    breath: ['Respira con ritmo', 'Inspira nella discesa ed espira nella spinta, senza trattenere il fiato.'],
    vtt: [['Schiena e bacino appoggiati.', 'Piedi a metà piattaforma.'], ['Scendi senza staccare il bacino.', 'Spingi senza bloccare le ginocchia.'], ['Non far cedere le ginocchia all’interno.', 'Non bloccarle in alto.'], ['Inspira nella discesa.', 'Espira nella spinta.']],
  },
  {
    id: 'exercise-13', name: 'Leg extension', equipment: 'Macchina',
    kind: 'legext', camera: cam([0, .8, .25], 3.9, .45), views: [{ yaw: .9, label: 'VISTA A TRE QUARTI' }, SIDE],
    labels: ['ESTENSIONE CONTROLLATA', 'RITORNO CONTROLLATO'],
    prep: ['Regola la macchina', 'Schienale e rullo regolati: ginocchia in asse con la leva, rullo appoggiato sopra le caviglie, schiena appoggiata.'],
    exec: ['Segui un ritmo controllato', ['Estendi le gambe con un movimento fluido, senza scatti.', 'Fai una breve pausa quando le gambe sono quasi estese.', 'Ritorna lentamente senza far toccare i pesi.']],
    err: ['Mantieni il controllo', ['Staccare il bacino dal sedile.', 'Usare lo slancio per sollevare il carico.', 'Bloccare le ginocchia in estensione completa.']],
    breath: ['Respira con ritmo', 'Espira nell’estensione e inspira nel ritorno, mantenendo le mani salde sulle maniglie.'],
    vtt: [['Ginocchia in asse con la leva.', 'Schiena e bacino appoggiati.'], ['Estendi con un movimento fluido.', 'Ritorna lentamente.'], ['Non staccare il bacino.', 'Non usare lo slancio.'], ['Espira nell’estensione.', 'Inspira nel ritorno.']],
  },
  {
    id: 'exercise-5', name: 'Rematore bilanciere', equipment: 'Bilanciere',
    kind: 'row', implement: 'barbell', camera: cam([0, .85, .1], 4.1, .4), views: [{ yaw: .9, label: 'VISTA A TRE QUARTI' }, SIDE],
    labels: ['TRAZIONE CONTROLLATA', 'RITORNO CONTROLLATO'],
    prep: ['Trova una posizione stabile', 'Piedi alla larghezza del bacino, ginocchia leggermente flesse, busto inclinato con schiena neutra e core attivo.'],
    exec: ['Segui un ritmo controllato', ['Tira il bilanciere verso la parte bassa dell’addome.', 'Porta i gomiti indietro, vicini al busto, avvicinando le scapole.', 'Ritorna con controllo, senza perdere l’inclinazione del busto.']],
    err: ['Mantieni il controllo', ['Arrotondare la schiena.', 'Usare lo slancio del busto.', 'Alzare le spalle verso le orecchie.']],
    breath: ['Respira con ritmo', 'Espira durante la trazione e inspira nel ritorno, con il busto fermo.'],
    vtt: [['Ginocchia flesse, schiena neutra.', 'Core attivo e busto inclinato.'], ['Tira il bilanciere verso l’addome.', 'Ritorna senza perdere la posizione.'], ['Non arrotondare la schiena.', 'Non usare lo slancio.'], ['Espira nella trazione.', 'Inspira nel ritorno.']],
  },
  {
    id: 'exercise-10', name: 'Alzate posteriori', equipment: 'Manubri',
    kind: 'reardelt', implement: 'dumbbell', camera: cam([0, .9, .05], 4.1, .4), views: [{ yaw: .9, label: 'VISTA A TRE QUARTI' }, { yaw: 2.9, label: 'VISTA POSTERIORE' }],
    labels: ['SALITA CONTROLLATA', 'DISCESA CONTROLLATA'],
    prep: ['Trova una posizione stabile', 'Busto inclinato in avanti con schiena neutra, ginocchia flesse e manubri sotto le spalle, gomiti appena flessi.'],
    exec: ['Segui un ritmo controllato', ['Solleva i manubri verso i lati aprendo le braccia.', 'Guida il movimento con i gomiti, senza alzare le spalle.', 'Scendi lentamente mantenendo il busto fermo.']],
    err: ['Mantieni il controllo', ['Alzare il busto per dare slancio.', 'Stringere i manubri con troppa forza e usare i polsi.', 'Salire oltre l’altezza delle spalle.']],
    breath: ['Respira con ritmo', 'Espira nella salita e inspira nella discesa, mantenendo la schiena neutra.'],
    vtt: [['Busto inclinato, schiena neutra.', 'Gomiti appena flessi.'], ['Solleva i manubri ai lati.', 'Scendi lentamente, senza slancio.'], ['Non alzare il busto.', 'Non salire oltre le spalle.'], ['Espira nella salita.', 'Inspira nella discesa.']],
  },
];
