#!/usr/bin/env python3
"""Owner-run GET-only export of authority signals; never import the application.

Retain no passwords, hashes, email addresses, credentials or credit/billing fields.
Do not run until an independently verified administrator roster is available.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--database", default="(default)")
    parser.add_argument("--tenant", default="")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--token-stdin", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,62}", args.project):
        parser.error("Invalid project ID")
    for value in [args.database, args.tenant]:
        if value and not re.fullmatch(r"[A-Za-z0-9()_-]{1,128}", value):
            parser.error("Invalid database/tenant ID")
    if args.output.exists():
        parser.error("Refusing to overwrite an existing snapshot")
    token = sys.stdin.read().strip() if args.token_stdin else subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True, stderr=subprocess.DEVNULL
    ).strip()
    if not token or any(c.isspace() for c in token):
        raise ValueError("Invalid token")
    request_count = 0

    def get(host, path, query):
        nonlocal request_count
        if host not in ["identitytoolkit.googleapis.com", "firestore.googleapis.com"]:
            raise ValueError("Unexpected host")
        url = "https://" + host + path + "?" + urllib.parse.urlencode(query, doseq=True)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "X-Goog-User-Project": args.project}, method="GET")
        with urllib.request.urlopen(req, timeout=30) as response:
            request_count += 1
            return json.load(response)

    signals = ["role", "isAdmin", "admin", "fromCollection", "test"]

    def authority(data):
        result = {key: data[key] for key in signals if key in data}
        for nested in ["claims", "customClaims"]:
            if isinstance(data.get(nested), dict):
                result[nested] = {key: data[nested][key] for key in signals if key in data[nested]}
        return result

    snapshot = {
        "project": args.project, "database": args.database, "tenant": args.tenant or None,
        "capturedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "complete": False, "authUsers": [], "adminDocuments": [], "profileSignals": [],
    }
    page = ""
    while True:
        query = {"maxResults": 1000}
        if page:
            query["nextPageToken"] = page
        if args.tenant:
            query["tenantId"] = args.tenant
        result = get("identitytoolkit.googleapis.com", f"/v1/projects/{args.project}/accounts:batchGet", query)
        for account in result.get("users", []):
            claims = json.loads(account.get("customAttributes") or "{}")
            snapshot["authUsers"].append({
                "uid": account["localId"], "disabled": account.get("disabled", False),
                "validSince": account.get("validSince"), "customClaims": authority(claims),
            })
        page = result.get("nextPageToken", "")
        if not page:
            break

    def decode(value):
        for key in ["stringValue", "booleanValue", "timestampValue"]:
            if key in value:
                return value[key]
        if "mapValue" in value:
            return {key: decode(item) for key, item in value["mapValue"].get("fields", {}).items()}
        return None

    for collection in ["admins", "users"]:
        page = ""
        while True:
            fields = signals + ["claims", "customClaims"]
            if collection == "admins":
                fields += ["status", "disabled", "createdAt", "createdBy"]
            query = {"pageSize": 1000, "mask.fieldPaths": fields}
            if page:
                query["pageToken"] = page
            result = get("firestore.googleapis.com", f"/v1/projects/{args.project}/databases/{args.database}/documents/{collection}", query)
            for document in result.get("documents", []):
                data = {key: decode(value) for key, value in document.get("fields", {}).items()}
                uid = document["name"].rsplit("/", 1)[1]
                if collection == "admins":
                    metadata = {key: data[key] for key in ["status", "disabled", "createdAt", "createdBy"] if key in data}
                    snapshot["adminDocuments"].append({"uid": uid, **authority(data), **metadata})
                elif data:
                    snapshot["profileSignals"].append({"uid": uid, **authority(data)})
            page = result.get("nextPageToken", "")
            if not page:
                break
    snapshot["complete"] = True
    snapshot["finishedAtUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    snapshot["getRequests"] = request_count
    os.umask(0o077)
    with args.output.open("x") as output:
        json.dump(snapshot, output, indent=2)
        output.write("\n")
    print(json.dumps({"output": str(args.output), "complete": True, "getRequests": request_count, "counts": {key: len(snapshot[key]) for key in ["authUsers", "adminDocuments", "profileSignals"]}}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        print("Authority export failed; no snapshot or credentials printed. Check read-only access and retry into a new file.", file=sys.stderr)
        sys.exit(2)
