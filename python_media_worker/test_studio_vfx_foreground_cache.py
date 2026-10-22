import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from studio_vfx_foreground_cache import ForegroundFrameCache


class ForegroundCacheTests(unittest.TestCase):
    def test_exact_pixels_and_all_foreground_inputs_are_bound(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'STUDIO_VFX_FOREGROUND_CACHE_DIR':folder}),patch('studio_vfx_foreground_cache.os.statvfs') as space:
            space.return_value.f_bavail=10*1024**3
            space.return_value.f_frsize=1
            cache=ForegroundFrameCache('renderer-v1')
            source=Image.new('RGB',(3,2),(90,70,60));alpha=Image.new('L',source.size,120)
            commands=[{'type':'foreground_refine','decontaminate':1}]
            calls=[]
            def compute():
                calls.append(True)
                return Image.new('RGB',source.size,(100,70,50)),Image.new('L',source.size,127)
            first=cache.prepare(source,alpha,commands,compute)
            repeated=cache.prepare(source,alpha,commands,compute)
            self.assertEqual(len(calls),1)
            self.assertEqual([i.tobytes() for i in first],[i.tobytes() for i in repeated])
            for frame,matte,effects in [(Image.new('RGB',source.size,(91,70,60)),alpha,commands),
                                        (source,Image.new('L',source.size,121),commands),
                                        (source,alpha,[{'type':'foreground_refine','decontaminate':.5}])]:
                cache.prepare(frame,matte,effects,compute)
            ForegroundFrameCache('renderer-v2').prepare(source,alpha,commands,compute)
            self.assertEqual(len(calls),5)
            self.assertEqual(cache.hits,1)

    def test_corruption_recomputes_and_low_space_stops_writes(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'STUDIO_VFX_FOREGROUND_CACHE_DIR':folder}),patch('studio_vfx_foreground_cache.os.statvfs') as space:
            space.return_value.f_bavail=10*1024**3;space.return_value.f_frsize=1
            source=Image.new('RGB',(2,2));alpha=Image.new('L',source.size,128)
            cache=ForegroundFrameCache('v1');calls=[]
            def compute():calls.append(1);return source,alpha
            cache.prepare(source,alpha,[],compute)
            file=next(Path(folder).glob('*.png'));file.write_bytes(b'corrupt')
            cache.prepare(source,alpha,[],compute)
            self.assertEqual(len(calls),2)
            file.unlink();space.return_value.f_bavail=1
            cache.prepare(source,alpha,[],compute)
            self.assertEqual(list(Path(folder).iterdir()),[])

    def test_cache_is_optional(self):
        with patch.dict(os.environ,{},clear=True):
            cache=ForegroundFrameCache('v1');source=Image.new('RGB',(2,2));alpha=Image.new('L',(2,2),255)
            self.assertEqual(cache.prepare(source,alpha,[],lambda:(source,alpha)),(source,alpha))


if __name__=='__main__':unittest.main()
