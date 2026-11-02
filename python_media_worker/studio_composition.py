"""Deterministic flat-layer RGB blending for the canonical Studio stack."""
import math

BLEND_MODES = {"normal", "multiply", "screen", "difference", "overlay", "hard-light", "soft-light", "color-dodge", "luminosity"}


def luminosity_filter(width, window=None):
    # Nonseparable CSS luminosity = SetLum(backdrop, Lum(foreground)), including
    # ClipColor for out-of-gamut values. Read both RGB pictures in one geq input.
    lum = lambda x: f"(0.3*r({x},Y)+0.59*g({x},Y)+0.11*b({x},Y))"
    difference = f"({lum(f'X+{int(width)}')}-{lum('X')})"
    expression = []
    for channel in ('r', 'g', 'b'):
        registers = f"st(0,{lum(f'X+{int(width)}')});st(1,r(X,Y)+{difference});st(2,g(X,Y)+{difference});st(3,b(X,Y)+{difference});st(4,min(ld(1),min(ld(2),ld(3))));"
        registers += ";".join(f"st({index},if(lt(ld(4),0),ld(0)+(ld({index})-ld(0))*ld(0)/(ld(0)-ld(4)),ld({index})))" for index in (1,2,3)) + ";"
        registers += "st(5,max(ld(1),max(ld(2),ld(3))));"
        value = {'r':1, 'g':2, 'b':3}[channel]
        registers += f"if(gt(ld(5),255),ld(0)+(ld({value})-ld(0))*(255-ld(0))/(ld(5)-ld(0)),ld({value}))"
        if window:
            registers = f"if(between(T,{window[0]:.3f},{window[1]:.3f}),{registers},{channel}(X,Y))"
        expression.append(f"{channel}='{registers}'")
    return "hstack=inputs=2,geq=" + ":".join(expression) + f",crop={int(width)}:ih:0:0"


def rgb_blend_filter(mode):
    if mode == "hard-light":
        return "blend=all_mode=hardlight"
    # FFmpeg's built-in softlight and dodge differ from CSS compositing.
    # A is the backdrop; B is the foreground, both in 0..255 RGB.
    if mode == "color-dodge":
        return "blend=all_expr='if(eq(A,0),0,if(eq(B,255),255,min(255,A*255/(255-B))))'"
    if mode == "soft-light":
        d = "if(lte(A,63.75),((16*A/255-12)*A/255+4)*A,sqrt(A*255))"
        return f"blend=all_expr='if(lte(B,127.5),A-(255-2*B)*A*(255-A)/65025,A+(2*B-255)*({d}-A)/255)'"
    return f"blend=all_mode={mode}"


def blend_layer_block(block, input_label, output_label, mode, width, height, duration, prefix, time_window=None):
    mode = str(mode or "normal")
    if mode not in BLEND_MODES:
        raise ValueError(f"Studio blend mode {mode!r} is not implemented for export")
    if mode == "normal":
        return list(block)
    if not block or width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("Invalid Studio blend layer geometry")
    if time_window is not None and (len(time_window) != 2 or
            not all(math.isfinite(value) for value in time_window) or time_window[1] <= time_window[0]):
        raise ValueError("Invalid Studio blend time window")
    blend_filter = luminosity_filter(width, time_window) if mode == 'luminosity' else rgb_blend_filter(mode)
    if time_window and mode != 'luminosity':
        blend_filter += f":enable='between(t,{time_window[0]:.3f},{time_window[1]:.3f})'"
    names = {name: f"{prefix}_{name}" for name in
             ["blank", "foreground", "color", "alpha_in", "alpha", "base", "base_rgb", "keep", "rgb", "blended", "rgba"]}
    # Draw this same ordinary layer block on a transparent canvas. Keep its
    # own timing, geometry, motion, masks and opacity; do not blend in YUV or
    # let the mode modify the layer alpha.
    result = [f"[{input_label}]split=2[{names['keep']}][{names['base']}];",
              f"color=c=black:s={int(width)}x{int(height)}:r=30:d={float(duration):.6f},"
              f"format=rgba,colorchannelmixer=aa=0[{names['blank']}];"]
    result.extend(part.replace(f"[{input_label}]", f"[{names['blank']}]")
                  .replace(f"[{output_label}]", f"[{names['foreground']}]") for part in block)
    result.extend([
        f"[{names['foreground']}]format=rgba,split=2[{names['color']}][{names['alpha_in']}];",
        f"[{names['alpha_in']}]alphaextract[{names['alpha']}];",
        f"[{names['base']}]format=gbrp[{names['base_rgb']}];",
        f"[{names['color']}]format=gbrp[{names['rgb']}];",
        f"[{names['base_rgb']}][{names['rgb']}]{blend_filter}[{names['blended']}];",
        f"[{names['blended']}][{names['alpha']}]alphamerge[{names['rgba']}];",
        f"[{names['keep']}][{names['rgba']}]overlay=0:0:eof_action=pass:repeatlast=0:format=auto[{output_label}];",
    ])
    return result
