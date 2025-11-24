#!/usr/bin/env bash
# Print gh CLI commands to set the encryption keys as GitHub repository secrets.
# Usage: run this script and copy/paste the commands, replacing PLACEHOLDER with actual secret values.

OWNER_REPO="Tibule12/AutoPromote"
echo "# Replace the values in single quotes with your secret values and run these commands";
echo "# Example: echo -n '$(node ./scripts/generateSecret.js 64)' | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
echo "";
echo "# Set the GENERIC_TOKEN_ENCRYPTION_KEY secret";
echo "echo -n 'PLACEHOLDER_GENERIC_KEY' | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
echo "";
echo "# Set the FUNCTIONS_TOKEN_ENCRYPTION_KEY secret";
echo "echo -n 'PLACEHOLDER_FUNCTIONS_KEY' | gh secret set FUNCTIONS_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
echo "";
echo "# Set the TWITTER_TOKEN_ENCRYPTION_KEY secret";
echo "echo -n 'PLACEHOLDER_TWITTER_KEY' | gh secret set TWITTER_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";

echo "";
echo "# If you want to set them from env vars on unix-like systems run this instead:";
echo "# echo -n \"$GENERIC_TOKEN_ENCRYPTION_KEY\" | gh secret set GENERIC_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
echo "# echo -n \"$FUNCTIONS_TOKEN_ENCRYPTION_KEY\" | gh secret set FUNCTIONS_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
echo "# echo -n \"$TWITTER_TOKEN_ENCRYPTION_KEY\" | gh secret set TWITTER_TOKEN_ENCRYPTION_KEY --repo $OWNER_REPO";
