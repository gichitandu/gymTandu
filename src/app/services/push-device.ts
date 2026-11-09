// Separate device permission metadata; never included in personal archives/backups.
export interface PushDeviceGrant {
  accountId: string;
  id: string;
  enabled: boolean;
}
const PUSH_DEVICE_DB = "gymtrack-push-device-v1";
export async function pushDeviceGrant(
  write?: PushDeviceGrant,
): Promise<PushDeviceGrant | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(PUSH_DEVICE_DB, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains("settings"))
        opening.result.createObjectStore("settings");
    };
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () =>
      reject(Error("Impostazioni notifiche occupate da un’altra finestra."));
    opening.onsuccess = () => {
      const db = opening.result,
        tx = db.transaction("settings", write ? "readwrite" : "readonly"),
        store = tx.objectStore("settings");
      let value: PushDeviceGrant | null = null;
      const job = write ? store.put(write, "current") : store.get("current");
      job.onsuccess = () => {
        value = write || job.result || null;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || Error("Impostazioni notifiche non salvate."));
      };
    };
  });
}
export async function clearPushBadge() {
  try {
    await (
      navigator as Navigator & { clearAppBadge?: () => Promise<void> }
    ).clearAppBadge?.();
  } catch {}
}
export async function stopDevicePushForLogout() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return;
  // Persist local opt-out before network work; logout must not wait on the push provider.
  const stop = (async () => {
    try {
      const grant = await pushDeviceGrant();
      if (grant) await pushDeviceGrant({ ...grant, enabled: false });
    } catch {}
    await clearPushBadge();
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager?.getSubscription();
    if (sub) await sub.unsubscribe();
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stop,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 1500);
      }),
    ]);
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
