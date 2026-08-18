import httpx
from config import NIM_API_KEY, NIM_BASE_URL, NIM_MODEL, TRANSLATION_TIMEOUT_FAILOVER


class NIMAPIError(Exception):
    pass


async def translate(messages: list[dict], timeout: float = TRANSLATION_TIMEOUT_FAILOVER) -> str:
    if not NIM_API_KEY:
        raise NIMAPIError("NIM_API_KEY not configured")

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{NIM_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {NIM_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": NIM_MODEL,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": 256,
            },
        )

    if response.status_code != 200:
        raise NIMAPIError(f"NIM API error: {response.status_code}")

    data = response.json()
    return data["choices"][0]["message"]["content"].strip()
