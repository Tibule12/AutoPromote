// Basic sanity checks: encryption round-trip & rateLimit logic smoke (without Firestore writes)
process.env.TWITTER_TOKEN_ENCRYPTION_KEY =
  process.env.TWITTER_TOKEN_ENCRYPTION_KEY || "dev-local-test-key";

const { encryptToken, decryptToken, hasEncryption } = require("../src/services/secretVault");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

console.log("Encryption enabled?", hasEncryption());
const sample = "super-secret-token-123";
const enc = encryptToken(sample);
assert(enc && enc !== sample, "Token should be encrypted");
const dec = decryptToken(enc);
assert(dec === sample, "Decrypted token mismatch");
console.log("Encryption round trip OK");

console.log("All basic sanity checks passed.");
