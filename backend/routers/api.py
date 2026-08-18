from fastapi import APIRouter
from fastapi.responses import Response

from services.journey_logger import logger

router = APIRouter(prefix="/api")


@router.get("/sessions/{session_id}/export")
async def export_journey(session_id: str):
    markdown = logger.export_markdown(session_id)
    return Response(
        content=markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename=JOURNEY_LOG_{session_id[:8]}.md"},
    )
