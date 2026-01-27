const { saveFileSafely } = require('../src/utils/storageGuard');

async function run(){
  const fakeFile = { name: 'fake.txt', async save(buf, options){ this._saved = buf; this._options = options; return true; } };

  try{
    console.log('Test: Buffer -> should succeed');
    await saveFileSafely(fakeFile, Buffer.from('hello'), {contentType:'text/plain'});
    console.log('saved size', fakeFile._saved.length);
  }catch(e){ console.error('failed', e.message); }

  try{
    console.log('Test: string "undefined" -> should fail');
    await saveFileSafely(fakeFile, 'undefined');
    console.error('ERROR: expected failure but succeeded');
  }catch(e){ console.log('expected failure:', e.message); }

  try{
    console.log('Test: null -> should fail');
    await saveFileSafely(fakeFile, null);
    console.error('ERROR: expected failure but succeeded');
  }catch(e){ console.log('expected failure:', e.message); }

  try{
    console.log('Test: string "<html>ok</html>" -> should succeed');
    await saveFileSafely(fakeFile, '<html>ok</html>', {contentType:'text/html'});
    console.log('saved size', fakeFile._saved.length, 'options', fakeFile._options);
  }catch(e){ console.error('failed', e.message); }
}

run().catch(e=>{ console.error(e); process.exit(1); });