import { describe, expect, it } from 'vitest';
import { detectInstallPlatform, detectIosBrowser } from '../src/app/services/install-platform';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';

describe('rilevamento piattaforma per installazione', () => {
  it('riconosce iPhone, iPad in modalità desktop, Android, Windows e Mac', () => {
    expect(detectInstallPlatform({ userAgent: IPHONE_SAFARI })).toBe('ios');
    expect(detectInstallPlatform({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallPlatform({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac');
    expect(detectInstallPlatform({ userAgent: ANDROID })).toBe('android');
    expect(detectInstallPlatform({ userAgent: WINDOWS, userAgentData: { platform: 'Windows' } })).toBe('windows');
    expect(detectInstallPlatform({ userAgent: 'curl/8' })).toBe('other');
    expect(detectInstallPlatform(undefined)).toBe('other');
  });
  it('distingue Safari dagli altri browser iOS', () => {
    expect(detectIosBrowser(IPHONE_SAFARI)).toBe('safari');
    expect(detectIosBrowser(IPHONE_CHROME)).toBe('chrome');
    expect(detectIosBrowser(IPHONE_SAFARI.replace('Version/18.0', 'FxiOS/130.0'))).toBe('firefox');
    expect(detectIosBrowser(IPHONE_SAFARI + ' Instagram/300.0')).toBe('other');
    expect(detectIosBrowser(undefined)).toBe('other');
  });
});
