"""Styled title assets consumed by the existing canonical layer compositor.

The browser and worker bundle identical Inter 4.1 static fonts. Layout units
are relative to programme height, never the inspector or remaining CSS space.
"""
import math
import re
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont

WEIGHTS = {400: "Regular", 600: "SemiBold", 800: "ExtraBold", 900: "Black"}


def color(value, default="transparent"):
    value = str(value or default)
    if value == "transparent":
        return (0, 0, 0, 0)
    match = re.fullmatch(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)", value)
    if match:
        return (*[min(255, int(n)) for n in match.groups()[:3]], round(255 * min(1, float(match[4]))))
    return ImageColor.getcolor(value, "RGBA")


def title_animation_pose(overlay, time):
    start = float(overlay.get("start_time") or 0)
    duration = max(.05, float(overlay.get("duration") or 3))
    animation = overlay.get("animation") or {}
    pose = {"opacity": 1, "scale": 1, "x": 0, "y": 0}
    for kind, progress in [
        (animation.get("enter"), (time-start)/max(.001, float(animation.get("enterDuration", .3)))),
        (animation.get("exit"), (start+duration-time)/max(.001, float(animation.get("exitDuration", .3)))),
    ]:
        if not kind or kind == "none":
            continue
        remaining = (1-max(0, min(1, progress)))**3
        pose["opacity"] *= 1-remaining
        if kind == "zoom":
            pose["scale"] *= .7+.3*(1-remaining)
        if kind in ("slideLeft", "slideRight"):
            pose["x"] += (-10 if kind == "slideLeft" else 10)*remaining
        if kind in ("slideUp", "slideDown"):
            pose["y"] += (-10 if kind == "slideUp" else 10)*remaining
    return pose


def wrap_lines(text, font, maximum):
    lines = []
    for paragraph in str(text or "").split("\n"):
        line = ""
        for word in paragraph.split(" "):
            candidate = line + (" " if line else "") + word
            if line and font.getlength(candidate) > maximum:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def render_title_asset(overlay, output_path, width, height):
    output_width, output_height = width, height
    width, height = width*720/height, 720
    if (overlay.get("fontFamily") or "Inter") != "Inter":
        raise ValueError("Title font is unavailable for export; choose Inter in Titles before rendering")
    weight = int(overlay.get("fontWeight") or 900)
    if weight not in WEIGHTS:
        raise ValueError("Unsupported title weight")
    unit = height/720
    font = ImageFont.truetype(str(Path(__file__).parent/"assets"/"fonts"/f"Inter-{WEIGHTS[weight]}.ttf"), max(1, round(height/20)))
    padding_x, padding_y = 16*unit, 8*unit
    maximum_width = width*max(.15, min(.9, float(overlay.get("width") or 90)/100))
    maximum = maximum_width-padding_x*2
    lines = wrap_lines(overlay.get("text"), font, maximum)
    line_height = height/20*1.4
    box_width = min(maximum_width, max(1, max(font.getlength(line) for line in lines)+padding_x*2))
    box_height = line_height*len(lines)+padding_y*2
    margin = math.ceil(24*unit)
    image = Image.new("RGBA", (math.ceil(box_width)+margin*2, math.ceil(box_height)+margin*2))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((margin, margin, margin+box_width, margin+box_height), radius=10*unit, fill=color(overlay.get("bg")))
    glyphs = Image.new("RGBA", image.size)
    text_draw = ImageDraw.Draw(glyphs)
    ascent, descent = font.getmetrics()
    for index, line in enumerate(lines):
        length = font.getlength(line)
        align = overlay.get("textAlign") or "center"
        x = margin+padding_x if align == "left" else margin+box_width-padding_x-length if align == "right" else margin+(box_width-length)/2
        baseline = margin+padding_y+index*line_height+(line_height-ascent-descent)/2+ascent
        text_draw.text((x, baseline), line, font=font, anchor="ls", fill=color(overlay.get("color"), "white"),
                       stroke_width=max(0, round(float(overlay.get("strokeWidth") or 0)*unit/2)), stroke_fill=(0, 0, 0, 235))
    shadow = overlay.get("shadow") or "soft"
    if shadow != "none":
        for y, blur, opacity in ([(4, 7, .95), (1, 1, 1)] if shadow == "strong" else [(3, 5, .72)]):
            mask = glyphs.getchannel("A").filter(ImageFilter.GaussianBlur(blur*unit)).point(lambda a: round(a*opacity))
            shade = Image.new("RGBA", image.size, (0, 0, 0, 0)); shade.putalpha(mask)
            image.alpha_composite(shade, (0, round(y*unit)))
    image.alpha_composite(glyphs)
    anchor_x = (margin+box_width*float(overlay.get("anchorX", 50))/100)/image.width*100
    anchor_y = (margin+box_height*float(overlay.get("anchorY", 50))/100)/image.height*100
    image = image.resize((max(1, round(image.width*output_height/720)), max(1, round(image.height*output_height/720))), Image.Resampling.LANCZOS)
    image.save(output_path)
    return {"width": image.width/output_width*100, "height": image.height/output_height*100, "mediaFit": "stretch",
            "anchorX": anchor_x, "anchorY": anchor_y,
            "lines": lines}
