from pathlib import Path
import json
from PIL import Image
from model_workers.common import sha
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=Path('reports/background-replacement-20261101/private');cache=CachedSubjectMatte(p/'opaque-alpha-first/subject_masks',p/'first.mkv')
cleanup={'id':'tv-fragments','type':'foreground_refine','start':0,'end':1/24,'choke':0,'feather':.3,'edge_radius':0,'decontaminate':0,
 'recover_box':[0,0,0,0],'recover_hue':210,'hue_tolerance':30,'saturation_min':.25,
 'detail_box':[.77,.51,.89,.65],'dark_max':0,'clear_box':[0,0,0,0],'reject_hue':230,'reject_tolerance':45,'reject_saturation':.5,'reject_value':.18,'after_holdout':True,'reject_connected':False}
orange={**cleanup,'id':'screen-fringe','detail_box':[.59,.40,1,.75],'reject_hue':15,'reject_tolerance':20,'reject_saturation':.72,'reject_value':.83}
effects=[{'id':'set','type':'background_replace','start':0,'end':1/24,'asset_id':'room','asset_sha256':sha(p/'replacement.png'),'blur':2,'exposure':-.35,'saturation':.8},
 {'id':'light','type':'foreground_grade','start':0,'end':1/24,'exposure':-.08,'saturation':.95,'contrast':1.02},cleanup,orange]
plan={'version':1,'source_sha256':sha(p/'first.mkv'),'matte_sha256':cache.artifact_sha256,'effects':effects}
renderer=VfxFrameRenderer(plan,cache,lambda _:p/'replacement.png');renderer.render(Image.open(p/'source-frame.png').convert('RGB'),0).save(p/'treated-first.png')
(p/'review-effects.json').write_text(json.dumps(effects,indent=2))
