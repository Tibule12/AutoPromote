"""Compare native camera projection against the actual Three.js matrices."""
import json
import os
import subprocess
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from plane_scene import plane_corners


def test_native_plane_sequence_contains_each_moving_texture_frame(tmp_path):
    from PIL import Image
    from plane_scene import render_plane_scene
    scene=json.loads((Path(__file__).parent/'smoke.json').read_text())['scene']
    scene.update(template='media_plane',assetAspect=16/9,entrance='fade',hold='still',exit='fade',
                 x=50,y=50,z=0,rotationX=0,rotationY=-17,rotationZ=0,scale=1,cameraMotion=0)
    texture=tmp_path/'texture';texture.mkdir()
    output=tmp_path/'frames';output.mkdir()
    for index in range(6):
        Image.new('RGB',(160,90),(30+index*30,60,90)).save(texture/f'texture_{index+1:04d}.png')
    render_plane_scene(dict(scene=scene,width=160,height=90,duration=.5,fps=12),texture/'texture_0001.png',output)
    images=sorted(output.glob('frame_*.png'))
    assert len(images)==6
    for index in range(1,6):
        pixel=Image.open(images[index]).getpixel((80,45))
        assert abs(pixel[0]-(30+index*30))<=2
        assert pixel[3]>0


def test_camera_object_depth_and_xyz_rotation_match_three_projection():
    root=Path(__file__).resolve().parents[2]
    code=r'''
const root=process.argv[1],THREE=require(root+'/frontend/node_modules/three'),babel=require(root+'/frontend/node_modules/@babel/core'),Module=require('module');
function read(name){const file=root+'/frontend/src/components/threeD/'+name+'.js',m=new Module(file);m._compile(babel.transformFileSync(file,{configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs',{paths:[root+'/frontend']})]}).code,file);return m.exports;}
const model=read('studio3DModel'),projection=read('studio3DProjection'),out=[];
for(const aspect of [16/9,9/16,1])for(const time of [.5,1.5,2.5]){
 const scene=model.normalizeStudio3DScene({...model.createStudio3DScene('media_plane',0,'plane'),duration:3,assetType:'video',assetAspect:16/9,assetContentHash:'a'.repeat(64),assetSourceStart:2,
 x:61,y:43,z:.7,rotationX:17,rotationY:-29,rotationZ:8,scale:1.13,cameraMotion:.6});
 const pose=model.studio3DPose(scene,time),g=new THREE.Object3D();g.position.set(pose.x,pose.y,pose.z);g.scale.setScalar(pose.scale);g.rotation.set(...[pose.rotationX,pose.rotationY,pose.rotationZ].map(n=>n*Math.PI/180),'ZYX');g.updateMatrixWorld(true);
 const c=projection.studio3DCameraProjection(scene,aspect,time),camera=new THREE.PerspectiveCamera(c.verticalFov,aspect,.1,100);camera.position.set(c.x,0,c.distance);camera.updateMatrixWorld(true);
 const h=3.4/scene.assetAspect,corners=[[-3.4,h,.18],[3.4,h,.18],[3.4,-h,.18],[-3.4,-h,.18]].map(v=>{const p=new THREE.Vector3(...v).applyMatrix4(g.matrixWorld).project(camera);return[(p.x+1)/2,(1-p.y)/2]});
 out.push({scene,time,width:aspect>=1?720:Math.round(720*aspect),height:aspect>=1?720/aspect:720,corners,opacity:pose.opacity});
}process.stdout.write(JSON.stringify(out));
'''
    env=dict(os.environ);env['NODE_PATH']=str(root/'../AutoPromote/node_modules')
    samples=json.loads(subprocess.check_output(['node','-e',code,str(root)],env=env))
    for sample in samples:
        corners,opacity=plane_corners(sample['scene'],sample['time'],sample['width'],sample['height'])
        np.testing.assert_allclose(corners,sample['corners'],rtol=0,atol=1e-12)
        assert abs(opacity-sample['opacity'])<1e-12


def test_fractional_delivery_budget_removes_float_noise_without_losing_real_partial_frames():
    from scene_motion import delivery_frame_count
    assert delivery_frame_count(dict(duration=3.3000000000000007,fps=30))==99
    assert delivery_frame_count(dict(duration=3.3001,fps=30))==100
