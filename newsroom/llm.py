"""The only module that calls the LLM. One function: complete_json(...) -> dict."""
from __future__ import annotations

import json
import os
from typing import Any

from newsroom import config


class LLMError(RuntimeError):
    """The model could not produce a usable answer; the caller blocks the story."""


_client = None


def _anthropic_client():
    global _client
    if _client is None:
        try:
            import anthropic  # imported lazily so the mock provider and tests run without it
        except ImportError as e:
            raise LLMError("the 'anthropic' package is not installed (pip install anthropic)") from e
        api_key = os.environ.get("LLM_API_KEY") or None  # None -> SDK falls back to ANTHROPIC_API_KEY / profile
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


def complete_json(messages: list[dict[str, str]], *, system: str, schema: dict[str, Any]) -> dict[str, Any]:
    """Send a conversation, get back one JSON object matching `schema`."""
    if config.LLM_PROVIDER != "anthropic":
        raise LLMError(f"unknown LLM_PROVIDER '{config.LLM_PROVIDER}' (use 'anthropic' or 'mock')")
    import anthropic

    client = _anthropic_client()
    try:
        response = client.beta.messages.create(
            model=config.LLM_MODEL,
            max_tokens=config.LLM_MAX_TOKENS,
            system=system,
            messages=messages,
            output_config={"effort": config.LLM_EFFORT, "format": {"type": "json_schema", "schema": schema}},
            # On a policy decline the API re-runs the request on a fallback model inside the same call.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError as e:
        raise LLMError("rate limited by the LLM API") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"LLM API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("could not reach the LLM API") from e

    if response.stop_reason == "refusal":
        raise LLMError("the model declined to write this story")
    if response.stop_reason == "max_tokens":
        raise LLMError("the model ran out of tokens")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise LLMError("no text in the model response")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError("the model returned invalid JSON") from e
    if not isinstance(data, dict):
        raise LLMError("the model returned JSON that is not an object")
    return data
