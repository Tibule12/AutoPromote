const runtime = require('./runtime');
const { digest } = require('../unifiedCredits/workerVerification');
const { fail } = require('../unifiedCredits/policy');
let transportInstalled = false;
function installPublicationTransport() {
  if (transportInstalled) return;
  transportInstalled = true;
  require('axios').interceptors.request.use(config => {
    const p = runtime.current()?.publication;
    if (!p) return config;
    if (p.signal.aborted || Date.now() >= p.deadline) fail('PUBLICATION_DEADLINE', 504);
    p.requests++;
    if (p.requests > 32) fail('PUBLICATION_REQUEST_LIMIT', 429);
    config.signal = config.signal ? AbortSignal.any([config.signal,p.signal]) : p.signal;
    config.timeout = Math.min(config.timeout || 90000, p.deadline - Date.now());
    config.maxBodyLength = Math.min(config.maxBodyLength > 0 ? config.maxBodyLength : p.maxBytes, p.maxBytes);
    config.maxContentLength = Math.min(config.maxContentLength > 0 ? config.maxContentLength : 1024 ** 2, 1024 ** 2);
    if (!['GET','HEAD'].includes(String(config.method || 'GET').toUpperCase()) &&
        !/oauth|\/token(?:\?|$|\/)/i.test(config.url || '')) p.dispatched = true;
    return config;
  });
}
async function withPublication({ uid, taskId, contentId, platform, payload, legacySignedTask = false }, publish) {
  if (!runtime.enabled() || runtime.current()?.publication) return publish();
  installPublicationTransport();
  if (!uid || !contentId) fail('PUBLICATION_OWNER_REQUIRED', 403);
  const service = runtime.service();
  const requestId = 'publication-' + (taskId || digest([uid, platform, contentId, payload]));
  const fingerprint = digest({ uid, contentId, platform, payload });
  const mediaUrl = payload?.fileUrl || payload?.videoUrl || payload?.url;
  let sourceBytes = mediaUrl ? 500 * 1024 ** 2 : 0;
  if (mediaUrl) {
    try {
      const response = await require('../../utils/ssrfGuard').safeFetch(mediaUrl, require('node-fetch'),
        { requireHttps: true, fetchOptions: { method: 'HEAD', signal: AbortSignal.timeout(10000) } });
      const length = Number(response.headers.get('content-length'));
      if (response.ok && Number.isSafeInteger(length) && length > 0) sourceBytes = length;
    } catch { /* Retain the existing maximum source-size reservation. */ }
  }
  const profileId = sourceBytes <= 64 * 1024 ** 2 ? 'publication-small' : 'publication-large';
  const q = service.quote('publisher.publish', profileId);
  const reservation = await service.reserve(uid, { operation: 'publisher.publish', profileId, requestId, fingerprint,
    approvedTokens: legacySignedTask ? 0 : q.tokens, legacyCashOnly: legacySignedTask });
  const db = require('../../firebaseAdmin').db;
  const receipt = db.collection('processing_publication_receipts').doc(digest([uid, requestId]));
  if (reservation.duplicate) {
    const saved = (await receipt.get()).data();
    if (saved?.success) {
      if (reservation.state !== 'settled') await service.settle(uid,requestId,{
        eventId:digest([requestId,'confirmed']),success:true,
        actualMicros:Number.isSafeInteger(saved.estimatedMicros)?saved.estimatedMicros:q.maxMicros,
        consumedTokens:saved.outcome?.duplicate?0:undefined,stopped:true,
      });
      return saved.outcome;
    }
    // The provider might have accepted a lost response. Preserve the existing
    // native provider receipt/recovery instead of submitting another post.
    fail('PUBLICATION_UNCONFIRMED', 409);
  }
  await service.start(uid, requestId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), q.maxSeconds * 1000);
  const publication = { requestId, signal: controller.signal, maxBytes: profileId === 'publication-small' ? 128 * 1024 ** 2 : 1024 ** 3,
    bytes: 0, requests: 0, dispatched: false, deadline: Date.now() + q.maxSeconds * 1000 };
  publication.prepareMedia = async value => {
    if (!value || typeof value !== 'string') return value;
    let url;
    try { url = new URL(value); } catch { return value; }
    const bucket = require('../../firebaseAdmin').storage.bucket();
    let name;
    if (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/'+bucket.name+'/'))
      name = decodeURIComponent(url.pathname.slice(bucket.name.length+2));
    if (url.hostname === 'firebasestorage.googleapis.com' && url.pathname.startsWith('/v0/b/'+bucket.name+'/o/'))
      name = decodeURIComponent(url.pathname.slice(('/v0/b/'+bucket.name+'/o/').length));
    if (!name) return value; // Existing external sources keep their bounded transport.
    const file = bucket.file(name);
    const [metadata] = await file.getMetadata();
    const content = (await db.collection('content').doc(contentId).get()).data();
    const owners = [content?.user_id,content?.userId,content?.uid].filter(Boolean);
    if (metadata.metadata?.ownerUid !== uid && !(owners.length && owners.every(owner=>owner===uid)))
      fail('PUBLICATION_OWNER_REQUIRED',403);
    return require('./mediaDelivery').urlFor(file,{budgetId:digest([uid,requestId,'provider-source']),userId:uid,
      maxBytes:Math.floor(publication.maxBytes/2)});
  };
  let confirmedReceiptSaved = false;
  try {
    await service.authorizeDispatch(uid, requestId);
    const outcome = await runtime.context.run({ uid, service, reservation, publication,
      boundedWorker: { enforcesCostBound: true } }, publish);
    if (outcome?.success === false) fail('PUBLICATION_FAILED', 502);
    // Actual provider processing is free. This estimates our bounded transfer
    // and control-plane exposure; it is not an attributed provider invoice.
    const cost = publication.bytes ? Math.min(q.maxMicros, Math.ceil(publication.bytes * 300000 / 1024 ** 3) + 1000)
      : publication.dispatched ? q.maxMicros : 1000;
    await receipt.create({ userId: uid, requestId, success: true, outcome, estimatedMicros:cost,
      bytes:publication.bytes,completedAt: new Date().toISOString() });
    confirmedReceiptSaved = true;
    await service.settle(uid, requestId, { eventId: digest([requestId, 'confirmed']),
      success: true, actualMicros: cost, consumedTokens: outcome?.duplicate ? 0 : undefined, stopped: true });
    return outcome;
  } catch (error) {
    controller.abort();
    if (confirmedReceiptSaved) {
      error.code='PUBLICATION_RECONCILIATION_PENDING';error.errorClass='publication_unconfirmed';
      throw error;
    }
    const actualMicros = publication.dispatched ? q.maxMicros : 0;
    await service.settle(uid, requestId, { eventId: digest([requestId, 'unconfirmed']),
      success: false, actualMicros, stopped: true });
    if (publication.dispatched) {
      error.code = 'PUBLICATION_UNCONFIRMED';
      error.errorClass = 'publication_unconfirmed';
      error.publicationUnconfirmed = true;
    }
    throw error;
  } finally { clearTimeout(timeout); controller.abort(); }
}
module.exports = { withPublication };
