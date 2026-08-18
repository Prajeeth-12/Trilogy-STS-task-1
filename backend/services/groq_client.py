import httpx
from config import GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL, TRANSLATION_TIMEOUT_PRIMARY


class RateLimitError(Exception):
    pass


class GroqAPIError(Exception):
    pass


async def translate(messages: list[dict], timeout: float = TRANSLATION_TIMEOUT_PRIMARY) -> str:
    if not GROQ_API_KEY:
        raise GroqAPIError("GROQ_API_KEY not configured")

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 256,
            },
        )

    if response.status_code == 429:
        raise RateLimitError("Groq rate limit hit")

    if response.status_code != 200:
        raise GroqAPIError(f"Groq API error: {response.status_code}")

    data = response.json()
    return data["choices"][0]["message"]["content"].strip()
