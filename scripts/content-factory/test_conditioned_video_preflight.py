"""CPU safety/identity contracts. These do not qualify inference or creativity."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

from PIL import Image

SCRIPT=Path(__file__).with_name('generate-conditioned-video.py')
spec=importlib.util.spec_from_file_location('conditioned',SCRIPT)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Preflight(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.reference=self.root/'reference.png';Image.new('RGB',(128,72),'purple').save(self.reference)
  self.output=self.root/'attempts'
  self.request={'deadlineEpoch':time.time()+3600,'sourceBrief':'Contract fixture',
   'settings':{'width':1280,'height':720,'frames':81,'steps':40,'referenceResize':'aspect_fit'},
   'shots':[{'name':'creator-1','prompt':'The creator turns and types','seed':1,
    'reference_image':str(self.reference),'reference_image_sha256':hashlib.sha256(self.reference.read_bytes()).hexdigest()}]}
 def tearDown(self):self.tmp.cleanup()
 def check(self,request=None):return module.validate_request(request or self.request,self.root,self.output,'rtx_pro_6000')
 def test_valid_request_is_cpu_only(self):
  result=self.check();self.assertEqual(result['status'],'PASS_CPU_REQUEST_ONLY')
  self.assertIn('No GPU inference',result['limitation'])
 def test_changed_original_is_rejected(self):
  Image.new('RGB',(128,72),'green').save(self.reference)
  with self.assertRaisesRegex(ValueError,'no longer matches'):self.check()
 def test_rtx_requires_exact_reference_hash(self):
  del self.request['shots'][0]['reference_image_sha256']
  with self.assertRaisesRegex(ValueError,'exact reference'):self.check()
 def test_duplicate_attempt_identity_is_rejected(self):
  self.request['shots'].append(copy.deepcopy(self.request['shots'][0]))
  with self.assertRaisesRegex(ValueError,'Duplicate'):self.check()
 def test_saved_take_cannot_be_overwritten(self):
  saved=self.output/'creator-1';saved.mkdir(parents=True);(saved/'latents.pt').write_bytes(b'retained take')
  with self.assertRaises(FileExistsError):self.check()
  self.assertEqual((saved/'latents.pt').read_bytes(),b'retained take')
 def test_deadline_and_dimensions_fail_before_runtime_import(self):
  for field,value in [('deadlineEpoch',time.time()-1),('settings',{'width':4096,'height':4096})]:
   request=copy.deepcopy(self.request);request[field]=value
   with self.assertRaises(ValueError):self.check(request)
 def test_source_symlink_outside_owned_root_is_rejected(self):
  with tempfile.TemporaryDirectory() as other:
   target=Path(other)/'other.png';Image.new('RGB',(16,16)).save(target)
   self.reference.unlink();self.reference.symlink_to(target)
   with self.assertRaisesRegex(ValueError,'outside bounded'):self.check()
 def test_cli_validate_does_not_need_torch_model_or_gpu(self):
  request=self.root/'request.json';request.write_text(json.dumps(self.request))
  result=subprocess.run(['python3',str(SCRIPT),'--request',str(request),'--root',str(self.root),
   '--output',str(self.output),'--models',str(self.root/'missing-model'),'--gpu-profile','rtx_pro_6000','--validate-only'],
   capture_output=True,text=True,check=True)
  self.assertEqual(json.loads(result.stdout)['status'],'PASS_CPU_REQUEST_ONLY')
  self.assertFalse(self.output.exists())

if __name__=='__main__':unittest.main()
