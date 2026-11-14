from python_media_worker.studio_pro_render_engine import (
    LOUDNESS_STANDARDS,
    build_audio_master_loudnorm_filter,
    build_film_emulation_filter,
    build_optical_flow_speed_filter,
    build_reverse_freeze_filter,
    select_video_encode_profile,
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

    assert build_audio_master_loudnorm_filter("social") == "loudnorm=I=-14.0:TP=-1.0:LRA=7"
    assert build_audio_master_loudnorm_filter("podcast") == "loudnorm=I=-16.0:TP=-1.0:LRA=7"
    assert build_audio_master_loudnorm_filter("broadcast") == "loudnorm=I=-23.0:TP=-1.0:LRA=7"
    assert set(LOUDNESS_STANDARDS.keys()) == {"social", "podcast", "broadcast"}
