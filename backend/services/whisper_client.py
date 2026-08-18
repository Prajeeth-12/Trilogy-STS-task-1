import io
import wave
import struct
import httpx
from config import GROQ_API_KEY, GROQ_BASE_URL


class WhisperError(Exception):
    pass


async def transcribe(audio_pcm: bytes, sample_rate: int = 16000, language: str = "en") -> str:
    if not GROQ_API_KEY:
        raise WhisperError("GROQ_API_KEY not configured")

    wav_buffer = _pcm_to_wav(audio_pcm, sample_rate)

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{GROQ_BASE_URL}/audio/transcriptions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": ("audio.wav", wav_buffer, "audio/wav")},
            data={
                "model": "whisper-large-v3-turbo",
                "language": language[:2],
                "response_format": "json",
                "temperature": 0.0,
            },
        )

    if response.status_code != 200:
        raise WhisperError(f"Whisper API error {response.status_code}: {response.text[:200]}")

    data = response.json()
    text = data.get("text", "").strip()
    return text


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    num_samples = len(pcm_bytes) // 4  # float32 = 4 bytes per sample
    samples = struct.unpack(f'{num_samples}f', pcm_bytes)
    int16_samples = [int(max(-1.0, min(1.0, s)) * 32767) for s in samples]

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f'{len(int16_samples)}h', *int16_samples))

    return buf.getvalue()
