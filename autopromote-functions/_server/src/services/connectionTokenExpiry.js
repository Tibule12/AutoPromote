function timestampMs(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (value && typeof (value.seconds ?? value._seconds) === "number") {
    return (value.seconds ?? value._seconds) * 1000;
  }
  return NaN;
}

function accessTokenExpiresAt(connection, tokens) {
  for (const value of [tokens.expires_at, tokens.expiresAt, connection.expiresAt]) {
    const ms = timestampMs(value);
    if (Number.isFinite(ms)) return ms;
  }
  const issuedAt = timestampMs(connection.tokensUpdatedAt || connection.updatedAt);
  const lifetime = Number(tokens.expires_in);
  return Number.isFinite(issuedAt) && lifetime > 0 ? issuedAt + lifetime * 1000 : NaN;
}

module.exports = { timestampMs, accessTokenExpiresAt };
