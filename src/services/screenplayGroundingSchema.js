// Pair each allowable prop name with the exact action quote containing it.
// Separate name/quote enums permit syntactically valid but false attribution.
function groundedPropItems(quotes, excludedNames = []) {
  const canonical = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const excluded = new Set(excludedNames.map(canonical));
  const boundary = /^(a|an|the|on|in|of|to|from|with|and|or|at|by|as)$/i;
  const alternatives = [];
  for (const quote of [...new Set(quotes)]) {
    const words = [...quote.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
    const names = new Set();
    for (let start = 0; start < words.length; start++) {
      for (let length = 1; length <= 5 && start + length <= words.length; length++) {
        const last = words[start + length - 1];
        if (boundary.test(words[start][0]) || boundary.test(last[0])) continue;
        const name = quote.slice(words[start].index, last.index + last[0].length);
        if (name.length <= 160 && !excluded.has(canonical(name))) names.add(name);
      }
    }
    if (names.size) alternatives.push({ type: 'object', additionalProperties: false,
      properties: { name: { enum: [...names] }, sourceQuote: { enum: [quote] } }, required: ['name', 'sourceQuote'] });
  }
  return alternatives.length ? { anyOf: alternatives } : null;
}
module.exports = { groundedPropItems };
