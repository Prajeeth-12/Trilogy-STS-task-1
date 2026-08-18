import os
import json
from dotenv import load_dotenv

load_dotenv()

SETTINGS_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "EchoBridge")
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")


def _load_from_settings_file() -> dict:
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    return {}


def _get_key(name: str) -> str:
    settings = _load_from_settings_file()
    return settings.get(name, "") or os.getenv(name.upper(), "")


# Translation providers
NIM_API_KEY = _get_key("nim_api_key")
NIM_MODEL = "meta/llama-3.1-8b-instruct"
NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"

GROQ_API_KEY = _get_key("groq_api_key")
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

TRANSLATION_TIMEOUT_PRIMARY = 3.0
TRANSLATION_TIMEOUT_FAILOVER = 5.0

CONTEXT_WINDOW_SIZE = 5


def reload_keys():
    global NIM_API_KEY, GROQ_API_KEY
    NIM_API_KEY = _get_key("nim_api_key")
    GROQ_API_KEY = _get_key("groq_api_key")
