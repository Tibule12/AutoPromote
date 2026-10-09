"""CPU media-clock regressions; synthetic media is never AI proof."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import hashlib
from unittest.mock import patch
from model_workers.common import normalize,materialize_model
from model_workers.adapters.vision import frame_indices,understanding_output

class WorkerCpu(unittest.TestCase):
    def test_gallery_half_frames_follow_studio_clock(self):
        self.assertEqual(frame_indices(13,9),[0,2,3,5,6,8,9,11,12])
        self.assertEqual(frame_indices(72,6),[0,14,28,43,57,71])
    def test_actual_derivative_half_frame_clock(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'synthetic_cpu_source.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=64x36:r=24',
                '-frames:v','12','-c:v','libx264','-threads','1',str(source)],check=True)
            _,geometry=normalize(source,{'sourceRange':{'startTick':0,'endTick':9375}},root/'derivative.mp4')
            self.assertEqual(int(geometry['nb_read_frames']),3)
    def test_opaque_ids_normalize_but_unobserved_facts_do_not(self):
        data={'summary':'CPU fixture','subjects':[{'id':0,'label':'fixture','description':'test','observedFrameIndices':[0]}],
              'observations':[{'frameIndex':0,'sourceTick':0,'description':'test'}]}
        self.assertEqual(understanding_output(json.dumps(data),[0],[0])['subjects'][0]['id'],'subject-1')
        data['subjects'][0]['observedFrameIndices']=[1]
        with self.assertRaises(ValueError):understanding_output(json.dumps(data),[0],[0])
    def test_checkpoint_transport_rejects_changed_bytes_before_model_load(self):
        # Explicit transport double. This qualifies integrity checks, not AI.
        for corrupt in [False,True]:
            with self.subTest(corrupt=corrupt),tempfile.TemporaryDirectory() as directory:
                root=Path(directory);(root/'config/model-runtime').mkdir(parents=True)
                files=[{'path':f'part-{i}.bin','bytes':16,'sha256':hashlib.sha256(bytes([i])*16).hexdigest()} for i in range(8)]
                model={'checkpoint':'fixture/pinned','revision':'a'*40,'weights':files,'license':'test_fixture'}
                lock={'models':[{**model,'files':files}]}
                (root/'config/model-runtime/sources.v1.json').write_text(json.dumps(lock))
                receipt={**model,'files':[{**f,'generation':'1'} for f in files]}
                class Blob:
                    def __init__(self,key,generation):self.key,self.generation=key,generation
                    def download_as_bytes(self,timeout):return json.dumps(receipt).encode()
                    def download_to_filename(self,target,timeout):
                        self_generation=self.generation
                        if self_generation!=1:raise ValueError('Unpinned object generation')
                        i=int(Path(self.key).stem.split('-')[1]);data=bytes([i])*16
                        Path(target).write_bytes(b'changed' if corrupt and i==3 else data)
                class Bucket:
                    def blob(self,key,generation=None):return Blob(key,generation)
                work=root/'work';work.mkdir()
                with patch('model_workers.common.ROOT',root):
                    if corrupt:
                        with self.assertRaises(ValueError):materialize_model({'model':model,'modelCachePrefix':'fixture'},Bucket(),work)
                    else:
                        output,provenance=materialize_model({'model':model,'modelCachePrefix':'fixture'},Bucket(),work)
                        self.assertEqual(len(list(output.iterdir())),8)
                        self.assertEqual(provenance['weights'],files)

if __name__=='__main__':unittest.main()
