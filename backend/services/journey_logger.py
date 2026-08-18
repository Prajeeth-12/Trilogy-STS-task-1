import time
from dataclasses import dataclass, field
from models.schemas import TranslationRequest


@dataclass
class JourneyEvent:
    timestamp: float
    session_id: str
    event_type: str
    details: dict = field(default_factory=dict)


class JourneyLogger:
    def __init__(self):
        self._events: dict[str, list[JourneyEvent]] = {}

    def _add(self, session_id: str, event: JourneyEvent):
        if session_id not in self._events:
            self._events[session_id] = []
        self._events[session_id].append(event)

    def log_session_start(self, session_id: str, source_lang: str, target_lang: str):
        self._add(session_id, JourneyEvent(
            timestamp=time.time(),
            session_id=session_id,
            event_type="session_start",
            details={"source_lang": source_lang, "target_lang": target_lang},
        ))

    def log_translation(self, request: TranslationRequest, result: str, latency_ms: int, provider: str):
        self._add(request.session_id, JourneyEvent(
            timestamp=time.time(),
            session_id=request.session_id,
            event_type="translation",
            details={
                "original": request.text,
                "translated": result,
                "source_lang": request.source_lang,
                "target_lang": request.target_lang,
                "latency_ms": latency_ms,
                "provider": provider,
                "seq_num": request.seq_num,
            },
        ))

    def log_error(self, session_id: str, message: str):
        self._add(session_id, JourneyEvent(
            timestamp=time.time(),
            session_id=session_id,
            event_type="error",
            details={"message": message},
        ))

    def log_mode_switch(self, session_id: str, mode: str):
        self._add(session_id, JourneyEvent(
            timestamp=time.time(),
            session_id=session_id,
            event_type="mode_switch",
            details={"mode": mode},
        ))

    def get_events(self, session_id: str) -> list[JourneyEvent]:
        return self._events.get(session_id, [])

    def export_markdown(self, session_id: str) -> str:
        events = self.get_events(session_id)
        if not events:
            return "# EchoBridge STS — Journey Log\n\nNo events recorded."

        translations = [e for e in events if e.event_type == "translation"]
        errors = [e for e in events if e.event_type == "error"]

        md = "# EchoBridge STS — Journey Log\n\n"
        md += f"**Session:** `{session_id}`\n\n"

        if events:
            from datetime import datetime
            start = datetime.fromtimestamp(events[0].timestamp).strftime("%Y-%m-%d %H:%M:%S")
            end = datetime.fromtimestamp(events[-1].timestamp).strftime("%H:%M:%S")
            md += f"**Duration:** {start} → {end}\n\n"

        md += "---\n\n"
        md += "## Translations\n\n"
        md += "| # | Time | Original | Translation | Latency | Provider |\n"
        md += "|---|------|----------|-------------|---------|----------|\n"

        for i, event in enumerate(translations, 1):
            from datetime import datetime
            t = datetime.fromtimestamp(event.timestamp).strftime("%H:%M:%S")
            d = event.details
            original = d["original"][:50].replace("|", "\\|")
            translated = d["translated"][:50].replace("|", "\\|")
            md += f"| {i} | {t} | {original} | {translated} | {d['latency_ms']}ms | {d['provider']} |\n"

        md += f"\n---\n\n"
        md += "## Stats\n\n"
        md += f"- **Total translations:** {len(translations)}\n"

        if translations:
            avg_latency = sum(e.details["latency_ms"] for e in translations) // len(translations)
            md += f"- **Average latency:** {avg_latency}ms\n"
            providers = {}
            for e in translations:
                p = e.details["provider"]
                providers[p] = providers.get(p, 0) + 1
            md += f"- **Providers:** {', '.join(f'{k}: {v}' for k, v in providers.items())}\n"

        md += f"- **Errors:** {len(errors)}\n"

        if errors:
            md += "\n## Errors\n\n"
            for e in errors:
                from datetime import datetime
                t = datetime.fromtimestamp(e.timestamp).strftime("%H:%M:%S")
                md += f"- `{t}` — {e.details['message']}\n"

        return md


logger = JourneyLogger()
