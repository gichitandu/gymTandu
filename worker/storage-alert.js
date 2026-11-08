// Controllo dello spazio R2: avvisa via email quando l'uso supera 8, 9 e 9,5 GB
// (il piano gratuito include 10 GB). GB decimali, quindi l'avviso è leggermente
// prudente rispetto ai GiB. Lo stato resta in un piccolo oggetto nello stesso bucket
// e l'email parte una sola volta per soglia, finché l'uso non scende di nuovo.
const GB = 1_000_000_000;
export const STORAGE_THRESHOLDS = [8 * GB, 9 * GB, 9.5 * GB];
const STATE_KEY = 'system/storage-alert.json';
const LIMIT_GB = 10;

/** Somma le dimensioni di tutti gli oggetti del bucket. */
export async function bucketBytes(bucket) {
  let total = 0, cursor;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const object of page.objects) total += object.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return total;
}

const gb = bytes => (bytes / GB).toFixed(2).replace('.', ',');

async function readState(bucket) {
  try {
    const object = await bucket.get(STATE_KEY);
    const value = object ? JSON.parse(await object.text()) : null;
    return Number.isInteger(value?.level) && value.level >= 0 && value.level <= STORAGE_THRESHOLDS.length ? value.level : 0;
  } catch { return 0; }
}
const writeState = (bucket, level, bytes) => bucket.put(STATE_KEY, JSON.stringify({ level, bytes, updatedAt: new Date().toISOString() }));

async function sendEmail(env, to, level, bytes, fetchImpl) {
  const threshold = STORAGE_THRESHOLDS[level - 1];
  const percent = Math.round(bytes / (LIMIT_GB * GB) * 100);
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'GymTrack <onboarding@resend.dev>',
      to: [to],
      subject: `GymTrack: spazio R2 oltre ${gb(threshold)} GB`,
      text: `Lo spazio usato su Cloudflare R2 ha superato ${gb(threshold)} GB.\n\nUso attuale: ${gb(bytes)} GB su ${LIMIT_GB} GB inclusi nel piano gratuito (${percent}%).\n\nOltre il limite gratuito Cloudflare addebita lo spazio in più. Puoi liberare spazio eliminando vecchie copie dal bucket gymtrack-archives, oppure passare a un piano a pagamento.\n\nQuesto avviso arriva una sola volta per soglia (8, 9 e 9,5 GB).`,
    }),
  });
  if (!response.ok) throw new Error('Invio email non riuscito (' + response.status + ').');
}

/**
 * Esegue il controllo. Restituisce { bytes, level, sent }. Se l'invio fallisce lo stato
 * non viene aggiornato, così il prossimo controllo riprova.
 */
export async function storageAlert(env, to, fetchImpl = fetch) {
  if (!env.BUCKET) return { bytes: 0, level: 0, sent: false };
  const bytes = await bucketBytes(env.BUCKET);
  const level = STORAGE_THRESHOLDS.filter(threshold => bytes >= threshold).length;
  const known = await readState(env.BUCKET);
  if (level === known) return { bytes, level, sent: false };
  if (level < known) { await writeState(env.BUCKET, level, bytes); return { bytes, level, sent: false }; }
  if (!env.RESEND_API_KEY) { console.warn('Soglia R2 superata ma RESEND_API_KEY non è impostata: nessuna email inviata.'); return { bytes, level, sent: false }; }
  await sendEmail(env, env.ALERT_EMAIL || to, level, bytes, fetchImpl);
  await writeState(env.BUCKET, level, bytes);
  return { bytes, level, sent: true };
}
