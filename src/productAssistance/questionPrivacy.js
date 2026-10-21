'use strict';
// Human questions may legitimately include an email, source link or error path.
// Remove those values before retrieval, receipts or the private gap journal.
function redactQuestion(question) {
  let text = question;
  for (const [pattern, replacement] of [
    [/-----BEGIN[\s\S]*/gi, '[private key removed]'],
    [/\b(?:token|secret|password|api[_ -]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]*)/gi, '[credential removed]'],
    [/\bBearer\s+[^\s,;]+/gi, '[credential removed]'],
    [/\beyJ[a-zA-Z0-9_.-]{15,}/g, '[credential removed]'],
    [/(?:https?:\/\/|gs:\/\/)[^\s<>"']*/gi, '[link removed]'],
    [/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email removed]'],
    [/(?:\/(?:home|Users)\/|[a-z]:\\)[^\s<>"']*/gi, '[private path removed]'],
  ]) text = text.replace(pattern, replacement);
  return { question: text, redacted: text !== question };
}
module.exports = { redactQuestion };
