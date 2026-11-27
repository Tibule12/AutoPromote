"""Fuse only the exact neutral finish into the existing final compositor.

Keep the same Rec709 conversion before titles. Eliminate an otherwise neutral
full-video lossy encode, not any colour/motion/effect decision. Unknown filters
or upstream effects remain on their existing pipeline.
"""
def can_fuse_neutral_finish(filter_text, *, adjustment_layers, request):
    if not filter_text or adjustment_layers:
        return False
    if any(getattr(request, name, None) for name in (
        "creative_effects", "subjectVfx", "threeDGraphics",
        "silence_removal", "visual_enhance", "remove_watermark", "professional_cleanup")):
        return False
    creative = getattr(request, "creative_plan", None)
    if creative:
        enabled = creative.get("enabled", True) if isinstance(creative, dict) else getattr(creative, "enabled", True)
        if enabled: return False
    graphics = getattr(request, "motionGraphics", None)
    if graphics and (not isinstance(graphics, dict) or any(
            value for key, value in graphics.items() if key != "version")):
        return False
    speed = getattr(request, "speed_segments", None) or []
    if len(speed) > 1 or any((item.get("rate") if isinstance(item, dict) else getattr(item, "rate", None)) != 1 for item in speed):
        return False
    parts = filter_text.split(",")
    neutral = "eq=brightness=0.0000:contrast=1.0000:saturation=1.0000:eval=frame"
    allowed = {neutral, "scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p",
               "setparams=range=limited:colorspace=bt709", "setsar=1"}
    return parts[0] == neutral and all(part in allowed for part in parts)
