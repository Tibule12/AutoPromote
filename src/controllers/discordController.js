const { verifyKey } = require('discord-interactions');

// Placeholder for Discord business logic
async function handleDiscordInteractions(req, res) {
    const { type, data } = req.body;

    // PING-PONG for health check
    if (type === 1) { // PING
        return res.status(200).json({ type: 1 }); // PONG
    }

    // Handle slash commands
    if (type === 2) { // APPLICATION_COMMAND
        const { name } = data;

        if (name === 'hello') {
            return res.status(200).json({
                type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
                data: {
                    content: 'Hello from AutoPromote!',
                },
            });
        }
    }

    return res.status(404).send('Unknown interaction type');
}

async function handleDiscordLinkedRoles(req, res) {
    // This would be the full OAuth2 flow.
    // For now, we'll just return a success message.
    const { code } = req.query;
    if (code) {
        // Here you would exchange the code for an access token
        // and then fetch user data from Discord.
        console.log(`Received Discord OAuth code: ${code}`);
        return res.status(200).send('Successfully linked your Discord account!');
    }

    // If no code, redirect to Discord's auth URL (example)
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = process.env.DISCORD_REDIRECT_URI;
    if (clientId && redirectUri) {
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20role_connections.write`;
        return res.redirect(authUrl);
    }

    return res.status(200).send('Discord Linked Roles endpoint. Configuration needed.');
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
