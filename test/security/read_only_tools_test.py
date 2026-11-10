"""Use fake OAuth/REST responses only; no Google/Firebase connection."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/security" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReadOnlyExports(unittest.TestCase):
    def run_export(self, name, output, handler):
        module = load(name)
        text = io.StringIO()
        with patch("sys.argv", [name, "--project", "demo-security", "--output", str(output)]), patch.object(module.subprocess, "check_output", return_value="private-fixture-token"), patch.object(module.urllib.request, "urlopen", side_effect=handler), contextlib.redirect_stdout(text):
            result = module.main()
        self.assertNotIn("private-fixture-token", text.getvalue())
        return result

    def test_rules_capture_compares_active_source_and_rechecks_release(self):
        content = (ROOT / "test/security/fixtures/firestore.before.rules").read_text()
        release = {"name": "projects/demo-security/releases/cloud.firestore", "rulesetName": "projects/demo-security/rulesets/test", "updateTime": "2026-10-26T00:00:00Z"}
        calls = []

        def respond(request, **_kwargs):
            calls.append(request.full_url)
            self.assertEqual(request.get_method(), "GET")
            if "/rulesets/" in request.full_url:
                data = {"source": {"files": [{"name": "firestore.rules", "content": content}]}}
            elif "/releases?" in request.full_url:
                data = {"releases": [release]}
            else:
                data = release
            stream = io.BytesIO(json.dumps(data).encode()); stream.status = 200
            return stream

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "rules"
            self.assertEqual(self.run_export("export-deployed-rules", output, respond), 0)
            evidence = json.loads((output / "evidence.json").read_text())
            self.assertTrue(evidence["complete"])
            self.assertTrue(evidence["comparisons"][0]["matchesRepositoryBeforeExactly"])
            self.assertEqual(len(calls), 3)

    def test_denial_never_becomes_evidence_of_safe_rules(self):
        def deny(request, **_kwargs):
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}'))
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "denied"
            self.assertEqual(self.run_export("export-deployed-rules", output, deny), 2)
            evidence = json.loads((output / "evidence.json").read_text())
            self.assertFalse(evidence["complete"])
            self.assertEqual(evidence["comparisons"], [])

    def test_authority_export_keeps_only_selected_signals_and_uses_field_masks(self):
        calls = []

        def respond(request, **_kwargs):
            self.assertEqual(request.get_method(), "GET")
            calls.append(request.full_url)
            if "identitytoolkit" in request.full_url:
                data = {"users": [{"localId": "test-admin", "passwordHash": "never-save", "email": "private@example.test", "customAttributes": '{"admin":true,"unrelated":"omit"}'}]}
            else:
                self.assertIn("mask.fieldPaths", request.full_url)
                collection = "admins" if "/admins?" in request.full_url else "users"
                data = {"documents": [{"name": "projects/demo-security/databases/(default)/documents/" + collection + "/test-admin", "fields": {"role": {"stringValue": "admin"}}}]}
            return io.BytesIO(json.dumps(data).encode())

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "authority.json"
            self.run_export("export-admin-authority", output, respond)
            result = output.read_text()
            for secret in ["never-save", "private@example.test", "private-fixture-token", "unrelated"]:
                self.assertNotIn(secret, result)
            self.assertTrue(json.loads(result)["complete"])
            self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
