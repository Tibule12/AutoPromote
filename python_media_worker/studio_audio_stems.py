"""Synced multi-track PCM WAV stem builder for Pro Studio mixer handoff."""
import os
import subprocess


STEM_FILENAMES = {
    "originalAudio": "01_dialogue.wav",
    "broll": "02_broll.wav",
    "music": "03_music.wav",
    "voiceover": "04_voiceover.wav",
    "sfx": "05_sfx.wav",
}


def build_stem_pad_trim_filter(duration, sample_rate=48000):
    dur = max(0.05, float(duration or 0.05))
    return (
        f"aresample={int(sample_rate)},"
        f"aformat=sample_rates={int(sample_rate)}:channel_layouts=stereo,"
        f"apad=whole_dur={dur:.6f},atrim=0:{dur:.6f},asetpts=PTS-STARTPTS"
    )


def export_bus_stems_with_ffmpeg(
    inputs,
    filter_parts,
    bus_label_map,
    duration,
    output_dir,
    *,
    sample_rate=48000,
    codec="pcm_s24le",
):
    """
    Renders isolated time-aligned lossless WAV stems for each active audio bus
    starting identically at 0.000s with matching total output duration.
    """
    if not bus_label_map:
        return []
    os.makedirs(output_dir, exist_ok=True)
    parts = list(filter_parts or [])
    maps = []
    manifest = []
    dur = max(0.05, float(duration or 0.05))
    pad_chain = build_stem_pad_trim_filter(dur, sample_rate=sample_rate)

    for idx, (bus_name, raw_label) in enumerate(bus_label_map.items()):
        in_tok = raw_label if str(raw_label).startswith("[") else f"[{raw_label}]"
        stem_label = f"[stem_out_{idx}_{bus_name}]"
        parts.append(f"{in_tok}{pad_chain}{stem_label}")
        filename = STEM_FILENAMES.get(bus_name, f"{idx + 1:02d}_{bus_name}.wav")
        dest_path = os.path.join(output_dir, filename)
        maps.append((bus_name, stem_label, filename, dest_path))

    cmd = ["ffmpeg", "-v", "error", "-nostdin", *inputs, "-filter_complex", ";".join(parts)]
    for bus_name, stem_label, filename, dest_path in maps:
        cmd.extend(["-map", stem_label, "-vn", "-c:a", codec, "-y", dest_path])
        manifest.append(
            {
                "bus": bus_name,
                "filename": filename,
                "path": dest_path,
                "durationSeconds": round(dur, 6),
                "sampleRate": int(sample_rate),
                "channels": 2,
                "codec": codec,
            }
        )

    subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=1800)
    return manifest
