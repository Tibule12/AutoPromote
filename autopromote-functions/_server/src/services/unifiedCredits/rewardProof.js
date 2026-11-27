const crypto = require("crypto");
const { fail, integer } = require("./policy");

function createMockVerifier(secret) {
  if (typeof secret !== "string" || secret.length < 32) fail("MOCK_SECRET_TOO_SHORT");
  function sign(payload) {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }
  return {
    provider: "local-mock",
    // This is an emulator fixture issuer, NOT Google verification or a live-ad token.
    issue({ userId, sessionId, eventId, completedAt }) {
      const payload = JSON.stringify({
        provider: "local-mock",
        userId,
        sessionId,
        eventId,
        completedAt,
      });
      return { payload, signature: sign(payload) };
    },
    verify(proof) {
      if (
        typeof proof?.payload !== "string" ||
        proof.payload.length > 2048 ||
        !/^[a-f0-9]{64}$/.test(proof.signature || "")
      )
        fail("UNVERIFIED_REWARD", 403);
      if (
        !crypto.timingSafeEqual(
          Buffer.from(proof.signature, "hex"),
          Buffer.from(sign(proof.payload), "hex")
        )
      ) {
        fail("UNVERIFIED_REWARD", 403);
      }
      let data;
      try {
        data = JSON.parse(proof.payload);
      } catch {
        fail("UNVERIFIED_REWARD", 403);
      }
      if (
        data.provider !== "local-mock" ||
        ![data.userId, data.sessionId, data.eventId].every(
          v => typeof v === "string" && v.length > 0 && v.length <= 160
        )
      ) {
        fail("UNVERIFIED_REWARD", 403);
      }
      integer(data.completedAt, "COMPLETION_TIME");
      return data;
    },
  };
}
module.exports = { createMockVerifier };
