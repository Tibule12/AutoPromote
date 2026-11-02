#!/usr/bin/env python3
"""Self-contained title mattes from the same licensed fonts as ordinary titles."""
import hashlib,json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import ImageFont
ROOT=Path(__file__).resolve().parents[1]
metrics=json.loads((ROOT/'frontend/src/components/motion/textMetrics.v1.json').read_text())
result={'version':1,'size':36,'lineHeight':50.4,'weights':{}}
for weight,suffix in [(400,'Regular'),(600,'SemiBold'),(800,'ExtraBold'),(900,'Black')]:
    path=ROOT/f'python_media_worker/assets/fonts/Inter-{suffix}.ttf'
    font=TTFont(path);glyphs=font.getGlyphSet();cmap=font.getBestCmap();raster=ImageFont.truetype(str(path),36)
    data={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'unitsPerEm':font['head'].unitsPerEm,'glyphs':{}}
    for char,advance in metrics['weights'][str(weight)]['advances'].items():
        pen=SVGPathPen(glyphs);glyphs[cmap[ord(char)]].draw(pen)
        data['glyphs'][char]={'path':pen.getCommands(),'advance':advance}
    result['weights'][str(weight)]=data
out=ROOT/'frontend/src/components/motion/titleGlyphs.v1.json';out.write_text(json.dumps(result,separators=(',',':'))+'\n');print('Native title glyph bytes:',out.stat().st_size)
