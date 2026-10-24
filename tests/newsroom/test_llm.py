"""The openai_compatible provider (used for Gemini) against a fake HTTP server: no key, no network."""
import json

import httpx
import pytest

from newsroom import config, llm, prompts, run, writer

STORY = {"text": "You are now at {{e3.ILV.playoff_after}}.", "facts_used": ["e3.ILV.playoff_after"]}


def completion(content, finish="stop"):
    return {"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": finish}]}


@pytest.fixture
def gemini(monkeypatch):
    """Point the provider at a fake server; returns the list of requests it received and a way to script replies."""
    monkeypatch.setattr(config, "LLM_BASE_URL", "https://example.test/v1beta/openai")
    monkeypatch.setattr(config, "LLM_MODEL_SET", "gemini-test")
    monkeypatch.setattr(config, "LLM_FALLBACK_MODELS", [])  # independent of the developer's .env
    monkeypatch.setattr(config, "LLM_EXTRA_KEYS", [])
    monkeypatch.setattr(llm, "_used_up", set())
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    seen, replies = [], []

    def handler(request):
        seen.append({"url": str(request.url), "auth": request.headers.get("authorization"),
                     "body": json.loads(request.content)})
        status, payload = replies.pop(0)
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(llm, "_http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    return seen, replies


def ask():
    return llm.complete_json([{"role": "user", "content": "hi"}], system="sys", schema=prompts.OUTPUT_SCHEMA,
                             provider="openai_compatible")


def test_request_shape_and_parse(gemini):
    seen, replies = gemini
    replies.append((200, completion(json.dumps(STORY))))
    assert ask() == STORY
    req = seen[0]
    assert req["url"] == "https://example.test/v1beta/openai/chat/completions"
    assert req["auth"] == "Bearer test-key"
    assert req["body"]["model"] == "gemini-test"
    assert req["body"]["messages"][0] == {"role": "system", "content": "sys"}
    assert req["body"]["response_format"]["type"] == "json_schema"


def test_json_fence_is_tolerated(gemini):
    _, replies = gemini
    replies.append((200, completion("```json\n" + json.dumps(STORY) + "\n```")))
    assert ask() == STORY


def test_schema_not_supported_falls_back_to_json_mode(gemini):
    seen, replies = gemini
    replies += [(400, {"error": "response_format json_schema not supported"}), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert seen[1]["body"]["response_format"] == {"type": "json_object"}


def test_rate_limit_is_retried(gemini):
    seen, replies = gemini
    replies += [(429, {"error": "quota"}), (429, {"error": "quota"}), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert len(seen) == 3


def test_rate_limit_gives_up_with_a_clear_error(gemini):
    _, replies = gemini
    replies += [(429, {"error": "quota"})] * (config.LLM_RATE_LIMIT_RETRIES + 1)
    with pytest.raises(llm.LLMError, match="all models failed"):
        ask()


def test_overload_503_is_retried(gemini):
    seen, replies = gemini
    busy = {"error": {"code": 503, "message": "high demand"}}
    replies += [(503, busy), (503, busy), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert len(seen) == 3


def test_overloaded_model_falls_back_to_the_next_one(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_FALLBACK_MODELS", ["gemini-backup"])
    busy = {"error": {"code": 503, "message": "high demand"}}
    replies += [(503, busy)] * (config.LLM_RATE_LIMIT_RETRIES + 1) + [(200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert seen[-1]["body"]["model"] == "gemini-backup"


def test_retired_model_404_falls_back_immediately(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_FALLBACK_MODELS", ["gemini-backup"])
    replies += [(404, {"error": {"message": "no longer available"}}), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert [r["body"]["model"] for r in seen] == ["gemini-test", "gemini-backup"]


def test_daily_quota_skips_to_next_model_without_waiting(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_FALLBACK_MODELS", ["gemini-lite"])
    waits = []
    monkeypatch.setattr(llm.time, "sleep", lambda s: waits.append(s))
    used_up = [{"error": {"code": 429, "message": "You exceeded your current quota",
                          "details": [{"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
                                      {"retryDelay": "75793s"}]}}]
    replies += [(429, used_up), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert [r["body"]["model"] for r in seen] == ["gemini-test", "gemini-lite"]
    assert waits == []  # no pointless waiting on a daily quota


USED_UP = [{"error": {"code": 429, "message": "You exceeded your current quota",
                      "details": [{"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}]


def test_teammate_key_takes_over_the_same_model(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_EXTRA_KEYS", ["team-key"])
    replies += [(429, USED_UP), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert [(r["body"]["model"], r["auth"]) for r in seen] == [("gemini-test", "Bearer test-key"),
                                                               ("gemini-test", "Bearer team-key")]


def test_used_up_pairs_are_skipped_for_the_rest_of_the_run(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_EXTRA_KEYS", ["team-key"])
    replies += [(429, USED_UP), (200, completion(json.dumps(STORY))), (200, completion(json.dumps(STORY)))]
    ask()
    ask()
    assert [r["auth"] for r in seen] == ["Bearer test-key", "Bearer team-key", "Bearer team-key"]


def test_rejected_key_is_skipped(gemini, monkeypatch):
    seen, replies = gemini
    monkeypatch.setattr(config, "LLM_EXTRA_KEYS", ["team-key"])
    replies += [(401, {"error": {"message": "API key not valid"}}), (200, completion(json.dumps(STORY)))]
    assert ask() == STORY
    assert seen[-1]["auth"] == "Bearer team-key"


def test_bad_key_is_not_retried(gemini):
    seen, replies = gemini
    replies.append((401, {"error": {"message": "API key not valid"}}))
    with pytest.raises(llm.LLMError, match="401"):
        ask()
    assert len(seen) == 1


def test_timeout_is_retried(monkeypatch):
    monkeypatch.setattr(config, "LLM_BASE_URL", "https://example.test/v1beta/openai")
    monkeypatch.setattr(config, "LLM_MODEL_SET", "gemini-test")
    monkeypatch.setattr(config, "LLM_FALLBACK_MODELS", [])
    monkeypatch.setattr(config, "LLM_EXTRA_KEYS", [])
    monkeypatch.setattr(llm, "_used_up", set())
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ReadTimeout("slow", request=request)
        return httpx.Response(200, json=completion(json.dumps(STORY)))

    monkeypatch.setattr(llm, "_http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    assert ask() == STORY and len(calls) == 2


def test_truncated_answer_is_an_error(gemini):
    _, replies = gemini
    replies.append((200, completion('{"text": "You are', finish="length")))
    with pytest.raises(llm.LLMError, match="ran out of tokens"):
        ask()


def test_missing_settings_are_explained(monkeypatch):
    monkeypatch.setattr(config, "LLM_BASE_URL", "")
    with pytest.raises(llm.LLMError, match="LLM_BASE_URL"):
        ask()


def test_writer_passes_the_provider_through(facts, gemini):
    """--provider openai_compatible must reach the HTTP call, whatever .env says."""
    seen, replies = gemini
    replies.append((200, completion(json.dumps(STORY))))
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="openai_compatible")
    assert draft.problems == [] and len(seen) == 1


def test_bad_draft_from_gemini_is_still_blocked(facts, gemini):
    """A weaker model writing raw numbers twice ends blocked, never published."""
    _, replies = gemini
    bad = {"text": "You are now at 41%.", "facts_used": []}
    replies += [(200, completion(json.dumps(bad)))] * 2
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="openai_compatible")
    assert any("raw number" in p for p in draft.problems) and draft.attempts == 2
