from newsroom import config, prompts


def test_system_prompt_shows_double_brace_placeholders():
    """The examples must show {{fact_id}}: single braces make the model write placeholders the checker blocks."""
    text = prompts.system_prompt()
    assert "{{fact_id}}" in text and "{{e3.ILV.playoff_after}}" in text
    assert "{fact_id}" not in text.replace("{{fact_id}}", "")
    assert f"at most {config.MAX_WORDS} words" in text
    assert "{max_words}" not in text
