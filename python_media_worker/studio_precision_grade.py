"""RGB tone transfer matching studioPrecisionGrade.js, before graphics/captions."""
def build_precision_grade_filter(fx):
    def value(key, default, low, high):
        return max(low, min(high, float(fx.get(key, default))))
    exposure = 2 ** value("exposureStops", 0, -2, 2)
    lift = value("lift", 0, -.15, .15)
    gamma = value("gamma", 1, .6, 1.6)
    gain = value("gain", 1, .6, 1.4)
    warmth, tint = value("temperature", 0, -1, 1), value("tint", 0, -1, 1)
    contrast, brightness = value("contrast", 1, .65, 1.75), value("brightness", 1, .65, 1.4)
    saturation = value("saturation", 1, 0, 1.8)
    balance = [1+warmth*.1+tint*.04, 1-tint*.08, 1-warmth*.1+tint*.04]
    channels = []
    for name, wb in zip("rgb", balance):
        scale = exposure * brightness * gain * wb
        channels.append(f"{name}='clip((pow(max(0,val/255*{scale:.8f}+{lift:.8f}),{1/gamma:.8f})-0.5)*{contrast:.8f}+0.5,0,1)*255'")
    matrix = []
    for row, name in enumerate("rgb"):
        for col, weight in enumerate([.2126, .7152, .0722]):
            coefficient = (1-saturation)*weight + (saturation if row == col else 0)
            matrix.append(f"{name}{'rgb'[col]}={coefficient:.8f}")
    return "format=rgb24,lutrgb=" + ":".join(channels) + ",colorchannelmixer=" + ":".join(matrix)
