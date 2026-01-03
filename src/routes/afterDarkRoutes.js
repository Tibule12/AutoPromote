const express = require('express');
const router = express.Router();
const { createShow, getShow, listShows, updateShow, deleteShow } = require('../models/afterDarkModel');

// All routes under /afterdark are expected to be mounted behind authMiddleware and requireAdultAccess

// GET /afterdark/ - list adult shows (paginated)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const offset = parseInt(req.query.offset || '0', 10) || 0;
    const shows = await listShows({ limit, offset });
    return res.json({ success: true, shows });
  } catch (e) {
    console.error('AfterDark list error', e && e.message);
    return res.status(500).json({ error: 'Failed to list shows' });
  }
});

// GET /afterdark/show/:id - fetch a single show
router.get('/show/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const show = await getShow(id);
    if (!show) return res.status(404).json({ error: 'Show not found' });
    return res.json({ success: true, show });
  } catch (e) {
    console.error('AfterDark get show error', e && e.message);
    return res.status(500).json({ error: 'Failed to fetch show' });
  }
});

// POST /afterdark/show - create a new show (performer with KYC/verified only)
router.post('/show', async (req, res) => {
  try {
    // req.userRecord is attached by requireAdultAccess middleware and contains kycVerified
    const user = req.userRecord || req.user;
    if (!user || !user.uid) return res.status(401).json({ error: 'Authentication required' });

    // Require KYC verified or explicit creator flag
    const isKyc = !!user.kycVerified;
    const canCreate = isKyc || (user.role && (user.role === 'performer' || user.role === 'creator'));
    if (!canCreate) return res.status(403).json({ error: 'Performer KYC required to create AfterDark shows' });

    const payload = {
      title: (req.body && req.body.title) || 'Untitled AfterDark show',
      description: (req.body && req.body.description) || '',
      userId: user.uid,
      isAdult: true,
      metadata: (req.body && req.body.metadata) || {},
      status: (req.body && req.body.status) || 'draft',
    };

    const created = await createShow(payload);
    return res.status(201).json({ success: true, show: created });
  } catch (e) {
    console.error('AfterDark create error', e && e.message);
    return res.status(500).json({ error: 'Failed to create show' });
  }
});

// PATCH /afterdark/show/:id - update show (owner or admin)
router.patch('/show/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getShow(id);
    if (!existing) return res.status(404).json({ error: 'Show not found' });

    const user = req.userRecord || req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const isAdmin = user.role === 'admin' || user.isAdmin === true;
    const isOwner = existing.userId === user.uid;
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized to update show' });

    const patch = {};
    if (req.body.title) patch.title = req.body.title;
    if (req.body.description) patch.description = req.body.description;
    if (req.body.status) patch.status = req.body.status;
    if (req.body.metadata) patch.metadata = req.body.metadata;

    const updated = await updateShow(id, patch);
    return res.json({ success: true, show: updated });
  } catch (e) {
    console.error('AfterDark update error', e && e.message);
    return res.status(500).json({ error: 'Failed to update show' });
  }
});

// DELETE /afterdark/show/:id - delete show (owner or admin)
router.delete('/show/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getShow(id);
    if (!existing) return res.status(404).json({ error: 'Show not found' });

    const user = req.userRecord || req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const isAdmin = user.role === 'admin' || user.isAdmin === true;
    const isOwner = existing.userId === user.uid;
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized to delete show' });

    const ok = await deleteShow(id);
    if (!ok) return res.status(500).json({ error: 'Failed to delete show' });
    return res.json({ success: true });
  } catch (e) {
    console.error('AfterDark delete error', e && e.message);
    return res.status(500).json({ error: 'Failed to delete show' });
  }
});

module.exports = router;
