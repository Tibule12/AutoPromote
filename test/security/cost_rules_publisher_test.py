import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2]/'scripts/security/publish-cost-security-rules.py'


class CostRulesPublisherTests(unittest.TestCase):
    def run_fixture(self, execute=False, drift=False, runtime='a'*40):
        spec=importlib.util.spec_from_file_location('cost_rules_publisher',SCRIPT)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/'config/security').mkdir(parents=True)
            old='retained production policy'
            new='reviewed financial policy'
            (root/'config/security/candidate.rules').write_text(new)
            baseline='projects/autopromote-cc6d3/rulesets/baseline'
            created='projects/autopromote-cc6d3/rulesets/new'
            (root/'config/security/cost-security-rules-release.json').write_text(json.dumps({
                'project':'autopromote-cc6d3','target':'cloud.firestore','source':'config/security/candidate.rules',
                'sha256':hashlib.sha256(new.encode()).hexdigest(),'baselineSha256':hashlib.sha256(old.encode()).hexdigest(),
                'baselineRuleset':baseline,'scope':'financial policy only'}))
            module.__file__=str(root/'scripts/security/publish.py')
            active=baseline if not drift else 'projects/autopromote-cc6d3/rulesets/concurrent'
            calls=[]
            def response(request,**_):
                nonlocal active
                if isinstance(request,str):
                    return io.BytesIO(json.dumps({'commit':runtime}).encode())
                method=request.get_method()
                calls.append((method,request.full_url))
                if method=='POST': data={'name':created}
                elif method=='PATCH':
                    active=json.loads(request.data)['release']['rulesetName']
                    data={'name':'projects/autopromote-cc6d3/releases/cloud.firestore','rulesetName':active}
                elif '/releases/' in request.full_url: data={'rulesetName':active}
                else: data={'source':{'files':[{'content':new if request.full_url.endswith('/new') else old}]}}
                return io.BytesIO(json.dumps(data).encode())
            args=['publisher','--expected-runtime-commit','a'*40,'--receipt',str(root/'receipt.json')]
            if execute: args+=['--execute']
            with patch.object(sys,'argv',args),patch.object(module.urllib.request,'urlopen',side_effect=response),patch.object(module.subprocess,'check_output',return_value='private-test-token'),contextlib.redirect_stdout(io.StringIO()):
                if drift or runtime!='a'*40:
                    with self.assertRaises(AssertionError): module.main()
                else: module.main()
            receipt=json.loads((root/'receipt.json').read_text())
            return calls,receipt

    def test_readonly_default_never_creates_or_patches(self):
        calls,receipt=self.run_fixture()
        self.assertEqual(receipt['status'],'READY_NO_CHANGES')
        self.assertTrue(all(method=='GET' for method,_ in calls))

    def test_execute_changes_only_firestore_and_rechecks_source(self):
        calls,receipt=self.run_fixture(execute=True)
        self.assertEqual(receipt['status'],'PUBLISHED_AND_VERIFIED')
        mutations=[(method,url) for method,url in calls if method!='GET']
        self.assertEqual([method for method,_ in mutations],['POST','PATCH'])
        self.assertTrue(mutations[1][1].endswith('/releases/cloud.firestore'))
        self.assertTrue(all('firebaserules.googleapis.com' in url for _,url in calls))

    def test_policy_drift_and_wrong_runtime_refuse_before_any_write(self):
        for kwargs in [{'drift':True},{'runtime':'b'*40}]:
            calls,receipt=self.run_fixture(execute=True,**kwargs)
            self.assertEqual(receipt['status'],'STOPPED')
            self.assertTrue(all(method=='GET' for method,_ in calls))


if __name__=='__main__':
    unittest.main()
