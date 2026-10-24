"""One passing and one failing case per verifier rule (AGENTS.md section 3, Person B)."""
import pytest

from newsroom.verifier import placeholders, render, verify

# Ilves were not playing; Kärpät scored the 2-1 at event 3.
CLEAN = ("You didn't play tonight, but that goal cost you {{e3.ILV.playoff_delta}}. "
         "You're now at {{e3.ILV.playoff_after}}, and {{e3.ILV.next_date}} against {{e3.ILV.next_opponent}} matters.")


@pytest.fixture
def ilv(facts):
    return facts["3"]["ILV"]


@pytest.fixture
def names(facts):
    out = set()
    for per_team in facts.values():
        for tf in per_team.values():
            out |= set(tf["allowed_names"]) | {tf["context"]["team_name"]}
    return out


def check(text, ilv, names, used=None):
    return verify(text, placeholders(text) if used is None else used, ilv, names)


def test_clean_story_passes(ilv, names):
    assert check(CLEAN, ilv, names) == []


def test_render_substitutes_display_values(ilv):
    out = render(CLEAN, ilv)
    assert "{{" not in out and "3 percentage points" in out and "Kärpät" in out


# Rule 1: raw digits
def test_rule1_raw_digit_blocked(ilv, names):
    problems = check(CLEAN.replace("{{e3.ILV.playoff_after}}", "37%"), ilv, names,
                     used=["e3.ILV.playoff_delta", "e3.ILV.next_date", "e3.ILV.next_opponent"])
    assert any("raw number '37%'" in p for p in problems)


def test_rule1_digits_inside_placeholders_are_fine(ilv, names):
    assert check("It is {{e3.ILV.playoff_after}} now.", ilv, names) == []


# Rule 2: unknown or malformed placeholders
def test_rule2_unknown_fact_blocked(ilv, names):
    problems = check("Their chance is {{e3.ILV.magic_number}}.", ilv, names)
    assert any("unknown fact id 'e3.ILV.magic_number'" in p for p in problems)


def test_rule2_fact_from_another_team_blocked(ilv, names):
    problems = check("Kärpät are at {{e3.KAR.playoff_after}}.", ilv, names)
    assert any("unknown fact id" in p for p in problems)


def test_rule2_malformed_placeholder_blocked(ilv, names):
    problems = check("Their chance is {{e3.ILV.playoff_after.", ilv, names, used=[])
    assert "malformed placeholder" in problems


# Rule 3: facts_used must match the placeholders
def test_rule3_used_but_not_listed(ilv, names):
    problems = check(CLEAN, ilv, names, used=["e3.ILV.playoff_delta"])
    assert any("used but not listed" in p for p in problems)


def test_rule3_listed_but_not_used(ilv, names):
    problems = check("It is {{e3.ILV.playoff_after}}.", ilv, names,
                     used=["e3.ILV.playoff_after", "e3.ILV.direct_after"])
    assert any("listed in facts_used but not in the text" in p for p in problems)


# Rule 4: names outside the fact sheet
def test_rule4_unlisted_team_blocked(ilv, names):
    problems = check("Tappara will be pleased: you are at {{e3.ILV.playoff_after}}.", ilv, names)
    assert "name 'Tappara' is not in the fact sheet" in problems


def test_rule4_allowed_names_pass(ilv, names):
    assert check("Kärpät scored against Pelicans; Ilves are at {{e3.ILV.playoff_after}}.", ilv, names) == []


def test_rule4_partial_words_do_not_match(ilv, names):
    # "TPS" must not match inside another word.
    assert check("The STEPS ahead are clear: {{e3.ILV.playoff_after}}.", ilv, names) == []


# Rule 5: length and banned words
def test_rule5_too_long_blocked(ilv, names):
    problems = check(CLEAN + " word" * 60, ilv, names)
    assert any("words (max 60)" in p for p in problems)


@pytest.mark.parametrize("bad", ["You should bet on it.", "Grab the odds boost.", "No injury news.",
                                 "That is a guarantee."])
def test_rule5_banned_words_blocked(ilv, names, bad):
    problems = check(f"{bad} You are at {{{{e3.ILV.playoff_after}}}}.", ilv, names)
    assert any(p.startswith("banned word") for p in problems)


def test_rule5_better_is_not_bet(ilv, names):
    assert check("Better days ahead: {{e3.ILV.playoff_after}}.", ilv, names) == []
