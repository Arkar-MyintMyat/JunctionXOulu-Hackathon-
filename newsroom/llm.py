"""The only module that calls the LLM. One function: complete_json(...) -> dict.

Providers (LLM_PROVIDER in .env):
- "anthropic": Claude via the anthropic SDK (structured JSON output, server-side refusal fallback).
- "openai_compatible": any OpenAI-style chat completions API over httpx, e.g. Google Gemini:
      LLM_PROVIDER=openai_compatible
      LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
      LLM_MODEL=<a Gemini model id from AI Studio>
      LLM_API_KEY=<your AI Studio key>
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import httpx

from newsroom import config


class LLMError(RuntimeError):
    """The model could not produce a usable answer; the caller blocks the story."""


def complete_json(messages: list[dict[str, str]], *, system: str, schema: dict[str, Any],
                  provider: str | None = None) -> dict[str, Any]:
    """Send a conversation, get back one JSON object matching `schema`."""
    provider = provider or config.LLM_PROVIDER
    if provider == "anthropic":
        return _anthropic_json(messages, system, schema)
    if provider == "openai_compatible":
        return _openai_compatible_json(messages, system, schema)
    raise LLMError(f"unknown LLM_PROVIDER '{provider}' (use one of {', '.join(config.LLM_PROVIDERS)})")


def parse_json_object(text: str) -> dict[str, Any]:
    """Parse the model's JSON; tolerate a ```json fence around it, nothing else."""
    cleaned = text.strip()
    fence = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise LLMError("the model returned invalid JSON") from e
    if not isinstance(data, dict):
        raise LLMError("the model returned JSON that is not an object")
    return data


# ---------- anthropic ----------

_anthropic = None


def _anthropic_client():
    global _anthropic
    if _anthropic is None:
        try:
            import anthropic  # imported lazily so other providers and tests run without it
        except ImportError as e:
            raise LLMError("the 'anthropic' package is not installed (pip install anthropic)") from e
        api_key = os.environ.get("LLM_API_KEY") or None  # None -> SDK falls back to ANTHROPIC_API_KEY / profile
        _anthropic = anthropic.Anthropic(api_key=api_key)
    return _anthropic


def _anthropic_json(messages: list[dict[str, str]], system: str, schema: dict[str, Any]) -> dict[str, Any]:
    client = _anthropic_client()
    import anthropic

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
    return parse_json_object(text)


# ---------- openai_compatible (Gemini, Groq, OpenRouter, Ollama, ...) ----------

def _http_client() -> httpx.Client:
    """Separate function so tests can swap in a fake transport."""
    return httpx.Client(timeout=config.LLM_HTTP_TIMEOUT)


RETRYABLE = {429, 500, 502, 503, 504}  # rate limited or overloaded: wait and try again
NEXT_MODEL = {404} | RETRYABLE         # still failing after retries, or model gone: try the next model


def _retry_after(response: httpx.Response | None, attempt: int) -> float:
    try:
        return min(60.0, float(response.headers.get("retry-after", ""))) if response is not None else 0.0
    except ValueError:
        pass
    return min(60.0, 2.0 * 2 ** attempt)


def _short_error(response: httpx.Response) -> str:
    """The provider's error message, whether it sends an object, a list of objects or a plain string."""
    try:
        err: Any = response.json()
    except ValueError:
        return response.text[:160]
    if isinstance(err, list) and err:
        err = err[0]
    if isinstance(err, dict):
        err = err.get("error", err)
    if isinstance(err, dict):
        err = err.get("message", "")
    return str(err)[:160] or response.text[:160]


def _quota_used_up(response: httpx.Response) -> bool:
    """A 429 for a used-up daily quota (Gemini free tier: requests per day per model). Waiting won't help."""
    if response.status_code != 429:
        return False
    text = response.text
    if "PerDay" in text:
        return True
    match = re.search(r'"retryDelay"\s*:\s*"(\d+)', text)
    return bool(match and int(match.group(1)) > 300)


def _post_with_retries(client: httpx.Client, url: str, headers: dict[str, str], body: dict[str, Any]):
    """One model: retry rate limits, overload and timeouts. Returns (response or None, last problem)."""
    response: httpx.Response | None = None
    for attempt in range(config.LLM_RATE_LIMIT_RETRIES + 1):
        try:
            response = client.post(url, headers=headers, json=body)
        except httpx.TimeoutException:
            problem = "timed out"
        except httpx.HTTPError:
            problem = "could not reach the LLM API"
        else:
            if response.status_code == 400 and body["response_format"]["type"] == "json_schema":
                # Some providers or models do not take a JSON schema: fall back to plain JSON mode.
                # The prompt still asks for {text, facts_used}, and the verifier checks the result.
                body["response_format"] = {"type": "json_object"}
                continue
            if response.status_code not in RETRYABLE:
                return response, ""
            if _quota_used_up(response):
                return response, "daily free-tier quota used up for this model"
            problem = f"{response.status_code} {_short_error(response)}"
        if attempt < config.LLM_RATE_LIMIT_RETRIES:
            time.sleep(_retry_after(response, attempt))
    return response, problem


def _openai_compatible_json(messages: list[dict[str, str]], system: str, schema: dict[str, Any]) -> dict[str, Any]:
    if not config.LLM_BASE_URL:
        raise LLMError("LLM_BASE_URL is not set (for Gemini: https://generativelanguage.googleapis.com/v1beta/openai)")
    if not config.LLM_MODEL_SET:
        raise LLMError("LLM_MODEL is not set (use a model id from your provider, e.g. from Google AI Studio)")
    api_key = os.environ.get("LLM_API_KEY")
    if not api_key:
        raise LLMError("LLM_API_KEY is not set")

    url = f"{config.LLM_BASE_URL}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    models = [config.LLM_MODEL_SET, *[m for m in config.LLM_FALLBACK_MODELS if m != config.LLM_MODEL_SET]]
    failures: list[str] = []

    with _http_client() as client:
        for model in models:
            body: dict[str, Any] = {
                "model": model,
                "messages": [{"role": "system", "content": system}, *messages],
                "response_format": {"type": "json_schema",
                                    "json_schema": {"name": "story", "schema": schema, "strict": True}},
            }
            response, problem = _post_with_retries(client, url, headers, body)
            if response is not None and response.status_code < 400:
                break
            if response is not None and response.status_code not in NEXT_MODEL and not problem:
                raise LLMError(f"LLM API error {response.status_code}: {_short_error(response)}")
            failures.append(f"{model}: {problem or response.status_code}")
        else:
            raise LLMError("all models failed (" + "; ".join(failures) + "); try again later or use --retry-failed")

    try:
        choice = response.json()["choices"][0]
        text = choice["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise LLMError("unexpected response shape from the LLM API") from e
    if choice.get("finish_reason") == "length":
        raise LLMError("the model ran out of tokens")
    if not text:
        raise LLMError("no text in the model response")
    return parse_json_object(text)
