import json
import os
from fastapi import APIRouter
from pydantic import BaseModel
import httpx

router = APIRouter(prefix="/api/settings")

SETTINGS_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "EchoBridge")
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")


class KeysPayload(BaseModel):
    groq_api_key: str = ""
    nim_api_key: str = ""


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return {}


def _save_settings(data: dict):
    os.makedirs(SETTINGS_DIR, exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(data, f, indent=2)


@router.get("/status")
async def settings_status():
    from config import GROQ_API_KEY, NIM_API_KEY
    settings = _load_settings()
    groq_ok = bool(settings.get("groq_api_key") or GROQ_API_KEY)
    nim_ok = bool(settings.get("nim_api_key") or NIM_API_KEY)
    return {
        "groq": groq_ok,
        "nim": nim_ok,
        "configured": groq_ok or nim_ok,
    }


@router.post("")
async def save_settings(payload: KeysPayload):
    errors = []

    # Validate Groq key
    if payload.groq_api_key:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {payload.groq_api_key}"},
                )
            if resp.status_code != 200:
                errors.append(f"Groq key invalid (status {resp.status_code})")
        except Exception as e:
            errors.append(f"Groq validation failed: {str(e)[:50]}")

    # Validate NIM key
    if payload.nim_api_key:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://integrate.api.nvidia.com/v1/models",
                    headers={"Authorization": f"Bearer {payload.nim_api_key}"},
                )
            if resp.status_code != 200:
                errors.append(f"NIM key invalid (status {resp.status_code})")
        except Exception as e:
            errors.append(f"NIM validation failed: {str(e)[:50]}")

    if errors:
        return {"success": False, "errors": errors}

    # Save validated keys
    settings = _load_settings()
    if payload.groq_api_key:
        settings["groq_api_key"] = payload.groq_api_key
    if payload.nim_api_key:
        settings["nim_api_key"] = payload.nim_api_key
    _save_settings(settings)

    # Reload keys in config module
    from config import reload_keys
    reload_keys()

    return {"success": True, "errors": []}


@router.get("/guide")
async def settings_guide():
    return {
        "groq": {
            "name": "Groq",
            "url": "https://console.groq.com/keys",
            "steps": [
                "Go to console.groq.com and sign up (free)",
                "Navigate to API Keys section",
                "Click 'Create API Key'",
                "Copy the key (starts with gsk_)"
            ]
        },
        "nim": {
            "name": "NVIDIA NIM",
            "url": "https://build.nvidia.com",
            "steps": [
                "Go to build.nvidia.com and sign up (free)",
                "Browse any model (e.g. Llama 3.1)",
                "Click 'Get API Key' in the top right",
                "Copy the key (starts with nvapi-)"
            ]
        }
    }
