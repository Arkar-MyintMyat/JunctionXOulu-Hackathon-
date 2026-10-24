import re

from newsroom.factsheet import fmt_pct, fmt_points, fmt_score, next_games

ID = re.compile(r"^e\d+\.[A-Z]{3}\.[a-z0-9_]+$")


def test_every_event_has_facts_for_every_team(odds, facts):
    codes = {t["code"] for t in odds["teams"]}
    assert set(facts) == {str(e["idx"]) for e in odds["events"]}
    for per_team in facts.values():
        assert set(per_team) == codes


def test_fact_ids_follow_the_contract(facts):
    for idx, per_team in facts.items():
        for code, tf in per_team.items():
            for f in tf["facts"]:
                assert ID.match(f["id"]), f["id"]
                assert f["id"].startswith(f"e{idx}.{code}.")


def test_display_matches_value(facts):
    for per_team in facts.values():
        for tf in per_team.values():
            for f in tf["facts"]:
                name = f["id"].rsplit(".", 1)[1]
                if name.endswith(("_before", "_after")):
                    assert f["display"] == fmt_pct(f["value"])
                elif name.endswith("_delta"):
                    assert f["display"] == fmt_points(f["value"])
                elif name == "score":
                    assert f["display"] == fmt_score(f["value"])


def test_delta_is_after_minus_before(facts):
    tf = facts["3"]["KAR"]
    by = {f["id"].rsplit(".", 1)[1]: f["value"] for f in tf["facts"]}
    assert abs(by["playoff_delta"] - (by["playoff_after"] - by["playoff_before"])) < 1e-9
    assert tf["context"]["playoff_direction"] == "up"


def test_roles(facts):
    e3 = facts["3"]
    assert e3["KAR"]["context"]["role"] == "scored"
    assert e3["PEL"]["context"]["role"] == "conceded"
    assert e3["ILV"]["context"]["role"] == "not playing"
    assert e3["ILV"]["context"]["scorer"] == "Lehtonen"


def test_allowed_names_cover_the_story(facts):
    ilv = facts["3"]["ILV"]["allowed_names"]
    assert {"Ilves", "Kärpät", "Pelicans", "Lehtonen"} <= set(ilv)


def test_next_game_facts(facts):
    ilv = {f["id"].rsplit(".", 1)[1]: f for f in facts["3"]["ILV"]["facts"]}
    assert ilv["next_opponent"]["value"] == "KAR" and ilv["next_opponent"]["display"] == "Kärpät"
    assert ilv["next_date"]["display"] == "Monday"


def test_next_games_skips_same_day_and_unknown_teams():
    ids = {"a": "AAA", "b": "BBB"}
    schedule = [{"start": "2026-03-14T16:00:00Z", "homeTeamId": "a", "awayTeamId": "b"},
                {"start": "2026-03-15T16:00:00Z", "homeTeamId": "a", "awayTeamId": "zzz"},
                {"start": "2026-03-16T16:00:00Z", "homeTeamId": "b", "awayTeamId": "a"}]
    assert next_games(schedule, ids, "2026-03-14") == {"BBB": {"opponent": "AAA", "date": "2026-03-16"},
                                                       "AAA": {"opponent": "BBB", "date": "2026-03-16"}}


def test_overtime_goal_is_flagged_and_written_as_overtime(odds):
    import copy

    from newsroom.factsheet import build_facts
    from newsroom.writer import template_story

    ot = copy.deepcopy(odds)
    ot["events"][3]["seconds"], ot["events"][3]["clock"] = 3869, "64:29"
    facts = build_facts(ot, {})
    assert facts["3"]["KAR"]["context"]["overtime"] is True
    assert facts["2"]["KAR"]["context"]["overtime"] is False
    text, _ = template_story(facts["3"]["KAR"], "fan")
    assert "in overtime" in text and "{{e3.KAR.clock}}" not in text


def test_default_schedule_path_follows_loader_layout(tmp_path, monkeypatch):
    from newsroom import config
    from newsroom.factsheet import default_schedule_path

    monkeypatch.setattr(config, "RAW_DIR", tmp_path)
    assert default_schedule_path(2026) is None
    (tmp_path / "2026").mkdir()
    (tmp_path / "2026" / "schedule.json").write_text("[]", encoding="utf-8")
    assert default_schedule_path(2026) == tmp_path / "2026" / "schedule.json"
    assert default_schedule_path(2027) is None


def test_season_over_only_when_the_schedule_says_so(odds):
    from newsroom.factsheet import build_facts
    from newsroom.writer import template_story

    # Last game of the season: schedule loaded, nobody has a later game.
    over = build_facts(odds, {}, schedule_known=True)
    assert over["3"]["ILV"]["context"]["season_over"] is True
    assert not any(f["id"].endswith(("next_opponent", "next_date")) for f in over["3"]["ILV"]["facts"])
    text, _ = template_story(over["3"]["ILV"], "fan")
    assert "regular season is over" in text and "Next up" not in text
    # No schedule at all: claim nothing.
    unknown = build_facts(odds, {}, schedule_known=False)
    assert unknown["3"]["ILV"]["context"]["season_over"] is False
    assert "season" not in template_story(unknown["3"]["ILV"], "fan")[0]


def test_goal_that_lowers_the_scorers_own_chance(odds):
    """Game 480: TPS's 3-3 equaliser lowered TPS's own playoff chance (7% -> 2%)."""
    import copy

    from newsroom.factsheet import build_facts
    from newsroom.writer import template_story

    o = copy.deepcopy(odds)
    o["events"][2]["odds"]["PEL"]["playoff"] = o["events"][1]["odds"]["PEL"]["playoff"] - 0.05  # PEL scored at e2
    tf = build_facts(o, {}, schedule_known=True)["2"]["PEL"]
    assert tf["context"]["role"] == "scored" and tf["context"]["playoff_direction"] == "down"
    for audience, start in (("fan", "Even so, your playoff chance fell"),
                            ("neutral", "Even so, Pelicans' playoff chance fell"),
                            ("bettor", "Even so, the model's estimate of Pelicans' playoff chance fell")):
        assert start in template_story(tf, audience)[0]


def test_formatting():
    assert fmt_pct(0.414) == "41%"
    assert fmt_points(-0.18) == "18 percentage points"
    assert fmt_points(0.01) == "1 percentage point"
    assert fmt_points(0.001) == "less than 1 percentage point"
    assert fmt_score("3-2") == "3–2"
