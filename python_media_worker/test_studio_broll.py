import unittest
import tempfile
import subprocess
from pathlib import Path
from types import SimpleNamespace
from python_media_worker.studio_broll import overlay_commands, audible_duration, ducking_windows, split_layout_filters

class BRollTests(unittest.TestCase):
    def test_held_audio_returns_before_the_picture_ends(self):
        self.assertEqual(audible_duration(5,1,10,'hold'),4)
        self.assertEqual(audible_duration(5,1,10,'hold',6),0)
        self.assertEqual(audible_duration(5,1,10,'loop',6),10)

    def test_overlapping_ducks_use_the_strongest_active_gain(self):
        def cue(start,duration,strength,mute=False):return SimpleNamespace(start_time=start,duration=duration,audioDucking=True,audioDuckingStrength=strength,useOverlayAudio=True,muteMainAudio=mute)
        self.assertEqual(ducking_windows([cue(0,4,.2),cue(1,2,.75)]),[(0,1,.8),(1,3,.25),(3,4,.8)])
        self.assertEqual(ducking_windows([cue(1,2,0)]),[])
        self.assertEqual(ducking_windows([cue(0,4,.2),cue(1,2,.2,True)]),[(0,1,.8),(1,3,0),(3,4,.8)])

    def test_exhausted_return_does_not_fabricate_a_last_frame(self):
        self.assertEqual(overlay_commands('source','prefix',5,1,10,'return',0,[],True,6)[2],0)

    def test_real_ffmpeg_loop_keeps_phase_and_hold_has_silent_tail(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=str(root/'source.mp4')
            run=lambda args:subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=24:duration=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',source])
            def prepare(name,behavior,offset,duration):
                commands,output,visible,_=overlay_commands(source,str(root/name),3,1,duration,behavior,0,[],True,offset)
                for command in commands:run(command)
                self.assertAlmostEqual(visible,duration);return output
            full=prepare('full','loop',0,5);shifted=prepare('shifted','loop',1,3)
            def frame(file,time):return run(['ffmpeg','-v','error','-ss',str(time),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']).stdout
            # Sample after a cycle wrap; this fails when splitting shortens the loop.
            a,b=frame(full,3.5),frame(shifted,2.5)
            self.assertEqual(len(a),len(b));self.assertLess(sum(abs(x-y) for x,y in zip(a,b))/len(a),6)
            held=prepare('held','hold',0,5)
            audio=run(['ffmpeg','-v','error','-ss','2.5','-i',held,'-t','1','-map','0:a','-f','s16le','-']).stdout
            import array
            pcm=array.array('h',audio);self.assertTrue(pcm);self.assertLess(max(abs(v) for v in pcm),8)
            self.assertEqual(frame(held,3),frame(held,4))

    def test_split_layout_filter_is_bounded_and_uses_the_opposite_half(self):
        for x,offset in [(75,0),(25,48)]:
            graph=split_layout_filters('in','out',96,64,SimpleNamespace(x=x),1,2)
            self.assertIn(f'pad=96:64:{offset}:0',graph[1]);self.assertIn('gte(t,1.000000)*lt(t,2.000000)',graph[2])

if __name__=='__main__':unittest.main()
