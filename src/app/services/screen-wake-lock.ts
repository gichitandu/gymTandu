/**
 * Mantiene lo schermo acceso mentre la pagina è visibile (Screen Wake Lock API).
 * Il blocco viene rilasciato dal sistema quando la pagina va in background:
 * al ritorno in primo piano viene richiesto di nuovo. Se l'API non è
 * disponibile o la richiesta fallisce, l'app continua a funzionare normalmente.
 */
interface WakeLockSentinelLike {
  release(): Promise<void>;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

export class ScreenWakeLock {
  private sentinel?: WakeLockSentinelLike;
  private active = false;
  private readonly onVisibility = () => {
    if (this.active && document.visibilityState === 'visible') void this.acquire();
  };

  start() {
    if (this.active || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.acquire();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', this.onVisibility);
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    void sentinel?.release().catch(() => undefined);
  }

  private async acquire() {
    if (this.sentinel || typeof navigator === 'undefined') return;
    try {
      const sentinel = await (navigator as WakeLockNavigator).wakeLock?.request('screen');
      if (!sentinel) return;
      if (!this.active) {
        await sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      (sentinel as unknown as EventTarget).addEventListener?.('release', () => {
        if (this.sentinel === sentinel) this.sentinel = undefined;
      });
    } catch {
      // Batteria scarica, risparmio energetico o API non consentita: nessun errore da mostrare.
    }
  }
}
