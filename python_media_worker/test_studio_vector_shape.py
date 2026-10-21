from pathlib import Path
import subprocess
import tempfile
import unittest

import numpy as np
from PIL import Image
from python_media_worker.studio_vector_shape import validate_vector_shape, rasterize_vector_shape, trim_vector_points, validate_vector_trim, vector_points, offset_vector_points
from python_media_worker.studio_layer_motion import render_image_layer_motion


def square():
    return {'version':1,'closed':True,'nodes':[{'x':x,'y':y,'in':[0,0],'out':[0,0]}for x,y in [(10,10),(90,10),(90,90),(10,90)]],
        'fill':{'kind':'linear','color':'#ff0000','endColor':'#0000ff','start':[0,0],'end':[100,0]},'stroke':{'color':'#ffffff','width':0}}


class VectorShapeTests(unittest.TestCase):
    def test_offset_crosses_closed_seam_and_clips_open_endpoints(self):
        points=[(0,0),(100,0),(100,100),(0,100),(0,0)]
        for offset in (80,-20,280):
            self.assertEqual(offset_vector_points(points,0,30,offset,True),[(0,80),(0,0),(40,0)])
        self.assertIs(offset_vector_points(points,0,100,800,True),points)
        self.assertEqual(offset_vector_points(points,50,50,80,True),[])
        self.assertEqual(offset_vector_points(points,80,20,80,True),[])
        self.assertEqual(offset_vector_points([(0,0),(100,0)],0,30,80,False),[(80,0),(100,0)])
        self.assertEqual(offset_vector_points([(0,0),(100,0)],0,30,-20,False),[(0,0),(10,0)])
        self.assertEqual(offset_vector_points([(0,0),(100,0)],0,30,100,False),[])
        for bad in (True,float('nan'),1001,-1001):
            with self.assertRaises(ValueError):offset_vector_points(points,0,30,bad,True)

    def test_offset_keeps_fill_and_has_no_false_diagonal_at_closed_seam(self):
        spec=square();spec['stroke'].update(width=4,color='#00ff00')
        full=np.asarray(rasterize_vector_shape(spec,200))
        np.testing.assert_array_equal(full,np.asarray(rasterize_vector_shape(spec,200,stroke_offset=-950)))
        partial=np.asarray(rasterize_vector_shape(spec,200,stroke_end=30,stroke_offset=80))
        np.testing.assert_array_equal(full[100,100],partial[100,100])
        self.assertEqual(partial[20,40,1],255)
        self.assertEqual(partial[40,20,1],255)
        spec['fill']['kind']='none'
        partial=np.asarray(rasterize_vector_shape(spec,200,stroke_end=30,stroke_offset=80))
        self.assertEqual(partial[50,50,3],0)  # No chord between tail and head.
        self.assertGreater(partial[20,20,3],240)  # Continuous round join at seam.

    def test_actual_offset_movie_completes_repeated_loops_and_reverse_programme_motion(self):
        with tempfile.TemporaryDirectory() as folder:
            spec=square();spec['fill']['kind']='none';spec['stroke'].update(width=4,color='#00ff00')
            overlay={'id':'art','type':'image','frameShape':'edge','start_time':0,'duration':4,'width':100,'height':100,'x':50,'y':50}
            layer={'id':'art','vector_shape':spec,'effects':{},'base_transform':{'stroke_end':20},
                'motion_keyframes':[{'property':'strokeOffset','time':0,'value':0,'easing':'linear'},
                    {'property':'strokeOffset','time':2,'value':200,'easing':'linear'},
                    {'property':'strokeOffset','time':4,'value':0,'easing':'linear'}]}
            output=Path(folder)/'offset.mov'
            render_image_layer_motion(None,output,overlay,layer,64,64,2,[{'start_time':0,'end_time':4,'rate':2}],4)
            raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-f','rawvideo','-pix_fmt','rgba','-'])
            frames=np.frombuffer(raw,np.uint8).reshape(8,64,64,4)
            np.testing.assert_array_equal(frames[0],frames[2])
            np.testing.assert_array_equal(frames[2],frames[4])
            np.testing.assert_array_equal(frames[1],frames[7])
            self.assertGreater(np.count_nonzero(frames[0]!=frames[1]),100)
            self.assertGreater(frames[0,6,30,3],200)
            self.assertEqual(frames[1,6,30,3],0)
    def test_dense_curved_stroke_has_no_join_pinholes_inside_the_outline(self):
        spec = square(); spec['closed'] = False
        spec['nodes'] = [dict(x=15,y=78,**{'in':[0,0],'out':[0,-48]}),
            dict(x=49,y=15,**{'in':[-16,0],'out':[20,0]}),
            dict(x=85,y=78,**{'in':[0,-46],'out':[0,0]})]
        spec['fill']['kind'] = 'none'; spec['stroke'].update(width=3,color='#00d4ff')
        alpha = np.asarray(rasterize_vector_shape(spec,1024,stroke_end=99))[:,:,3]
        points = vector_points(spec)
        for i in range(5,245):
            x,y = points[i]; p,q = points[i-1],points[i+1]
            dx,dy = q[0]-p[0],q[1]-p[1]; length = (dx*dx+dy*dy)**.5
            for side in (-.32,.32):
                px,py = round((x-dy/length*3*side)*10.24),round((y+dx/length*3*side)*10.24)
                self.assertGreaterEqual(int(alpha[py,px]),240)
    def test_trim_distance_empty_and_repeated_points(self):
        points = [(0, 0), (0, 0), (90, 0), (90, 10)]
        self.assertEqual(trim_vector_points(points, 25, 95), [(25, 0), (90, 0), (90, 5)])
        self.assertEqual(trim_vector_points(points, 50, 50), [])
        self.assertEqual(trim_vector_points(points, 80, 20), [])
        self.assertEqual(trim_vector_points([(2, 2), (2, 2)]), [])
        for value in (True, float('nan'), -1, 101):
            with self.assertRaises(ValueError): trim_vector_points(points, value, 100)

    def test_trim_preserves_fill_and_closed_path_seam(self):
        spec = square(); spec['stroke'].update(width=4, color='#00ff00')
        full = np.asarray(rasterize_vector_shape(spec, 200))
        empty = np.asarray(rasterize_vector_shape(spec, 200, stroke_start=50, stroke_end=50))
        partial = np.asarray(rasterize_vector_shape(spec, 200, stroke_start=0, stroke_end=25))
        np.testing.assert_array_equal(empty[100, 100], full[100, 100])
        self.assertEqual(partial[20, 100, 1], 255)
        self.assertNotEqual(partial[100, 180, 1], 255)
        self.assertGreater(full[100, 180, 3], 0)
        spec['fill']['kind'] = 'none'
        self.assertEqual(np.asarray(rasterize_vector_shape(spec, 200, stroke_end=0))[:, :, 3].max(), 0)

    def test_trim_rejects_nonvector_and_invalid_saved_decisions(self):
        for layer in [
            {'motion_keyframes': [{'property':'strokeEnd','value':50,'time':0}]},
            {'base_transform': {'stroke_end':50}},
            {'vector_shape': square(), 'base_transform': {'stroke_end':True}},
            {'vector_shape': square(), 'motion_keyframes': [{'property':'strokeEnd','value':101,'time':0}]},
            {'vector_shape': square(), 'motion_keyframes': [{'property':'strokeEnd','value':50,'time':float('nan')}]},
        ]:
            with self.assertRaises(ValueError): validate_vector_trim(layer)

    def test_actual_movie_draws_holds_and_erases_without_stale_pose_reuse(self):
        with tempfile.TemporaryDirectory() as folder:
            spec = square(); spec['fill']['kind'] = 'none'; spec['stroke'].update(width=4, color='#00ff00')
            output = Path(folder)/'trim.mov'
            overlay = {'id':'art','type':'image','frameShape':'edge','start_time':0,'duration':2,
                'width':100,'height':100,'x':50,'y':50,'mediaFit':'contain'}
            animation = [{'id':str(i),'property':p,'time':t,'value':v,'easing':e} for i,(p,t,v,e) in enumerate([
                ('strokeEnd',0,0,'linear'),('strokeEnd',.5,50,'linear'),('strokeEnd',1,50,'hold'),
                ('strokeEnd',1.5,100,'linear'),('strokeStart',0,0,'linear'),('strokeStart',1.5,0,'hold'),
                ('strokeStart',1.75,100,'linear')])]
            layer = {'id':'art','vector_shape':spec,'base_transform':{},'motion_keyframes':animation,'effects':{}}
            render_image_layer_motion(None,output,overlay,layer,64,64,2,[],4)
            result = subprocess.run(['ffmpeg','-v','error','-i',str(output),'-f','rawvideo','-pix_fmt','rgba','-'],capture_output=True,check=True,timeout=30)
            frames = np.frombuffer(result.stdout,np.uint8).reshape(8,64,64,4)
            self.assertEqual(frames[0,:,:,3].max(),0)
            np.testing.assert_array_equal(frames[2],frames[3])
            np.testing.assert_array_equal(frames[3],frames[4])
            self.assertGreater(np.count_nonzero(frames[6,:,:,3]),np.count_nonzero(frames[2,:,:,3]))
            self.assertEqual(frames[7,:,:,3].max(),0)

    def test_trim_uses_programme_keys_after_output_speed_mapping(self):
        with tempfile.TemporaryDirectory() as folder:
            spec = square(); spec['fill']['kind'] = 'none'; spec['stroke'].update(width=4, color='#00ff00')
            output = Path(folder)/'speed.mov'
            overlay = {'id':'art','type':'image','frameShape':'edge','start_time':0,'duration':2,
                'width':100,'height':100,'x':50,'y':50}
            layer = {'id':'art','vector_shape':spec,'base_transform':{},'effects':{},
                'motion_keyframes':[{'property':'strokeEnd','time':0,'value':0,'easing':'linear'},
                    {'property':'strokeEnd','time':2,'value':100,'easing':'linear'}]}
            receipt = render_image_layer_motion(None,output,overlay,layer,64,64,1,
                [{'start_time':0,'end_time':2,'rate':2}],4)
            self.assertEqual(receipt['duration'],1)
            raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-f','rawvideo','-pix_fmt','rgba','-'])
            frames = np.frombuffer(raw,np.uint8).reshape(4,64,64,4)
            self.assertEqual(frames[0,:,:,3].max(),0)
            self.assertGreater(frames[2,32,58,3],200)  # Half path at programme t=1.
            self.assertEqual(frames[1,32,58,3],0)    # Quarter path at programme t=.5.
    def test_alpha_and_gradient_follow_canonical_contour(self):
        pixels=np.asarray(rasterize_vector_shape(square(),100))
        self.assertEqual(pixels[0,0,3],0);self.assertEqual(pixels[50,50,3],255)
        np.testing.assert_allclose(pixels[50,25,:3],[190,0,65],atol=1)
        repeated=square();repeated['nodes']*=2
        self.assertEqual(rasterize_vector_shape(repeated,100).getpixel((50,50))[3],0)
        changed=square();changed['nodes'][0]['out']=[0,50]
        self.assertGreater(np.count_nonzero(np.asarray(rasterize_vector_shape(changed,100))[:,:,3]!=pixels[:,:,3]),100)

    def test_untrusted_geometry_rejects_before_raster_allocation(self):
        cases=[]
        for key,value in [('x',True),('x',float('inf')),('in',[201,0]),('href','https://external')]:
            item=square();item['nodes'][0][key]=value;cases.append(item)
        item=square();item['fill']['color']='url(https://external)';cases.append(item)
        item=square();item['fill']['end']=[0,0];cases.append(item)
        for item in cases:
            with self.assertRaises(ValueError):validate_vector_shape(item)
        with self.assertRaises(ValueError):rasterize_vector_shape(square(),8192)

    def test_actual_image_compositor_uses_edited_contour_not_stale_cached_pixels(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'cached.png';output=Path(folder)/'vector.mov'
            Image.new('RGBA',(32,32),'green').save(source)
            spec=square();spec['fill'].update(kind='solid',color='#0000ff')
            overlay={'id':'art','start_time':0,'duration':.5,'width':100,'height':100,'x':50,'y':50,'mediaFit':'contain'}
            layer={'id':'art','vector_shape':spec,'base_transform':{'x':50,'y':50,'scale':1,'opacity':1},'effects':{}}
            render_image_layer_motion(source,output,overlay,layer,64,64,.5,[],4)
            result=subprocess.run(['ffmpeg','-v','error','-i',str(output),'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],capture_output=True,check=True,timeout=30)
            pixels=np.frombuffer(result.stdout,np.uint8).reshape(64,64,4)
            np.testing.assert_array_equal(pixels[32,32],[0,0,255,255]);self.assertEqual(pixels[0,0,3],0)


if __name__=='__main__':unittest.main()
