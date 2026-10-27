"""Speech-to-text providers. Independent of the chat LLM client."""
from __future__ import annotations

import logging
import os
import tempfile
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import httpx

log = logging.getLogger("dc.stt")

DEFAULT_WHISPER_MODEL = "whisper-1"
OPENAI_BASE = "https://api.openai.com/v1"


class SttError(RuntimeError):
    """Transcription failed for a reason the caller can show."""


class SttUnavailableError(SttError):
    """Provider is not configured or not installed."""


class SttNoSpeechError(SttError):
    """Audio arrived but no speech was found."""


class Transcriber(Protocol):
    def transcribe(self, audio: bytes, *, mime: str, language: str | None = "en") -> str: ...


def _suffix_for(mime: str) -> str:
    mime = (mime or "").split(";")[0].strip().lower()
    return {
        "audio/webm": ".webm",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".mp4",
        "audio/ogg": ".ogg",
        "video/webm": ".webm",
    }.get(mime, ".webm")


class OpenAiWhisper:
    """OpenAI /v1/audio/transcriptions. Uses OPENAI_API_KEY regardless of LLM_PROVIDER."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = (api_key if api_key is not None else os.environ.get("OPENAI_API_KEY", "")).strip()
        self.model = (model or os.environ.get("WHISPER_MODEL", DEFAULT_WHISPER_MODEL)).strip() or DEFAULT_WHISPER_MODEL

    def transcribe(self, audio: bytes, *, mime: str, language: str | None = "en") -> str:
        if not self.api_key:
            raise SttUnavailableError("No OpenAI key. Set OPENAI_API_KEY in backend/.env.")
        if not audio:
            raise SttNoSpeechError("No audio data was captured.")
        name = f"speech{_suffix_for(mime)}"
        files = {"file": (name, audio, mime or "application/octet-stream")}
        data: dict[str, str] = {"model": self.model}
        if language:
            data["language"] = language
        try:
            r = httpx.post(
                f"{OPENAI_BASE}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                files=files,
                data=data,
                timeout=60.0,
                follow_redirects=False,
            )
        except httpx.HTTPError as e:
            raise SttError("Transcription could not reach OpenAI.") from e
        if r.status_code >= 400:
            detail = (r.text or "")[:200]
            raise SttError(f"Transcription failed ({r.status_code}). {detail}".strip())
        text = str(r.json().get("text") or "").strip()
        if not text:
            raise SttNoSpeechError("No speech detected in recording.")
        return text


class LocalFasterWhisper:
    """Optional local STT. Only used when STT_PROVIDER=local and faster-whisper is installed."""

    def transcribe(self, audio: bytes, *, mime: str, language: str | None = "en") -> str:
        if not audio:
            raise SttNoSpeechError("No audio data was captured.")
        model = _local_model()
        suffix = _suffix_for(mime)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(audio)
            path = Path(handle.name)
        try:
            threshold = float(os.environ.get("STT_NO_SPEECH_THRESHOLD", "0.6"))
            segments, _ = model.transcribe(
                str(path),
                language=language,
                vad_filter=True,
                no_speech_threshold=threshold,
                condition_on_previous_text=False,
                beam_size=1,
            )
            text = " ".join(str(s.text or "").strip() for s in segments if str(s.text or "").strip()).strip()
            if not text:
                raise SttNoSpeechError("No speech detected in recording.")
            return text
        except SttNoSpeechError:
            raise
        except SttUnavailableError:
            raise
        except Exception as e:
            raise SttError("Local transcription failed.") from e
        finally:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                log.warning("stt.tempfile_cleanup_failed path=%s", path)


@lru_cache(maxsize=1)
def _local_model() -> object:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as e:
        raise SttUnavailableError("faster-whisper is not installed on this runtime.") from e
    size = os.environ.get("STT_MODEL_SIZE", "base")
    device = os.environ.get("STT_DEVICE", "cpu")
    compute = os.environ.get("STT_COMPUTE_TYPE", "int8")
    log.info("stt.model_loading model=%s device=%s compute_type=%s", size, device, compute)
    return WhisperModel(size, device=device, compute_type=compute)


_factory: Callable[[], Transcriber] | None = None


def set_transcriber_factory(factory: Callable[[], Transcriber] | None) -> None:
    """Tests inject a fake Transcriber; pass None to restore the default."""
    global _factory
    _factory = factory


def get_transcriber() -> Transcriber:
    if _factory is not None:
        return _factory()
    provider = (os.environ.get("STT_PROVIDER") or "openai").strip().lower()
    if provider == "local":
        return LocalFasterWhisper()
    return OpenAiWhisper()


def transcribe_for_user(user_id: int, audio: bytes, *, mime: str, module: str = "interview") -> str:
    """Transcribe and record a usage row. Raises SttError subclasses for the route to map."""
    from dc_platform import usage

    usage.check_quota(user_id)
    text = get_transcriber().transcribe(audio, mime=mime)
    model = os.environ.get("WHISPER_MODEL", DEFAULT_WHISPER_MODEL) if (os.environ.get("STT_PROVIDER") or "openai") != "local" else os.environ.get("STT_MODEL_SIZE", "base")
    usage.record(user_id, module, model, "transcribe", tokens_in=0, tokens_out=max(1, len(text.split())), cost_micro=0)
    return text
