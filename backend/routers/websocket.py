import json
import time
import traceback
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from models.schemas import TranslationRequest, TranslationResponse, ErrorResponse
from services.translator import translate, AllProvidersFailedError
from services.whisper_client import transcribe, WhisperError
from services.context_manager import build_context_block, add_to_context
from services.journey_logger import logger

router = APIRouter()

# Per-session audio buffer (accumulates PCM chunks)
_audio_buffers: dict[str, bytearray] = {}
_audio_seq: dict[str, int] = {}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, sessionId: str = "default"):
    await websocket.accept()
    logger.log_session_start(sessionId, "", "")
    _audio_buffers[sessionId] = bytearray()
    _audio_seq[sessionId] = 0

    try:
        while True:
            data = await websocket.receive()

            if "text" in data:
                message = json.loads(data["text"])
                msg_type = message.get("type", "")

                if msg_type == "translate":
                    try:
                        request = TranslationRequest(**message)
                        response = await translate(request)
                        await websocket.send_text(response.model_dump_json())
                    except AllProvidersFailedError:
                        error = ErrorResponse(
                            message="All translation providers failed.",
                            code="TRANSLATION_FAILED",
                        )
                        await websocket.send_text(error.model_dump_json())
                    except Exception as e:
                        print(f"[WS] Translation error: {e}")
                        traceback.print_exc()
                        error = ErrorResponse(
                            message=f"Error: {str(e)[:100]}",
                            code="INTERNAL_ERROR",
                        )
                        await websocket.send_text(error.model_dump_json())

                elif msg_type == "flush_audio":
                    # Frontend signals to process buffered audio
                    source_lang = message.get("source_lang", "en")
                    target_lang = message.get("target_lang", "es")
                    await _process_audio_buffer(websocket, sessionId, source_lang, target_lang)

                elif msg_type == "switch_mode":
                    logger.log_mode_switch(sessionId, message.get("mode", "online"))
                    await websocket.send_text(json.dumps({
                        "type": "mode_changed",
                        "mode": message.get("mode", "online"),
                        "status": "ready",
                    }))

                elif msg_type == "end_session":
                    break

            elif "bytes" in data:
                # Binary frame: raw PCM audio data from AudioWorklet
                _audio_buffers.setdefault(sessionId, bytearray()).extend(data["bytes"])

                # Auto-flush every ~3 seconds of audio (16kHz * 4 bytes * 3s = 192000 bytes)
                if len(_audio_buffers[sessionId]) >= 192000:
                    source_lang = "en"  # Will be overridden by flush_audio messages
                    target_lang = "es"
                    await _process_audio_buffer(websocket, sessionId, source_lang, target_lang)

    except WebSocketDisconnect:
        pass
    finally:
        _audio_buffers.pop(sessionId, None)
        _audio_seq.pop(sessionId, None)


async def _process_audio_buffer(websocket: WebSocket, session_id: str, source_lang: str, target_lang: str):
    buffer = _audio_buffers.get(session_id, bytearray())
    if len(buffer) < 16000:  # Less than 0.25s of audio, skip
        return

    audio_data = bytes(buffer)
    _audio_buffers[session_id] = bytearray()

    start_time = time.perf_counter()

    try:
        # Step 1: Whisper STT
        text = await transcribe(audio_data, sample_rate=16000, language=source_lang)

        if not text or len(text.strip()) < 2:
            return

        stt_time = time.perf_counter()
        stt_ms = int((stt_time - start_time) * 1000)

        # Step 2: Translate
        _audio_seq[session_id] = _audio_seq.get(session_id, 0) + 1
        seq_num = _audio_seq[session_id]

        request = TranslationRequest(
            type="translate",
            text=text.strip(),
            source_lang=source_lang,
            target_lang=target_lang,
            session_id=session_id,
            seq_num=seq_num,
            timestamp=time.time(),
        )

        response = await translate(request)

        total_ms = int((time.perf_counter() - start_time) * 1000)

        # Send response with STT timing info
        result = {
            "type": "translation",
            "original_text": text.strip(),
            "translated_text": response.translated_text,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "latency_ms": total_ms,
            "stt_ms": stt_ms,
            "translation_ms": total_ms - stt_ms,
            "provider": response.provider,
            "seq_num": seq_num,
            "timestamp": time.time(),
        }
        await websocket.send_text(json.dumps(result))

    except WhisperError as e:
        print(f"[WS] Whisper STT error: {e}")
    except AllProvidersFailedError:
        error = ErrorResponse(message="Translation providers failed.", code="TRANSLATION_FAILED")
        await websocket.send_text(error.model_dump_json())
    except Exception as e:
        print(f"[WS] Audio processing error: {e}")
        traceback.print_exc()
