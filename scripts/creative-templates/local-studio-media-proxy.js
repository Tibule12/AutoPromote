// Read-only media transport for the local App. The existing authenticated
// uploader still authorizes the source. No bucket CORS or IAM is changed.
const crypto = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');

function createLocalStudioMediaProxy({ appOrigin, apiOrigin, bucket, cacheDirectory, workerOutputDirectory, key = crypto.randomBytes(32), now = Date.now }) {
  const app = new URL(appOrigin), api = new URL(apiOrigin);
  for (const url of [app, api])
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Local media transport requires loopback origins');
  const prefix = '/api/_local/studio-media/';
  const signature = text => crypto.createHmac('sha256', key).update(text).digest('base64url');
  const ownedPath = (uid, storagePath) => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid) &&
    typeof storagePath === 'string' && (storagePath.startsWith(`studio/sources/${uid}/`) ||
      new RegExp(`^studio/exports/${uid}/[A-Za-z0-9_-]{1,160}/render\\.(mp4|mov|webm)$`).test(storagePath)) &&
    !storagePath.includes('..') && storagePath.length < 1024;
  function issue(uid, storagePath, sourceUrl) {
    if (!ownedPath(uid, storagePath)) throw new Error('Local source ownership mismatch');
    const original = new URL(sourceUrl);
    const firebase = original.hostname === 'firebasestorage.googleapis.com';
    const signedGcs = original.hostname === 'storage.googleapis.com' &&
      (original.searchParams.has('Signature') || original.searchParams.has('X-Goog-Signature'));
    if (original.protocol !== 'https:' || (!firebase && !signedGcs))
      throw new Error('Expected the authenticated uploader source');
    const objectPath = firebase ? decodeURIComponent(original.pathname.split('/o/')[1] || '')
      : decodeURIComponent(original.pathname.split('/').slice(2).join('/'));
    if (objectPath !== storagePath) throw new Error('Local source URL does not match its owned object');
    const token = firebase ? original.searchParams.get('token') || '' : '';
    const payload = Buffer.from(JSON.stringify({ uid, storagePath, expires: now()+3*3600000,
      ...(token ? {tokenHash:crypto.createHash('sha256').update(token).digest('hex')} : {}) })).toString('base64url');
    const result = new URL(prefix+payload+'.'+signature(payload), apiOrigin);
    // Preserve the existing source token for the ordinary renderer's owner /
    // upload-token verification. This grants no access to a different source.
    if(token)result.searchParams.set('token', token);
    return result.href;
  }
  function decode(value) {
    const [payload, supplied, extra] = String(value || '').split('.');
    if (extra || !payload || !supplied || payload.length > 2048) throw new Error('Invalid media capability');
    const expected = signature(payload), a = Buffer.from(supplied), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Invalid media capability');
    const result = JSON.parse(Buffer.from(payload,'base64url').toString());
    if (!ownedPath(result.uid,result.storagePath) || !Number.isFinite(result.expires) || result.expires < now())
      throw new Error('Expired media capability');
    return result;
  }
  const routes = new Set(['/api/media/multicam/uploads/start','/api/media/multicam/uploads/complete',
    '/api/media/multicam/uploads/recover','/api/media/studio-assets/resolve']);
  function wrap(req,res,next) {
    const status = /^\/api\/media\/(?:status|viral-render-attempt)\/[A-Za-z0-9_-]+$/.test(req.path);
    if (!routes.has(req.path) && !status) return next();
    const original = res.json.bind(res);
    res.json = value => {
      const uid = req.user?.uid || req.userId;
      if (res.statusCode < 400 && uid && status && value?.status === 'completed') {
        const storagePath = value.outputStoragePath || value.storagePath || value.result?.outputStoragePath;
        const url = value.outputUrl || value.output_url || value.result?.url || value.result?.output_url;
        if (storagePath && url && ownedPath(uid,storagePath)) {
          const local = issue(uid,storagePath,url);
          const download = new URL(local);download.searchParams.set('download','1');
          return original({...value,outputUrl:local,output_url:local,downloadUrl:download.href,
            result:{...value.result,url:local,output_url:local,downloadUrl:download.href}});
        }
      }
      if (res.statusCode < 400 && uid && value?.url && ownedPath(uid,value.storagePath))
        return original({...value,url:issue(uid,value.storagePath,value.url)});
      return original(value);
    };
    next();
  }
  async function stream(req,res) {
    try {
      const capability = decode(req.params.capability);
      if (req.headers.origin && req.headers.origin !== app.origin) return res.sendStatus(403);
      const object = bucket().file(capability.storagePath), [metadata] = await object.getMetadata();
      const exportJob = capability.storagePath.startsWith(`studio/exports/${capability.uid}/`)
        ? capability.storagePath.split('/')[3] : null;
      if (metadata.metadata?.ownerUid !== capability.uid || (exportJob
          ? metadata.metadata?.purpose !== 'studio_export' || metadata.metadata?.jobId !== exportJob
          : !['studio_source','studio_project'].includes(metadata.metadata?.purpose))) return res.sendStatus(403);
      const tokens = String(metadata.metadata?.firebaseStorageDownloadTokens || '').split(',').map(x=>x.trim());
      if (capability.tokenHash && (!tokens.includes(req.query.token) ||
          crypto.createHash('sha256').update(String(req.query.token || '')).digest('hex') !== capability.tokenHash))
        return res.sendStatus(403);
      const size = Number(metadata.size);
      if (!Number.isSafeInteger(size) || size <= 0) return res.sendStatus(409);
      let start = 0, end = size-1;
      if (req.headers.range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if (!match) return res.status(416).set('Content-Range',`bytes */${size}`).end();
        start = Number(match[1]);end = match[2] ? Math.min(size-1,Number(match[2])) : size-1;
        if (!Number.isSafeInteger(start) || start > end || start >= size)
          return res.status(416).set('Content-Range',`bytes */${size}`).end();
        res.status(206).set('Content-Range',`bytes ${start}-${end}/${size}`);
      }
      res.set({'Access-Control-Allow-Origin':app.origin,'Vary':'Origin','Accept-Ranges':'bytes',
        'Content-Type':metadata.contentType || 'video/mp4','Content-Length':String(end-start+1),
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      // The App and API use different loopback ports. Browsers ignore an
      // anchor's download attribute across origins; the response must carry
      // attachment disposition for the ordinary download control.
      if(exportJob&&req.query.download==='1')res.set('Content-Disposition','attachment; filename="viral_clip_rendered.mp4"');
      let cached;
      if(exportJob&&workerOutputDirectory&&/^[a-f0-9]{64}$/.test(metadata.metadata?.sha256||'')){
        const names=fs.readdirSync(workerOutputDirectory).filter(name=>name.startsWith(exportJob+'_viral-')&&name.endsWith('.mp4'));
        for(const name of names){
          const file=path.join(workerOutputDirectory,name),stat=fs.lstatSync(file);
          if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==size||stat.size>1024*1024*1024)continue;
          const bytes=fs.readFileSync(file);
          if(crypto.createHash('sha256').update(bytes).digest('hex')===metadata.metadata.sha256&&
              crypto.createHash('md5').update(bytes).digest('base64')===metadata.md5Hash){cached=file;break;}
        }
      }
      if(cacheDirectory){
        const manifestFile=path.join(cacheDirectory,'manifest.private.json');
        if(fs.existsSync(manifestFile)){
          const item=JSON.parse(fs.readFileSync(manifestFile)).find(x=>x.storagePath===capability.storagePath&&x.generation===metadata.generation);
          if(item&&/^[a-f0-9]{64}$/.test(item.sha256)){
            const file=path.join(cacheDirectory,item.sha256+'.bin');
            if(fs.existsSync(file)){
              const bytes=fs.readFileSync(file);
              const md5=crypto.createHash('md5').update(bytes).digest('base64');
              if(bytes.length===size&&metadata.md5Hash===md5&&
                  crypto.createHash('sha256').update(bytes).digest('hex')===item.sha256&&
                  (!metadata.metadata?.sha256||metadata.metadata.sha256===item.sha256))cached=file;
            }
          }
        }
      }
      const pinned = cached?null:bucket().file(capability.storagePath,{generation:metadata.generation});
      const read = cached?fs.createReadStream(cached,{start,end}):pinned.createReadStream(req.headers.range?{start,end,validation:false}:{validation:'crc32c'});
      read.on('error',()=>{if(!res.headersSent)res.sendStatus(503);else res.destroy();});
      req.on('aborted',()=>read.destroy());read.pipe(res);
    }catch(error){console.warn('[local-media] read failed:',String(error?.code||error?.message||'unknown').replace(/https?:\/\/\S+/g,'[private URL]').slice(0,180));if(!res.headersSent)res.sendStatus(403);else res.destroy();}
  }
  return { prefix, issue, decode, wrap, stream };
}
module.exports = { createLocalStudioMediaProxy };
