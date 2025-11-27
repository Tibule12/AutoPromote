import { isAllowedAuthUrl } from '../isAllowedAuthUrl';

describe('isAllowedAuthUrl helper', () => {
  it('returns false for empty or non-strings', () => {
    expect(isAllowedAuthUrl(null)).toBe(false);
    expect(isAllowedAuthUrl(undefined)).toBe(false);
    expect(isAllowedAuthUrl(123)).toBe(false);
    expect(isAllowedAuthUrl('')).toBe(false);
  });

  it('allows tg:// deep links', () => {
    expect(isAllowedAuthUrl('tg://resolve?domain=testbot&start=123')).toBe(true);
    expect(isAllowedAuthUrl('tg:some/path')).toBe(true);
  });

  it('allows known oauth hostnames', () => {
    expect(isAllowedAuthUrl('https://accounts.google.com/o/oauth2/approve')).toBe(true);
    expect(isAllowedAuthUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isAllowedAuthUrl('https://api.twitter.com/oauth2/authorize')).toBe(true);
    expect(isAllowedAuthUrl('https://accounts.spotify.com/authorize')).toBe(true);
    expect(isAllowedAuthUrl('https://www.reddit.com/api/v1/authorize')).toBe(true);
    // Snapchat auth URL should be allowed and navigated directly
    expect(isAllowedAuthUrl('https://accounts.snapchat.com/accounts/oauth2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fapi.example.com%2Fcallback')).toBe(true);
  });

  it('allows same-origin URLs', () => {
    // Jest jsdom default origin is http://localhost
    expect(isAllowedAuthUrl('http://localhost/some/path')).toBe(true);
  });

  it('rejects other origins', () => {
    expect(isAllowedAuthUrl('https://evil.com/redirect?target=https://www.youtube.com')).toBe(false);
    expect(isAllowedAuthUrl('https://example.org/')).toBe(false);
    expect(isAllowedAuthUrl('http://attacker.local/path')).toBe(false);
  });
});
