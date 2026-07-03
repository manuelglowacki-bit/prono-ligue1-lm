import React, { useEffect, useMemo, useState } from 'react';
import '../styles/trophies.css';

const TROPHY_ADMIN_JOURNEES_KEY = "admin_journees";
const TROPHY_ADMIN_MANAGER_KEY = "admin_pronos_manager_v3";

function readTrophyJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function flattenAdminJourneesForTrophies() {
  const journees =
    readTrophyJson(TROPHY_ADMIN_JOURNEES_KEY, null) ||
    readTrophyJson(TROPHY_ADMIN_MANAGER_KEY, null) ||
    [];

  if (!Array.isArray(journees) || !journees.length) {
    return [];
  }

  return journees.flatMap((journee, journeeIndex) => {
    const journeeId = journee.id || `j${journeeIndex + 1}`;
    const journeeTitle = journee.title || `J${journee.number || journeeIndex + 1}`;

    const ligue1Matches = Array.isArray(journee.matches)
      ? journee.matches.map((match, matchIndex) => ({
          ...match,
          id: match.id || `${journeeId}-m${matchIndex + 1}`,
          journeeId,
          journeeTitle,
          journeeNumber: journee.number || journeeIndex + 1,
          type: "ligue1",
          isBonus: false,
          home: match.home || match.homeTeam || match.domicile || "",
          away: match.away || match.awayTeam || match.exterieur || "",
          date: match.date || "",
          time: match.time || "",
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          result: match.result || match.resultat || match.resultatFinal || "",
          resultat: match.resultat || match.result || match.resultatFinal || "",
          adminValidated: Boolean(match.adminValidated || match.validated || match.isValidated)
        }))
      : [];

    const bonusMatches = Array.isArray(journee.bonus)
      ? journee.bonus.map((match, matchIndex) => ({
          ...match,
          id: match.id || `${journeeId}-b${matchIndex + 1}`,
          journeeId,
          journeeTitle,
          journeeNumber: journee.number || journeeIndex + 1,
          type: "bonus",
          isBonus: true,
          league: match.league || match.competition || "",
          home: match.home || match.homeTeam || match.domicile || "",
          away: match.away || match.awayTeam || match.exterieur || "",
          date: match.date || "",
          time: match.time || "",
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          result: match.result || match.resultat || match.resultatFinal || "",
          resultat: match.resultat || match.result || match.resultatFinal || "",
          adminValidated: Boolean(match.adminValidated || match.validated || match.isValidated)
        }))
      : [];

    return [...ligue1Matches, ...bonusMatches];
  });
}

function loadTrophyMatchesFromAdminOrLegacy(legacyKey) {
  const adminMatches = flattenAdminJourneesForTrophies();

  if (adminMatches.length) {
    try {
      localStorage.setItem(legacyKey, JSON.stringify(adminMatches));
    } catch {
      // ignore storage errors
    }

    return adminMatches;
  }

  return readTrophyJson(legacyKey, []);
}


const PLAYER_KEY = 'prono_ligue1_lm_current_player';
const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function hasScore(match) {
  return match.scoreDomicile !== null &&
    match.scoreDomicile !== undefined &&
    match.scoreExterieur !== null &&
    match.scoreExterieur !== undefined;
}

function getResult(match) {
  const h = Number(match.scoreDomicile);
  const a = Number(match.scoreExterieur);

  if (h > a) return '1';
  if (h < a) return '2';
  return 'N';
}

function getLevel(value, levels) {
  let level = null;

  levels.forEach((item) => {
    if (value >= item.value) {
      level = item;
    }
  });

  return level;
}

function getNextLevel(value, levels) {
  return levels.find((item) => value < item.value) || null;
}

function buildTrophy(trophy) {
  const currentLevel = getLevel(trophy.value, trophy.levels);
  const nextLevel = getNextLevel(trophy.value, trophy.levels);
  const target = nextLevel ? nextLevel.value : trophy.levels[trophy.levels.length - 1].value;
  const progress = target ? Math.min(100, Math.round((trophy.value / target) * 100)) : 0;

  return {
    ...trophy,
    currentLevel,
    nextLevel,
    target,
    progress,
    status: currentLevel ? 'unlocked' : trophy.value > 0 ? 'progress' : 'locked',
  };
}

export default function TrophiesPage() {
  const [currentPlayer, setCurrentPlayer] = useState('Manu');
  const [matches, setMatches] = useState([]);
  const [pronos, setPronos] = useState({});
  const [filter, setFilter] = useState('Tous');
  const [selectedLevel, setSelectedLevel] = useState(null);

  useEffect(() => {
    setCurrentPlayer(localStorage.getItem(PLAYER_KEY) || 'Manu');
    setMatches(safeJson(MATCHS_KEY, []));
    setPronos(safeJson(PRONOS_KEY, {}));
  }, []);

  const stats = useMemo(() => {
    const playerPronos = pronos[currentPlayer] || {};

    let totalPoints = 0;
    let bonsResultats = 0;
    let scoresExacts = 0;
    let pronosJoues = 0;
    let meilleureJournee = 0;
    let grossesJournees = 0;

    const pointsByDay = {};

    matches.filter(hasScore).forEach((match) => {
      const prono = playerPronos[match.id];
      const result = getResult(match);
      const journee = String(match.journee || '0');

      if (!pointsByDay[journee]) {
        pointsByDay[journee] = 0;
      }

      if (prono?.value) {
        pronosJoues += 1;

        if (prono.value === result) {
          totalPoints += 1;
          bonsResultats += 1;
          pointsByDay[journee] += 1;
        }
      }

      if (
        prono?.home !== undefined &&
        prono?.away !== undefined &&
        prono.home !== '' &&
        prono.away !== ''
      ) {
        pronosJoues += 1;

        const home = Number(prono.home);
        const away = Number(prono.away);
        const realHome = Number(match.scoreDomicile);
        const realAway = Number(match.scoreExterieur);

        const exact = home === realHome && away === realAway;
        const predicted = home > away ? '1' : home < away ? '2' : 'N';

        if (exact) {
          totalPoints += 2;
          scoresExacts += 1;
          bonsResultats += 1;
          pointsByDay[journee] += 2;
        } else if (predicted === result) {
          totalPoints += 1;
          bonsResultats += 1;
          pointsByDay[journee] += 1;
        }
      }
    });

    meilleureJournee = Math.max(0, ...Object.values(pointsByDay));
    grossesJournees = Object.values(pointsByDay).filter((points) => points >= 8).length;

    return {
      totalPoints,
      bonsResultats,
      scoresExacts,
      pronosJoues,
      meilleureJournee,
      grossesJournees,
      journeesJouees: Object.keys(pointsByDay).length,
    };
  }, [matches, pronos, currentPlayer]);

  const trophies = useMemo(() => {
    const list = [
      {
        icon: 'ðŸ†',
        title: 'Machine Ã  points',
        category: 'Points',
        description: 'Accumuler des points sur la saison.',
        value: stats.totalPoints,
        unit: 'pts',
        levels: [
          { name: 'Bronze', value: 200 },
          { name: 'Argent', value: 600 },
          { name: 'Or', value: 1200 },
          { name: 'LÃ©gende', value: 2500 },
        ],
      },
      {
        icon: 'ðŸ”¥',
        title: 'Grosse journÃ©e',
        category: 'Points',
        description: 'Faire plusieurs grosses journÃ©es Ã  8 points ou plus.',
        value: stats.grossesJournees,
        unit: 'J',
        levels: [
          { name: 'Bronze', value: 3 },
          { name: 'Argent', value: 10 },
          { name: 'Or', value: 25 },
          { name: 'LÃ©gende', value: 60 },
        ],
      },
      {
        icon: 'ðŸ’Ž',
        title: 'Å’il de lynx',
        category: 'Scores exacts',
        description: 'Trouver des scores exacts.',
        value: stats.scoresExacts,
        unit: 'exact',
        levels: [
          { name: 'Bronze', value: 5 },
          { name: 'Argent', value: 25 },
          { name: 'Or', value: 60 },
          { name: 'LÃ©gende', value: 150 },
        ],
      },
      {
        icon: 'âš½',
        title: 'MaÃ®tre du 1N2',
        category: '1N2',
        description: 'Trouver les bons rÃ©sultats classiques.',
        value: stats.bonsResultats,
        unit: 'OK',
        levels: [
          { name: 'Bronze', value: 50 },
          { name: 'Argent', value: 200 },
          { name: 'Or', value: 500 },
          { name: 'LÃ©gende', value: 1200 },
        ],
      },
      {
        icon: 'âœ…',
        title: 'Toujours prÃ©sent',
        category: 'RÃ©gularitÃ©',
        description: 'Participer aux journÃ©es de pronostics.',
        value: stats.journeesJouees,
        unit: 'J',
        levels: [
          { name: 'Bronze', value: 10 },
          { name: 'Argent', value: 34 },
          { name: 'Or', value: 102 },
          { name: 'LÃ©gende', value: 204 },
        ],
      },
      {
        icon: 'ðŸ“‹',
        title: 'Pronos jouÃ©s',
        category: 'RÃ©gularitÃ©',
        description: 'Remplir un maximum de pronostics.',
        value: stats.pronosJoues,
        unit: 'pronos',
        levels: [
          { name: 'Bronze', value: 100 },
          { name: 'Argent', value: 500 },
          { name: 'Or', value: 1000 },
          { name: 'LÃ©gende', value: 2500 },
        ],
      },
    ];

    return list.map(buildTrophy);
  }, [stats]);

  const earnedTrophies = trophies.filter((trophy) => trophy.currentLevel);

  const unlockedLevels = trophies.reduce((total, trophy) => {
    return total + trophy.levels.filter((level) => trophy.value >= level.value).length;
  }, 0);

  const totalLevels = trophies.length * 4;
  const globalProgress = totalLevels ? Math.round((unlockedLevels / totalLevels) * 100) : 0;

  const filters = ['Tous', 'Points', 'Scores exacts', '1N2', 'RÃ©gularitÃ©', 'DÃ©bloquÃ©s', 'En cours', 'VerrouillÃ©s'];

  const filteredTrophies = trophies.filter((trophy) => {
    if (filter === 'Tous') return true;
    if (filter === 'DÃ©bloquÃ©s') return trophy.currentLevel;
    if (filter === 'En cours') return trophy.status === 'progress';
    if (filter === 'VerrouillÃ©s') return trophy.status === 'locked';
    return trophy.category === filter;
  });

  return (
    <div className="trophies-page">
      <section className="trophies-header">
        <div className="trophies-header-left">
          <p>TROPHÃ‰ES</p>
          <h1>Collection de {currentPlayer}</h1>
          <span>Badges Ã©volutifs : Bronze / Argent / Or / LÃ©gende</span>

          <div className="trophies-header-badges">
            {earnedTrophies.length > 0 ? (
              earnedTrophies.map((trophy) => (
                <div
                  key={trophy.title}
                  className="header-trophy-chip earned"
                  title={`${trophy.title} : ${trophy.description}`}
                >
                  <strong>{trophy.icon}</strong>
                  <span>{trophy.title}</span>
                  <em>{trophy.currentLevel.name}</em>
                </div>
              ))
            ) : (
              <div className="header-trophy-empty">
                Aucun trophÃ©e gagnÃ© pour le moment.
              </div>
            )}
          </div>
        </div>

        <div className="trophies-header-cards">
          <div className="trophies-big-card">
            <span>Progression</span>
            <strong>{globalProgress}%</strong>
            <small>{unlockedLevels}/{totalLevels} niveaux</small>
          </div>
        </div>
      </section>

      <section className="trophies-summary">
        <article>
          <span>Points actuels</span>
          <strong>{stats.totalPoints} pts</strong>
          <small>Points gagnÃ©s sur la saison</small>
        </article>

        <article>
          <span>Scores exacts</span>
          <strong>{stats.scoresExacts}</strong>
          <small>Total joueur</small>
        </article>

        <article>
          <span>Meilleure journÃ©e</span>
          <strong>{stats.meilleureJournee} pts</strong>
          <small>Record actuel</small>
        </article>
      </section>

      <section className="trophies-filters">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? 'active' : ''}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </section>

      <section className="trophies-grid">
        {filteredTrophies.map((trophy) => (
          <article
            key={trophy.title}
            className={`trophy-card ${trophy.status}`}
            title={trophy.description}
          >
            <div className="trophy-top">
              <div className="trophy-icon">{trophy.icon}</div>
              <div className="trophy-level">
                {trophy.currentLevel ? trophy.currentLevel.name : 'VerrouillÃ©'}
              </div>
            </div>

            <h2>{trophy.title}</h2>
            <p>{trophy.description}</p>

            <div className="trophy-levels">
              {trophy.levels.map((level) => (
                <button
                  key={level.name}
                  type="button"
                  className={trophy.value >= level.value ? 'done' : ''}
                  onClick={() =>
                    setSelectedLevel((current) =>
                      current?.trophy === trophy.title && current?.name === level.name
                        ? null
                        : {
                            trophy: trophy.title,
                            name: level.name,
                            value: level.value,
                            unit: trophy.unit,
                            currentValue: trophy.value,
                          }
                    )
                  }
                  title={`${level.name} : ${level.value} ${trophy.unit}`}
                >
                  {level.name[0]}
                </button>
              ))}
            </div>

            {selectedLevel?.trophy === trophy.title && (
              <div className="trophy-level-detail">
                <strong>{selectedLevel.name}</strong>
                <span>
                  Objectif : {selectedLevel.value} {selectedLevel.unit}
                </span>
                <small>
                  Actuel : {selectedLevel.currentValue} {selectedLevel.unit}
                </small>
              </div>
            )}

            <div className="trophy-meta">
              <span>{trophy.category}</span>
              <strong>{trophy.value}/{trophy.target} {trophy.unit}</strong>
            </div>

            <div className="trophy-bar">
              <div style={{ width: `${trophy.progress}%` }} />
            </div>

            <div className="trophy-footer">
              {trophy.nextLevel ? (
                <span>Prochain : {trophy.nextLevel.name}</span>
              ) : (
                <span>Niveau max atteint</span>
              )}

              <strong>{trophy.progress}%</strong>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}




