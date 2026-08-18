from config import CONTEXT_WINDOW_SIZE

_sessions: dict[str, list[str]] = {}


def get_context(session_id: str) -> list[str]:
    return _sessions.get(session_id, [])


def add_to_context(session_id: str, original: str, translated: str) -> None:
    if session_id not in _sessions:
        _sessions[session_id] = []
    _sessions[session_id].append(f'"{original}" → "{translated}"')
    if len(_sessions[session_id]) > CONTEXT_WINDOW_SIZE:
        _sessions[session_id] = _sessions[session_id][-CONTEXT_WINDOW_SIZE:]


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def build_context_block(session_id: str) -> str:
    context = get_context(session_id)
    if not context:
        return ""
    return "Recent conversation for context:\n" + "\n".join(context)
