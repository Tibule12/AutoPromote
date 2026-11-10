#!/usr/bin/env python3
"""Inspect a specific cached Firebase CLI credential; revoke only with explicit flags.

Never print credential values, put them in argv/URLs, or change Firebase Auth users.
This operator tool is NOT invoked by the application or any deployment/test script.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True)
    parser.add_argument("--cache", type=Path, default=Path.home() / ".config/configstore/firebase-tools.json")
    parser.add_argument("--expected-sha256")
    parser.add_argument("--execute-revocation", action="store_true")
    args = parser.parse_args()
    data = json.loads(args.cache.read_text())
    accounts = [{"user": data.get("user", {}), "tokens": data.get("tokens", {})}] + data.get("additionalAccounts", [])
    matches = [a for a in accounts if a.get("user", {}).get("email") == args.account]
    if len(matches) != 1:
        raise ValueError("Account missing or ambiguous; no action")
    account = matches[0]
    user = account["user"]
    if (user.get("aud") or user.get("azp")) != CLIENT_ID:
        raise ValueError("OAuth client differs; no action")
    token = account.get("tokens", {}).get("refresh_token")
    if not isinstance(token, str) or not token:
        raise ValueError("No cached refresh credential; use the verified Google Account connection-removal procedure")
    fingerprint = hashlib.sha256(token.encode()).hexdigest()
    metadata = {"account": args.account, "oauthClientId": CLIENT_ID, "refreshSha256": fingerprint}
    if not args.execute_revocation:
        print(json.dumps({**metadata, "mode": "inspect-only", "networkRequests": 0}))
        return 0
    if args.expected_sha256 != fingerprint:
        raise ValueError("Credential fingerprint changed; obtain fresh approval before revocation")
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/revoke",
        data=urllib.parse.urlencode({"token": token}).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST",
    )
    # Prevent credential-bearing form data from being redirected to another endpoint.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=30) as response:
            status = response.status
            response.read(4096)  # Do not print provider bodies.
    except urllib.error.HTTPError as error:
        print(json.dumps({**metadata, "httpStatus": error.code, "providerAcknowledged": False}))
        return 2
    print(json.dumps({**metadata, "httpStatus": status, "providerAcknowledged": status == 200,
        "note": "Propagation may take time; this is a provider acknowledgement, not proof of immediate global token invalidation. Local cache unchanged."}))
    return 0 if status == 200 else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError):
        print("Credential operation refused or failed. No credential values printed; no application-user session operation performed.", file=sys.stderr)
        sys.exit(2)
