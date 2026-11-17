import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { clipSelectionSettings, clipSettingsCacheKey } from '../clipSelectionSettings';

describe('clip scan cache isolation', () => {
  const originalCrypto = globalThis.crypto;
  const originalEncoder = globalThis.TextEncoder;
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    globalThis.TextEncoder = TextEncoder;
  });
  afterAll(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    globalThis.TextEncoder = originalEncoder;
  });

  test('long shared prefixes retain different source and preference identities within the server token limit', async () => {
    const common = 'a'.repeat(220);
    const settings = clipSelectionSettings('15–30 seconds', ['TikTok'], 'b'.repeat(200));
    const key = await clipSettingsCacheKey(common + 'source-one', settings);
    expect(key.length).toBeLessThanOrEqual(80);
    expect(await clipSettingsCacheKey(common + 'source-one', settings)).toBe(key);
    expect(await clipSettingsCacheKey(common + 'source-two', settings)).not.toBe(key);
    expect(await clipSettingsCacheKey(common + 'source-one', { ...settings, minDuration: 30, maxDuration: 60 })).not.toBe(key);
    expect(await clipSettingsCacheKey(common + 'source-one', { ...settings, destinations: ['youtube_shorts'] })).not.toBe(key);
    expect(await clipSettingsCacheKey(common + 'source-one', { ...settings, focus: settings.focus + 'c' })).not.toBe(key);
  });

  test('missing browser hashing skips cached results safely', async () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    expect(await clipSettingsCacheKey('source', clipSelectionSettings())).toBeNull();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  });
});
