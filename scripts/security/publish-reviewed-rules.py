#!/usr/bin/env python3
"""Publish the reviewed owner-scoped policies only after the repaired backend is live.

No user documents, objects, billing, IAM, claims or sessions are modified.
The default only verifies local artifacts and runtime; --execute publishes Rules.
Uses the separate existing gcloud credential without printing any token.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request

PROJECT = "autopromote-cc6d3"
POLICY = "security-owner-bootstrap-20261027"
TARGETS = [
    ("cloud.firestore", "config/security/firestore.owner-scoped.rules", "2115bff8-a189-4179-9ecc-516c895d132a"),
    ("firebase.storage/autopromote-cc6d3.firebasestorage.app", "config/security/storage.owner-scoped.rules", "7d9cee7f-2189-492d-9d46-9bf7b0bf1200"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-runtime-commit", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", args.expected_runtime_commit):
        parser.error("Expected an exact reviewed 40-character backend commit")
    if args.receipt.exists():
        parser.error("Receipt must be a new file")
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "config/security/owner-rules-manifest.json").read_text())
    receipt = {"project": PROJECT, "startedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
               "execute": args.execute, "expectedRuntimeCommit": args.expected_runtime_commit,
               "authorization": "User authorised autonomous security remediation; AdSense and monetisation excluded",
               "scope": "Only two Rules releases; no document/object/Auth/IAM/billing changes", "runtime": [], "releases": []}
    sources = {}
    for target, name, _ in TARGETS:
        content = (root / name).read_text()
        digest = hashlib.sha256(content.encode()).hexdigest()
        if manifest["sources"].get(name) != digest:
            raise ValueError("Local source differs from the tested manifest")
        sources[target] = (name, content, digest)
    for origin in ["https://api.autopromote.org", "https://autopromote.onrender.com"]:
        with urllib.request.urlopen(origin + "/api/version", timeout=30) as response:
            runtime = json.load(response)
        if runtime.get("commit") != args.expected_runtime_commit or runtime.get("securityPolicy") != POLICY:
            raise ValueError("Repaired backend is not yet verified on both origins; retain E1")
        receipt["runtime"].append({"origin": origin, "commit": runtime["commit"], "securityPolicy": runtime["securityPolicy"]})
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True, stderr=subprocess.DEVNULL).strip()

    def request(method, resource, payload=None):
        if not resource.startswith(f"projects/{PROJECT}/"):
            raise ValueError("Different project refused")
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request("https://firebaserules.googleapis.com/v1/" + resource, data=body,
            headers={"Authorization": "Bearer " + token, "X-Goog-User-Project": PROJECT, "Content-Type": "application/json"}, method=method)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)

    try:
        # Read and verify both release pointers before any change.
        for target, name, expected in TARGETS:
            release_name = f"projects/{PROJECT}/releases/{target}"
            current = request("GET", release_name)
            if current.get("rulesetName") != f"projects/{PROJECT}/rulesets/{expected}":
                raise ValueError("Active release differs from recorded E1; investigate instead of overwriting")
            receipt["releases"].append({"release": release_name, "before": current["rulesetName"], "source": name, "sha256": sources[target][2]})
        if args.execute:
            for index, (target, _, _) in enumerate(TARGETS):
                name, content, digest = sources[target]
                result = request("POST", f"projects/{PROJECT}/rulesets", {"source": {"files": [{"name": Path(name).name, "content": content}]}})
                ruleset_name = result["name"]
                record = receipt["releases"][index]
                record["createdRuleset"] = ruleset_name
                # Avoid overwriting another operator's intervening release update.
                if request("GET", record["release"])["rulesetName"] != record["before"]:
                    raise ValueError("Release changed during preparation; publish stopped")
                request("PATCH", record["release"], {"release": {"name": record["release"], "rulesetName": ruleset_name}, "updateMask": "rulesetName"})
                verified = request("GET", record["release"])
                deployed = request("GET", ruleset_name)
                files = deployed.get("source", {}).get("files", [])
                if verified["rulesetName"] != ruleset_name or len(files) != 1 or hashlib.sha256(files[0]["content"].encode()).hexdigest() != digest:
                    raise ValueError("Published release verification failed; retain recorded safe policies and investigate")
                record.update({"after": ruleset_name, "verifiedSha256": digest, "updateTime": verified.get("updateTime")})
        receipt["status"] = "PUBLISHED_AND_VERIFIED" if args.execute else "READY_NO_CHANGES"
    except (ValueError, urllib.error.HTTPError, urllib.error.URLError, KeyError) as error:
        receipt["status"] = "STOPPED_REVIEW_REQUIRED"
        receipt["errorType"] = type(error).__name__
        if isinstance(error, urllib.error.HTTPError):
            receipt["httpStatus"] = error.code
        raise
    finally:
        receipt["finishedAtUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"status": receipt["status"], "receipt": str(args.receipt)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        raise SystemExit("Rules publication stopped. No credentials printed; inspect the receipt if created.")
