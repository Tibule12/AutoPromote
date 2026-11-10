// Isolated candidate files; ordinary local API/emulator traffic is forwarded.
// No browser route interception, response fixtures or altered Auth state.
const fs=require('fs');
const appOrigin='http://127.0.0.1:44811';
const build='/dev/shm/autopromote-abstract-final-client';
const { createLoopbackPreviewServer } = require('../../scripts/monetization/loopback-preview-server.cjs');
const server = createLoopbackPreviewServer({ appOrigin, build });
let ownOrigin;
server.listen(0,'127.0.0.1',()=>{ownOrigin='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync('/dev/shm/autopromote-abstract-20261030/final-candidate.json',JSON.stringify({origin:ownOrigin,pid:process.pid,appOrigin,build}));
 console.log('Isolated glass candidate ready.');
});
