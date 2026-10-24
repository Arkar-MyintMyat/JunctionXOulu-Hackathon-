import json

import pytest

from newsroom import llm, run, writer


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_mock_run_all_verified(facts_file, tmp_path):
    out = tmp_path / "stories.json"
    result = run.run("9001", ["fan"], "mock", inject=False, workers=1, facts_path=facts_file, out_path=out)
    assert load(out) == result
    assert result["stories"] and all(s["status"] == "verified" for s in result["stories"])


def test_inject_error_is_blocked(facts_file, tmp_path):
    result = run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file,
                     out_path=tmp_path / "s.json")
    blocked = [s for s in result["stories"] if s["status"] == "blocked"]
    assert len(blocked) == 1
    story = blocked[0]
    assert story["injected"] and story["review"] == "editor"
    assert any(p.startswith("raw number") for p in story["problems"])


def test_injection_hits_a_team_that_was_not_playing(facts_file, facts, tmp_path):
    result = run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file,
                     out_path=tmp_path / "s.json")
    story = next(s for s in result["stories"] if s.get("injected"))
    assert facts[str(story["event_idx"])][story["team"]]["context"]["role"] == "not playing"


def test_selection_only_goals_and_playing_teams_first(facts):
    targets = run.select_targets(facts)
    assert {idx for idx, _ in targets} == {1, 2, 3}          # goals only, no start/end
    e3 = [t for i, t in targets if i == 3]
    assert e3[:2] == ["KAR", "PEL"] or set(e3[:2]) == {"KAR", "PEL"}
    assert len(e3) <= 6


def test_big_swing_goes_to_editor_even_if_verified(facts):
    # Kärpät +23 points at e3 is under 25; a 25-point swing must be routed to the editor.
    tf = json.loads(json.dumps(facts["3"]["KAR"]))
    delta = next(f for f in tf["facts"] if f["id"].endswith(".playoff_delta"))
    assert run.review_route("verified", tf) == "auto"
    delta["value"] = -0.25
    assert run.review_route("verified", tf) == "editor"
    assert run.review_route("blocked", facts["3"]["ILV"]) == "editor"


def test_all_audiences_template(facts):
    names = run.known_names(facts)
    for audience in ("fan", "neutral", "bettor"):
        draft = writer.write_story(facts["3"]["ILV"], audience, names, provider="mock")
        assert draft.problems == [], (audience, draft.text, draft.problems)


def test_llm_retry_fixes_a_bad_draft(facts, monkeypatch):
    calls = []
    good = {"text": "You are now at {{e3.ILV.playoff_after}}.", "facts_used": ["e3.ILV.playoff_after"]}
    bad = {"text": "You are now at 41%.", "facts_used": []}

    def fake(messages, *, system, schema):
        calls.append(messages)
        return bad if len(calls) == 1 else good

    monkeypatch.setattr(llm, "complete_json", fake)
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="anthropic")
    assert draft.problems == [] and draft.attempts == 2
    assert "raw number '41%'" in calls[1][-1]["content"]      # the retry carries the checker's problems


def test_llm_failure_blocks_instead_of_crashing(facts, monkeypatch):
    def boom(messages, *, system, schema):
        raise llm.LLMError("could not reach the LLM API")

    monkeypatch.setattr(llm, "complete_json", boom)
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="anthropic")
    assert draft.problems == ["writer failed: could not reach the LLM API"]


def test_unknown_audience_rejected(facts):
    with pytest.raises(ValueError):
        writer.write_story(facts["3"]["ILV"], "pundit", set(), provider="mock")
