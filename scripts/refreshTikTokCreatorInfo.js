#!/usr/bin/env node
/*
Refresh TikTok creator_info and persist display_name for connections.
Usage:
  # dry run (default)
  node scripts/refreshTikTokCreatorInfo.js --project autopromote-cc6d3 --limit 100

  # apply changes
  node scripts/refreshTikTokCreatorInfo.js --project autopromote-cc6d3 --limit 100 --apply

Notes:
- Requires Firestore access (Application Default Credentials or service account).
- Safe to run as dry-run first. Writes only when --apply is passed.
*/

const path = require('path');
const { admin, db } = require('../src/firebaseAdmin');
const { tokensFromDoc } = require('../src/services/connectionTokenUtils');
const { safeFetch } = require('../src/utils/ssrfGuard');

async function main() {
  const argv = require('minimist')(process.argv.slice(2));
  const project = argv.project || process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT_ID || 'autopromote-cc6d3';
  const apply = argv.apply === true || argv.apply === 'true';
  const limit = parseInt(argv.limit || '0', 10) || 0;
  const batchSize = parseInt(argv.batch || '100', 10) || 100;

  console.log(`Project: ${project}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  if (!apply) console.log('No writes will be performed. Run with --apply to persist changes.');

  const firestore = db; // db() in firebaseAdmin shim is a function but we export db in production as instance

  // Use collectionGroup to find all connections, fallback to scanning users if needed
  let candidates = [];
  try {
    console.log('Scanning collectionGroup("connections")');
    const snap = await firestore.collectionGroup('connections').get();
    snap.forEach(d => {
      try {
        const data = d.data();
        if (data && (data.provider === 'tiktok' || d.id === 'tiktok' || data.open_id || data.scope)) {
          candidates.push({ path: d.ref.path, ref: d.ref, data });
        }
      } catch (e) {
        // ignore
      }
    });
  } catch (e) {
    console.warn('collectionGroup failed, falling back to scanning users collection:', e && e.message ? e.message : e);
    const users = await firestore.collection('users').get();
    for (const u of users.docs) {
      const uid = u.id;
      const conns = await firestore.collection('users').doc(uid).collection('connections').get();
      for (const c of conns.docs) {
        const data = c.data();
        if (data && (data.provider === 'tiktok' || c.id === 'tiktok' || data.open_id || data.scope)) {
          candidates.push({ path: c.ref.path, ref: c.ref, data });
        }
      }
    }
  }

  console.log('Found', candidates.length, 'connection docs');
  if (limit && candidates.length > limit) candidates = candidates.slice(0, limit);

  let toUpdate = [];
  for (const c of candidates) {
    const { ref, data, path } = c;
    // Skip if display_name already present
    const hasDisplayName = data.display_name || (data.meta && data.meta.display_name) || false;
    if (hasDisplayName) continue;

    // Check for tokens / access token
    const tokens = tokensFromDoc(data) || (data.tokens && typeof data.tokens === 'object' ? data.tokens : null);
    const accessToken = tokens && typeof tokens.access_token === 'string' && tokens.access_token.length > 0 ? tokens.access_token : null;
    if (!accessToken) {
      console.log('[skip] no access token for', path);
      continue;
    }

    // Attempt to fetch creator_info from TikTok
    try {
      const infoRes = await safeFetch('https://open.tiktokapis.com/v2/creator/info/', fetch, {
        fetchOptions: { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, timeout: 5000 },
        requireHttps: true,
        allowHosts: ['open.tiktokapis.com'],
      });
      if (!infoRes.ok) {
        console.log('[warn] provider returned non-ok for', path, 'status', infoRes.status);
        continue;
      }
      const infoJson = await infoRes.json().catch(() => null);
      const displayName = (infoJson && (infoJson.data?.display_name || infoJson.data?.user?.display_name)) || null;
      if (!displayName) {
        console.log('[skip] no display_name returned for', path);
        continue;
      }
      const mapped = {
        display_name: displayName,
        privacy_level_options: (infoJson && infoJson.data && infoJson.data.privacy_level_options) || undefined,
        interactions: (infoJson && infoJson.data && infoJson.data.interactions) || undefined,
        max_video_post_duration_sec: (infoJson && infoJson.data && infoJson.data.max_video_post_duration_sec) || undefined,
      };
      toUpdate.push({ ref, path, mapped });
      console.log('[ok] will update', path, '=>', displayName);
      if (batchSize && toUpdate.length >= batchSize) break;
    } catch (e) {
      console.warn('[error] failed to fetch for', path, e && e.message ? e.message : e);
      if (argv.continue === 'false') break;
    }
  }

  console.log('Candidates to update:', toUpdate.length);
  if (!apply) {
    for (const u of toUpdate) console.log('[dry-run] would update', u.path, 'with', u.mapped.display_name);
    console.log('Dry-run complete. Re-run with --apply to persist.');
    process.exit(0);
  }

  // Apply updates
  let applied = 0;
  for (const u of toUpdate) {
    try {
      await u.ref.update({ display_name: u.mapped.display_name, creator_info: u.mapped, updatedAt: new Date().toISOString() });
      console.log('[applied] updated', u.path);
      applied++;
    } catch (e) {
      console.warn('[error] failed to write for', u.path, e && e.message ? e.message : e);
    }
  }

  console.log(`Applied ${applied}/${toUpdate.length} updates`);
  console.log('Done');
  process.exit(0);
}

main().catch(e => { console.error('Fatal error', e && e.message ? e.message : e); process.exit(2); });
