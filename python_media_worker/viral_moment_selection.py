"""Source-bound editorial candidates for the existing Find Viral Clips analyser.

Scores describe editorial evidence, never a probability of going viral. No model,
network request, generated picture, or synthetic transcript is used here.
"""
import hashlib
import math
import re
from bisect import bisect_left
from statistics import mean

VERSION = "moments-v2"
DESTINATIONS = {"tiktok", "youtube_shorts", "instagram_reels"}
DESTINATION_LABELS = {
    "tiktok": "TikTok",
    "youtube_shorts": "YouTube Shorts",
    "instagram_reels": "Instagram Reels",
}
DESTINATION_PROFILES = {
    "youtube_shorts": {
        "label": "YouTube Shorts",
        "aspect": "9:16",
        "ideal_min": 15.0,
        "ideal_max": 58.0,
        "hard_max": 60.0,
        "weights": {"opening": 0.18, "payoff": 0.35, "story": -0.05, "energy": -0.05, "motion": -0.1, "complete": 5.0, "pace": 2.0},
    },
    "instagram_reels": {
        "label": "Instagram Reels",
        "aspect": "9:16",
        "ideal_min": 18.0,
        "ideal_max": 60.0,
        "hard_max": 90.0,
        "weights": {"opening": 0.0, "payoff": 0.05, "story": 0.35, "energy": 0.25, "motion": 0.3, "complete": 3.5, "pace": 1.0},
    },
    "tiktok": {
        "label": "TikTok",
        "aspect": "9:16",
        "ideal_min": 12.0,
        "ideal_max": 48.0,
        "hard_max": 120.0,
        "weights": {"opening": 0.4, "payoff": -0.05, "story": 0.15, "energy": 0.2, "motion": 0.25, "complete": 2.5, "pace": 3.5},
    },
}


class SignalSeries:
    def __init__(self, samples):
        pairs = sorted((number(s[0]), number(s[1])) for s in samples or [] if isinstance(s, (list, tuple)) and len(s) >= 2)
        self.times = [s[0] for s in pairs]
        self.values = [s[1] for s in pairs]
        self.sorted_values = sorted(self.values)

    def window(self, start, end):
        return self.values[bisect_left(self.times, start):bisect_left(self.times, end)]

    def rank(self, value):
        return bisect_left(self.sorted_values, value) / len(self.values) if self.values else 0


def number(value, default=0.0):
    try:
        result = float(value)
        return result if math.isfinite(result) else default
    except (ValueError, TypeError):
        return default


def selection_settings(value=None):
    value = value if isinstance(value, dict) else {}
    lower = max(5.0, min(90.0, number(value.get("minDuration"), 30)))
    upper = max(lower, min(120.0, number(value.get("maxDuration"), 60)))
    destinations = value.get("destinations")
    destinations = sorted(set(destinations) & DESTINATIONS) if isinstance(destinations, list) else sorted(DESTINATIONS)
    return {"version": VERSION, "minDuration": lower, "maxDuration": upper,
            "destinations": destinations, "focus": str(value.get("focus") or "").strip()[:200]}


def tokens(text):
    return re.findall(r"[^\W_]+(?:['’][^\W_]+)?", str(text).casefold(), re.UNICODE)


def _confidence(segment):
    if segment.get("transcriptConfidence") is not None:
        return max(0, min(1, number(segment["transcriptConfidence"])))
    samples = [number(w["probability"]) for w in segment.get("words", []) if w.get("probability") is not None]
    return mean(samples) if samples else 0.5


def speech_units(segments, duration):
    units = []
    for segment in segments or []:
        start, end = max(0, number(segment.get("start"))), min(duration, number(segment.get("end")))
        text = str(segment.get("text") or "").strip()
        confidence = _confidence(segment)
        if end <= start or not text or confidence < .35:
            continue
        words = [w for w in segment.get("words", []) if str(w.get("word") or "").strip()
                 and start <= number(w.get("start"), -1) < number(w.get("end"), -1) <= end + .05]
        if not words:
            units.append({"start": start, "end": end, "text": text, "confidence": confidence,
                          "completeEnd": bool(re.search(r"[.!?。！？…][\"'’”)]*$", text))})
            continue
        run = []
        for index, word in enumerate(words):
            run.append(word)
            terminal = bool(re.search(r"[.!?。！？…][\"'’”)]*$", str(word["word"]).strip()))
            next_gap = number(words[index + 1].get("start")) - number(word.get("end")) if index + 1 < len(words) else 0
            # A pause inside a comma-separated thought is not a new sentence.
            pause_boundary = next_gap >= 1.2 and len(run) >= 6 and not re.search(r"[,，:;]$", str(word["word"]).strip())
            if index == len(words) - 1 or terminal or pause_boundary:
                units.append({"start": number(run[0]["start"]), "end": min(end, number(run[-1]["end"])),
                              "text": " ".join(str(w["word"]).strip() for w in run), "confidence": confidence,
                              "completeEnd": terminal})
                run = []
    return sorted(units, key=lambda u: (u["start"], u["end"]))


def _samples(samples, start, end):
    if isinstance(samples, SignalSeries):
        return samples.window(start, end)
    return [number(s[1]) for s in samples or [] if isinstance(s, (list, tuple)) and len(s) >= 2
            and start <= number(s[0], -1) < end]


def _percentile_rank(samples, value):
    if isinstance(samples, SignalSeries):
        return samples.rank(value)
    finite = [number(s[1]) for s in samples or [] if isinstance(s, (tuple, list)) and len(s) >= 2]
    return sum(v < value for v in finite) / len(finite) if finite else 0


def _candidate(start, end, text, confidence, source, settings, duration, audio, motion, complete=True):
    length = end - start
    text = re.sub(r"\s+", " ", str(text)).strip()
    words = tokens(text)
    first = " ".join(words[:16])
    last = " ".join(words[-32:])
    question = bool(re.search(r"[?？]", text))
    opening_question = bool(re.match(r"(?:why|how|what|when|which|can|did|do|is|are|should|would)\b", first))
    contrast = bool(re.search(r"\b(?:but|however|instead|actually|until|although|yet)\b", text, re.I))
    explanation = bool(re.search(r"\b(?:because|therefore|means|result|learned|lesson|solution|finally|turned out|that's why)\b", last, re.I))
    practical = bool(re.search(r"\b(?:first|second|step|try|avoid|remember|example|here's how)\b", text, re.I))
    personal = bool(re.search(r"\b(?:i was|i felt|i lost|i realized|we were|i remember|changed my)\b", text, re.I))
    dependent = bool(re.match(r"(?:and|but|so|because|also|as i said|like i said|that one|it was)\b", first))
    promotion = bool(re.search(r"\b(?:subscribe|like and share|link in (?:the )?bio|use (?:my |our )?code|sponsored by|welcome back|thanks for watching)\b", text, re.I))
    question_without_answer = question and (len(words) < 18 or text.rstrip().endswith(("?", "？")))
    density = len(words) / max(length, 1)
    uniqueness = len(set(words)) / max(1, len(words))
    a = _samples(audio, start, end)
    m = _samples(motion, start, end)
    energy_rank = _percentile_rank(audio, max(a)) if a else 0
    motion_rank = _percentile_rank(motion, max(m)) if m else 0
    focus = set(tokens(settings["focus"]))
    focus_matches = len(focus & set(words)) / max(1, len(focus))
    fit = settings["minDuration"] <= length <= settings["maxDuration"]
    reasons, flags = [], []
    score = 32.0
    breakdown = {"durationFit": 10 if fit else 1, "sourceEvidence": 14 * confidence if words else 0,
                 "opening": (8 if opening_question else 3 if words else 0) - (9 if dependent else 0),
                 "payoff": 10 if explanation else 5 if complete and words else 0,
                 "story": (6 if contrast else 0) + (5 if personal else 0) + (5 if practical else 0),
                 "energy": round(6 * energy_rank, 2), "motion": round((4 if words else 15) * motion_rank, 2),
                 "focusMatch": round(10 * focus_matches, 2),
                 "penalties": -(18 if promotion else 0) - (12 if question_without_answer else 0)
                 - (12 if words and not complete else 0)
                 - (12 if words and uniqueness < .3 else 0) - (10 if words and density < .5 else 0)
                 - (6 if words and density > 4.5 else 0) - (10 if words and confidence < .62 else 0)}
    score += sum(breakdown.values())
    if opening_question:
        reasons.append("Opens with a source question")
    if explanation:
        reasons.append("Includes an explanation or outcome")
    if contrast or personal:
        reasons.append("Contains a story turn or personal stakes")
    if practical:
        reasons.append("Contains a practical example or step")
    if complete and words:
        reasons.append("Keeps recognised sentence boundaries")
    if energy_rank >= .8:
        reasons.append("Includes a measured audio-energy peak")
    if motion_rank >= .8:
        reasons.append("Includes a measured visual-motion peak")
    if focus_matches:
        reasons.append("Matches words in your editorial brief")
    if dependent:
        flags.append("Check the opening has enough context")
    if question_without_answer:
        flags.append("Question may need its answer included")
    if promotion:
        flags.append("Contains an introduction, promotion or outro")
    if confidence < .62 and words:
        flags.append("Review uncertain transcript wording")
    if not fit:
        flags.append("Source or sentence boundaries are shorter than the requested range")
    if not words:
        flags.append("Visual/audio evidence only; speech meaning is unverified")
        reasons.append("Selected from measured scene, motion and audio evidence")
    evidence = (22 + confidence * 55) if words else 30
    evidence += 7 if a else 0
    evidence += 7 if m else 0
    if not complete:
        flags.append("Review the cut boundaries: the final phrase may be incomplete")
    digest = hashlib.sha256(f"{start:.3f}:{end:.3f}:{source}:{text}".encode()).hexdigest()[:18]
    editorial_score = round(max(0, min(96, score)), 1)
    format_meta = score_destination_fit(
        length=length,
        words=words,
        density=density,
        complete=complete,
        breakdown=breakdown,
        base_score=editorial_score,
        destinations=settings.get("destinations"),
    )
    return {"id": f"moment_{digest}", "start": round(start, 3), "end": round(end, 3), "duration": round(length, 3),
            "text": text, "transcript": text, "transcriptConfidence": round(confidence, 3),
            "speechTrusted": bool(words and confidence >= .62), "source": source,
            "viralScore": editorial_score, "scoreBreakdown": breakdown,
            "editorialBreakdown": dict(breakdown),
            "scoreConfidence": round(min(95, evidence), 1),
            "scoreConfidenceLabel": "Strong evidence" if evidence >= 78 else "Moderate evidence" if evidence >= 58 else "Exploratory evidence",
            "reason": "; ".join(reasons), "reasons": reasons, "reviewFlags": flags,
            "hookText": " ".join(text.split()[:12]) if words else f"Visual moment at {int(start)//60}:{int(start)%60:02d}",
            "scoreMeaning": "Editorial ranking from source evidence; not a confidence percentage or prediction of views.",
            "selectionSettings": settings, "selectorVersion": VERSION, "durationMatchesRequest": fit,
            "analysisMode": "speech_editorial" if words else "visual_only",
            **format_meta}


def score_destination_fit(
    *,
    length,
    words,
    density,
    complete,
    breakdown,
    base_score,
    destinations=None,
):
    """Score grounded fit per vertical destination (Reels, Shorts, TikTok)."""
    active = sorted(set(destinations) & DESTINATIONS) if isinstance(destinations, list) and destinations else sorted(DESTINATIONS)
    tags = []
    for dest_id in active:
        profile = DESTINATION_PROFILES[dest_id]
        weights = profile["weights"]
        dest_score = float(base_score)
        note = None
        if length > profile["hard_max"]:
            dest_score -= 18.0
            note = f"Trim to {int(profile['hard_max'])}s or under for {profile['label']}"
        elif profile["ideal_min"] <= length <= profile["ideal_max"]:
            dest_score += 5.0
        else:
            dest_score += 1.0
        dest_score += max(0.0, number(breakdown.get("opening"))) * weights["opening"]
        dest_score += number(breakdown.get("payoff")) * weights["payoff"]
        dest_score += number(breakdown.get("story")) * weights["story"]
        dest_score += number(breakdown.get("energy")) * weights["energy"]
        dest_score += number(breakdown.get("motion")) * weights["motion"]
        if complete and words:
            dest_score += weights["complete"]
        if words and 1.8 <= density <= 3.8:
            dest_score += weights["pace"]
        rounded = round(max(0.0, min(96.0, dest_score)), 1)
        fit_label = "Trim needed" if length > profile["hard_max"] else ("Strong fit" if rounded >= 68.0 else "Good fit")
        tags.append({
            "id": dest_id,
            "label": profile["label"],
            "aspect": profile["aspect"],
            "score": rounded,
            "fit": fit_label,
            "note": note,
        })
    tags.sort(key=lambda item: (-item["score"], item["id"]))
    ready_tag = next((tag for tag in tags if tag["fit"] != "Trim needed"), None)
    recommended = (ready_tag or tags[0])["id"] if tags else "instagram_reels"
    return {
        "destinationScores": {tag["id"]: tag["score"] for tag in tags},
        "formatTags": tags,
        "recommendedDestination": recommended,
        "targetAspectRatio": "9:16",
    }


def sort_moments_for_destination(candidates, destination=None):
    """Sort selected moments by target Reels/Shorts/TikTok fit while preserving ties by editorial score."""
    dest_id = destination if destination in DESTINATIONS else None
    def rank_key(candidate):
        tags = candidate.get("formatTags") or []
        scores = candidate.get("destinationScores") or {}
        if dest_id:
            tag = next((item for item in tags if item.get("id") == dest_id), None)
            ready = (tag or {}).get("fit") != "Trim needed"
            dest_score = number(scores.get(dest_id), candidate.get("viralScore"))
        else:
            ready = any(item.get("fit") != "Trim needed" for item in tags) if tags else True
            dest_score = max((number(v) for v in scores.values()), default=number(candidate.get("viralScore")))
        return (
            0 if ready else 1,
            -dest_score,
            -number(candidate.get("viralScore")),
            number(candidate.get("start")),
        )
    return sorted([dict(item) for item in (candidates or [])], key=rank_key)


def _overlap(a, b):
    return max(0, min(a["end"], b["end"]) - max(a["start"], b["start"])) / max(.01, min(a["duration"], b["duration"]))


def select_diverse(candidates, limit=12):
    remaining = sorted(candidates, key=lambda c: (-c["viralScore"], c["start"], c["end"]))
    selected = []
    while remaining and len(selected) < limit:
        best = None
        best_value = -math.inf
        for candidate in remaining:
            if any(_overlap(candidate, prior) >= .55 for prior in selected):
                continue
            words = set(tokens(candidate.get("text")))
            similarity = max((len(words & set(tokens(p.get("text")))) / max(1, len(words | set(tokens(p.get("text"))))) for p in selected), default=0)
            if words and similarity > .82:
                continue
            value = candidate["viralScore"] - similarity * 13
            if value > best_value:
                best, best_value = candidate, value
        if best is None:
            break
        selected.append(dict(best, campaignOrder=len(selected) + 1))
        remaining.remove(best)
    return selected


def build_moment_candidates(segments, scene_ranges, duration, *, settings=None, audio=None, motion=None):
    duration = number(duration)
    if duration <= 0:
        return []
    options = selection_settings(settings)
    minimum, maximum = min(options["minDuration"], duration), min(options["maxDuration"], duration)
    units = speech_units(segments, duration)
    audio_series, motion_series = SignalSeries(audio), SignalSeries(motion)
    candidates = []
    # Every sentence can open a candidate; multiple complete endings compete.
    # Never expand a spoken beat to an unrelated camera-scene boundary.
    for i, first in enumerate(units):
        window = []
        for unit in units[i:i + 80]:
            if window and unit["start"] - window[-1]["end"] > 2.5:
                break
            if unit["end"] - first["start"] > maximum + .001:
                break
            window.append(unit)
            length = unit["end"] - first["start"]
            if length < minimum - .001:
                continue
            text = " ".join(u["text"] for u in window)
            weight = sum(u["end"] - u["start"] for u in window)
            confidence = sum(u["confidence"] * (u["end"] - u["start"]) for u in window) / max(.01, weight)
            candidates.append(_candidate(first["start"], unit["end"], text, confidence, "sentence_window", options, duration, audio_series, motion_series, complete=unit["completeEnd"]))
        if len(candidates) > 12000:
            # Bounded retained candidates, without privileging the video's end.
            candidates = sorted(candidates, key=lambda c: -c["viralScore"])[:4000]
    if units and not candidates:
        for u in units:
            if u["end"] - u["start"] <= maximum:
                candidates.append(_candidate(u["start"], u["end"], u["text"], u["confidence"], "sentence_window", options, duration, audio_series, motion_series, complete=u["completeEnd"]))
    # Silent/performance footage and speech-analysis gaps still have grounded
    # visual candidates. Windows include the lead-in AND aftermath of peaks.
    if not units or sum(u["end"] - u["start"] for u in units) < duration * .25:
        target = min(maximum, max(minimum, (minimum + maximum) / 2))
        peaks = sorted(motion or [], key=lambda s: -number(s[1]))[:30]
        peaks += sorted(audio or [], key=lambda s: -number(s[1]))[:20]
        anchors = [number(s[0]) for s in peaks]
        anchors += [number(s[0]) for s in scene_ranges or []]
        anchors += [i * max(1, target / 2) for i in range(min(3000, int(duration / max(1, target / 2)) + 1))]
        for anchor in anchors:
            start = max(0, min(duration - target, anchor - target * .4))
            end = min(duration, start + target)
            if end > start:
                candidates.append(_candidate(start, end, "", 0, "visual_window", options, duration, audio_series, motion_series))
    return select_diverse(candidates, 40)


def finalize_moments(candidates, settings=None, limit=12):
    # Optional external judgement can modestly refine evidence-led selection;
    # it cannot manufacture a 99 score or replace source times/transcript.
    options = selection_settings(settings) if settings is not None else None
    output = []
    for value in candidates:
        c = dict(value)
        breakdown = c.get("editorialBreakdown") or c.get("scoreBreakdown", {})
        base = 32 + sum(breakdown.values())
        ai = c.get("aiRankScore")
        if ai is not None:
            base += max(-5, min(5, (number(ai) - base) * .15))
        c["viralScore"] = round(max(0, min(96, base)), 1)
        c["scoreBreakdown"] = dict(breakdown)
        c["reason"] = "; ".join(c.get("reasons") or [])
        words = tokens(c.get("text") or c.get("transcript") or "")
        length = max(0.01, number(c.get("duration"), number(c.get("end")) - number(c.get("start"))))
        density = len(words) / max(length, 1.0)
        complete = not any("final phrase may be incomplete" in str(flag).lower() for flag in (c.get("reviewFlags") or []))
        active_destinations = (options or c.get("selectionSettings") or {}).get("destinations")
        c.update(score_destination_fit(
            length=length,
            words=words,
            density=density,
            complete=complete,
            breakdown=breakdown,
            base_score=c["viralScore"],
            destinations=active_destinations,
        ))
        output.append(c)
    selected = select_diverse(output, limit)
    if options and len(options["destinations"]) == 1:
        selected = sort_moments_for_destination(selected, options["destinations"][0])
        for order, item in enumerate(selected, start=1):
            item["campaignOrder"] = order
    return selected
