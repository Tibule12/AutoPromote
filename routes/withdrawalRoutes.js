const express = require('express');
const supabase = require('../supabaseClient');
const router = express.Router();
const authMiddleware = require('../authMiddleware');

// POST /api/withdrawals/request - User requests a withdrawal
// User requests a withdrawal (Wise or PayPal)
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { amount, currency, method, payout_details } = req.body; // method: 'wise' or 'paypal'
    const userId = req.userId;
    // Check user balance (implement your own logic)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance, email')
      .eq('id', userId)
      .single();
    if (userError || !user) {
      return res.status(400).json({ error: 'User not found' });
    }
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    // Create withdrawal request
    const { data, error } = await supabase
      .from('withdrawals')
      .insert([
        {
          user_id: userId,
          amount,
          currency: currency || 'USD',
          status: 'pending',
          method: method || 'wise',
          payout_details: payout_details || {},
        }
      ])
      .select();
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ message: 'Withdrawal request submitted', withdrawal: data[0] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Admin triggers payout (stub for Wise/PayPal integration)
router.post('/process/:id', authMiddleware, async (req, res) => {
  // TODO: Check admin role in production
  try {
    const withdrawalId = req.params.id;
    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawalId)
      .single();
    if (error || !withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    // Payout logic
    let payoutResult = null;
    if (withdrawal.method === 'wise') {
      // TODO: Integrate Wise API here
      // Example: Use axios or fetch to call Wise API with your WISE_API_KEY
      // Send payout to withdrawal.payout_details (bank info, email, etc.)
      // payoutResult = await sendWisePayout(withdrawal);
      payoutResult = { success: true, provider: 'wise', message: 'Stub: Wise payout sent.' };
    } else if (withdrawal.method === 'paypal') {
      // TODO: Integrate PayPal Payouts API here
      // Example: Use PayPal SDK or REST API with PAYPAL_CLIENT_ID/SECRET
      // Send payout to withdrawal.payout_details (PayPal email)
      // payoutResult = await sendPayPalPayout(withdrawal);
      payoutResult = { success: true, provider: 'paypal', message: 'Stub: PayPal payout sent.' };
    } else {
      return res.status(400).json({ error: 'Unsupported payout method' });
    }

    // Mark as paid if payoutResult.success
    if (payoutResult && payoutResult.success) {
      await supabase
        .from('withdrawals')
        .update({ status: 'paid', processed_at: new Date().toISOString() })
        .eq('id', withdrawalId);
      return res.json({ message: `Payout processed via ${payoutResult.provider}` });
    } else {
      // Optionally, mark as failed
      await supabase
        .from('withdrawals')
        .update({ status: 'failed', processed_at: new Date().toISOString() })
        .eq('id', withdrawalId);
      return res.status(500).json({ error: 'Payout failed', details: payoutResult });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/withdrawals/history - User views withdrawal history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ withdrawals: data });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
