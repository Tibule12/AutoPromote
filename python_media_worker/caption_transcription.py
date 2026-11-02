"""Local caption model selection, separate from the language of the output.

Swivuriso does not expose decoder tokens for its seven supported languages.
An explicit source-language choice must never be passed as an unsupported
Whisper token or silently treated as an English detection.
"""
import os

SOUTH_AFRICAN_LANGUAGES = frozenset({"xh", "zu", "st", "tn", "ts", "nr", "ve", "za-mixed"})
CAPTION_SOURCE_LANGUAGES = SOUTH_AFRICAN_LANGUAGES | {"auto", "en", "af"}


def caption_transcription_options(source_language="auto", *, translate_to_english=False):
    selected = str(source_language or "auto").strip().lower()
    if selected not in CAPTION_SOURCE_LANGUAGES:
        raise ValueError("Choose a supported caption source language or automatic detection")
    override = os.getenv("VIRAL_CAPTION_WHISPER_MODEL") or os.getenv("MULTICAM_CAPTION_WHISPER_MODEL")
    if selected in SOUTH_AFRICAN_LANGUAGES:
        if translate_to_english:
            raise ValueError("Automatic English translation is unavailable for this speech-language choice. Keep the spoken-language captions or import reviewed English subtitles.")
        model = override or os.getenv("VIRAL_CAPTION_SOUTH_AFRICAN_WHISPER_MODEL") or "digiphyte/swivuriso-turbo"
        language = None
    else:
        # Turbo checkpoints are for recognition. Standard Whisper supports the
        # existing translation task; an operator can pin a different checkpoint.
        if translate_to_english:
            model = override or os.getenv("VIRAL_CAPTION_TRANSLATION_WHISPER_MODEL") or "small"
        else:
            model = override or os.getenv("VIRAL_CAPTION_GENERAL_WHISPER_MODEL") or "deepdml/faster-whisper-large-v3-turbo-ct2"
        language = None if selected == "auto" else selected
    return {"model_name": model, "language": language}
