// The owner's explicit local shutdown survives retries from another local run.
const fs = require('node:fs');
const marker = '/tmp/autopromote-owner-stop-local-studio-20261031';
if (fs.existsSync(marker)) {
  throw new Error('Owner stopped local Studio/demo servers and requested generated-video cleanup on 31 October 2026. Do not restart or regenerate videos. Read '+marker+'; only an explicit owner request can resume this local setup.');
}
