'use strict';
const { textRecords } = require('../productKnowledge');
const STOP = new Set('how do i can what is the a an my to of for in on it this that does why me about auto promote autopromote please now next tell and use using want with have get make add are wrong not working could would should help'.split(' '));
const SYNONYMS = { subtitle: 'caption' };
const normalize = text => text.normalize('NFKC').toLowerCase().replace(/key\s+frames?/g, 'keyframes').replace(/voice\s+over/g, 'voiceover').replace(/b[ -]roll/g, 'broll').replace(/[^a-z0-9]+/g, ' ').trim();
const stem = word => word.length > 4 && !word.endsWith('ss') ? word.replace(/ies$/, 'y').replace(/s$/, '') : word;
const tokens = text => [...new Set(normalize(text).split(' ').filter(t => (t.length > 2 || ['3d', '2d'].includes(t)) && !STOP.has(t)).map(stem))];
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const differences = [...a].map((c, i) => c === b[i] ? -1 : i).filter(i => i >= 0);
    return differences.length === 1 || differences.length === 2 && differences[1] === differences[0] + 1 && a[differences[0]] === b[differences[1]] && a[differences[1]] === b[differences[0]];
  }
  const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.slice(i) === longer.slice(i + 1);
}
function createRetrieval(book) {
  const records = textRecords(book).map(record => ({ ...record,
    words: new Set(tokens(record.text)),
    titleWords: new Set(tokens(record.entry.name || record.entry.title || record.entry.label)),
    names: [record.entry.name || record.entry.title || record.entry.label, ...(record.entry.aliases || [])].map(normalize),
  }));
  const frequency = new Map();
  for (const record of records) for (const word of record.words) frequency.set(word, (frequency.get(word) || 0) + 1);
  // Only correct unique near-matches to documented title vocabulary. Arbitrary
  // prose/non-English text must not become an invented confident feature match.
  const vocabulary = [...new Set([...records.flatMap(r => [...r.titleWords]), ...Object.keys(SYNONYMS)])].filter(w => w.length >= 5);
  const correctWord = word => {
      if (SYNONYMS[word]) return SYNONYMS[word];
      if (frequency.has(word) || word.length < 5) return word;
      const candidates = vocabulary.filter(v => oneEdit(word, v));
      const corrected = candidates.length === 1 ? candidates[0] : word;
      return SYNONYMS[corrected] || corrected;
    };
  const retrieve = (question, context = {}) => {
    const phrase = ` ${normalize(question)} `;
    const qs = tokens(question).map(correctWord);
    return records.map(record => {
      const exact = Math.max(0, ...record.names.filter(name => name.length >= 3 && phrase.includes(` ${name} `)).map(name => name.length));
      const matches = qs.filter(word => record.words.has(word));
      const contextual = context.selected_feature_id && (record.id === context.selected_feature_id || record.entry.feature_ids?.includes(context.selected_feature_id));
      const score = (exact ? 100 + exact : 0) + matches.reduce((sum, word) => sum + Math.log(1 + records.length / (1 + frequency.get(word))) * (record.titleWords.has(word) ? 5 : 1), 0) + (contextual ? 10 : 0);
      return { ...record, score, exact, matches: matches.length, contextual };
    }).filter(r => r.exact || r.score >= 5 && r.matches >= Math.min(2, qs.length) && qs.length).sort((a, b) => Number(Boolean(b.contextual)) - Number(Boolean(a.contextual)) || b.score - a.score || a.id.localeCompare(b.id));
  };
  retrieve.correct = question => normalize(question).split(' ').map(word => correctWord(stem(word))).join(' ');
  return retrieve;
}
module.exports = { createRetrieval, normalize, tokens };
