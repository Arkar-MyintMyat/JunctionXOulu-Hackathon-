import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from newsroom.factsheet import build_facts, load_schedule, load_team_ids, next_games  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def odds():
    return json.loads((FIXTURES / "odds_sample.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def facts(odds):
    upcoming = next_games(load_schedule(FIXTURES / "schedule_sample.json"),
                          load_team_ids(FIXTURES / "teams_sample.json"), odds["match"]["date"])
    return build_facts(odds, upcoming)


@pytest.fixture
def facts_file(tmp_path, facts):
    path = tmp_path / "facts-9001.json"
    path.write_text(json.dumps({"schema_version": 1, "match_id": 9001, "facts": facts}, ensure_ascii=False),
                    encoding="utf-8")
    return path
