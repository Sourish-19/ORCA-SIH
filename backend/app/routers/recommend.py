"""
Recommendation router - Stack B pipeline over HTTP.

    POST /api/recommend        body: RecommendationRequest
    GET  /api/recommend/demo   the default Chennai query, no body

The legacy Stack A route (POST /api/query) is left untouched in app.main.
"""

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.models.api import DEFAULT_QUERY, RecommendationRequest, RecommendationResponse
from app.services.pipeline import ChennaiDatasetUnavailable, run_recommendation

router = APIRouter(prefix="/api", tags=["recommendation"])


async def _run(query: str, language: str, audience: str) -> RecommendationResponse:
    try:
        return await run_in_threadpool(
            run_recommendation,
            query=query,
            language=language,
            audience=audience,
        )
    except ChennaiDatasetUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Chennai processed dataset unavailable: {exc}")
    except HTTPException:
        raise
    except Exception as exc:  # deterministic pipeline shouldn't fail; surface it if it does
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend(request: RecommendationRequest) -> RecommendationResponse:
    return await _run(request.query, request.language, request.audience)


@router.get("/recommend/demo", response_model=RecommendationResponse)
async def recommend_demo() -> RecommendationResponse:
    return await _run(DEFAULT_QUERY, "auto", "fisherman")
