const express = require('express');
// Use local src firebaseAdmin shim to avoid brittle relative path to backend copy
let db;
try { ({ db } = require('../firebaseAdmin')); } catch(_) { ({ db } = require('../../firebaseAdmin')); }

// Initialize Stripe only if key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found. Stripe Connect features will be disabled.');
}

const router = express.Router();
// Prefer local src middleware if available; fallback to backend copy for legacy structure
let authMiddleware;
try { authMiddleware = require('../authMiddleware'); } catch(_) { try { authMiddleware = require('../../authMiddleware'); } catch(e) { authMiddleware = (req,_res,next)=> next(); } }

// POST /api/withdrawals/onboard - Start Stripe Connect onboarding for user
router.post('/onboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.uid;
    // Create or retrieve Stripe account for user
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    let accountId = userData.stripeAccountId;
    
    if (!accountId) {
      // Create Stripe Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        email: userData.email,
        capabilities: { transfers: { requested: true } }
      });
      accountId = account.id;
      
      // Save to Firestore
      await userRef.update({ 
        stripeAccountId: accountId,
        updatedAt: new Date().toISOString()
      });
    }
    
    // Create Stripe onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: process.env.STRIPE_ONBOARD_REFRESH_URL,
      return_url: process.env.STRIPE_ONBOARD_RETURN_URL,
      type: 'account_onboarding',
    });
    
    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Stripe onboarding failed:', error);
    res.status(500).json({ error: 'Stripe onboarding failed', details: error.message });
  }
});

// GET /api/stripe/account/status - retrieve Stripe Connect account status & outstanding requirements
router.get('/account/status', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ ok:false, error: 'stripe_not_configured' });
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ ok:false, error: 'user_not_found' });
    const data = userDoc.data();
    if (!data.stripeAccountId) return res.json({ ok:true, onboarded:false, account:null, nextAction:'POST /api/stripe/onboard to start onboarding' });
    let account; try { account = await stripe.accounts.retrieve(data.stripeAccountId); } catch(e){ return res.status(400).json({ ok:false, error:'retrieve_failed', detail:e.message }); }
    const reqs = account.requirements || {};
    const currentlyDue = reqs.currently_due || [];
    const eventuallyDue = reqs.eventually_due || [];
    const pastDue = reqs.past_due || [];
    const disabledReason = reqs.disabled_reason || null;
    const chargesEnabled = !!account.charges_enabled;
    const payoutsEnabled = !!account.payouts_enabled;
    const pctComplete = (() => {
      const total = (new Set([...(eventuallyDue||[]), ...(currentlyDue||[])])).size || 1;
      const remaining = currentlyDue.length;
      return Math.max(0, Math.min(100, Math.round(100 - (remaining/total)*100)));
    })();
    return res.json({
      ok:true,
      onboarded:true,
      accountId: account.id,
      chargesEnabled,
      payoutsEnabled,
      disabledReason,
      pctComplete,
      requirements: {
        currentlyDue,
        eventuallyDue,
        pastDue,
        pendingVerification: reqs.pending_verification || []
      },
      nextAction: !chargesEnabled || !payoutsEnabled ? 'Complete outstanding requirements in Stripe onboarding' : 'Ready'
    });
  } catch (e) {
    console.error('[stripe][status] error', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// POST /api/stripe/account/login-link - generate a fresh Express dashboard link (helpful while waiting for manual review)
router.post('/account/login-link', authMiddleware, async (req, res) => {
  try {
    if (!stripe) return res.status(400).json({ ok:false, error: 'stripe_not_configured' });
    const userId = req.user.uid;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data().stripeAccountId) return res.status(404).json({ ok:false, error: 'account_not_onboarded' });
    const accountId = userDoc.data().stripeAccountId;
    const login = await stripe.accounts.createLoginLink(accountId, {
      redirect_url: process.env.STRIPE_ONBOARD_RETURN_URL
    });
    return res.json({ ok:true, url: login.url, expires_at: login.expires_at });
  } catch (e) {
    console.error('[stripe][login-link] error', e);
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// NOTE: While Stripe reviews account data, you can poll /api/stripe/account/status client-side every few minutes
// and show a progress UI using pctComplete + currentlyDue. This enables users to supply missing info proactively.


module.exports = router;
