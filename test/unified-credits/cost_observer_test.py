"""Verify the cost observer's network boundary without credentials or real services."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse, parse_qs

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/monetization/observe-costs.py'
spec = importlib.util.spec_from_file_location('observer', SCRIPT)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)

class Response(io.BytesIO):
    status = 200

class ObserverTests(unittest.TestCase):
    def test_all_requests_are_bounded_gets_to_named_project_and_summary_excludes_env(self):
        calls = []
        def fake_open(request, timeout):
            self.assertEqual(request.get_method(), 'GET')
            parsed = urlparse(request.full_url)
            self.assertIn(parsed.hostname, ['cloudbilling.googleapis.com', 'bigquery.googleapis.com', 'run.googleapis.com', 'monitoring.googleapis.com', 'storage.googleapis.com'])
            self.assertIn('autopromote-cc6d3', request.full_url)
            self.assertLessEqual(timeout, 25)
            calls.append(request.full_url)
            data = {}
            if '/metricDescriptors' in parsed.path:
                metric = parse_qs(parsed.query)['filter'][0]
                data = {'metricDescriptors': [{'unit': 'By' if 'storage/total_bytes' in metric else 's', 'metricKind': 'GAUGE' if 'storage/total_bytes' in metric else 'DELTA'}]}
            elif '/services/media-worker-v1' in parsed.path:
                data = {'template': {'containers': [{'env': [{'name': 'SECRET_FIXTURE', 'value': 'not-a-real-credential'}], 'resources': {'limits': {'cpu': '4'}}}]}}
            return Response(json.dumps(data).encode())
        with tempfile.TemporaryDirectory() as scratch:
            destination = Path(scratch) / 'new-private-output'
            with patch('sys.argv', ['observer', '--output', str(destination)]), patch.object(observer.subprocess, 'check_output', return_value='fake-test-token'), patch.object(observer.urllib.request, 'urlopen', side_effect=fake_open), patch('builtins.print'):
                observer.main()
            data = json.loads((destination/'summary.json').read_text())
            self.assertEqual(data['methods'], ['GET'])
            self.assertFalse(data['operationsOrProviderChargesStarted'])
            self.assertNotIn('SECRET_FIXTURE', json.dumps(data))
            self.assertNotIn('not-a-real-credential', json.dumps(data))
            self.assertGreater(len(calls), 10)
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
            self.assertTrue(all((f.stat().st_mode & 0o777) == 0o600 for f in destination.glob('*.json')))

if __name__ == '__main__':
    unittest.main()
