function publishingError(message, errorClass, status) {
  const error = new Error(message);
  error.errorClass = errorClass;
  if (status) error.status = status;
  return error;
}

function classifyPublishingError(error = "") {
  const known = [
    "auth",
    "validation",
    "rate_limit",
    "transient",
    "not_found",
    "publication_pending",
    "publication_unconfirmed",
  ];
  if (known.includes(error?.errorClass)) return error.errorClass;
  const status = error?.status || error?.statusCode;
  const message = String(error?.message || error).toLowerCase();
  const tokenAt = message.indexOf('access token');
  const noValidAt = message.indexOf('no valid ');
  const expiredToken = tokenAt !== -1 && message.indexOf('expir', tokenAt + 12) !== -1;
  const missingToken = noValidAt !== -1 && message.indexOf('access token', noValidAt + 9) !== -1;
  if (
    status === 401 ||
    status === 403 ||
    expiredToken || missingToken ||
    /expired_access_token|invalid_access_token|invalid_grant|invalid_token|reconnect|unauthorized/.test(
      message
    ) ||
    /(?:"status"\s*:\s*|status=)(401|403)\b/.test(message)
  )
    return "auth";
  if (status === 429 || /quota|rate.?limit|too many requests|429/.test(message))
    return "rate_limit";
  if (status >= 500 || /timeout|network|fetch failed/.test(message)) return "transient";
  if (/auth|permission/.test(message)) return "auth";
  if (status === 404 || message.includes("not found")) return "not_found";
  if (/exceeds maximum allowed size|too large|corrupt|invalid file/.test(message))
    return "validation";
  return "generic";
}

module.exports = { publishingError, classifyPublishingError };
