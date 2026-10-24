"""Team attack / defence rates (goals per game), shrunk toward the league average."""
from engine import config
from engine.model import Game


def game_goals(g: Game) -> tuple[int, int]:
    """Goals for the strength model: final score minus the shootout winner (it is not a real goal)."""
    home, away = g.home_goals, g.away_goals
    if g.finished_type == "SO":
        if home > away:
            home -= 1
        else:
            away -= 1
    return home, away


def team_rates(games: list[Game], codes: list[str], before: str | None = None
               ) -> tuple[dict[str, float], dict[str, float], float]:
    """(attack, defence, league_avg) from finished games that started before `before`.

    attack = goals for per game, defence = goals against per game, both shrunk:
    rate = (team_total + K * league_avg) / (games + K), K = config.SHRINKAGE_GAMES.
    """
    gf = {c: 0 for c in codes}
    ga = {c: 0 for c in codes}
    gp = {c: 0 for c in codes}
    for g in games:
        if not g.ended or g.finished_type is None or (before is not None and g.start >= before):
            continue
        h, a = game_goals(g)
        gf[g.home] += h
        ga[g.home] += a
        gf[g.away] += a
        ga[g.away] += h
        gp[g.home] += 1
        gp[g.away] += 1
    total_games = sum(gp.values())
    # TODO(A): league average is 0 goals before the first game; use last season's average then.
    league_avg = sum(gf.values()) / total_games if total_games else 3.0
    k = config.SHRINKAGE_GAMES
    attack = {c: (gf[c] + k * league_avg) / (gp[c] + k) for c in codes}
    defence = {c: (ga[c] + k * league_avg) / (gp[c] + k) for c in codes}
    return attack, defence, league_avg
