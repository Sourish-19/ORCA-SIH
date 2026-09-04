"""
Explanation Models - schemas for the ORCA LLM Explainer.

The explainer NARRATES a DecisionResult in plain language (English or Tamil).
It never carries its own copy of a score, status, or decision - those stay on
DecisionResult. If the LLM is unavailable or its output fails the deterministic
guardrail checks, a template fallback produces the narrative instead.
"""

from typing import Optional
from pydantic import BaseModel, Field


class LLMExplainerConfig(BaseModel):
    """Runtime configuration for the explainer (usually built from app.config)."""
    model: str = "gemini-flash-latest"
    enabled: bool = True
    timeout_seconds: float = 12.0
    max_output_tokens: int = 800

    @classmethod
    def from_env(cls) -> "LLMExplainerConfig":
        """Build config from app.config / environment. 'auto' -> on if GROQ_API_KEY or GEMINI_API_KEY set."""
        from app import config as app_config

        setting = str(getattr(app_config, "ORCA_LLM_ENABLED", "auto")).strip().lower()
        if setting == "off":
            enabled = False
        elif setting == "on":
            enabled = True
        else:  # "auto"
            enabled = bool(getattr(app_config, "GROQ_API_KEY", None)) or bool(getattr(app_config, "GEMINI_API_KEY", None))

        return cls(
            model=getattr(app_config, "ORCA_LLM_MODEL", "qwen/qwen3.6-27b"),
            enabled=enabled,
            timeout_seconds=float(getattr(app_config, "ORCA_LLM_TIMEOUT_SECONDS", 12.0)),
            max_output_tokens=int(getattr(app_config, "ORCA_LLM_MAX_OUTPUT_TOKENS", 350)),
        )



class DecisionExplanation(BaseModel):
    """Plain-language narration of a DecisionResult. Terminal - nothing downstream parses it."""
    headline: str
    narrative: str
    language: str = Field("en", description="'en' | 'ta'")
    audience: str = Field("fisherman", description="'fisherman' | 'analyst'")

    model_used: str = Field(
        "template-fallback",
        description="Generator of the returned text: the model id, or 'template-fallback'",
    )
    is_fallback: bool = Field(True, description="True when the deterministic template produced the text")
    grounding_ok: bool = Field(
        True,
        description="True unless an LLM draft was produced and then rejected by a guardrail check",
    )
    fallback_reason: Optional[str] = Field(
        None,
        description="Why the template was used, e.g. 'llm_disabled', 'api_error:...', "
                    "'failed_number_check', 'failed_contradiction_check', 'failed_place_check'",
    )
