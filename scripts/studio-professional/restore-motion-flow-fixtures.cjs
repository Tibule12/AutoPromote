// Restore exact, previously UI-imported test bytes after an ephemeral emulator
// shutdown. Fixture setup only: no project/auth injection or production access.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const directory = process.argv[2];
const config = JSON.parse(fs.readFileSync(path.join(directory, 'config.json')));
Object.assign(process.env, config.env);
require('../../src/services/unifiedCredits/runtime').assertSandbox(config.env);
assert.equal(config.env.GCLOUD_PROJECT, 'demo-autopromote-credits');
assert.equal(new URL(config.origin).hostname, '127.0.0.1');
const net = require('node:net'), connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' ? first.host || '127.0.0.1' : typeof args[1] === 'string' ? args[1] : '127.0.0.1';
  assert(['127.0.0.1', 'localhost', '::1'].includes(host)); return connect.apply(this, args);
};
const { OAuth2Client } = require('google-auth-library');
const { Storage } = require('@google-cloud/storage');
const authClient = new OAuth2Client(); authClient.setCredentials({access_token:'owner',expiry_date:Date.now()+3600000});
const bucket = new Storage({ projectId: 'demo-autopromote-credits', authClient }).bucket('demo-autopromote-credits');
async function main() {
  const folder = path.join(root, 'reports/studio-motion-flow-takeover-20261031');
  const project = JSON.parse(fs.readFileSync(path.join(folder, 'Editable Project.autopromote.json')));
  const receipts = [];
  for (const media of project.snapshot.projectMedia) {
    assert(/^studio\/sources\/demo-pilot-alice\//.test(media.storagePath));
    assert(['presenter-1.mp4','presenter-2.mp4'].includes(media.name));
    const file = path.join(folder,'media',media.name), bytes=fs.readFileSync(file);
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if (media.contentHash) assert.equal(hash,media.contentHash);
    await bucket.file(media.storagePath).save(bytes,{resumable:false,metadata:{contentType:'video/mp4',metadata:{
      ownerUid:'demo-pilot-alice',purpose:'studio_source',contentHash:hash,sourceName:media.name,
    }}});
    receipts.push({ storagePath:media.storagePath,bytes:bytes.length,sha256:hash });
  }
  fs.writeFileSync(path.join(folder,'emulator-source-restoration.json'),JSON.stringify({
    demoOnly:true,scope:'Restoration of exact native-imported media fixture objects; no auth/project/credit writes',receipts,
  },null,2));
  console.log('Restored exact two owned emulator source objects; browser will sign in and restore the native backup normally.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
