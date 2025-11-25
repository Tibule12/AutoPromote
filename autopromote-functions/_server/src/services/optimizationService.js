// optimizationService.js - Placeholder AI/variant optimization service
// Generates simple message variants and records optimization events.
const { db, admin } = require('../firebaseAdmin');

function generateVariants(base, { hashtags = [], max = 3 } = {}) {
  const variants = [];
  const clean = (base||'New content').slice(0,240);
  const tagStr = hashtags.length ? ' ' + hashtags.slice(0,3).map(t=>`#${t.replace(/[^a-z0-9_]/gi,'')}`).join(' ') : '';
  variants.push(clean + tagStr);
  if (clean.length > 50) variants.push(clean.slice(0,50) + '…' + tagStr);
  variants.push('🔥 ' + clean + tagStr);
  return variants.slice(0,max);
}

async function recordOptimization({ contentId, uid, strategy, input, output }) {
  try {
    await db.collection('events').add({
      type: 'optimization_run',
      contentId: contentId || null,
      uid: uid || null,
      strategy: strategy || 'simple_variants',
      input: input ? { len: JSON.stringify(input).length } : null,
      variants: output,
      createdAt: new Date().toISOString()
    });
  } catch(_){}
}

async function getOrGenerateVariants({ contentId, uid, baseMessage, tags }) {
  const variants = generateVariants(baseMessage, { hashtags: tags });
  await recordOptimization({ contentId, uid, strategy: 'simple_variants', input: { baseMessage, tags }, output: variants });
  return variants;
}

module.exports = { generateVariants, getOrGenerateVariants };
