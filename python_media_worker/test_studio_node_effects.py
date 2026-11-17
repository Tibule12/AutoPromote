import copy
import json
from pathlib import Path
import subprocess
import numpy as np
import pytest
from PIL import Image
from studio_node_effects import apply_node_effects, validate_node_effects
from studio_layer_cache import video_layer_uses_canonical_raster

BASE={'version':1,'key':{'enabled':False,'mode':'chroma','color':'#00d455','similarity':.32,'smoothness':.14,'spill':.48,'choke':0,'invert':False},'optical':{'halation':0,'streak':0},'warp':{'enabled':False,'x':8,'y':6,'frequency':2.2},'defocus':0,'depth':0}
ROOT=Path(__file__).resolve().parents[1]

def sample():
    rng=np.random.default_rng(4)
    a=rng.integers(0,256,(17,19,4),dtype=np.uint8);a[:4,:,:]=[0,212,85,255];a[7:11,7:11]=[255,255,255,255]
    return a

@pytest.mark.parametrize('patch',[
 {'key':{'enabled':True}}, {'key':{'enabled':True,'mode':'hsl_delta'}}, {'key':{'enabled':True,'mode':'luma'}},
 {'key':{'enabled':True,'choke':2}}, {'key':{'enabled':True,'choke':-2}}, {'key':{'enabled':True,'choke':20}}, {'key':{'enabled':True,'choke':-20}}, {'key':{'enabled':True,'invert':True}},
 {'optical':{'halation':.7}}, {'optical':{'streak':.8}}, {'defocus':3}, {'warp':{'enabled':True,'x':3,'y':4}},
 {'key':{'enabled':True},'optical':{'halation':.5,'streak':.6},'warp':{'enabled':True},'defocus':2},
])
def test_browser_worker_pixel_equations_match(patch):
    spec=copy.deepcopy(BASE)
    for k,v in patch.items():
        if isinstance(v,dict):spec[k].update(v)
        else:spec[k]=v
    a=sample();expected=np.array(apply_node_effects(Image.fromarray(a),spec,.73,.8))
    js="""const fs=require('fs'),vm=require('vm');const p=JSON.parse(fs.readFileSync(0,'utf8'));const source=fs.readFileSync(p.path,'utf8').replace(/export /g,'');const s={};vm.createContext(s);vm.runInContext(source+';globalThis.apply=applyStudioNodeEffects',s);const d=new Uint8ClampedArray(p.data);s.apply(d,p.w,p.h,p.spec,.73,.8);process.stdout.write(JSON.stringify([...d]));"""
    result=subprocess.run(['node','-e',js],input=json.dumps({'path':str(ROOT/'frontend/src/components/studioNodeEffects.js'),'data':a.flatten().tolist(),'w':19,'h':17,'spec':spec}),capture_output=True,text=True,check=True)
    actual=np.array(json.loads(result.stdout)).reshape(a.shape)
    assert np.max(np.abs(actual.astype(int)-expected.astype(int))) <= 1

@pytest.mark.parametrize('field,value',[('defocus',float('nan')),('depth',101),('version',2),('extra',0)])
def test_malformed_contract_rejected(field,value):
    spec=copy.deepcopy(BASE);spec[field]=value
    with pytest.raises(ValueError):validate_node_effects(spec)

@pytest.mark.parametrize('patch',[{'key':{'enabled':True}},{'warp':{'enabled':True}},{'optical':{'halation':.5}},{'defocus':2}])
def test_static_video_effects_use_canonical_compositor(patch):
    spec=copy.deepcopy(BASE)
    for k,v in patch.items():
        if isinstance(v,dict):spec[k].update(v)
        else:spec[k]=v
    assert video_layer_uses_canonical_raster('i',{'effects':{'node':spec}}, {'layers':[]})

def test_key_output_really_removes_screen_without_erasing_foreground():
    spec=copy.deepcopy(BASE);spec['key']['enabled']=True
    a=np.array([[[0,212,85,255],[255,0,0,128]]],dtype=np.uint8)
    result=np.array(apply_node_effects(Image.fromarray(a),spec))
    assert result[0,0,3]==0 and result[0,1,3]==128
