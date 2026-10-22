import copy,json
from pathlib import Path
import numpy as np
import pytest
from studio_vector_shape import validate_vector_shape,rasterize_vector_shape

def contour(lo,hi):
 return {'closed':True,'nodes':[dict(x=x,y=y,**{'in':[0,0],'out':[0,0]}) for x,y in [(lo,lo),(hi,lo),(hi,hi),(lo,hi)]]}
def compound():
 return {'version':2,'contours':[contour(10,90),contour(35,65)],'fill':{'kind':'solid','color':'#7c3aff','endColor':'#00ccff','start':[0,100],'end':[100,0]},'stroke':{'color':'#ffffff','width':0}}

def test_real_counter_is_transparent_on_any_background():
 im=rasterize_vector_shape(compound(),200)
 assert im.getpixel((100,100))[3]==0 and im.getpixel((40,40))[3]==255
 assert im.getpixel((5,5))[3]==0

def test_even_odd_nested_counter_and_overlaps():
 shape=compound();shape['contours'].append(contour(45,55));im=rasterize_vector_shape(shape,200)
 assert im.getpixel((100,100))[3]==255 and im.getpixel((80,80))[3]==0

def test_trim_strokes_do_not_bridge_components_and_empty_range_keeps_fill():
 shape=compound();shape['stroke']['width']=2
 empty=rasterize_vector_shape(shape,200,stroke_start=50,stroke_end=50)
 baseline=compound();assert np.array_equal(np.asarray(empty),np.asarray(rasterize_vector_shape(baseline,200)))
 shape['fill']['kind']='none';part=rasterize_vector_shape(shape,200,stroke_start=0,stroke_end=25,stroke_offset=25)
 assert part.getpixel((50,100))[3]==0 and part.getpixel((180,100))[3]>200

@pytest.mark.parametrize('change',[lambda s:s.update(version=True),lambda s:s.update(nodes=[]),lambda s:s.update(contours=[]),lambda s:s['contours'][0].update(external='url'),lambda s:s['contours'][0]['nodes'][0].update(x=float('nan'))])
def test_invalid_compound_fails_before_raster(change):
 shape=compound();change(shape)
 with pytest.raises(ValueError):validate_vector_shape(shape)

def test_all_bundled_logo_glyphs_are_native_valid_compounds():
 data=json.loads((Path(__file__).parents[1]/'frontend/src/components/motion/logoGlyphs.v1.json').read_text())
 count=0
 for weight in data['weights'].values():
  for glyph in weight['glyphs'].values():
   if glyph['contours']:
    shape=compound();shape['contours']=copy.deepcopy(glyph['contours']);validate_vector_shape(shape);count+=1
 assert count==130
