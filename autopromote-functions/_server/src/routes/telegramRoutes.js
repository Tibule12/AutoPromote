// Telegram OAuth and Bot API integration
const express = require('express');
const router = express.Router();
const authMiddleware = require('../authMiddleware');
const { admin, db } = require('../firebaseAdmin');
const { rateLimiter } = require('../middlewares/globalRateLimiter');
const telegramService = require('../services/telegramService');
let codeqlLimiter;
try { codeqlLimiter = require('../middlewares/codeqlRateLimit'); } catch(_) { codeqlLimiter = null; }

// Rate limiters for Telegram routes
const tgPublicLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TG_PUBLIC || '120', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '10'), windowHint: 'telegram_public' });
const tgWriteLimiter = rateLimiter({ capacity: parseInt(process.env.RATE_LIMIT_TG_WRITES || '60', 10), refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || '5'), windowHint: 'telegram_writes' });

// Apply public limiter at router level
router.use((req, res, next) => tgPublicLimiter(req, res, next));
if (codeqlLimiter && codeqlLimiter.writes) {
	router.use(codeqlLimiter.writes);
}

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'AutoPromoteBot';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://www.autopromote.org';

/**
 * GET /api/telegram/auth/start
 * Returns HTML page with Telegram Login Widget for OAuth
 */
router.get('/auth/start', authMiddleware, (req, res) => {
	const uid = req.user.uid;
	
	if (!BOT_TOKEN || !BOT_USERNAME) {
		return res.status(500).json({ 
			error: 'telegram_not_configured',
			missing: !BOT_TOKEN ? ['TELEGRAM_BOT_TOKEN'] : ['TELEGRAM_BOT_USERNAME']
		});
	}
	
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Connect Telegram - AutoPromote</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body { 
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 20px;
		}
		.container {
			background: white;
			border-radius: 16px;
			box-shadow: 0 20px 60px rgba(0,0,0,0.3);
			padding: 48px 40px;
			max-width: 500px;
			width: 100%;
			text-align: center;
		}
		.logo {
			width: 80px;
			height: 80px;
			background: #0088cc;
			border-radius: 50%;
			margin: 0 auto 24px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 40px;
		}
		h1 {
			color: #1a202c;
			font-size: 28px;
			margin-bottom: 12px;
			font-weight: 700;
		}
		p {
			color: #718096;
			font-size: 16px;
			line-height: 1.6;
			margin-bottom: 32px;
		}
		.widget-container {
			display: flex;
			justify-content: center;
			margin: 32px 0;
		}
		.back-btn {
			display: inline-block;
			margin-top: 24px;
			padding: 12px 24px;
			background: #f7fafc;
			color: #4a5568;
			text-decoration: none;
			border-radius: 8px;
			font-weight: 500;
			transition: all 0.2s;
		}
		.back-btn:hover {
			background: #edf2f7;
			transform: translateY(-1px);
		}
		.status {
			margin-top: 24px;
			padding: 16px;
			border-radius: 8px;
			background: #f7fafc;
			color: #4a5568;
			font-size: 14px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="logo">📱</div>
		<h1>Connect your Telegram</h1>
		<p>Click the button below to authenticate with Telegram and enable posting to your account.</p>
		
		<div class="widget-container">
			<script async src="https://telegram.org/js/telegram-widget.js?22" 
				data-telegram-login="${BOT_USERNAME}" 
				data-size="large" 
				data-onauth="onTelegramAuth(user)" 
				data-request-access="write">
			</script>
		</div>
		
		<div id="status" class="status" style="display:none;">Processing...</div>
		
		<a href="${DASHBOARD_URL}/dashboard" class="back-btn">← Back to Dashboard</a>
	</div>
	
	<script>
		function onTelegramAuth(user) {
			const status = document.getElementById('status');
			status.style.display = 'block';
			status.textContent = 'Verifying Telegram authentication...';
			
			fetch('/api/telegram/auth/callback', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ${req.user.token || ''}'
				},
				body: JSON.stringify({ authData: user, uid: '${uid}' })
			})
			.then(res => res.json())
			.then(data => {
				if (data.success) {
					status.style.background = '#c6f6d5';
					status.style.color = '#22543d';
					status.textContent = '✓ Telegram connected successfully! Redirecting...';
					setTimeout(() => {
						window.location.href = '${DASHBOARD_URL}/dashboard?telegram=connected';
					}, 1500);
				} else {
					status.style.background = '#fed7d7';
					status.style.color = '#742a2a';
					status.textContent = '✗ Connection failed: ' + (data.error || 'Unknown error');
				}
			})
			.catch(err => {
				status.style.background = '#fed7d7';
				status.style.color = '#742a2a';
				status.textContent = '✗ Connection error: ' + err.message;
			});
		}
	</script>
</body>
</html>`;
	
	res.send(html);
});

/**
 * POST /api/telegram/auth/callback
 * Verify Telegram auth data and store connection
 */
router.post('/auth/callback', authMiddleware, tgWriteLimiter, async (req, res) => {
	try {
		const uid = req.user.uid;
		const { authData } = req.body;
		
		if (!authData || !authData.id || !authData.hash) {
			return res.status(400).json({ 
				success: false, 
				error: 'missing_auth_data' 
			});
		}
		
		// Verify the auth data came from Telegram
		const isValid = telegramService.verifyTelegramAuth(authData);
		
		if (!isValid) {
			return res.status(401).json({ 
				success: false, 
				error: 'invalid_telegram_auth' 
			});
		}
		
		// Store the connection
		const result = await telegramService.storeTelegramAuth(uid, authData);
		
		res.json(result);
	} catch (error) {
		console.error('Telegram auth callback error:', error);
		res.status(500).json({ 
			success: false, 
			error: error.message || 'auth_failed' 
		});
	}
});

/**
 * GET /api/telegram/status
 * Check if user has connected Telegram
 */
router.get('/status', authMiddleware, async (req, res) => {
	try {
		const uid = req.user.uid;
		const connection = await telegramService.getUserTelegramConnection(uid);
		
		if (!connection) {
			return res.json({ 
				connected: false,
				platform: 'telegram'
			});
		}
		
		res.json({
			connected: true,
			platform: 'telegram',
			userId: connection.userId,
			username: connection.username,
			firstName: connection.firstName,
			lastName: connection.lastName,
			photoUrl: connection.photoUrl,
			connectedAt: connection.connectedAt
		});
	} catch (error) {
		console.error('Telegram status error:', error);
		res.status(500).json({ 
			connected: false, 
			error: error.message 
		});
	}
});

/**
 * DELETE /api/telegram/disconnect
 * Disconnect Telegram account
 */
router.delete('/disconnect', authMiddleware, tgWriteLimiter, async (req, res) => {
	try {
		const uid = req.user.uid;
		
		await db.collection('users')
			.doc(uid)
			.collection('connections')
			.doc('telegram')
			.delete();
		
		res.json({ 
			success: true, 
			message: 'Telegram disconnected' 
		});
	} catch (error) {
		console.error('Telegram disconnect error:', error);
		res.status(500).json({ 
			success: false, 
			error: error.message 
		});
	}
});

/**
 * POST /api/telegram/webhook
 * Webhook endpoint for Telegram bot updates
 */
router.post('/webhook', async (req, res) => {
	try {
		// Verify webhook secret if configured
		const secret = req.headers['x-telegram-bot-api-secret-token'];
		if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
			return res.status(401).json({ error: 'invalid_webhook_secret' });
		}
		
		const update = req.body;
		
		// Log webhook received
		console.log('Telegram webhook received:', {
			updateId: update.update_id,
			message: update.message ? 'present' : 'none',
			chatId: update.message?.chat?.id
		});
		
		// Handle different update types
		if (update.message) {
			const chatId = update.message.chat.id;
			const text = update.message.text;
			
			// Handle /start command
			if (text === '/start') {
				// You can send a welcome message or instructions
				console.log(`New chat started with ID: ${chatId}`);
			}
		}
		
		// Always respond 200 to acknowledge receipt
		res.json({ ok: true });
	} catch (error) {
		console.error('Telegram webhook error:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * POST /api/telegram/test-message
 * Test endpoint to send a message via bot (for testing)
 */
router.post('/test-message', authMiddleware, tgWriteLimiter, async (req, res) => {
	try {
		const uid = req.user.uid;
		const { message } = req.body;
		
		const result = await telegramService.postToTelegram({
			uid,
			payload: { message: message || 'Test message from AutoPromote!' }
		});
		
		res.json(result);
	} catch (error) {
		console.error('Telegram test message error:', error);
		res.status(500).json({ 
			success: false, 
			error: error.message 
		});
	}
});

module.exports = router;
