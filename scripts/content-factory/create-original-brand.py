"""Create original editable AutoPromote brand artwork on CPU, without inference.

The symbol is authored geometry. Typography is outlined from the installed
Ubuntu Sans font, so exported SVGs require no fonts or external resources.
Preparation dependencies: fonttools, cairosvg, Pillow.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image


SYMBOL = [
    {'id': 'forward-fold', 'fill': '#8453f6',
     'path': 'M112 16H155C186 16 206 35 206 63C206 91 186 110 155 110H142V156H112ZM142 45V81H151C166 81 175 76 175 63C175 50 166 45 151 45Z'},
    {'id': 'rising-plane', 'fill': '#aa8aff',
     'path': 'M10 156 60 26Q64 16 74 16H93L144 156H110L100 128H51L41 156ZM62 98H89L76 60Z'},
]


def document(width, height, body, label='AutoPromote logo'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(label)}">'
            f'<title>{html.escape(label)}</title>{body}</svg>')


def symbol(color=None):
    return '<g transform="translate(-.88 22.04) scale(.86)">' + ''.join(
        f'<path id="{p["id"]}" fill="{color or p["fill"]}" fill-rule="evenodd" d="{p["path"]}"/>' for p in SYMBOL) + '</g>'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--font', type=Path, default=Path('/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf'))
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    original_font = TTFont(args.font)
    license_text = '\n\n'.join(dict.fromkeys(n.toUnicode() for n in original_font['name'].names if n.nameID in {0, 13, 14}))
    (out / 'typography-license.txt').write_text(license_text)
    font = instantiateVariableFont(original_font, {'wght': 620, 'wdth': 100}, inplace=False)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    em = font['head'].unitsPerEm
    size = 87
    scale = size / em
    cursor = 0
    word_parts = []
    word_paths = []
    for index, char in enumerate('AutoPromote'):
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        path = pen.getCommands()
        word_parts.append({'id': f'wordmark-{index + 1:02}', 'character': char, 'path': path,
                           'transform': [scale, 0, 0, -scale, cursor, 0]})
        word_paths.append(f'<path id="wordmark-{index + 1:02}" d="{path}" transform="translate({cursor:.5f} 0) scale({scale:.8f} {-scale:.8f})"/>')
        cursor += (font['hmtx'][name][0] - 17) * scale
    width, height = round(230 + cursor + 62), 264
    words = ''.join(word_paths)

    def lockup(word_color, mono=None):
        return (f'<g id="symbol" transform="translate(31 36)">{symbol(mono)}</g>'
                f'<g id="wordmark" transform="translate(230 164)" fill="{word_color}">{words}</g>')

    artifacts = []

    def save(name, svg, png_width=None):
        path = out / (name + '.svg')
        path.write_text(svg)
        png = out / (name + '.png')
        cairosvg.svg2png(bytestring=svg.encode(), write_to=str(png), output_width=png_width or 1800)
        for file in (path, png):
            artifacts.append({'path': file.name, 'sha256': hashlib.file_digest(file.open('rb'), 'sha256').hexdigest(),
                              'bytes': file.stat().st_size, 'role': 'editable_vector' if file.suffix == '.svg' else 'raster_export'})

    save('autopromote-logo-dark', document(width, height, lockup('#f4f0ff')))
    save('autopromote-logo-light', document(width, height, lockup('#10121b')))
    save('autopromote-logo-white', document(width, height, lockup('#ffffff', '#ffffff')))
    save('autopromote-logo-black', document(width, height, lockup('#000000', '#000000')))
    save('autopromote-symbol', document(192, 192, symbol()), 1024)
    save('autopromote-symbol-white', document(192, 192, symbol('#ffffff')), 1024)
    app_icon = '<rect width="256" height="256" rx="57" fill="#0b0d15"/><g transform="translate(34 34)">' + symbol() + '</g>'
    save('autopromote-app-icon', document(256, 256, app_icon, 'AutoPromote app icon'), 1024)
    for dimension in (24, 32, 48, 64, 128, 256):
        cairosvg.svg2png(bytestring=document(256, 256, app_icon).encode(), write_to=str(out / f'app-icon-{dimension}.png'),
                        output_width=dimension, output_height=dimension)
    presentation = (f'<rect width="1600" height="1000" fill="#0b0d15"/>'
                    f'<g transform="translate(180 252) scale({1240 / width:.8f})">{lockup("#f4f0ff")}</g>'
                    '<path d="M160 645H1440" stroke="#242632"/>'
                    f'<g transform="translate(241 720) scale(.8)">{symbol("#ffffff")}</g>'
                    f'<g transform="translate(720 720) scale(.8)">{symbol()}</g>'
                    '<rect x="1150" y="698" width="188" height="188" rx="44" fill="#171925"/>'
                    f'<g transform="translate(1168 714) scale(.8)">{symbol()}</g>')
    save('brand-preview', document(1600, 1000, presentation, 'AutoPromote original logo with monochrome and app-icon variants'), 1600)
    geometry = {'version': 1, 'coordinateSystem': 'SVG; x right, y down', 'symbolViewBox': [0, 0, 192, 192],
                'symbolParts': SYMBOL, 'symbolTransform': [.86, 0, 0, .86, -.88, 22.04], 'symbolFillRule': 'evenodd',
                'wordmark': {'text': 'AutoPromote', 'parts': word_parts,
                'fontFamily': 'Ubuntu Sans', 'weight': 620, 'size': size, 'width': cursor},
                'lockup': {'width': width, 'height': height, 'symbolTranslate': [31, 36], 'wordmarkTranslate': [230, 164]},
                'uniformScalingOnly': True, 'notes': 'Original parametric paths and affine transforms; no raster trace or 3D-render claim.'}
    (out / 'logo-geometry.json').write_text(json.dumps(geometry, indent=2))
    story = {'about': 'Raw creative pieces become a coherent identity.', 'whyCare': 'A recognisable mark lets viewers associate finished work with AutoPromote.',
             'hook': 'An upward diagonal meets a forward folded shape.', 'beginning': 'Two independent geometric components.',
             'development': 'The components join into a compact A/P-inspired monogram.', 'tension': 'The open counter and diagonal seam withhold the complete silhouette.',
             'payoff': 'The parts read as one strong symbol beside AutoPromote.', 'ending': 'A clean, readable brand lockup.',
             'withheld': 'For a later ident: the complete wordmark until the symbol resolves.',
             'amplify': ['The diagonal join', 'The open counter', 'The final two-tone silhouette'],
             'remove': ['Glowing strokes', 'Decorative particles', 'Generic film reels', 'The former rocket artwork']}
    metadata = {'status': 'ORIGINAL_LOGO_FOR_FOUNDER_REVIEW', 'model': 'authored vector geometry / no generative inference',
                'tool': 'SVG / outlined typography / CPU Cairo raster export', 'sourceBrief': 'Create a new AutoPromote logo from scratch.',
                'settings': {'symbolColors': ['#aa8aff', '#8453f6'], 'ink': '#0b0d15', 'ivory': '#f4f0ff', 'fontWeight': 620},
                'story': story, 'nativeGeometry': 'logo-geometry.json', 'artifacts': artifacts,
                'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'gpuUsed': False,
                'publicAppChanged': False, 'identIntegrationStatus': 'not_integrated; new vector asset is prepared for a dedicated reveal'}
    (out / 'brand-asset.json').write_text(json.dumps(metadata, indent=2))
    for name in ('autopromote-logo-dark', 'autopromote-logo-light', 'autopromote-symbol'):
        image = Image.open(out / (name + '.png'))
        assert image.mode == 'RGBA' and image.getextrema()[-1] == (0, 255), f'Transparency failed: {name}'
    print(json.dumps({'status': metadata['status'], 'output': str(out), 'vectorAndPngPairs': len(artifacts) // 2, 'gpuUsed': False}))


if __name__ == '__main__':
    main()
