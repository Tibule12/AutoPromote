"""Evidence-grounded, in-scene Reality Break rendering.

The scene generator is deliberately gated: every visual must be justified by
timestamped transcript evidence. Generated imagery is placed on a real surface
inside the source scene; the original camera frame and people remain the base.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import subprocess
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    from .motion_sculpture import MediaPipePersonSegmenter, validate_rendered_media
except ImportError:
    from motion_sculpture import MediaPipePersonSegmenter, validate_rendered_media


class SceneUnderstandingError(RuntimeError):
    """Raised when Reality Break cannot support a scene with real evidence."""


def _normalized_text(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def relevant_transcript(
    segments: Sequence[Mapping[str, Any]],
    start_time: float,
    end_time: float,
    *,
    context_seconds: float = 2.0,
) -> list[Dict[str, Any]]:
    start = max(0.0, float(start_time) - context_seconds)
    end = max(start, float(end_time) + context_seconds)
    selected = []
    for segment in segments:
        segment_start = float(segment.get("start", 0.0) or 0.0)
        segment_end = float(segment.get("end", segment_start) or segment_start)
        text = " ".join(str(segment.get("text") or "").split())
        if text and segment_end >= start and segment_start <= end:
            selected_segment = {
                "start": round(segment_start, 3),
                "end": round(segment_end, 3),
                "text": text,
            }
            # Speaker and language labels are evidence for the director, not a
            # reason to rewrite the actual transcript. Keep them when the
            # transcription provider supplied them and omit them when unknown.
            for key in (
                "speaker",
                "speakerLabel",
                "language",
                "languageLabel",
                "languages",
                "reviewRequired",
            ):
                if key in segment:
                    selected_segment[key] = segment[key]
            selected.append(selected_segment)
    return selected


def build_reality_captions(
    segments: Sequence[Mapping[str, Any]],
    source_start: float,
    source_end: float,
    render_start: float,
) -> list[Dict[str, Any]]:
    """Group literal code-switched words into short, readable caption beats."""
    selected_words: list[Dict[str, Any]] = []
    for segment in segments:
        for word in segment.get("words") or []:
            start = float(word.get("start", 0.0) or 0.0)
            end = float(word.get("end", start) or start)
            text = " ".join(str(word.get("word") or "").split())
            probability = float(word.get("probability", 1.0) or 0.0)
            if text and end >= source_start and start <= source_end and probability >= 0.35:
                selected_words.append({"start": start, "end": end, "text": text})

    captions: list[Dict[str, Any]] = []
    group: list[Dict[str, Any]] = []
    for word in selected_words:
        group.append(word)
        duration = float(group[-1]["end"]) - float(group[0]["start"])
        closes_phrase = str(word["text"]).endswith((".", "?", "!", ","))
        if len(group) >= 6 or duration >= 2.1 or closes_phrase:
            captions.append(
                {
                    "start": round(render_start + max(0.0, float(group[0]["start"]) - source_start), 3),
                    "end": round(render_start + max(0.12, float(group[-1]["end"]) - source_start), 3),
                    "text": " ".join(str(item["text"]) for item in group),
                }
            )
            group = []
    if group:
        captions.append(
            {
                "start": round(render_start + max(0.0, float(group[0]["start"]) - source_start), 3),
                "end": round(render_start + max(0.12, float(group[-1]["end"]) - source_start), 3),
                "text": " ".join(str(item["text"]) for item in group),
            }
        )
    return captions


def validate_scene_brief(
    raw_brief: Mapping[str, Any],
    transcript_segments: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    if not isinstance(raw_brief, Mapping):
        raise SceneUnderstandingError("Reality Break returned no structured scene brief")
    try:
        confidence = float(raw_brief.get("confidence", 0.0) or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence < 0.68:
        raise SceneUnderstandingError(
            f"Reality Break understanding confidence is too low ({confidence:.2f})"
        )

    transcript_text = _normalized_text(
        " ".join(str(segment.get("text") or "") for segment in transcript_segments)
    )
    evidence = raw_brief.get("evidence") or []
    grounded_evidence = []
    for item in evidence if isinstance(evidence, list) else []:
        if not isinstance(item, Mapping):
            continue
        quote = " ".join(str(item.get("quote") or "").split()).strip()
        normalized_quote = _normalized_text(quote)
        # Require at least two literal source words. This prevents a fluent model
        # explanation from becoming its own unsupported evidence.
        if len(normalized_quote.split()) >= 2 and normalized_quote in transcript_text:
            grounded_evidence.append(
                {
                    "timestamp": float(item.get("timestamp", 0.0) or 0.0),
                    "quote": quote,
                    "supports": " ".join(str(item.get("supports") or "").split())[:240],
                }
            )
    if not grounded_evidence:
        raise SceneUnderstandingError("Reality Break scene brief has no literal transcript evidence")

    meaning = " ".join(str(raw_brief.get("meaning") or "").split()).strip()
    metaphor = " ".join(str(raw_brief.get("visual_metaphor") or "").split()).strip()
    prompt = " ".join(str(raw_brief.get("environment_prompt") or "").split()).strip()
    if len(meaning) < 12 or len(metaphor) < 8 or len(prompt) < 80:
        raise SceneUnderstandingError("Reality Break scene brief is incomplete")

    forbidden = ("portrait of the speaker", "replace the speaker", "clone the speaker")
    if any(phrase in prompt.lower() for phrase in forbidden):
        raise SceneUnderstandingError("Reality Break attempted to generate the source person")

    integration_surface = raw_brief.get("integration_surface") or {}
    normalized_surface: Dict[str, Any] = {}
    if isinstance(integration_surface, Mapping):
        polygon = integration_surface.get("polygon")
        if isinstance(polygon, Sequence) and len(polygon) == 4:
            try:
                normalized_surface = {
                    "type": " ".join(str(integration_surface.get("type") or "surface").split())[:80],
                    "reason": " ".join(str(integration_surface.get("reason") or "").split())[:240],
                    "confidence": round(
                        max(0.0, min(1.0, float(integration_surface.get("confidence", 0.0) or 0.0))),
                        3,
                    ),
                    "polygon": [
                        [
                            max(0.0, min(1.0, float(point[0]))),
                            max(0.0, min(1.0, float(point[1]))),
                        ]
                        for point in polygon
                    ],
                }
            except (TypeError, ValueError, IndexError):
                normalized_surface = {}

    story_beats: list[Dict[str, Any]] = []
    allowed_kinds = {"object", "location", "action", "person_reference", "metaphor"}
    for item in raw_brief.get("story_beats") or []:
        if not isinstance(item, Mapping):
            continue
        exact_quote = " ".join(str(item.get("exact_quote") or "").split())
        normalized_quote = _normalized_text(exact_quote)
        kind = str(item.get("kind") or "").strip().lower()
        visual = " ".join(str(item.get("visual") or "").split()).strip()
        search_query = " ".join(str(item.get("search_query") or visual).split()).strip()
        if (
            len(normalized_quote.split()) >= 1
            and normalized_quote in transcript_text
            and kind in allowed_kinds
            and len(visual) >= 8
        ):
            beat_start = float(item.get("start", 0.0) or 0.0)
            beat_end = max(beat_start + 0.05, float(item.get("end", beat_start) or beat_start))
            story_beats.append(
                {
                    "start": round(beat_start, 3),
                    "end": round(beat_end, 3),
                    "kind": kind,
                    "exact_quote": exact_quote[:240],
                    "visual": visual[:500],
                    "search_query": search_query[:160],
                }
            )
    if not story_beats:
        raise SceneUnderstandingError("Reality Break scene brief has no timestamped visual story beats")

    return {
        "meaning": meaning[:600],
        "confidence": round(min(1.0, confidence), 3),
        "visual_metaphor": metaphor[:500],
        "environment_prompt": prompt[:4000],
        "integration_surface": normalized_surface,
        "story_beats": story_beats,
        "evidence": grounded_evidence,
        "uncertainties": [
            " ".join(str(item).split())[:240]
            for item in (raw_brief.get("uncertainties") or [])[:8]
            if str(item).strip()
        ],
    }


def _frame_content(video_path: str, timestamps: Iterable[float]) -> list[Dict[str, Any]]:
    capture = cv2.VideoCapture(video_path)
    if not capture.isOpened():
        return []
    frames = []
    try:
        for timestamp in timestamps:
            capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(timestamp)) * 1000.0)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            height, width = frame.shape[:2]
            scale = min(1.0, 640.0 / max(width, height, 1))
            if scale < 1.0:
                frame = cv2.resize(
                    frame,
                    (round(width * scale), round(height * scale)),
                    interpolation=cv2.INTER_AREA,
                )
            ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
            if ok:
                frames.append(
                    {
                        "time": round(float(timestamp), 3),
                        "data": base64.b64encode(encoded.tobytes()).decode("ascii"),
                    }
                )
    finally:
        capture.release()
    return frames


def build_grounded_scene_brief(
    video_path: str,
    transcript_segments: Sequence[Mapping[str, Any]],
    start_time: float,
    end_time: float,
    *,
    api_key: Optional[str] = None,
    request_post=None,
) -> Dict[str, Any]:
    """Use transcript + representative frames to plan one evidence-backed scene."""
    key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not key:
        raise SceneUnderstandingError("Reality Break requires an AI understanding key")
    selected = relevant_transcript(transcript_segments, start_time, end_time)
    if not selected:
        raise SceneUnderstandingError("Reality Break found no speech around the selected moment")

    def transcript_line(item: Mapping[str, Any]) -> str:
        identity = []
        speaker = str(item.get("speakerLabel") or item.get("speaker") or "").strip()
        language = str(item.get("languageLabel") or item.get("language") or "").strip()
        if speaker and speaker.lower() not in {"unknown", "speaker needs review"}:
            identity.append(speaker)
        if language and language.lower() not in {"und", "language needs review"}:
            identity.append(language)
        prefix = f" ({' / '.join(identity)})" if identity else ""
        return f"[{float(item.get('start', 0.0)):.2f}-{float(item.get('end', 0.0)):.2f}]{prefix} {item.get('text', '')}"

    selected_text = "\n".join(transcript_line(item) for item in selected)
    full_context = "\n".join(
        transcript_line(item)
        for item in transcript_segments
        if str(item.get("text") or "").strip()
    )[:12000]
    prompt = (
        "You are AutoPromote's evidence-first cinematic scene director. This South African podcast may "
        "code-switch naturally between isiXhosa, English, and isiZulu, including inside one sentence. "
        "Preserve every literal quote exactly as transcribed and never translate, standardize, or force the "
        "conversation into one language. Speaker/language labels are editing metadata; when marked unknown or "
        "review-required, treat them as uncertain rather than guessing. Understand the whole conversation, but design one "
        "visual transformation only for the selected moment. Do not invent people, relatives, locations, "
        "dates, achievements, quotes, or events. If words are uncertain, list them and do not visualize them. "
        "Use an elegant symbolic documentary metaphor rather than a fake literal reenactment. The real source "
        "frame and every person will remain untouched. Your visual must live on a visible physical display, "
        "window, wall, or other plausible planar surface inside that frame, with correct perspective and no "
        "generated people or faces. Identify concrete objects, places, actions, and metaphors in spoken order; "
        "never reuse a generic visual for unrelated words. Return strict JSON with meaning, confidence (0..1), evidence "
        "(array of timestamp, exact literal quote copied from transcript, supports), uncertainties, "
        "visual_metaphor, story_beats, integration_surface, and environment_prompt. story_beats must be an array "
        "of timestamped {start, end, kind, exact_quote, visual, search_query} items, with exact_quote copied literally from the "
        "transcript, search_query a concrete 2-6 word English stock-video search grounded in that quote, and kind "
        "one of object, location, action, person_reference, or metaphor. Arrange those beats "
        "left-to-right in the generated plate so camera movement reveals each visual at its spoken time. "
        "integration_surface must contain type, "
        "reason, confidence, and polygon: four [x,y] points normalized from 0..1 in clockwise order around the "
        "chosen real surface. The environment_prompt must request a premium cinematic portal interior plate, "
        "no people, no faces, no text, no logos, no UI, and imagery derived only from the transcript evidence.\n\n"
        f"SELECTED MOMENT:\n{selected_text}\n\nWHOLE-CLIP CONTEXT:\n{full_context}"
    )
    content: list[Dict[str, Any]] = [{"type": "text", "text": prompt}]
    midpoint = (float(start_time) + float(end_time)) / 2.0
    for frame in _frame_content(video_path, (start_time, midpoint, end_time)):
        content.append({"type": "text", "text": f"Source layout at {frame['time']:.2f}s"})
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{frame['data']}",
                    "detail": "low",
                },
            }
        )

    if request_post is None:
        import requests
        request_post = requests.post
    response = request_post(
        (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("AUTOPROMOTE_REALITY_DIRECTOR_MODEL")
            or os.getenv("OPENAI_MODEL_GPT4O")
            or "gpt-4o",
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.15,
            "max_tokens": 1200,
            "response_format": {"type": "json_object"},
        },
        timeout=75,
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"]
    raw = re.sub(r"^```(?:json)?|```$", "", str(raw).strip(), flags=re.MULTILINE).strip()
    return validate_scene_brief(json.loads(raw), selected)


def generate_environment_image(
    scene_brief: Mapping[str, Any],
    output_path: str,
    *,
    approved_tmp_dir: str,
    api_key: Optional[str] = None,
    request_post=None,
) -> Dict[str, Any]:
    key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not key:
        raise SceneUnderstandingError("Reality Break requires an image generation key")
    resolved_output = os.path.realpath(os.path.abspath(output_path))
    resolved_tmp = os.path.realpath(os.path.abspath(approved_tmp_dir))
    if os.path.commonpath([resolved_output, resolved_tmp]) != resolved_tmp:
        raise ValueError("Reality Break environment path must be within the approved tmp directory")
    if request_post is None:
        import requests
        request_post = requests.post
    response = request_post(
        (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/images/generations",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "model": os.getenv("AUTOPROMOTE_REALITY_IMAGE_MODEL") or "gpt-image-1",
            "prompt": scene_brief["environment_prompt"],
            "size": "1536x1024",
            "quality": os.getenv("AUTOPROMOTE_REALITY_IMAGE_QUALITY") or "medium",
            "output_format": "png",
            "n": 1,
        },
        timeout=150,
    )
    response.raise_for_status()
    payload = response.json()
    encoded = str(((payload.get("data") or [{}])[0]).get("b64_json") or "")
    if not encoded:
        raise RuntimeError("Reality Break image generation returned no image")
    image_bytes = base64.b64decode(encoded, validate=True)
    with open(resolved_output, "wb") as image_file:
        image_file.write(image_bytes)
    if cv2.imread(resolved_output, cv2.IMREAD_COLOR) is None:
        os.remove(resolved_output)
        raise RuntimeError("Reality Break generated image is not decodable")
    return {
        "path": resolved_output,
        "size": len(image_bytes),
        "model": os.getenv("AUTOPROMOTE_REALITY_IMAGE_MODEL") or "gpt-image-1",
    }


def generate_studio_background_image(
    video_path: str,
    output_path: str,
    *,
    approved_tmp_dir: str,
    timestamp: float = 0.5,
    api_key: Optional[str] = None,
    request_post=None,
) -> Dict[str, Any]:
    """Turn a real source frame into a camera-matched empty podcast studio plate."""
    key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
    if not key:
        raise SceneUnderstandingError("Studio Makeover requires an image generation key")
    resolved_output = os.path.realpath(os.path.abspath(output_path))
    resolved_tmp = os.path.realpath(os.path.abspath(approved_tmp_dir))
    if os.path.commonpath([resolved_output, resolved_tmp]) != resolved_tmp:
        raise ValueError("Studio Makeover path must be within the approved tmp directory")

    capture = cv2.VideoCapture(video_path)
    try:
        capture.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(timestamp)) * 1000.0)
        ok, frame = capture.read()
    finally:
        capture.release()
    if not ok or frame is None:
        raise RuntimeError("Studio Makeover could not inspect the source frame")
    encoded_ok, encoded = cv2.imencode(".png", frame)
    if not encoded_ok:
        raise RuntimeError("Studio Makeover could not encode its source frame")

    prompt = (
        "Edit this exact camera frame into an EMPTY, photorealistic, professionally built podcast studio "
        "background plate. Replace the plain wall, awkward monitor graphic, and messy background with warm "
        "oak acoustic slats, soft cream rounded acoustic panels, restrained amber practical lighting, and "
        "tasteful muted coral and deep cobalt accents. Preserve the exact camera viewpoint, lens perspective, "
        "room proportions, and outer frame. Remove every person, body part, face, microphone, boom arm, couch, "
        "chair, table clutter, loose plant, logo, word, caption, and screen graphic. Leave believable empty space "
        "for the original captured speakers and equipment to be composited back. Real physical materials and "
        "shadows; flattering high-end broadcast lighting. No people, text, branding, neon cyberpunk, purple "
        "portal, virtual-set look, watermark, or interface."
    )
    if request_post is None:
        import requests
        request_post = requests.post
    response = request_post(
        (os.getenv("OPENAI_API_BASE") or "https://api.openai.com") + "/v1/images/edits",
        headers={"Authorization": f"Bearer {key}"},
        files={"image": ("podcast-source-frame.png", encoded.tobytes(), "image/png")},
        data={
            "model": os.getenv("AUTOPROMOTE_STUDIO_BACKGROUND_MODEL") or "gpt-image-1",
            "prompt": prompt,
            "size": "1536x1024",
            "quality": os.getenv("AUTOPROMOTE_STUDIO_BACKGROUND_QUALITY") or "medium",
            "output_format": "png",
            "n": "1",
        },
        timeout=240,
    )
    response.raise_for_status()
    payload = response.json()
    image_bytes = base64.b64decode(
        str(((payload.get("data") or [{}])[0]).get("b64_json") or ""),
        validate=True,
    )
    if not image_bytes:
        raise RuntimeError("Studio Makeover returned no background image")
    with open(resolved_output, "wb") as output_file:
        output_file.write(image_bytes)
    if cv2.imread(resolved_output, cv2.IMREAD_COLOR) is None:
        os.remove(resolved_output)
        raise RuntimeError("Studio Makeover background is not decodable")
    return {
        "path": resolved_output,
        "size": len(image_bytes),
        "model": os.getenv("AUTOPROMOTE_STUDIO_BACKGROUND_MODEL") or "gpt-image-1",
        "source_timestamp": round(float(timestamp), 3),
        "composition": "generated_empty_studio_behind_source_people",
    }


def generate_story_images(
    scene_brief: Mapping[str, Any],
    output_stem: str,
    *,
    approved_tmp_dir: str,
    api_key: Optional[str] = None,
    request_post=None,
) -> list[Dict[str, Any]]:
    """Generate a distinct visual asset for every grounded spoken beat."""
    receipts: list[Dict[str, Any]] = []
    beats = list(scene_brief.get("story_beats") or [])[:6]
    if not beats:
        raise SceneUnderstandingError("Reality Break cannot generate images without story beats")
    base_style = str(scene_brief.get("environment_prompt") or "").strip()
    for index, beat in enumerate(beats):
        output_path = f"{output_stem}_{index}.png"
        beat_prompt = (
            f"{base_style}\n\nGenerate ONLY story beat {index + 1}: the exact spoken evidence is "
            f"{json.dumps(str(beat.get('exact_quote') or ''))}. Beat type: "
            f"{str(beat.get('kind') or 'metaphor')}. Required visual: "
            f"{str(beat.get('visual') or '')}. Do not include details from other beats. "
            "This asset will be perspective-projected onto a real surface in the original video; "
            "include no people, faces, words, captions, logos, interface chrome, or borders."
        )
        image_receipt = generate_environment_image(
            {"environment_prompt": beat_prompt},
            output_path,
            approved_tmp_dir=approved_tmp_dir,
            api_key=api_key,
            request_post=request_post,
        )
        receipts.append({**image_receipt, "beat": dict(beat), "index": index})
    return receipts


def generate_story_videos(
    scene_brief: Mapping[str, Any],
    output_stem: str,
    *,
    approved_tmp_dir: str,
    request_get=None,
) -> list[Dict[str, Any]]:
    """Fetch genuine moving footage for every transcript-grounded story beat."""
    key = str(os.getenv("PEXELS_API_KEY") or "").strip()
    if not key:
        raise SceneUnderstandingError("Reality Break moving visuals require PEXELS_API_KEY")
    if request_get is None:
        import requests
        request_get = requests.get
    resolved_tmp = os.path.realpath(os.path.abspath(approved_tmp_dir))
    receipts = []
    for index, beat in enumerate(list(scene_brief.get("story_beats") or [])[:6]):
        query = " ".join(
            str(beat.get("search_query") or beat.get("visual") or "").split()
        )[:160]
        if not query:
            raise SceneUnderstandingError("Reality Break story beat has no moving-video query")
        search = request_get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": key},
            params={"query": query, "orientation": "landscape", "per_page": 10},
            timeout=40,
        )
        search.raise_for_status()
        best = None
        best_score = -1
        best_video = None
        for video in search.json().get("videos") or []:
            for candidate in video.get("video_files") or []:
                width = int(candidate.get("width") or 0)
                height = int(candidate.get("height") or 0)
                link = str(candidate.get("link") or "")
                if not link or width <= height:
                    continue
                score = min(width, 1920) + min(height, 1080) - abs((width / max(height, 1)) - (16 / 9)) * 500
                if score > best_score:
                    best_score = score
                    best = candidate
                    best_video = video
        if not best:
            raise SceneUnderstandingError(
                f"Reality Break found no honest moving footage for story beat: {query}"
            )
        output_path = os.path.realpath(os.path.abspath(f"{output_stem}_{index}.mp4"))
        if os.path.commonpath([output_path, resolved_tmp]) != resolved_tmp:
            raise ValueError("Reality Break story video path must be within the approved tmp directory")
        download = request_get(str(best["link"]), stream=True, timeout=120)
        download.raise_for_status()
        with open(output_path, "wb") as output_file:
            for chunk in download.iter_content(chunk_size=1024 * 256):
                if chunk:
                    output_file.write(chunk)
        validation = validate_rendered_media(output_path, expected_audio=False)
        receipts.append(
            {
                "path": output_path,
                "size": os.path.getsize(output_path),
                "beat": dict(beat),
                "index": index,
                "provider": "pexels_api",
                "query": query,
                "source_id": (best_video or {}).get("id"),
                "source_url": (best_video or {}).get("url"),
                "validation": validation,
            }
        )
    if not receipts:
        raise SceneUnderstandingError("Reality Break cannot create moving visuals without story beats")
    return receipts


def search_story_video_candidates(
    beats: Sequence[Mapping[str, Any]],
    *,
    max_candidates: int = 3,
    request_get=None,
) -> list[Dict[str, Any]]:
    """Return previewable licensed moving-footage choices for reviewed story beats."""
    key = str(os.getenv("PEXELS_API_KEY") or "").strip()
    if not key:
        raise SceneUnderstandingError("Licensed story footage search is not configured")
    if request_get is None:
        import requests
        request_get = requests.get
    candidate_limit = max(1, min(4, int(max_candidates or 3)))
    planned = []
    for raw_beat in list(beats or [])[:6]:
        beat = dict(raw_beat or {})
        beat_id = str(beat.get("id") or "").strip()[:120]
        query = " ".join(
            str(beat.get("search_query") or beat.get("searchQuery") or "").split()
        )[:160]
        evidence_quote = " ".join(
            str(beat.get("evidence_quote") or beat.get("evidenceQuote") or "").split()
        )[:240]
        review_required = bool(
            beat.get("review_required") or beat.get("reviewRequired")
        )
        if not beat_id or not query or not evidence_quote:
            raise SceneUnderstandingError(
                "Every story visual search requires a beat id, exact transcript evidence and query"
            )
        if review_required:
            planned.append(
                {
                    "beat_id": beat_id,
                    "status": "blocked_by_transcript_review",
                    "evidence_quote": evidence_quote,
                    "query": query,
                    "candidates": [],
                }
            )
            continue
        response = request_get(
            "https://api.pexels.com/videos/search",
            headers={"Authorization": key},
            params={
                "query": query,
                "orientation": "landscape",
                "size": "medium",
                "per_page": 12,
            },
            timeout=40,
        )
        response.raise_for_status()
        ranked = []
        for video in response.json().get("videos") or []:
            best_file = None
            best_score = -1e9
            for file in video.get("video_files") or []:
                width = int(file.get("width") or 0)
                height = int(file.get("height") or 0)
                link = str(file.get("link") or "").strip()
                if not link.startswith("https://videos.pexels.com/") or width <= height:
                    continue
                resolution_score = min(width, 1920) + min(height, 1080)
                aspect_penalty = abs((width / max(height, 1)) - (16 / 9)) * 650
                oversize_penalty = max(0, width - 1920) * 0.05
                score = resolution_score - aspect_penalty - oversize_penalty
                if score > best_score:
                    best_score = score
                    best_file = file
            if not best_file:
                continue
            preview_image = str(video.get("image") or "").strip()
            source_page = str(video.get("url") or "").strip()
            if preview_image and not preview_image.startswith("https://images.pexels.com/"):
                preview_image = ""
            if source_page and not source_page.startswith("https://www.pexels.com/"):
                source_page = ""
            ranked.append(
                {
                    "id": f"pexels-{video.get('id')}",
                    "provider": "pexels",
                    "license": "Pexels License",
                    "source_id": video.get("id"),
                    "source_page": source_page,
                    "video_url": best_file.get("link"),
                    "preview_image": preview_image,
                    "width": int(best_file.get("width") or 0),
                    "height": int(best_file.get("height") or 0),
                    "duration": float(video.get("duration") or 0.0),
                    "creator": str((video.get("user") or {}).get("name") or "Pexels creator")[:120],
                    "score": round(float(best_score), 2),
                }
            )
        ranked.sort(key=lambda item: item["score"], reverse=True)
        planned.append(
            {
                "beat_id": beat_id,
                "status": "candidates_ready" if ranked else "no_match",
                "evidence_quote": evidence_quote,
                "query": query,
                "candidates": ranked[:candidate_limit],
            }
        )
    return planned


def _cover_plate(
    plate: np.ndarray,
    width: int,
    height: int,
    progress: float,
    *,
    semantic_pan: bool = False,
) -> np.ndarray:
    source_height, source_width = plate.shape[:2]
    scale = max(width / source_width, height / source_height) * (1.0 + 0.025 * progress)
    resized = cv2.resize(
        plate,
        (round(source_width * scale), round(source_height * scale)),
        interpolation=cv2.INTER_LANCZOS4,
    )
    resized_height, resized_width = resized.shape[:2]
    pan_position = (0.03 + 0.94 * _smoothstep(progress)) if semantic_pan else (0.45 + 0.08 * progress)
    x = max(0, min(resized_width - width, round((resized_width - width) * pan_position)))
    y = max(0, (resized_height - height) // 2)
    return resized[y : y + height, x : x + width].copy()


def _smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def _normalized_portal_quad(
    effect: Mapping[str, Any],
    width: int,
    height: int,
    person: np.ndarray,
) -> np.ndarray:
    """Resolve the director-selected real surface, with a conservative fallback."""
    surface = effect.get("integration_surface") or effect.get("integrationSurface") or {}
    if not surface and isinstance(effect.get("scene_brief"), Mapping):
        surface = effect["scene_brief"].get("integration_surface") or {}
    polygon = surface.get("polygon") if isinstance(surface, Mapping) else None
    if isinstance(polygon, Sequence) and len(polygon) == 4:
        try:
            points = np.array(
                [[float(point[0]) * width, float(point[1]) * height] for point in polygon],
                dtype=np.float32,
            )
            area = abs(cv2.contourArea(points))
            if area >= width * height * 0.035 and np.all(np.isfinite(points)):
                points[:, 0] = np.clip(points[:, 0], 0, width - 1)
                points[:, 1] = np.clip(points[:, 1], 0, height - 1)
                return points
        except (TypeError, ValueError, IndexError):
            pass

    # No reliable director surface: use the largest free side of the frame as
    # a restrained glass panel. This never replaces the original background.
    ys, xs = np.where(person >= 96)
    subject_x = float(np.median(xs) / max(1, width)) if len(xs) else 0.5
    if subject_x >= 0.5:
        normalized = ((0.035, 0.10), (0.43, 0.16), (0.42, 0.79), (0.035, 0.79))
    else:
        normalized = ((0.57, 0.16), (0.965, 0.10), (0.965, 0.79), (0.58, 0.79))
    return np.array([[x * width, y * height] for x, y in normalized], dtype=np.float32)


def _portal_composite(
    frame: np.ndarray,
    plate: np.ndarray,
    quad: np.ndarray,
    person: np.ndarray,
    progress: float,
    reveal: float,
    semantic_pan: bool,
    animate_story: bool,
) -> np.ndarray:
    """Project a moving story plate into a real plane without replacing the scene."""
    height, width = frame.shape[:2]
    portal_width = max(16, round(max(np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3]))))
    portal_height = max(16, round(max(np.linalg.norm(quad[3] - quad[0]), np.linalg.norm(quad[2] - quad[1]))))
    prepared = _cover_plate(
        plate,
        portal_width,
        portal_height,
        progress,
        semantic_pan=semantic_pan,
    )
    if animate_story:
        prepared = _animate_story_plate(prepared, progress)
    source = np.array(
        [[0, 0], [portal_width - 1, 0], [portal_width - 1, portal_height - 1], [0, portal_height - 1]],
        dtype=np.float32,
    )
    transform = cv2.getPerspectiveTransform(source, quad.astype(np.float32))
    warped = cv2.warpPerspective(
        prepared,
        transform,
        (width, height),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
    )

    polygon = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(polygon, np.round(quad).astype(np.int32), 255, lineType=cv2.LINE_AA)
    inset_px = max(2, round(min(width, height) * 0.004))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (inset_px * 2 + 1, inset_px * 2 + 1))
    interior = cv2.erode(polygon, kernel)
    interior = cv2.GaussianBlur(interior, (0, 0), sigmaX=max(1.2, inset_px * 0.55))

    # A vertical energy seam reveals the scene as though the existing display
    # wakes up. It is confined to the chosen physical plane.
    min_x = float(np.min(quad[:, 0]))
    max_x = float(np.max(quad[:, 0]))
    xx = np.arange(width, dtype=np.float32)[None, :]
    reveal_edge = min_x + (max_x - min_x) * min(1.0, reveal * 1.18)
    wipe = np.clip((reveal_edge - xx) / max(8.0, width * 0.018) + 0.5, 0.0, 1.0)
    alpha = interior.astype(np.float32) / 255.0
    alpha *= wipe
    alpha *= (1.0 - (person.astype(np.float32) / 255.0) * 0.98)
    alpha *= 0.97

    base = frame.astype(np.float32)
    result = base * (1.0 - alpha[..., None]) + warped.astype(np.float32) * alpha[..., None]

    # Screen light belongs to the set: a restrained bloom touches the nearby
    # wall/props, while the face and body remain the original camera pixels.
    dilated = cv2.dilate(polygon, np.ones((17, 17), dtype=np.uint8))
    ring = cv2.GaussianBlur(cv2.subtract(dilated, polygon), (0, 0), sigmaX=max(5.0, width * 0.006))
    spill = cv2.GaussianBlur(polygon, (0, 0), sigmaX=max(18.0, width * 0.022))
    spill = np.clip(spill.astype(np.float32) - polygon.astype(np.float32) * 0.9, 0, 255) / 255.0
    safe_spill = spill * (1.0 - person.astype(np.float32) / 255.0)
    glow = np.clip(ring.astype(np.float32) / 255.0 * reveal, 0.0, 1.0)
    light = np.array((22.0, 76.0, 98.0), dtype=np.float32)  # warm amber in BGR
    result += light[None, None, :] * (glow[..., None] * 0.34 + safe_spill[..., None] * reveal * 0.08)

    # A narrow moving glint sells the glass surface without covering the story.
    seam = np.exp(-((xx - reveal_edge) ** 2) / max(24.0, (width * 0.008) ** 2))
    seam_alpha = seam * (polygon.astype(np.float32) / 255.0) * reveal * 0.32
    result += np.array((120.0, 175.0, 205.0), dtype=np.float32)[None, None, :] * seam_alpha[..., None]
    return np.clip(result, 0, 255).astype(np.uint8)


def _animate_story_plate(plate: np.ndarray, progress: float) -> np.ndarray:
    """Turn a generated still into a living 2.5D motion plate."""
    height, width = plate.shape[:2]
    phase = float(progress) * math.tau
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)

    # Independent horizontal/vertical drift creates restrained depth movement
    # rather than a static Ken Burns crop.
    map_x = xx + np.sin(yy * (math.tau / max(1.0, height * 0.72)) + phase * 1.35) * (1.8 + width * 0.0012)
    map_y = yy + np.sin(xx * (math.tau / max(1.0, width * 0.86)) - phase * 1.08) * (1.2 + height * 0.0008)
    moving = cv2.remap(
        plate,
        map_x,
        map_y,
        interpolation=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REFLECT_101,
    ).astype(np.float32)

    # A light pulse travels across bright visual structures (sound ribbons,
    # DNA, practical lights) while leaving dark areas stable.
    luma = cv2.cvtColor(moving.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    sweep_center = width * (0.05 + 0.90 * _smoothstep(progress))
    sweep = np.exp(-((xx - sweep_center) ** 2) / max(36.0, (width * 0.055) ** 2))
    highlight = np.clip((luma - 0.42) / 0.58, 0.0, 1.0) * sweep
    moving += np.array((32.0, 54.0, 68.0), dtype=np.float32)[None, None, :] * highlight[..., None]

    # Deterministic floating motes provide real frame-to-frame motion without
    # covering the underlying story object or introducing synthetic people.
    motes = np.zeros_like(moving)
    for index in range(14):
        x = int(((index * 0.173 + progress * (0.12 + (index % 4) * 0.025)) % 1.0) * width)
        y = int(((index * 0.311 - progress * (0.08 + (index % 3) * 0.018)) % 1.0) * height)
        radius = max(1, round(min(width, height) * (0.0025 + (index % 3) * 0.0014)))
        colour = (135, 196, 255) if index % 2 else (255, 176, 78)
        cv2.circle(motes, (x, y), radius * 2, colour, -1, lineType=cv2.LINE_AA)
    motes = cv2.GaussianBlur(motes, (0, 0), sigmaX=max(1.2, width * 0.003))
    moving += motes * (0.12 + 0.08 * math.sin(phase * 2.0) ** 2)
    return np.clip(moving, 0, 255).astype(np.uint8)


def _caption_at(captions: Sequence[Mapping[str, Any]], timestamp: float) -> str:
    for caption in captions:
        if float(caption.get("start", 0.0) or 0.0) <= timestamp <= float(caption.get("end", 0.0) or 0.0):
            return " ".join(str(caption.get("text") or "").split())
    return ""


def _draw_caption(frame: np.ndarray, text: str) -> np.ndarray:
    if not text:
        return frame
    height, width = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    canvas = Image.fromarray(rgb)
    draw = ImageDraw.Draw(canvas, "RGBA")
    font_path = os.getenv("AUTOPROMOTE_CAPTION_FONT") or "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, max(25, round(height * 0.043)))
    max_width = round(width * 0.72)
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textbbox((0, 0), candidate, font=font, stroke_width=1)[2] > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    lines = lines[:2]
    line_height = round(font.size * 1.18)
    box_height = line_height * len(lines) + round(height * 0.034)
    top = round(height * 0.82) - box_height
    widest = max(draw.textbbox((0, 0), line, font=font, stroke_width=2)[2] for line in lines)
    left = (width - widest) // 2 - round(width * 0.018)
    right = (width + widest) // 2 + round(width * 0.018)
    draw.rounded_rectangle(
        (left, top, right, top + box_height),
        radius=round(height * 0.018),
        fill=(6, 9, 17, 190),
        outline=(255, 171, 79, 115),
        width=max(1, round(height * 0.002)),
    )
    cursor_y = top + round(height * 0.012)
    for line in lines:
        bounds = draw.textbbox((0, 0), line, font=font, stroke_width=2)
        line_width = bounds[2] - bounds[0]
        draw.text(
            ((width - line_width) // 2, cursor_y),
            line,
            font=font,
            fill=(255, 252, 246, 255),
            stroke_width=2,
            stroke_fill=(0, 0, 0, 210),
        )
        cursor_y += line_height
    return cv2.cvtColor(np.asarray(canvas), cv2.COLOR_RGB2BGR)


def _polish_source_frame(frame: np.ndarray, person: np.ndarray, strength: float) -> np.ndarray:
    """Refine the real camera pixels without synthesizing or reshaping a face."""
    strength = max(0.0, min(1.0, float(strength)))
    if strength <= 0.0:
        return frame
    source = frame.astype(np.float32)
    luminance = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    # Background: remove brittle digital noise, gently separate cool shadows
    # from warm highlights, and retain the original physical set geometry.
    softened = cv2.GaussianBlur(frame, (0, 0), sigmaX=0.62).astype(np.float32)
    background = source * (1.0 - 0.18 * strength) + softened * (0.18 * strength)
    shadow = np.clip((0.58 - luminance) / 0.58, 0.0, 1.0)[..., None]
    highlight = np.clip((luminance - 0.48) / 0.52, 0.0, 1.0)[..., None]
    background += np.array((10.0, 3.0, -3.0), dtype=np.float32) * shadow * (0.42 * strength)
    background += np.array((-3.0, 3.0, 8.0), dtype=np.float32) * highlight * (0.32 * strength)

    # Real person: very light denoise followed by micro-contrast recovery. This
    # uses only the captured pixels—no generative face restoration or reshaping.
    person_soft = cv2.GaussianBlur(frame, (0, 0), sigmaX=0.48).astype(np.float32)
    person_clean = source * (1.0 - 0.10 * strength) + person_soft * (0.10 * strength)
    detail_base = cv2.GaussianBlur(person_clean, (0, 0), sigmaX=1.05)
    person_polished = person_clean + (person_clean - detail_base) * (0.22 * strength)

    alpha = cv2.GaussianBlur(person, (0, 0), sigmaX=2.2).astype(np.float32)[..., None] / 255.0
    composed = background * (1.0 - alpha) + person_polished * alpha
    return np.clip(composed, 0, 255).astype(np.uint8)


def _foreground_mask(person: np.ndarray) -> np.ndarray:
    height, width = person.shape
    # Preserve MediaPipe's soft boundary. Expanding a binary silhouette here
    # reintroduces source-wall pixels as a bright cut-out fringe around clothing.
    foreground = person.copy()

    # Preserve real desks, microphones and props in the lower foreground. The
    # long feather avoids a visible horizontal replacement seam.
    fade_start = round(height * 0.68)
    fade_end = round(height * 0.88)
    ramp = np.zeros(height, dtype=np.uint8)
    ramp[fade_start:fade_end] = np.linspace(0, 255, fade_end - fade_start, dtype=np.uint8)
    ramp[fade_end:] = 255
    foreground = np.maximum(foreground, np.repeat(ramp[:, None], width, axis=1))
    return cv2.GaussianBlur(foreground, (0, 0), sigmaX=1.4, sigmaY=1.4)


def _cinematic_story_plate(
    plate: np.ndarray,
    width: int,
    height: int,
    progress: float,
    *,
    semantic_pan: bool,
    background: bool,
    background_blur: float = 1.8,
    background_dim: float = 0.82,
) -> np.ndarray:
    """Prepare real moving footage as a restrained editorial plate."""
    prepared = _cover_plate(
        plate,
        width,
        height,
        progress,
        semantic_pan=semantic_pan,
    )
    if background:
        # Full-background footage should support the speaker, not compete with
        # their face. Keep it moving and recognisable while adding depth.
        blur = max(0.0, min(12.0, float(background_blur or 0.0)))
        if blur > 0.05:
            prepared = cv2.GaussianBlur(prepared, (0, 0), sigmaX=blur, sigmaY=blur)
    float_plate = prepared.astype(np.float32) / 255.0
    float_plate = np.clip((float_plate - 0.5) * (1.08 if background else 1.12) + 0.5, 0.0, 1.0)
    hsv = cv2.cvtColor((float_plate * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] *= 0.88 if background else 0.96
    hsv[..., 2] *= max(0.42, min(1.0, float(background_dim or 0.82))) if background else 0.94
    prepared = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)

    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = (xx - width * 0.5) / max(width * 0.5, 1.0)
    ny = (yy - height * 0.48) / max(height * 0.52, 1.0)
    vignette = np.clip(1.0 - (nx * nx + ny * ny) * (0.19 if background else 0.13), 0.67, 1.0)
    graded = prepared.astype(np.float32) * vignette[..., None]
    # Purple shadows and warm highlights tie the documentary insert to the set.
    graded += np.array((9.0, 2.0, 12.0), dtype=np.float32)[None, None, :]
    return np.clip(graded, 0, 255).astype(np.uint8)


def _full_background_composite(
    source: np.ndarray,
    plate: np.ndarray,
    person: np.ndarray,
    progress: float,
    reveal: float,
    semantic_pan: bool,
    background_blur: float = 1.8,
    background_dim: float = 0.82,
) -> np.ndarray:
    """Place real moving footage behind captured people and foreground props."""
    height, width = source.shape[:2]
    story = _cinematic_story_plate(
        plate,
        width,
        height,
        progress,
        semantic_pan=semantic_pan,
        background=True,
        background_blur=background_blur,
        background_dim=background_dim,
    )
    foreground = _foreground_mask(person).astype(np.float32)[..., None] / 255.0
    # A tiny warm spill around the silhouette integrates the real subject with
    # the replacement environment without altering facial geometry.
    edge = cv2.GaussianBlur(person, (0, 0), sigmaX=9.0).astype(np.float32) / 255.0
    edge = np.clip(edge - person.astype(np.float32) / 255.0, 0.0, 1.0)[..., None]
    story_float = story.astype(np.float32)
    story_float += edge * np.array((7.0, 11.0, 19.0), dtype=np.float32)
    composed = story_float * (1.0 - foreground) + source.astype(np.float32) * foreground
    blended = source.astype(np.float32) * (1.0 - reveal) + composed * reveal
    return np.clip(blended, 0, 255).astype(np.uint8)


def _broll_cutaway_composite(
    source: np.ndarray,
    plate: np.ndarray,
    progress: float,
    reveal: float,
    semantic_pan: bool,
) -> np.ndarray:
    """Use grounded moving footage as a full-frame cutaway over source audio."""
    height, width = source.shape[:2]
    story = _cinematic_story_plate(
        plate,
        width,
        height,
        progress,
        semantic_pan=semantic_pan,
        background=False,
    )
    blended = source.astype(np.float32) * (1.0 - reveal) + story.astype(np.float32) * reveal
    return np.clip(blended, 0, 255).astype(np.uint8)


def _subject_punch_in(
    source: np.ndarray,
    person: np.ndarray,
    progress: float,
    *,
    max_zoom: float = 1.065,
) -> np.ndarray:
    """Add a restrained editorial push toward the real captured speaker."""
    height, width = source.shape[:2]
    zoom = 1.0 + (max(1.0, float(max_zoom)) - 1.0) * _smoothstep(progress)
    if zoom <= 1.001:
        return source
    resized = cv2.resize(
        source,
        (max(width, round(width * zoom)), max(height, round(height * zoom))),
        interpolation=cv2.INTER_LANCZOS4,
    )
    ys, xs = np.where(person >= 96)
    subject_x = float(np.median(xs)) if len(xs) else width * 0.5
    subject_y = float(np.median(ys)) if len(ys) else height * 0.46
    scaled_x = subject_x * zoom
    scaled_y = subject_y * zoom
    crop_x = round(scaled_x - subject_x)
    crop_y = round(scaled_y - subject_y)
    crop_x = max(0, min(resized.shape[1] - width, crop_x))
    crop_y = max(0, min(resized.shape[0] - height, crop_y))
    return resized[crop_y : crop_y + height, crop_x : crop_x + width].copy()


def recover_transient_subject_matte(
    segmenter: Any,
    frame: np.ndarray,
    previous_mask: Optional[np.ndarray],
    consecutive_misses: int,
    *,
    max_consecutive_misses: int = 15,
) -> tuple[np.ndarray, int, bool]:
    """Bridge a brief detector miss without inventing or replacing the subject."""
    try:
        return segmenter.matte(frame, previous_mask), 0, False
    except RuntimeError as error:
        is_transient_subject_miss = "No human subject was detected" in str(error)
        can_reuse_verified_matte = (
            is_transient_subject_miss
            and previous_mask is not None
            and previous_mask.shape == frame.shape[:2]
            and np.any(previous_mask)
            and consecutive_misses < max_consecutive_misses
        )
        if not can_reuse_verified_matte:
            raise
        return previous_mask.copy(), consecutive_misses + 1, True


def render_content_aware_reality(
    input_path: str,
    output_path: str,
    environment_path: str,
    effect: Mapping[str, Any],
    *,
    approved_tmp_dir: str,
) -> Dict[str, Any]:
    resolved_tmp = os.path.realpath(os.path.abspath(approved_tmp_dir))
    paths = []
    for path, label in ((input_path, "input"), (output_path, "output"), (environment_path, "environment")):
        resolved = os.path.realpath(os.path.abspath(path))
        if os.path.commonpath([resolved, resolved_tmp]) != resolved_tmp:
            raise ValueError(f"Reality Break {label} path must be within the approved tmp directory")
        paths.append(resolved)
    safe_input, safe_output, safe_environment = paths

    capture = cv2.VideoCapture(safe_input)
    if not capture.isOpened():
        raise RuntimeError("Reality Break could not decode the input video")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    ok, first = capture.read()
    if not ok or first is None:
        capture.release()
        raise RuntimeError("Reality Break input contains no frames")
    height, width = first.shape[:2]
    def load_visual_asset(path: str) -> Dict[str, Any]:
        image = cv2.imread(path, cv2.IMREAD_COLOR)
        if image is not None:
            return {"kind": "image", "plate": image, "capture": None, "duration": 0.0}
        video_capture = cv2.VideoCapture(path)
        if not video_capture.isOpened():
            raise RuntimeError("Reality Break moving story asset is not decodable")
        asset_fps = float(video_capture.get(cv2.CAP_PROP_FPS) or 30.0)
        asset_frames = int(video_capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        return {
            "kind": "video",
            "plate": None,
            "capture": video_capture,
            "duration": asset_frames / max(asset_fps, 1.0),
        }

    def visual_asset_frame(asset: Mapping[str, Any], progress: float) -> np.ndarray:
        if asset.get("kind") == "image":
            return asset["plate"].copy()
        asset_capture = asset.get("capture")
        asset_duration = max(0.05, float(asset.get("duration") or 0.05))
        # Loop a short stock clip cleanly when the spoken beat is longer.
        asset_time = (max(0.0, progress) * asset_duration) % asset_duration
        asset_capture.set(cv2.CAP_PROP_POS_MSEC, asset_time * 1000.0)
        asset_ok, asset_frame = asset_capture.read()
        if not asset_ok or asset_frame is None:
            asset_capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
            asset_ok, asset_frame = asset_capture.read()
        if not asset_ok or asset_frame is None:
            raise RuntimeError("Reality Break could not read moving story footage")
        return asset_frame

    environment_asset = load_visual_asset(safe_environment)

    loaded_story_assets: list[Dict[str, Any]] = []
    for asset in effect.get("story_assets") or []:
        if not isinstance(asset, Mapping):
            continue
        asset_path = os.path.realpath(os.path.abspath(str(asset.get("path") or "")))
        if os.path.commonpath([asset_path, resolved_tmp]) != resolved_tmp:
            capture.release()
            raise ValueError("Reality Break story asset path must be within the approved tmp directory")
        visual_asset = load_visual_asset(asset_path)
        asset_start = float(asset.get("start", 0.0) or 0.0)
        asset_end = max(asset_start + 0.05, float(asset.get("end", asset_start) or asset_start))
        loaded_story_assets.append(
            {
                "start": asset_start,
                "end": asset_end,
                **visual_asset,
                "semantic_pan": bool(asset.get("semantic_pan", False)),
                "composition_mode": str(
                    asset.get("composition_mode")
                    or asset.get("compositionMode")
                    or "broll_cutaway"
                ).strip().lower(),
                "background_blur": float(
                    asset.get("background_blur")
                    or asset.get("backgroundBlur")
                    or 1.8
                ),
                "background_dim": float(
                    asset.get("background_dim")
                    or asset.get("backgroundDim")
                    or 0.82
                ),
            }
        )

    has_audio = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", safe_input],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip() != ""
    command = [
        "ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s:v", f"{width}x{height}", "-r", f"{fps:.8f}", "-i", "pipe:0", "-i", safe_input,
        "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-preset", "medium",
        "-crf", "16", "-pix_fmt", "yuv420p",
    ]
    command.extend(["-c:a", "aac", "-b:a", "160k"] if has_audio else ["-an"])
    command.extend(["-shortest", "-movflags", "+faststart", "-y", safe_output])

    segmenter = MediaPipePersonSegmenter(landscape=width >= height)
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    start = max(0.0, float(effect.get("start_time", 0.0) or 0.0))
    end = max(start, float(effect.get("end_time", frame_count / max(fps, 1.0)) or 0.0))
    media_duration = frame_count / max(fps, 1.0)
    previous_mask = None
    consecutive_subject_misses = 0
    subject_matte_recoveries = 0
    portal_quad = None
    captions = effect.get("captions") or []
    semantic_pan = bool(effect.get("semantic_pan") or effect.get("story_beats"))
    animate_story = bool(effect.get("animate_story", True))
    polish_strength = float(effect.get("source_polish", 0.58) or 0.0)
    composition_mode = str(effect.get("composition_mode") or "monitor").strip().lower()
    if composition_mode not in {
        "monitor",
        "full_background",
        "broll_cutaway",
        "paced_hybrid",
    }:
        composition_mode = "monitor"
    payoff_start = max(0.0, float(effect.get("payoff_start", end - 3.8) or 0.0))
    frame = first
    index = 0
    try:
        while frame is not None:
            timestamp = index / fps
            person, consecutive_subject_misses, recovered_matte = (
                recover_transient_subject_matte(
                    segmenter,
                    frame,
                    previous_mask,
                    consecutive_subject_misses,
                )
            )
            if recovered_matte:
                subject_matte_recoveries += 1
            previous_mask = person
            polished_frame = _polish_source_frame(frame, person, polish_strength)
            if start <= timestamp <= end:
                effect_progress = (timestamp - start) / max(end - start, 0.05)
                active_asset = environment_asset
                active_plate = visual_asset_frame(active_asset, effect_progress)
                active_progress = effect_progress
                active_semantic_pan = semantic_pan
                matched_asset = None
                for asset_index, asset in enumerate(loaded_story_assets):
                    if asset["start"] <= timestamp <= asset["end"]:
                        matched_asset = asset
                        active_progress = (timestamp - asset["start"]) / max(
                            asset["end"] - asset["start"],
                            0.05,
                        )
                        active_plate = visual_asset_frame(asset, active_progress)
                        active_semantic_pan = asset["semantic_pan"]
                        if asset_index > 0 and timestamp < asset["start"] + 0.32:
                            previous_plate = visual_asset_frame(
                                loaded_story_assets[asset_index - 1], 0.98
                            )
                            if previous_plate.shape != active_plate.shape:
                                previous_plate = cv2.resize(
                                    previous_plate,
                                    (active_plate.shape[1], active_plate.shape[0]),
                                    interpolation=cv2.INTER_LANCZOS4,
                                )
                            blend = _smoothstep((timestamp - asset["start"]) / 0.32)
                            active_plate = cv2.addWeighted(
                                previous_plate,
                                1.0 - blend,
                                active_plate,
                                blend,
                                0.0,
                            )
                        break
                if composition_mode == "paced_hybrid" and matched_asset is None:
                    if timestamp >= payoff_start:
                        payoff_progress = (timestamp - payoff_start) / max(end - payoff_start, 0.05)
                        rendered = _subject_punch_in(
                            polished_frame,
                            person,
                            payoff_progress,
                            max_zoom=float(effect.get("payoff_zoom", 1.065) or 1.065),
                        )
                    else:
                        rendered = polished_frame
                    caption = _caption_at(captions, timestamp)
                    if caption:
                        rendered = _draw_caption(rendered, caption)
                    if encoder.stdin is None:
                        raise RuntimeError("Reality Break encoder pipe is unavailable")
                    encoder.stdin.write(np.ascontiguousarray(rendered).tobytes())
                    index += 1
                    ok, next_frame = capture.read()
                    frame = next_frame if ok else None
                    continue
                if composition_mode == "monitor" and portal_quad is None:
                    portal_quad = _normalized_portal_quad(effect, width, height, person)
                reveal_in = _smoothstep((timestamp - start) / min(0.65, max(0.1, (end - start) * 0.3)))
                reveal_out = (
                    1.0
                    if end >= media_duration - (1.5 / max(fps, 1.0))
                    else _smoothstep(
                        (end - timestamp) / min(0.4, max(0.1, (end - start) * 0.25))
                    )
                )
                reveal = min(reveal_in, reveal_out)
                if composition_mode == "paced_hybrid":
                    cut_in = _smoothstep(
                        (timestamp - matched_asset["start"]) / max(
                            0.08,
                            float(effect.get("cut_fade_in", 0.18) or 0.18),
                        )
                    )
                    cut_out = _smoothstep(
                        (matched_asset["end"] - timestamp) / max(
                            0.08,
                            float(effect.get("cut_fade_out", 0.22) or 0.22),
                        )
                    )
                    cut_reveal = min(cut_in, cut_out)
                    asset_mode = matched_asset.get("composition_mode")
                    if asset_mode == "full_background":
                        rendered = _full_background_composite(
                            polished_frame,
                            active_plate,
                            person,
                            active_progress,
                            cut_reveal,
                            active_semantic_pan,
                            background_blur=float(matched_asset.get("background_blur") or 1.8),
                            background_dim=float(matched_asset.get("background_dim") or 0.82),
                        )
                    else:
                        rendered = _broll_cutaway_composite(
                            polished_frame,
                            active_plate,
                            active_progress,
                            cut_reveal,
                            active_semantic_pan,
                        )
                elif composition_mode == "full_background":
                    rendered = _full_background_composite(
                        polished_frame,
                        active_plate,
                        person,
                        active_progress,
                        reveal,
                        active_semantic_pan,
                        background_blur=float(effect.get("background_blur") or 1.8),
                        background_dim=float(effect.get("background_dim") or 0.82),
                    )
                elif composition_mode == "broll_cutaway":
                    rendered = _broll_cutaway_composite(
                        polished_frame,
                        active_plate,
                        active_progress,
                        reveal,
                        active_semantic_pan,
                    )
                else:
                    rendered = _portal_composite(
                        polished_frame,
                        active_plate,
                        portal_quad,
                        person,
                        active_progress,
                        reveal,
                        active_semantic_pan,
                        animate_story,
                    )
            else:
                rendered = polished_frame
            caption = _caption_at(captions, timestamp)
            if caption:
                rendered = _draw_caption(rendered, caption)
            if encoder.stdin is None:
                raise RuntimeError("Reality Break encoder pipe is unavailable")
            encoder.stdin.write(np.ascontiguousarray(rendered).tobytes())
            index += 1
            ok, next_frame = capture.read()
            frame = next_frame if ok else None

        if encoder.stdin is not None:
            encoder.stdin.close()
            encoder.stdin = None
        stderr = encoder.stderr.read().decode("utf-8", errors="replace") if encoder.stderr else ""
        if encoder.stderr is not None:
            encoder.stderr.close()
        code = encoder.wait()
        if code:
            raise RuntimeError(f"Reality Break encoder failed: {stderr[-1200:]}")
    except Exception:
        if encoder.stdin is not None:
            encoder.stdin.close()
            encoder.stdin = None
        encoder.kill()
        encoder.wait()
        if encoder.stderr is not None:
            encoder.stderr.close()
        if os.path.exists(safe_output):
            os.remove(safe_output)
        raise
    finally:
        capture.release()
        segmenter.close()
        if environment_asset.get("capture") is not None:
            environment_asset["capture"].release()
        for story_asset in loaded_story_assets:
            if story_asset.get("capture") is not None:
                story_asset["capture"].release()

    proof = validate_rendered_media(safe_output, expected_audio=has_audio)
    proof.update(
        {
            "frames": index,
            "fps": fps,
            "encoder": "libx264",
            "subject_pipeline": "mediapipe_selfie_segmentation_cpu",
            "subject_matte_recoveries": subject_matte_recoveries,
            "composition": {
                "monitor": "tracked_story_portal_inside_original_scene",
                "full_background": "moving_story_background_behind_real_subject",
                "broll_cutaway": "full_frame_story_cutaway_over_original_audio",
                "paced_hybrid": "paced_story_cutaways_with_real_speaker_payoff",
            }[composition_mode],
            "composition_mode": composition_mode,
            "source_people_preserved": composition_mode != "broll_cutaway",
            "source_people_handling": (
                "captured_subject_and_foreground_pixels_preserved"
                if composition_mode == "full_background"
                else "captured_people_unchanged_outside_editorial_cutaways"
                if composition_mode == "broll_cutaway"
                else "captured_people_unchanged_between_short_editorial_cutaways"
                if composition_mode == "paced_hybrid"
                else "captured_people_remain_in_original_scene"
            ),
            "source_polish": "non_generative_selective_grade_and_detail_recovery",
            "caption_language": (
                " + ".join(
                    {
                        "xh": "isiXhosa",
                        "en": "English",
                        "zu": "isiZulu",
                        "mixed": "code-switched",
                    }.get(str(code), str(code))
                    for code in dict.fromkeys(effect.get("caption_languages") or [])
                )
                or "preserve_spoken_languages"
                if captions
                else None
            ),
            "story_asset_count": len(loaded_story_assets) or 1,
            "story_motion": (
                f"grounded_moving_video_{composition_mode}"
                if any(asset.get("kind") == "video" for asset in loaded_story_assets)
                else "animated_2_5d_light_flow_and_particles"
                if animate_story
                else None
            ),
        }
    )
    return proof
