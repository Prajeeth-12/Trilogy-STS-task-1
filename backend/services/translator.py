import asyncio
import time

import httpx

from models.schemas import TranslationRequest, TranslationResponse
from services import groq_client, nim_client
from services.groq_client import RateLimitError, GroqAPIError
from services.nim_client import NIMAPIError
from services.context_manager import build_context_block, add_to_context
from services.journey_logger import logger

SYSTEM_PROMPT = """You are a real-time meeting translator.
Translate naturally. Maintain speaker's tone and terminology.
Reply ONLY with the translation — no explanations, no quotes, no prefixes.

{context_block}"""


def _build_messages(text: str, source_lang: str, target_lang: str, context_block: str) -> list[dict]:
    system = SYSTEM_PROMPT.format(context_block=context_block)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Translate from {source_lang} to {target_lang}:\n{text}"},
    ]


class AllProvidersFailedError(Exception):
    pass


async def translate(request: TranslationRequest) -> TranslationResponse:
    start = time.perf_counter()
    context_block = build_context_block(request.session_id)
    messages = _build_messages(request.text, request.source_lang, request.target_lang, context_block)

    # Primary: NVIDIA NIM (faster ~460ms avg)
    try:
        result = await nim_client.translate(messages)
        latency_ms = int((time.perf_counter() - start) * 1000)
        add_to_context(request.session_id, request.text, result)
        logger.log_translation(request, result, latency_ms, "nim")
        return TranslationResponse(
            original_text=request.text,
            translated_text=result,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            latency_ms=latency_ms,
            provider="nim",
            seq_num=request.seq_num,
            timestamp=request.timestamp,
        )
    except (NIMAPIError, httpx.TimeoutException, Exception) as e:
        logger.log_error(request.session_id, f"NIM failed: {e}")

    # Failover: Groq (reliable ~710ms avg)
    try:
        result = await groq_client.translate(messages)
        latency_ms = int((time.perf_counter() - start) * 1000)
        add_to_context(request.session_id, request.text, result)
        logger.log_translation(request, result, latency_ms, "groq")
        return TranslationResponse(
            original_text=request.text,
            translated_text=result,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            latency_ms=latency_ms,
            provider="groq",
            seq_num=request.seq_num,
            timestamp=request.timestamp,
        )
    except RateLimitError:
        await asyncio.sleep(1.0)
    except (GroqAPIError, httpx.TimeoutException, Exception) as e:
        logger.log_error(request.session_id, f"Groq failed: {e}")

    raise AllProvidersFailedError("All translation providers failed")
