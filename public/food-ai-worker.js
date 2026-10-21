// CPU inference runs on the device. Photos are never uploaded for recognition.
importScripts('/vendor/tf.min.js', '/vendor/imagenet-labels.js');
const MODEL = 'indexeddb://gymtrack-mobilenet-v1-025';
const MODEL_URL = '/vendor/food-model/model.json';
const PIXEL_COUNT = 224 * 224 * 3;
const CLASS_COUNT = Object.keys(IMAGENET_LABELS).length;

self.onmessage = async ({ data }) => {
  let model;
  try {
    if (data.operation === 'remove') {
      const models = await tf.io.listModels();
      if (models[MODEL]) await tf.io.removeModel(MODEL);
      postMessage({ done: true, removed: true });
      return;
    }
    if (!['classify', 'prepare'].includes(data.operation)) throw Error('Operazione AI non valida.');
    if (data.operation === 'classify' && (!data.pixels || data.pixels.byteLength !== PIXEL_COUNT)) {
      throw Error('Foto non leggibile. Scegli un’altra immagine e riprova.');
    }
    await tf.setBackend('cpu');
    await tf.ready();
    const loading = performance.now();
    let cached = true, warning = '';
    const loadBundled = async () => {
      if (data.allowDownload === false) throw Error('Prepara il modello su questo dispositivo oppure riprova con una connessione internet.');
      cached = false;
      postMessage({ progress: 'Caricamento del modello sul dispositivo…' });
      try {
        model = await tf.loadLayersModel(MODEL_URL);
      } catch {
        throw Error('Modello non disponibile. Collegati a internet per il primo utilizzo e riprova.');
      }
      // A full/private IndexedDB must not prevent recognition with loaded weights.
      try { await model.save(MODEL); }
      catch { warning = 'Riconoscimento disponibile; il modello non è stato salvato per l’uso offline.'; }
    };
    try { model = await tf.loadLayersModel(MODEL); }
    catch { await loadBundled(); }
    let loadMs = Math.round(performance.now() - loading);
    let values = [], milliseconds = 0;
    if (data.operation === 'classify') {
      const pixels = new Uint8Array(data.pixels);
      async function infer() {
        const start = performance.now();
        const output = tf.tidy(() => model.predict(tf.tensor3d(pixels, [224, 224, 3], 'int32').toFloat().div(127.5).sub(1).expandDims()));
        try {
          const result = Array.from(await output.data());
          if (result.length !== CLASS_COUNT || result.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw Error('Il modello salvato non è valido.');
          milliseconds = Math.round(performance.now() - start);
          return result;
        } finally { output.dispose(); }
      }
      postMessage({ progress: 'Riconoscimento degli alimenti nella foto…' });
      try { values = await infer(); }
      catch (error) {
        if (!cached || data.allowDownload === false) throw error;
        // Recover a damaged old cache rather than failing on every later photo.
        model.dispose();
        const reloading = performance.now();
        await loadBundled();
        loadMs += Math.round(performance.now() - reloading);
        values = await infer();
      }
    }
    const predictions = values.map((probability, index) => ({ label: IMAGENET_LABELS[index], probability }))
      .sort((a, b) => b.probability - a.probability).slice(0, 10);
    postMessage({ done: true, predictions, report: {
      backend: 'CPU', model: 'MobileNet v1 0.25', milliseconds, loadMs,
      tensorBytes: tf.memory().numBytes, cached, outputClasses: values.length || CLASS_COUNT,
      ...(warning ? { warning } : {}),
    } });
  } catch (error) {
    postMessage({ error: error.message || 'Analisi non riuscita. Puoi inserire gli alimenti manualmente.' });
  } finally {
    model?.dispose();
    tf.disposeVariables();
  }
};
