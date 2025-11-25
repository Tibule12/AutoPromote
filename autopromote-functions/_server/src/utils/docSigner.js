// docSigner.js - lightweight HMAC signing for critical documents (tamper detection)
const crypto = require('crypto');

const ALG = 'sha256';
const SECRET = process.env.DOC_SIGNING_SECRET || 'dev-doc-signing-secret-change';

function signPayload(obj) {
  const canonical = JSON.stringify(sorted(obj));
  return crypto.createHmac(ALG, SECRET).update(canonical).digest('hex');
}

function sorted(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sorted);
  return Object.keys(obj).sort().reduce((acc,k)=>{ acc[k]=sorted(obj[k]); return acc; }, {});
}

function attachSignature(doc) {
  const copy = { ...doc };
  delete copy._sig; // never include previous signature
  copy._sig = signPayload(copy);
  return copy;
}

function verifySignature(doc) {
  if (!doc || !doc._sig) return false;
  const sig = doc._sig;
  const copy = { ...doc };
  delete copy._sig;
  const expect = signPayload(copy);
  return timingSafeEq(sig, expect);
}

function timingSafeEq(a,b){
  try {
    const A = Buffer.from(a, 'utf8');
    const B = Buffer.from(b, 'utf8');
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A,B);
  } catch(_) { return false; }
}

module.exports = { attachSignature, verifySignature };