"""Fake local cache and fake HTTPS opener only. Never revoke real credentials."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("credential_tool", ROOT / "scripts/security/revoke-cli-oauth.py")
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class CredentialTool(unittest.TestCase):
    def run_tool(self, extra, opener=None):
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp) / "cache.json"
            cache.write_text(json.dumps({"user": {"email": "owner@example.test", "aud": tool.CLIENT_ID}, "tokens": {"refresh_token": "fake-private-credential"}}))
            output = io.StringIO()
            with patch("sys.argv", ["tool", "--account", "owner@example.test", "--cache", str(cache), *extra]), patch.object(tool.urllib.request, "build_opener", return_value=opener) as build, contextlib.redirect_stdout(output):
                result = tool.main()
            self.assertNotIn("fake-private-credential", output.getvalue())
            return result, build, output.getvalue()

    def test_default_is_read_only_and_makes_no_network_request(self):
        result, build, output = self.run_tool([])
        self.assertEqual(result, 0)
        build.assert_not_called()
        self.assertIn("inspect-only", output)

    def test_wrong_fingerprint_never_sends_a_request(self):
        with self.assertRaises(ValueError):
            self.run_tool(["--execute-revocation", "--expected-sha256", "wrong"])

    def test_explicit_execution_sends_only_form_body_to_fixed_https_endpoint(self):
        class Opener:
            def open(self, request, **_kwargs):
                self.request = request
                response = io.BytesIO(b"")
                response.status = 200
                return response
        opener = Opener()
        fingerprint = hashlib.sha256(b"fake-private-credential").hexdigest()
        result, _build, _output = self.run_tool(["--execute-revocation", "--expected-sha256", fingerprint], opener)
        self.assertEqual(result, 0)
        self.assertEqual(opener.request.full_url, "https://oauth2.googleapis.com/revoke")
        self.assertEqual(opener.request.get_method(), "POST")
        self.assertIn(b"token=fake-private-credential", opener.request.data)


if __name__ == "__main__":
    unittest.main()
