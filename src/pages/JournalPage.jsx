import React, { useEffect, useMemo, useState } from 'react';
import { getRegisteredPlayers } from '../utils/players';
import '../styles/journal.css';

const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';
const BONUS_CHOICES_KEY = 'prono_ligue1_lm_bonus_choices';
const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
const PLAYER_KEY = 'prono_ligue1_lm_current_player';
const DISPLAY_NAMES_KEY = 'prono_ligue1_lm_display_names';

const PLAYERS = getRegisteredPlayers();

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function clean(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getDisplayName(player) {
  const names = safeJson(DISPLAY_NAMES_KEY, {});
  return names[player] || player;
}

function hasScore(match) {
  return (
    match.scoreDomicile !== null &&
    match.scoreDomicile !== undefined &&
    match.scoreExterieur !== null &&
    match.scoreExterieur !== undefined
  );
}

function hasScoreProno(prono) {
  return (
    prono &&
    prono.home !== '' &&
    prono.home !== undefined &&
    prono.away !== '' &&
    prono.away !== undefined
  );
}

function getResult(match) {
  if (!hasScore(match)) return null;

  const home = Number(match.scoreDomicile);
  const away = Number(match.scoreExterieur);

  if (home > away) return '1';
  if (home < away) return '2';
  return 'N';
}

function getPlayerFavorite(player, currentPlayer) {
  const customFavorite = localStorage.getItem(`${FAVORITE_TEAM_KEY}_${player}`);

  if (customFavorite) return customFavorite;

  if (player === currentPlayer) {
    return localStorage.getItem(FAVORITE_TEAM_KEY) || 'RC Lens';
  }

  return '';
}

function isFavoriteMatch(match, favoriteTeam) {
  return (
    favoriteTeam &&
    (clean(match.domicile) === clean(favoriteTeam) ||
      clean(match.exterieur) === clean(favoriteTeam))
  );
}

function getPoints(match, prono, scoreExactMode, isBonus) {
  const result = getResult(match);

  if (!result || !prono) return 0;

  if (scoreExactMode) {
    if (!hasScoreProno(prono)) return 0;

    const pronoHome = Number(prono.home);
    const pronoAway = Number(prono.away);
    const realHome = Number(match.scoreDomicile);
    const realAway = Number(match.scoreExterieur);

    const exact = pronoHome === realHome && pronoAway === realAway;

    const predictedResult =
      pronoHome > pronoAway ? '1' : pronoHome < pronoAway ? '2' : 'N';

    if (exact) return isBonus ? 3 : 2;
    if (predictedResult === result) return isBonus ? 2 : 1;

    return 0;
  }

  return prono.value === result ? 1 : 0;
}

function isExactScore(match, prono, scoreExactMode) {
  if (!scoreExactMode || !hasScoreProno(prono)) return false;

  return (
    Number(prono.home) === Number(match.scoreDomicile) &&
    Number(prono.away) === Number(match.scoreExterieur)
  );
}

function calculatePlayer(player, matches, pronos, bonusChoices, currentPlayer, targetJournee, mode) {
  const playerPronos = pronos[player] || {};
  const favoriteTeam = getPlayerFavorite(player, currentPlayer);

  const stats = {
    player,
    name: getDisplayName(player),
    totalPoints: 0,
    exacts: 0,
    dayPoints: 0,
    dayExacts: 0,
  };

  matches.filter(hasScore).forEach((match) => {
    const journee = Number(match.journee || 0);
    if (!journee) return;

    if (mode === 'cumulative' && journee > targetJournee) return;
    if (mode === 'day' && journee !== targetJournee) return;

    const isBonus = match.type === 'BONUS';
    const bonusKey = `${player}-J${journee}`;
    const selectedBonusId = bonusChoices[bonusKey];

    if (isBonus && selectedBonusId !== match.id) return;

    const favorite = isFavoriteMatch(match, favoriteTeam);
    const scoreExactMode = favorite || isBonus;
    const prono = playerPronos[match.id];

    const attempted = scoreExactMode ? hasScoreProno(prono) : Boolean(prono?.value);
    if (!attempted) return;

    const points = getPoints(match, prono, scoreExactMode, isBonus);
    const exact = isExactScore(match, prono, scoreExactMode);

    if (mode === 'day') {
      stats.dayPoints += points;
      if (exact) stats.dayExacts += 1;
    }

    if (mode === 'cumulative') {
      stats.totalPoints += points;
      if (exact) stats.exacts += 1;
    }
  });

  return stats;
}

function sortRanking(players) {
  return [...players].sort((a, b) => {
    const pointsDiff = b.totalPoints - a.totalPoints;
    if (pointsDiff !== 0) return pointsDiff;
    return b.exacts - a.exacts;
  });
}

function sortDay(players) {
  return [...players].sort((a, b) => {
    const pointsDiff = b.dayPoints - a.dayPoints;
    if (pointsDiff !== 0) return pointsDiff;
    return b.dayExacts - a.dayExacts;
  });
}

function rankText(rank) {
  if (rank === 1) return '1re';
  return `${rank}e`;
}

function listNames(players) {
  return players.map((player) => player.name).join(', ');
}

function getBattleGroup(ranking) {
  const groups = {};

  ranking.forEach((player) => {
    const key = String(player.totalPoints);

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(player);
  });

  return Object.entries(groups)
    .map(([points, players]) => ({
      points: Number(points),
      players,
    }))
    .filter((group) => group.players.length >= 2)
    .sort((a, b) => b.players.length - a.players.length || b.points - a.points)[0];
}

function buildReport(journee, matches, pronos, bonusChoices, currentPlayer) {
  const currentRanking = sortRanking(
    PLAYERS.map((player) =>
      calculatePlayer(player, matches, pronos, bonusChoices, currentPlayer, journee, 'cumulative')
    )
  );

  const previousRanking =
    journee > 1
      ? sortRanking(
          PLAYERS.map((player) =>
            calculatePlayer(player, matches, pronos, bonusChoices, currentPlayer, journee - 1, 'cumulative')
          )
        )
      : [];

  const dayRanking = sortDay(
    PLAYERS.map((player) =>
      calculatePlayer(player, matches, pronos, bonusChoices, currentPlayer, journee, 'day')
    )
  );

  const previousPlaces = {};
  previousRanking.forEach((player, index) => {
    previousPlaces[player.player] = index + 1;
  });

  const ranking = currentRanking.map((player, index) => {
    const rank = index + 1;
    const oldRank = previousPlaces[player.player] || rank;

    return {
      ...player,
      rank,
      oldRank,
      evolution: oldRank - rank,
    };
  });

  return {
    journee,
    ranking,
    leader: ranking[0],
    second: ranking[1],
    third: ranking[2],
    bestDay: dayRanking[0],
    bestProgress: [...ranking]
      .filter((player) => player.evolution > 0)
      .sort((a, b) => b.evolution - a.evolution)[0],
    biggestDrop: [...ranking]
      .filter((player) => player.evolution < 0)
      .sort((a, b) => a.evolution - b.evolution)[0],
    battleGroup: getBattleGroup(ranking),
    bottom: ranking.slice(-3).reverse(),
  };
}

function generateArticle(report) {
  if (!report || !report.leader) {
    return {
      title: 'Analyse indisponible',
      subtitle: 'Aucune donnÃ©e suffisante pour gÃ©nÃ©rer le journal de cette journÃ©e.',
      sections: [],
    };
  }

  const leader = report.leader;
  const second = report.second;
  const third = report.third;
  const bestDay = report.bestDay;
  const bestProgress = report.bestProgress;
  const biggestDrop = report.biggestDrop;
  const battleGroup = report.battleGroup;
  const bottomNames = listNames(report.bottom);

  const gapSecond = second ? leader.totalPoints - second.totalPoints : 0;
  const gapThird = third ? leader.totalPoints - third.totalPoints : 0;

  return {
    title: `Analyse de l'Ã©volution du classement â€“ JournÃ©e ${report.journee}`,
    subtitle: `${leader.name} garde la main avec ${leader.totalPoints} points et impose son rythme en tÃªte du classement.`,
    sections: [
      {
        emoji: 'ðŸ¥‡',
        title: `${leader.name} prend les commandes`,
        text: `${leader.name} confirme sa rÃ©gularitÃ© et conserve la ${rankText(leader.rank)} place avec ${leader.totalPoints} points. Avec ${leader.exacts} score(s) exact(s), il garde aussi un avantage prÃ©cieux au dÃ©partage.`,
      },
      {
        emoji: 'ðŸ¥ˆ',
        title: second ? `${second.name} reste au contact` : 'Le dauphin reste Ã  dÃ©finir',
        text: second
          ? `${second.name} reste solide Ã  la ${rankText(second.rank)} place avec ${second.totalPoints} points. L'Ã©cart avec le leader est dÃ©sormais de ${gapSecond} point(s), ce qui laisse encore une vraie lutte pour la premiÃ¨re place.`
          : `Aucun poursuivant clair ne se dÃ©tache encore derriÃ¨re le leader.`,
      },
      {
        emoji: 'ðŸ¥‰',
        title: third ? `${third.name} reste en embuscade` : 'Le podium reste ouvert',
        text: third
          ? `Avec ${third.totalPoints} points, ${third.name} complÃ¨te le podium. Ã€ ${gapThird} point(s) du leader, il reste pleinement dans la course.`
          : `La troisiÃ¨me place reste encore trÃ¨s ouverte.`,
      },
      {
        emoji: 'ðŸ“ˆ',
        title: 'Les hommes forts de la journÃ©e',
        text:
          bestProgress
            ? `${bestProgress.name} signe la progression la plus marquante en gagnant ${bestProgress.evolution} place(s). ${bestDay && bestDay.dayPoints > 0 ? `${bestDay.name} rÃ©alise aussi la meilleure performance de la journÃ©e avec ${bestDay.dayPoints} point(s).` : ''}`
            : bestDay && bestDay.dayPoints > 0
              ? `${bestDay.name} rÃ©alise la meilleure performance de la journÃ©e avec ${bestDay.dayPoints} point(s).`
              : `Aucune grosse progression ne se dÃ©tache sur cette journÃ©e.`,
      },
      {
        emoji: 'âš”ï¸',
        title: 'La bataille du classement',
        text: battleGroup
          ? `${battleGroup.players.length} joueurs sont regroupÃ©s Ã  ${battleGroup.points} points : ${listNames(battleGroup.players)}. La moindre erreur peut totalement rebattre les cartes.`
          : `Les Ã©carts commencent Ã  se former, mais plusieurs joueurs restent encore proches les uns des autres.`,
      },
      {
        emoji: 'ðŸ“‰',
        title: 'Les joueurs sous pression',
        text: biggestDrop
          ? `${biggestDrop.name} recule de ${Math.abs(biggestDrop.evolution)} place(s). Rien n'est perdu, mais il faudra rapidement rÃ©agir pour ne pas laisser filer le bon wagon.`
          : `Aucune chute importante Ã  signaler, signe d'une journÃ©e plutÃ´t stable.`,
      },
      {
        emoji: 'ðŸ”Ž',
        title: 'Bas de classement',
        text: `${bottomNames || 'Plusieurs joueurs'} doivent encore trouver le bon rythme pour revenir dans la course. Les Ã©carts restent rattrapables, mais il faudra vite enchaÃ®ner les bonnes journÃ©es.`,
      },
      {
        emoji: 'ðŸŽ™ï¸',
        title: 'Le commentaire de la journÃ©e',
        text: `${leader.name} garde le contrÃ´le, mais rien n'est encore jouÃ©. Avec les bonus, les scores exacts et les Ã©carts encore serrÃ©s, une seule journÃ©e pleine peut provoquer un vrai bouleversement au classement. ðŸ†âš½`,
      },
    ],
  };
}

function cleanFavoriteClubDisplay(value) {
  if (!value) return "Non choisi";

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.favoriteTeam || parsed.club || parsed.Manu || Object.values(parsed).find(Boolean) || "Non choisi";
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return value.favoriteTeam || value.club || value.Manu || Object.values(value).find(Boolean) || "Non choisi";
  }

  return String(value);
}

export default function JournalPage() {
  const [matches, setMatches] = useState([]);
  const [pronos, setPronos] = useState({});
  const [bonusChoices, setBonusChoices] = useState({});
  const [currentPlayer, setCurrentPlayer] = useState('Manu');
  const [selectedJournee, setSelectedJournee] = useState(null);

  useEffect(() => {
    const loadedMatches = safeJson(MATCHS_KEY, []);

    const journÃ©esAvecScore = [...new Set(
      loadedMatches
        .filter(hasScore)
        .map((match) => Number(match.journee || 0))
        .filter(Boolean)
    )].sort((a, b) => b - a);

    setMatches(loadedMatches);
    setPronos(safeJson(PRONOS_KEY, {}));
    setBonusChoices(safeJson(BONUS_CHOICES_KEY, {}));
    setCurrentPlayer(localStorage.getItem(PLAYER_KEY) || 'Manu');
    setSelectedJournee(journÃ©esAvecScore[0] || null);
  }, []);

  const scoredJournees = useMemo(() => {
    return [...new Set(
      matches
        .filter(hasScore)
        .map((match) => Number(match.journee || 0))
        .filter(Boolean)
    )].sort((a, b) => b - a);
  }, [matches]);

  const reports = useMemo(() => {
    return scoredJournees.map((journee) =>
      buildReport(journee, matches, pronos, bonusChoices, currentPlayer)
    );
  }, [scoredJournees, matches, pronos, bonusChoices, currentPlayer]);

  const selectedReport = reports.find((report) => report.journee === selectedJournee);
  const article = generateArticle(selectedReport);

  return (
    <div className="journal-page">
      <section className="journal-header">
        <div>
          <p>LA GAZETTE</p>
          <h1>La Gazette</h1>
          <span>Le journal automatique du classement.</span>
        </div>
      </section>

      {reports.length === 0 ? (
        <section className="journal-empty">
          Aucun article disponible pour le moment. Il faut au moins une journÃ©e avec des scores enregistrÃ©s.
        </section>
      ) : (
        <>
          <section className="journal-days-minimal">
            {reports.map((report) => (
              <button
                key={report.journee}
                type="button"
                className={selectedJournee === report.journee ? 'active' : ''}
                onClick={() => setSelectedJournee(report.journee)}
                title={`Leader : ${report.leader?.name || '-'}`}
              >
                J{report.journee}
              </button>
            ))}
          </section>

          <section className="journal-paper">
            <div className="journal-paper-bar">
              <span>LA GAZETTE</span>
              <strong>JOURNÃ‰E {selectedReport?.journee}</strong>
            </div>

            <div className="journal-paper-title">
              <p>Le journal du classement</p>
              <h2>{article.title}</h2>
              <h3>{article.subtitle}</h3>
            </div>

            <div className="journal-paper-body">
              {article.sections.map((section) => (
                <article key={section.title} className="journal-paragraph-block">
                  <h4>
                    <span>{section.emoji}</span>
                    {section.title}
                  </h4>

                  <p>{section.text}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}





