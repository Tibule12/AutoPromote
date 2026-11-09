#!/usr/bin/env python3
"""Read Rules releases/source using GET only; never deploy, test or change IAM.

Uses the existing gcloud login, or a bearer token supplied privately on stdin.
Never print tokens or use Firebase CLI JSON account listings.
"""
import argparse
import datetime
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--token-stdin", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,62}", args.project):
        parser.error("Invalid project ID")
    if args.output.exists():
        parser.error("Output must be a new private directory")
    os.umask(0o077)
    args.output.mkdir(parents=True, mode=0o700)
    evidence = {
        "project": args.project,
        "collectedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "methods": ["GET"],
        "requests": [],
        "comparisons": [],
        "complete": False,
    }
    base = "https://firebaserules.googleapis.com/v1/"
    root = Path(__file__).resolve().parents[2]
    token = sys.stdin.read().strip() if args.token_stdin else subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True, stderr=subprocess.DEVNULL
    ).strip()
    if not token or any(c.isspace() for c in token):
        raise ValueError("No valid access token; authenticate locally without sharing credentials")

    def get(path):
        if not path.startswith(f"projects/{args.project}/"):
            raise ValueError("Refusing a different project")
        request = urllib.request.Request(base + path, headers={"Authorization": f"Bearer {token}"}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = json.load(response)
                evidence["requests"].append({"resource": path, "httpStatus": response.status})
                return data
        except urllib.error.HTTPError as error:
            data = json.loads(error.read()).get("error", {})
            # Keep only structured denial reasons. Do not save headers, tokens or bodies.
            evidence["requests"].append({
                "resource": path, "httpStatus": error.code,
                "status": data.get("status"),
                "reasons": [d.get("reason") for d in data.get("details", []) if d.get("reason")],
            })
            return None

    releases = []
    page = ""
    listed = True
    while True:
        result = get(f"projects/{args.project}/releases?pageSize=100" + ("&pageToken=" + urllib.parse.quote(page, safe="") if page else ""))
        if result is None:
            listed = False
            break
        releases.extend(result.get("releases", []))
        page = result.get("nextPageToken", "")
        if not page:
            break
    # The default release is still worth attempting when list permission is absent.
    if not listed:
        result = get(f"projects/{args.project}/releases/cloud.firestore")
        if result:
            releases.append(result)
    successful = 0
    stable = True
    for index, release in enumerate(releases):
        name = release["name"]
        if "/releases/cloud.firestore" not in name and "/releases/firebase.storage/" not in name:
            continue
        ruleset = get(release["rulesetName"])
        if ruleset is None:
            stable = False
            continue
        (args.output / f"release-{index}.json").write_text(json.dumps(release, indent=2) + "\n")
        (args.output / f"ruleset-{index}.json").write_text(json.dumps(ruleset, indent=2) + "\n")
        # Release names are mutable; confirm they did not change during this capture.
        current = get(name)
        unchanged = bool(current and current.get("rulesetName") == release["rulesetName"])
        stable = stable and unchanged
        for file_index, source in enumerate(ruleset.get("source", {}).get("files", [])):
            content = source["content"]
            (args.output / f"source-{index}-{file_index}.rules").write_text(content)
            firestore = "/releases/cloud.firestore" in name
            candidate = (root / ("firestore.rules" if firestore else "storage.rules")).read_text()
            baseline = (root / "test/security/fixtures/firestore.before.rules").read_text() if firestore else candidate
            comparison = {
                "release": name, "ruleset": release["rulesetName"],
                "releaseUpdateTime": release.get("updateTime"),
                "releaseStableDuringCapture": unchanged,
                "sourceName": source.get("name"),
                "deployedSha256": hashlib.sha256(content.encode()).hexdigest(),
                "matchesRepositoryBeforeExactly": content == baseline,
                "matchesCandidateExactly": content == candidate,
                "comparisonScope": "Exact source comparison; different text requires semantic review and emulator replay",
            }
            evidence["comparisons"].append(comparison)
            diff = difflib.unified_diff(baseline.splitlines(True), content.splitlines(True), fromfile="repository-before", tofile="deployed")
            (args.output / f"before-vs-deployed-{index}-{file_index}.diff").write_text("".join(diff))
            successful += int(firestore and unchanged)
    evidence["complete"] = listed and stable and successful > 0
    (args.output / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "complete": evidence["complete"], "requests": evidence["requests"], "comparisons": evidence["comparisons"]}, indent=2))
    return 0 if evidence["complete"] else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError):
        print("Evidence capture failed; inspect local authentication/network access. No credentials were printed.", file=sys.stderr)
        sys.exit(2)
