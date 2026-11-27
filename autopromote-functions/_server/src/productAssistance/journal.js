'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// One bounded, private local file; no file per question and no project storage.
// A future multi-instance deployment needs a reviewed shared store adapter.
function privateJournal(filename) {
  const directory = path.dirname(filename);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const maximum = 4 * 1024 * 1024;
  return {
    read() {
      if (!fs.existsSync(filename)) return { receipts: [], gaps: [] };
      if (fs.statSync(filename).size > maximum) throw new Error('HELP_JOURNAL_TOO_LARGE');
      const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (value.schema_version !== 1 || !Array.isArray(value.receipts) || !Array.isArray(value.gaps)) throw new Error('HELP_JOURNAL_INVALID');
      return value;
    },
    write(value) {
      const snapshot = { schema_version: 1, receipts: value.receipts.slice(-256), gaps: value.gaps.slice(-256) };
      let bytes = JSON.stringify(snapshot);
      while (Buffer.byteLength(bytes) > maximum && (snapshot.receipts.length || snapshot.gaps.length)) {
        if (snapshot.receipts.length) snapshot.receipts.shift();
        if (snapshot.gaps.length) snapshot.gaps.shift();
        bytes = JSON.stringify(snapshot);
      }
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, filename); fs.chmodSync(filename, 0o600); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    },
  };
}
module.exports = { privateJournal };
