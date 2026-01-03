/* Persona KYC service - production-friendly implementation
 * - Uses PERSONA_API_BASE and PERSONA_API_KEY to create sessions and verify session status.
 * - Falls back to a safe mock behavior when credentials are not configured (useful for tests).
 */
const fetch = require("node-fetch");

const PERSONA_API_BASE =
  process.env.PERSONA_API_BASE ||
  process.env.KYC_PROVIDER_REDIRECT_BASE ||
  "https://api.withpersona.com";
const PERSONA_API_KEY = process.env.PERSONA_API_KEY || "";

async function createSession({ attestationToken, userId, redirectOrigin }) {
  // Production: call Persona (or configured provider) to create a session and return redirect URL.
  if (!PERSONA_API_KEY) {
    // Fallback: return a mock redirect to aid local/dev testing.
    const mockUrl = `${process.env.KYC_PROVIDER_REDIRECT_BASE || "https://persona.example.com"}?token=${encodeURIComponent(attestationToken)}&uid=${encodeURIComponent(userId)}`;
    return { redirectUrl: mockUrl, provider: "persona", sessionId: null };
  }

  try {
    const endpoint = `${PERSONA_API_BASE.replace(/\/$/, "")}/sessions`;
    const body = {
      client_user_id: userId,
      metadata: { attestationToken, origin: redirectOrigin || null },
    };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERSONA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`persona createSession failed: ${res.status} ${txt}`);
    }
    const json = await res.json();
    // Persona-like APIs commonly return a URL to redirect the end user into the verification flow.
    // Look for fields `redirect_url`, `url`, or similar.
    const redirectUrl = json.redirect_url || json.url || (json.session && json.session.url) || null;
    const sessionId = json.id || (json.session && json.session.id) || null;
    return { redirectUrl, provider: "persona", sessionId };
  } catch (e) {
    console.warn("Persona createSession error:", e && e.message);
    // On error, fall back to a safe mock URL so callers may still proceed in dev.
    const mockUrl = `${process.env.KYC_PROVIDER_REDIRECT_BASE || "https://persona.example.com"}?token=${encodeURIComponent(attestationToken)}&uid=${encodeURIComponent(userId)}`;
    return { redirectUrl: mockUrl, provider: "persona", sessionId: null };
  }
}

async function verifyProviderResult({ providerSessionId, payload: _payload }) {
  // Verify session outcome via Persona API when configured.
  if (!PERSONA_API_KEY) {
    // In testing mode accept any non-empty session id as valid (but flag as mocked)
    if (!providerSessionId) return { valid: false, reason: "missing_session_id" };
    return { valid: true, mocked: true, details: { providerSessionId } };
  }
  try {
    const endpoint = `${PERSONA_API_BASE.replace(/\/$/, "")}/sessions/${encodeURIComponent(providerSessionId)}`;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${PERSONA_API_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`persona verify failed: ${res.status} ${txt}`);
    }
    const json = await res.json();
    // Interpret provider response: success when `status` or `outcome` indicates completion/approved
    const status = json.status || json.outcome || (json.session && json.session.status) || null;
    const valid =
      status &&
      ["completed", "approved", "success", "passed"].includes(String(status).toLowerCase());
    return { valid: !!valid, details: json };
  } catch (e) {
    console.error("Error verifying persona session:", e && e.message);
    return { valid: false, error: e && e.message };
  }
}

module.exports = { createSession, verifyProviderResult };
