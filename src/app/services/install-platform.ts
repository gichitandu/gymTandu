/** Piattaforma rilevata per l’installazione della PWA. */
export type InstallPlatform = 'ios' | 'android' | 'windows' | 'mac' | 'other';
/** Browser iOS: Safari offre «Aggiungi alla schermata Home»; gli altri browser iOS lo offrono solo da iOS 16.4. */
export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';

export interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

export function detectInstallPlatform(nav: NavigatorLike | undefined): InstallPlatform {
  if (!nav) return 'other';
  const ua = nav.userAgent || '';
  const hint = (nav.userAgentData?.platform || nav.platform || '').toLowerCase();
  // iPadOS si presenta come Mac: lo riconosce lo schermo touch.
  if (/iphone|ipad|ipod/i.test(ua) || (hint.startsWith('mac') && (nav.maxTouchPoints || 0) > 1)) return 'ios';
  if (/android/i.test(ua) || hint === 'android') return 'android';
  if (/windows/i.test(ua) || hint.startsWith('win')) return 'windows';
  if (/macintosh|mac os x/i.test(ua) || hint.startsWith('mac')) return 'mac';
  return 'other';
}

export function detectIosBrowser(userAgent: string | undefined): IosBrowser {
  const ua = userAgent || '';
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS/.test(ua)) return 'firefox';
  if (/EdgiOS/.test(ua)) return 'edge';
  if (/Safari/.test(ua) && !/(GSA|FBAN|FBAV|Instagram|Line)\//.test(ua)) return 'safari';
  return 'other';
}
