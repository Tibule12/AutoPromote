from python_media_worker.studio_pro_render_engine import (
    LOUDNESS_STANDARDS,
    build_audio_master_loudnorm_filter,
    build_film_emulation_filter,
    build_optical_flow_speed_filter,
    build_power_window_filter,
    build_reverse_freeze_filter,
    select_video_encode_profile,
    write_hsl_qualifier_cube,
)


def test_select_video_encode_profile_prefers_nvenc_when_available_and_falls_back_cleanly():
    hw = select_video_encode_profile(
        prefer_hw=True,
        detected_caps={"h264_nvenc": True, "hevc_nvenc": False},
    )
    assert hw["encoder"] == "h264_nvenc"
    assert hw["hardware"] is True
    assert "-c:v" in hw["args"] and "h264_nvenc" in hw["args"]

    cpu = select_video_encode_profile(
        prefer_hw=True,
        fps=60,
        width=3840,
        height=2160,
        detected_caps={"h264_nvenc": False, "hevc_nvenc": False},
    )
    assert cpu["encoder"] == "libx264"
    assert cpu["hardware"] is False
    assert "faster" in cpu["args"]


def test_optical_flow_slowmo_and_reverse_freeze_filters():
    slow = build_optical_flow_speed_filter(0.5, target_fps=60, optical_flow=True)
    assert "setpts=2.000000*(PTS-STARTPTS)" in slow
    assert "minterpolate=fps=60" in slow

    rev = build_reverse_freeze_filter(mode="reverse", has_audio=True)
    assert "reverse" in rev["video_filter"]
    assert "areverse" in rev["audio_filter"]

    frz = build_reverse_freeze_filter(mode="freeze", hold_seconds=2.5, has_audio=True)
    assert "tpad=stop_mode=clone:stop_duration=2.500" == frz["video_filter"]
    assert "apad=pad_dur=2.500" == frz["audio_filter"]


def test_film_emulation_and_lufs_master_filters():
    film = build_film_emulation_filter(
        {"halation": 30, "chromaticAberration": 20, "filmGrain": 25}
    )
    assert "rgbashift=" in film
    assert "gblur=" in film
    assert "noise=alls=" in film

    unit_film = build_film_emulation_filter(
        {"halation": 0.28, "chromaticAberration": 0.08, "filmGrain": 0.18}
    )
    assert "rgbashift=" in unit_film
    assert "gblur=" in unit_film
    assert "noise=alls=" in unit_film

    optical_film = build_film_emulation_filter(
        {"dreamGlow": 0.45, "anamorphicFlare": 0.6, "lensBlur": 0.35}
    )
    assert "maskedmerge" in optical_film
    assert "lutrgb=" in optical_film
    assert "sigmaV=0.5" in optical_film
    assert "blend=all_mode=screen" in optical_film

    assert build_audio_master_loudnorm_filter("social") == "loudnorm=I=-14.0:TP=-1.0:LRA=7"
    assert build_audio_master_loudnorm_filter("podcast") == "loudnorm=I=-16.0:TP=-1.0:LRA=7"
    assert build_audio_master_loudnorm_filter("broadcast") == "loudnorm=I=-23.0:TP=-1.0:LRA=7"
    assert set(LOUDNESS_STANDARDS.keys()) == {"social", "podcast", "broadcast"}


def test_hsl_qualifier_cube_and_power_window_filter(tmp_path):
    cube_path = tmp_path / "qualifier.cube"
    written = write_hsl_qualifier_cube(
        {
            "enabled": True,
            "hueCenter": 0.08,
            "hueWidth": 0.1,
            "satMin": 0.15,
            "satMax": 0.9,
            "lumMin": 0.1,
            "lumMax": 0.9,
            "softness": 0.25,
            "hueShift": 0.1,
            "saturation": 1.3,
            "gain": 1.1,
        },
        str(cube_path),
        size=5,
    )
    assert written == str(cube_path)
    lines = cube_path.read_text(encoding="ascii").strip().splitlines()
    assert lines[0] == "LUT_3D_SIZE 5"
    assert len(lines) == 3 + 125

    matte_path = tmp_path / "matte.cube"
    write_hsl_qualifier_cube({"enabled": True, "showMatte": True}, str(matte_path), size=5)
    matte_lines = matte_path.read_text(encoding="ascii").strip().splitlines()[3:]
    for entry in matte_lines:
        r, g, b = entry.split()
        assert r == g == b

    assert build_power_window_filter({"enabled": False}) == ""
    pw_rot = build_power_window_filter(
        {
            "enabled": True,
            "x": 0.4,
            "y": 0.45,
            "rx": 0.25,
            "ry": 0.3,
            "rotation": 0.45,
            "feather": 0.3,
            "invert": True,
            "exposureStops": 0.5,
            "gain": 1.2,
            "saturation": 1.15,
        }
    )
    assert "split=3[pw_base][pw_fx][pw_mask_src]" in pw_rot
    assert "lutrgb=" in pw_rot
    assert "hue=s=1.15000" in pw_rot
    assert "overlay=shortest=1:format=auto" in pw_rot
    assert "1-(1-clip(" in pw_rot
