const { verifyKey } = require('discord-interactions');
const axios = require('axios');

// Handle slash commands and ping events from Discord
async function handleDiscordInteractions(req, res) {
    const { type, data } = req.body || {};

    if (type === 1) {
        return res.status(200).json({ type: 1 });
    }

    if (type === 2 && data) {
        const { name } = data;

        if (name === 'hello') {
            return res.status(200).json({
                type: 4,
                data: { content: 'Hello from AutoPromote!' }
            });
        }
    }

    return res.status(404).send('Unknown interaction type');
}

async function handleDiscordLinkedRoles(req, res) {
    const { code } = req.query;

    // 1. If there is no code, redirect the user to Discord's authorization URL.
    if (!code) {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const redirectUri = process.env.DISCORD_REDIRECT_URI;
        if (clientId && redirectUri) {
            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20role_connections.write`;
            return res.redirect(authUrl);
        }
        return res.status(500).send('Discord client ID or redirect URI is not configured.');
    }

    // 2. If a code is present, exchange it for an access token.
    try {
        const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI,
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token } = tokenResponse.data;

        // 3. Use the access token to update the user's metadata for the linked role.
        // This is where you would set metadata based on your application's logic.
        // For this example, we'll set a `verified` flag and the current date.
        await axios.put(
            `https://discord.com/api/v10/users/@me/applications/${process.env.DISCORD_CLIENT_ID}/role-connection`,
            {
                platform_name: 'AutoPromote',
                platform_username: 'Your AutoPromote Username', // Replace with actual username from your DB
                metadata: {
                    verified: 1, // 1 for true, 0 for false
                    last_updated: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        // 4. Respond to the user.
        return res.status(200).send('Successfully linked your Discord account! You can now close this window.');

    } catch (error) {
        console.error('Error in Discord OAuth2 flow:', error.response ? error.response.data : error.message);
        return res.status(500).send('An error occurred while linking your Discord account.');
    }
}

function verifyDiscordRequest(clientKey) {
    return (req, res, next) => {
        const signature = req.get('X-Signature-Ed25519');
        const timestamp = req.get('X-Signature-Timestamp');
        const rawBody = req.rawBody; // Get the raw body from the request

        if (!signature || !timestamp || !rawBody) {
            return res.status(401).send('Invalid signature');
        }

        const isValid = verifyKey(rawBody, signature, timestamp, clientKey);
        if (!isValid) {
            return res.status(401).send('Invalid signature');
        }

        next();
    };
}

module.exports = {
    handleDiscordInteractions,
    handleDiscordLinkedRoles,
    verifyDiscordRequest,
};
