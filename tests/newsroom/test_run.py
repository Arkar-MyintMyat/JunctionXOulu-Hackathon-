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


def test_retry_failed_rewrites_only_api_failures(facts_file, tmp_path, monkeypatch):
    out = tmp_path / "s.json"
    first = run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file, out_path=out)
    # Pretend the API failed for one story in that run.
    data = load(out)
    failed = next(s for s in data["stories"] if not s.get("injected"))
    failed.update(text="", facts_used=[], problems=["writer failed: 503 high demand"], status="blocked")
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    written = []
    real = writer.write_story
    monkeypatch.setattr(writer, "write_story", lambda *a, **k: written.append(a[0]) or real(*a, **k))
    second = run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file, out_path=out,
                     retry_failed=True)

    assert len(written) == 1                                          # only the failed story was rewritten
    assert len(second["stories"]) == len(first["stories"])
    assert sum(bool(s.get("injected")) for s in second["stories"]) == 1  # the demo error is kept, not doubled
    assert not any(run.writer_failed(s) for s in second["stories"])


def test_playing_team_with_nothing_at_stake_gets_no_story(odds):
    """Game 480: KooKoo were already at 100%, so their goals changed nothing for them."""
    import copy

    from newsroom.factsheet import build_facts

    o = copy.deepcopy(odds)
    for e in o["events"]:
        e["odds"]["PEL"]["playoff"] = 1.0
    targets = run.select_targets(build_facts(o, {}))
    assert all(team != "PEL" for _, team in targets)
    assert any(team == "KAR" for _, team in targets)


def test_retry_blocked_rewrites_held_stories_but_keeps_the_injected_one(facts_file, tmp_path, monkeypatch):
    out = tmp_path / "s.json"
    run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file, out_path=out)
    data = load(out)
    held = next(s for s in data["stories"] if not s.get("injected"))
    held.update(problems=["fact 'x' listed in facts_used but not in the text"], status="blocked")
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    written = []
    real = writer.write_story
    monkeypatch.setattr(writer, "write_story", lambda *a, **k: written.append(a[0]) or real(*a, **k))
    result = run.run("9001", ["fan"], "mock", inject=True, workers=1, facts_path=facts_file, out_path=out,
                     retry_blocked=True)
    assert len(written) == 1                                              # only the held story
    assert sum(bool(s.get("injected")) for s in result["stories"]) == 1   # demo error kept
    assert [s["status"] for s in result["stories"] if not s.get("injected")].count("blocked") == 0


def test_injection_skips_stories_that_already_failed(facts):
    good = {"event_idx": 3, "team": "TPS", "audience": "fan", "text": "ok", "problems": []}
    failed = {"event_idx": 3, "team": "HPK", "audience": "fan", "text": "", "problems": ["writer failed: 404"]}
    assert run.pick_injection_target([failed, good], facts) is good
    assert run.pick_injection_target([failed], facts) is None


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

    def fake(messages, *, system, schema, provider=None):
        calls.append(messages)
        return bad if len(calls) == 1 else good

    monkeypatch.setattr(llm, "complete_json", fake)
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="anthropic")
    assert draft.problems == [] and draft.attempts == 2
    assert "raw number '41%'" in calls[1][-1]["content"]      # the retry carries the checker's problems


def test_llm_failure_blocks_instead_of_crashing(facts, monkeypatch):
    def boom(messages, *, system, schema, provider=None):
        raise llm.LLMError("could not reach the LLM API")

    monkeypatch.setattr(llm, "complete_json", boom)
    draft = writer.write_story(facts["3"]["ILV"], "fan", run.known_names(facts), provider="anthropic")
    assert draft.problems == ["writer failed: could not reach the LLM API"]


def test_unknown_audience_rejected(facts):
    with pytest.raises(ValueError):
        writer.write_story(facts["3"]["ILV"], "pundit", set(), provider="mock")
