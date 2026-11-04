"""No network or credentials: exercise release guards with fake API responses."""
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("publisher", ROOT / "scripts/security/publish-reviewed-rules.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublisherTests(unittest.TestCase):
    def run_publisher(self, *, execute=False, wrong_runtime=False, changed_release=False, changed_source=False):
        calls = []
        sources = {}
        releases = {f"projects/{publisher.PROJECT}/releases/{target}": f"projects/{publisher.PROJECT}/rulesets/{expected}"
                    for target, _, expected in publisher.TARGETS}

        def fake_open(request, timeout=30):
            if isinstance(request, str):
                calls.append(("GET", request))
                return io.BytesIO(json.dumps({"commit": "b" * 40 if wrong_runtime else "a" * 40, "securityPolicy": publisher.POLICY}).encode())
            resource = request.full_url.split("/v1/", 1)[1]
            method = request.get_method()
            calls.append((method, resource))
            if method == "GET" and "/releases/" in resource:
                data = {"rulesetName": "unexpected" if changed_release else releases[resource]}
            elif method == "POST":
                body = json.loads(request.data)
                name = f"projects/{publisher.PROJECT}/rulesets/fixture-{len(sources)}"
                sources[name] = body
                data = {"name": name}
            elif method == "PATCH":
                body = json.loads(request.data)
                releases[resource] = body["release"]["rulesetName"]
                data = body["release"]
            else:
                data = sources[resource]
            return io.BytesIO(json.dumps(data).encode())

        with tempfile.TemporaryDirectory() as scratch:
            # Test the publisher protocol using an isolated reviewed fixture.
            # Never rewrite the historical approval manifest to bless newer
            # application Rules; the actual publication guard stays intact.
            fixture = Path(scratch) / "fixture-root"
            manifest = {"sources": {}}
            for target, name, _ in publisher.TARGETS:
                file = fixture / name
                file.parent.mkdir(parents=True, exist_ok=True)
                content = "rules_version = '2';\n// isolated fake-API source for " + target + "\n"
                file.write_text(content)
                manifest["sources"][name] = hashlib.sha256(content.encode()).hexdigest()
            (fixture / "config/security/owner-rules-manifest.json").write_text(json.dumps(manifest))
            if changed_source:
                (fixture / publisher.TARGETS[0][1]).write_text("unreviewed fixture")
            receipt = Path(scratch) / "receipt.json"
            argv = ["publisher", "--expected-runtime-commit", "a" * 40, "--receipt", str(receipt)]
            if execute:
                argv += ["--execute"]
            with patch.object(publisher, "__file__", str(fixture / "scripts/security/publish-reviewed-rules.py")), \
                    patch("sys.argv", argv), patch.object(publisher.urllib.request, "urlopen", side_effect=fake_open), \
                    patch.object(publisher.subprocess, "check_output", return_value="fake-fixture-token"), patch("builtins.print"):
                if wrong_runtime or changed_release or changed_source:
                    with self.assertRaises(ValueError):
                        publisher.main()
                else:
                    publisher.main()
            data = json.loads(receipt.read_text()) if receipt.exists() else None
        return calls, data

    def test_refuses_changes_until_exact_repaired_runtime_is_live(self):
        calls, _ = self.run_publisher(execute=True, wrong_runtime=True)
        self.assertFalse(any(method != "GET" for method, _ in calls))

    def test_unreviewed_local_source_stops_before_any_network_or_credential_read(self):
        calls, receipt = self.run_publisher(execute=True, changed_source=True)
        self.assertEqual(calls, [])
        self.assertIsNone(receipt)

    def test_refuses_to_overwrite_an_unexpected_release(self):
        calls, receipt = self.run_publisher(execute=True, changed_release=True)
        self.assertFalse(any(method != "GET" for method, _ in calls))
        self.assertEqual(receipt["status"], "STOPPED_REVIEW_REQUIRED")

    def test_default_only_reads_and_records_preflight(self):
        calls, receipt = self.run_publisher()
        self.assertTrue(all(method == "GET" for method, _ in calls))
        self.assertEqual(receipt["status"], "READY_NO_CHANGES")

    def test_execute_changes_exactly_two_rules_releases_and_verifies_sources(self):
        calls, receipt = self.run_publisher(execute=True)
        self.assertEqual(receipt["status"], "PUBLISHED_AND_VERIFIED")
        writes = [(method, resource) for method, resource in calls if method != "GET"]
        self.assertEqual(len(writes), 4)
        self.assertEqual(sum(method == "PATCH" for method, _ in writes), 2)
        self.assertTrue(all(resource.startswith(f"projects/{publisher.PROJECT}/") for _, resource in writes))
        for result in receipt["releases"]:
            self.assertEqual(result["sha256"], result["verifiedSha256"])


if __name__ == "__main__":
    unittest.main()
