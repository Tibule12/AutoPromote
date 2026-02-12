const crypto = require('crypto');

const keys = [
  "43ab7d8916b3898471ed17dbba4258c7",
  "f44a54edd745c9e58a17b0cea9ed7e8058dd495ab887a5350fc1fb901bef34f3"
];

const encrypted = "ghDwaejsPcgHTX0CxJdyJGN9o6gZEgS+h/TDOAz6zV5CgWd7A5xRCIs7S/lYnTZtQ/DpHL2H5X0KMPIVuaJoKfvGZ6q+PYRsN6L04n8ziC89Pw+P/7f0uKX85EVmCwupCBQFLF8z1mNydAhgoHVnUlwXK5EPaf43/oRRLa/HI/ulwf9u2WC5r4INgC0iEts+809N+kcU1N7MQIltrBw0g2Wu21ExZSJIlmfnKJnKbYTtlLh7XlnpFgAuqjklAqNmXl/C7s1ZCPIKMIYTtm+/fpY2QZIp200PXamnENEocsdLkIH5hi5mUiVpsqKzvxU=";

function deriveKey(rawKey) {
    return crypto.createHash("sha256").update(rawKey).digest();
}

function decrypt(stored, rawKey) {
  try {
    const key = deriveKey(rawKey);
    const buf = Buffer.from(stored, "base64");
    if (buf.length < 29) return "TOO_SHORT";
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const data = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

keys.forEach((k, i) => {
    console.log(`Trying Key ${i+1}: ${k}`);
    const res = decrypt(encrypted, k);
    console.log(`Result: ${res.substring(0, 50)}...`);
});
