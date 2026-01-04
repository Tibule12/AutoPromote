const { tokensFromDoc } = require("../src/services/connectionTokenUtils");
const { encryptToken, decryptToken, hasEncryption } = require("../src/services/secretVault");

(async () => {
  try {
    // Case 1: tokens object passed
    const obj = { tokens: { access_token: "a1", refresh_token: "r1" } };
    const t1 = tokensFromDoc(obj);
    if (!t1 || t1.access_token !== "a1" || t1.refresh_token !== "r1")
      throw new Error("object tokens test failed");

    // Case 2: encrypted tokens string
    const plaintext = JSON.stringify({ access_token: "a2", refresh_token: "r2" });
    const enc = encryptToken(plaintext);
    const doc2 = { tokens: enc };
    const t2 = tokensFromDoc(doc2);
    if (!t2 || t2.access_token !== "a2" || t2.refresh_token !== "r2")
      throw new Error("encrypted tokens string failed");

    // Case 3: encrypted_access_token field
    const accessEnc = encryptToken("a3");
    const refreshEnc = encryptToken("r3");
    const doc3 = {
      encrypted_access_token: accessEnc,
      encrypted_refresh_token: refreshEnc,
      expires_in: 3600,
    };
    const t3 = tokensFromDoc(doc3);
    if (!t3 || t3.access_token !== "a3" || t3.refresh_token !== "r3" || t3.expires_in !== 3600)
      throw new Error("encrypted fields test failed");

    console.log("connectionTokenUtils tests passed");
    console.log("OK");
  } catch (e) {
    console.error("Test failed:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
