#!/usr/bin/env python3
"""Publish only the reviewed financial delta to the current Firestore policy.

Default is read-only verification. No Storage/IAM/data/plan/balance changes.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-runtime-commit', required=True)
    parser.add_argument('--receipt', required=True, type=Path)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{40}', args.expected_runtime_commit) or args.receipt.exists():
        parser.error('Exact runtime commit and new receipt path required')
    root = Path(__file__).resolve().parents[2]
    config = json.loads((root/'config/security/cost-security-rules-release.json').read_text())
    assert config['project'] == 'autopromote-cc6d3' and config['target'] == 'cloud.firestore'
    content = (root/config['source']).read_text()
    assert hashlib.sha256(content.encode()).hexdigest() == config['sha256']
    receipt = {'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'execute':args.execute,
               'project':config['project'], 'sourceSha256':config['sha256'], 'scope':config['scope'],
               'authorization':'Owner requested push and deployment of tested updates on 27 November 2026',
               'expectedRuntimeCommit':args.expected_runtime_commit}
    try:
        for origin in ['https://api.autopromote.org','https://autopromote.onrender.com']:
            with urllib.request.urlopen(origin+'/api/version',timeout=30) as response:
                assert json.load(response)['commit'] == args.expected_runtime_commit, 'Backend revision is not live'
        token = subprocess.check_output(['gcloud','auth','print-access-token'], text=True, stderr=subprocess.DEVNULL).strip()
        def request(method,resource,payload=None):
            assert resource.startswith('projects/'+config['project']+'/')
            req = urllib.request.Request('https://firebaserules.googleapis.com/v1/'+resource,
                data=json.dumps(payload).encode() if payload is not None else None,
                headers={'Authorization':'Bearer '+token, 'X-Goog-User-Project':config['project'], 'Content-Type':'application/json'}, method=method)
            with urllib.request.urlopen(req,timeout=30) as response:
                return json.load(response)
        name='projects/'+config['project']+'/releases/cloud.firestore'
        before=request('GET',name)
        old=request('GET',before['rulesetName'])['source']['files']
        assert len(old)==1
        old_hash=hashlib.sha256(old[0]['content'].encode()).hexdigest()
        if old_hash==config['sha256']:
            receipt.update(status='ALREADY_DEPLOYED_AND_VERIFIED',ruleset=before['rulesetName'])
        else:
            assert before['rulesetName']==config['baselineRuleset'] and old_hash==config['baselineSha256'], 'Production policy changed; refuse overwrite'
            receipt.update(beforeRuleset=before['rulesetName'],beforeSha256=old_hash)
            if args.execute:
                created=request('POST','projects/'+config['project']+'/rulesets',{'source':{'files':[{'name':Path(config['source']).name,'content':content}]}})
                receipt['createdRuleset']=created['name']
                assert request('GET',name)['rulesetName']==before['rulesetName'], 'Concurrent policy release; stopped'
                request('PATCH',name,{'release':{'name':name,'rulesetName':created['name']},'updateMask':'rulesetName'})
                after=request('GET',name)
                actual=request('GET',after['rulesetName'])['source']['files']
                assert after['rulesetName']==created['name'] and len(actual)==1 and hashlib.sha256(actual[0]['content'].encode()).hexdigest()==config['sha256']
                receipt.update(status='PUBLISHED_AND_VERIFIED',afterRuleset=after['rulesetName'],updateTime=after.get('updateTime'))
            else:
                receipt['status']='READY_NO_CHANGES'
    except Exception as error:
        receipt.update(status='STOPPED',errorType=type(error).__name__)
        if hasattr(error,'code'): receipt['httpStatus']=error.code
        raise
    finally:
        receipt['finishedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        args.receipt.parent.mkdir(parents=True,exist_ok=True)
        args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'status':receipt['status'],'receipt':str(args.receipt)}))


if __name__=='__main__':
    main()
