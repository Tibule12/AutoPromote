// Private byte-limited delivery for newly funded outputs/publications. Existing
// legacy links remain valid. A signature is checked before any database read.
const crypto = require('node:crypto');
const { fail } = require('../unifiedCredits/policy');
const exhausted = new Map();
function signingKey() {
  const key = process.env.DOC_SIGNING_SECRET || require('../../../firebaseConfig.server').private_key;
  if (!key) fail('MEDIA_DELIVERY_KEY_REQUIRED', 503);
  return key;
}
const sign = text => crypto.createHmac('sha256', signingKey()).update('processing-media-v1:' + text).digest('base64url');
function readCapability(cap) {
  if(typeof cap!=='string'||cap.length>8000)fail('SOURCE_FORBIDDEN',403);
  const [payload,signature,extra]=cap.split('.');const expected=sign(payload||'');
  if(extra||!signature||signature.length!==expected.length||
      !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))fail('SOURCE_FORBIDDEN',403);
  const data=JSON.parse(Buffer.from(payload,'base64url'));
  if(data.exp<Date.now()||!Number.isSafeInteger(data.size)||data.size<1)fail('TRANSFER_EXPIRED',410);
  return data;
}
async function workerSources(value,userId,options={}) {
  options.seen ||= new Map();
  if(Array.isArray(value))return Promise.all(value.map(v=>workerSources(v,userId,options)));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value)
    .map(async([key,v])=>[key,await workerSources(v,userId,options)])));
  if(typeof value!=='string'||!value.startsWith('https://'))return value;
  let url;try{url=new URL(value);}catch{return value;}
  if(!['api.autopromote.org','autopromote.onrender.com'].includes(url.hostname)||
      !url.pathname.startsWith('/api/processing-media/')) {
    // Firebase's fine-grained bucket does not automatically give the native
    // worker read access to browser-uploaded objects. Grant only an admitted,
    // owner-proven source object; never change the bucket's default/public ACL.
    if(!options.serviceAccount)return value;
    const bucket=require('../../firebaseAdmin').storage.bucket();
    let object;
    const prefix='/'+bucket.name+'/';
    if(url.hostname==='storage.googleapis.com'&&url.pathname.startsWith(prefix))object=decodeURIComponent(url.pathname.slice(prefix.length));
    if(url.hostname==='firebasestorage.googleapis.com'&&url.pathname.startsWith('/v0/b/'+bucket.name+'/o/'))object=decodeURIComponent(url.pathname.split('/o/')[1]);
    if(!object)return value;
    const cacheKey=bucket.name+'/'+object;
    if(!options.seen.has(cacheKey))options.seen.set(cacheKey,(async()=>{
      const original=bucket.file(object),[meta]=await original.getMetadata();
      if(url.searchParams.has('generation')&&url.searchParams.get('generation')!==String(meta.generation))fail('SOURCE_GENERATION_CHANGED',409);
      const owned=meta.metadata?.ownerUid===userId||meta.metadata?.userId===userId||object.split('/').includes(userId);
      const file=bucket.file(object,{generation:String(meta.generation)});
      const entity='user-'+options.serviceAccount;
      const [acl]=await file.acl.get();
      if(!owned){
        if(acl.some(a=>['allUsers','allAuthenticatedUsers'].includes(a.entity)&&['OWNER','READER'].includes(a.role)))return value;
        fail('SOURCE_FORBIDDEN',403);
      }
      if(!acl.some(a=>[entity,'allUsers','allAuthenticatedUsers'].includes(a.entity)&&['OWNER','READER'].includes(a.role)))
        await file.acl.add({entity,role:'READER'});
      return (await file.getSignedUrl({action:'read',expires:Date.now()+30*60000,
        queryParams:{generation:String(meta.generation)}}))[0];
    })());
    return options.seen.get(cacheKey);
  }
  const data=readCapability(url.pathname.slice('/api/processing-media/'.length));
  if(data.uid!==userId)fail('SOURCE_FORBIDDEN',403);
  const file=require('../../firebaseAdmin').storage.bucket(data.bucket).file(data.path);
  return workerSources((await file.getSignedUrl({action:'read',expires:Date.now()+30*60000,
    queryParams:{generation:data.generation}}))[0],userId,options);
}
async function reserveBytes(id, bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 1) fail('INVALID_TRANSFER_SIZE', 400);
  if ((exhausted.get(id) || 0) > Date.now()) fail('TRANSFER_ALLOWANCE_REACHED', 429);
  const db = require('../../firebaseAdmin').db;
  const ref = db.collection('processing_transfer_budgets').doc(id);
  let denied = false;
  await db.runTransaction(async tx => {
    const value = (await tx.get(ref)).data();
    if (!value || value.expiresAt < Date.now()) fail('TRANSFER_EXPIRED', 410);
    if (value.usedBytes + bytes > value.maxBytes) { denied = true; return; }
    tx.update(ref, { usedBytes: value.usedBytes + bytes });
  });
  if (denied) {
    if (exhausted.size > 5000) exhausted.clear();
    exhausted.set(id, Date.now() + 3600000);
    fail('TRANSFER_ALLOWANCE_REACHED', 429);
  }
}
async function createBudget(id, userId, maxBytes, allowIncrease = false) {
  const db = require('../../firebaseAdmin').db;
  const ref = db.collection('processing_transfer_budgets').doc(id);
  await db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    if (previous.exists) {
      if (previous.data().userId !== userId || (previous.data().maxBytes !== maxBytes &&
          !(allowIncrease && previous.data().maxBytes < maxBytes)))
        fail('TRANSFER_BINDING_CONFLICT', 403);
      if(allowIncrease && previous.data().maxBytes < maxBytes) tx.update(ref,{maxBytes});
      return;
    }
    tx.create(ref, { userId, maxBytes, usedBytes: 0, expiresAt: Date.now() + 6 * 86400000 });
  });
}
async function urlFor(file, { budgetId, userId, maxBytes = 256 * 1024 ** 2, download = false, allowIncrease = false }) {
  const [meta] = await file.getMetadata();
  await createBudget(budgetId, userId, maxBytes, allowIncrease);
  const payload = Buffer.from(JSON.stringify({ id: budgetId, uid: userId, bucket: file.bucket.name,
    path: file.name, generation: String(meta.generation), size: Number(meta.size), type: meta.contentType,
    attachment: download, exp: Date.now() + 6 * 86400000 })).toString('base64url');
  const origin = process.env.PROCESSING_PUBLIC_API_ORIGIN || process.env.PUBLIC_API_URL || 'https://api.autopromote.org';
  return `${origin}/api/processing-media/${payload}.${sign(payload)}`;
}
async function ownedOutputUrl(file, userId, jobId, download = false) {
  if (!require('./runtime').enabled()) return null;
  const job = (await require('../../firebaseAdmin').db.collection('video_edits').doc(jobId).get()).data();
  if (!job?.processingBindingId) return null;
  if (job.userId !== userId) fail('SOURCE_FORBIDDEN', 403);
  return urlFor(file, { budgetId: job.processingBindingId, userId, download, allowIncrease:true });
}
function router() {
  const express = require('express');
  const route = express.Router();
  route.get('/:cap', async (req, res) => {
    try {
      const cap = String(req.params.cap || '');
      if (cap.length > 8000) return res.sendStatus(403);
      const [payload, signature] = cap.split('.');
      const expected = sign(payload || '');
      if (!signature || signature.length !== expected.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.sendStatus(403);
      const data = JSON.parse(Buffer.from(payload, 'base64url'));
      if (data.exp < Date.now() || !Number.isSafeInteger(data.size) || data.size < 1) return res.sendStatus(410);
      let start = 0, end = data.size - 1;
      if (req.get('Range')) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.get('Range'));
        if (!range) return res.sendStatus(416);
        start = Number(range[1]); end = Math.min(range[2] ? Number(range[2]) : end, end);
        if (start > end) return res.sendStatus(416);
        res.status(206).set('Content-Range', `bytes ${start}-${end}/${data.size}`);
      }
      res.set({ 'Content-Type': data.type || 'application/octet-stream', 'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' });
      if (data.attachment) res.set('Content-Disposition', 'attachment; filename="' + data.path.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '-') + '"');
      if (req.method === 'HEAD') return res.end();
      await reserveBytes(data.id, end - start + 1);
      const file = require('../../firebaseAdmin').storage.bucket(data.bucket).file(data.path, { generation: data.generation });
      const source = file.createReadStream({ start, end, validation: false });
      res.once('close', () => source.destroy());
      source.once('error', () => res.destroy());
      source.pipe(res);
    } catch (error) {
      if (!res.headersSent) res.status(error.status || 503).json({ error: error.code || 'MEDIA_TRANSFER_UNAVAILABLE' });
      else res.destroy();
    }
  });
  return route;
}
module.exports = { router, urlFor, ownedOutputUrl, createBudget, reserveBytes, readCapability, workerSources };
