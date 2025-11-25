// secretVault.js
// Generic AES-256-GCM encryption/decryption for sensitive tokens
// Uses TWITTER_TOKEN_ENCRYPTION_KEY (rename later if you add a more generic key)
// Backward compatible: if no key, returns plaintext pass-through.

const crypto = require('crypto');

const RAW_KEY = process.env.TWITTER_TOKEN_ENCRYPTION_KEY || process.env.GENERIC_TOKEN_ENCRYPTION_KEY || null;

function hasEncryption() { return !!RAW_KEY; }

function deriveKey() {
  if (!RAW_KEY) return null;
  return crypto.createHash('sha256').update(RAW_KEY).digest();
}

function encryptToken(plaintext) {
  if (!plaintext) return null;
  const key = deriveKey();
  if (!key) return plaintext;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  } catch (e) {
    console.warn('[secretVault] encrypt failed, storing plaintext:', e.message);
    return plaintext;
  }
}

function decryptToken(stored) {
  if (!stored) return null;
  const key = deriveKey();
  if (!key) return stored;
  try {
    const buf = Buffer.from(stored, 'base64');
    if (buf.length < 29) return stored; // too small, likely plaintext
    const iv = buf.slice(0,12);
    const tag = buf.slice(12,28);
    const data = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (e) {
    console.warn('[secretVault] decrypt failed, returning raw value:', e.message);
    return stored;
  }
}

module.exports = { encryptToken, decryptToken, hasEncryption };
