import React, { useEffect, useMemo, useState } from 'react';
import '../styles/home.css';

const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';
const VALIDATIONS_KEY = 'prono_ligue1_lm_validations_journees';
const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
const PLAYER_KEY = 'prono_ligue1_lm_current_player';
const BONUS_CHOICES_KEY = 'prono_ligue1_lm_bonus_choices';

function clean(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function hasScoreProno(prono) {
  return prono && prono.home !== '' && prono.home !== undefined && prono.away !== '' && prono.away !== undefined;
}

function getMatchDate(match) {
  const date = match.date || match.blocageDate;
  const heure = match.heure || match.blocageHeure || '00:00';

  if (!date) return null;

  const d = new Date(`${date}T${heure}`);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function getResult(match) {
  const home = match.scoreDomicile;
  const away = match.scoreExterieur;

  if (home === null || home === undefined || away === null || away === undefined) return null;

  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return '1';
  if (h < a) return '2';
  return 'N';
}

function getPoints(match, prono, scoreExactMode, isBonus) {
  const result = getResult(match);
  if (!result || !prono) return 0;

  if (scoreExactMode) {
    if (!hasScoreProno(prono)) return 0;

    const homeProno = Number(prono.home);
    const awayProno = Number(prono.away);
    const homeScore = Number(match.scoreDomicile);
    const awayScore = Number(match.scoreExterieur);

    if (homeProno === homeScore && awayProno === awayScore) {
      return isBonus ? 3 : 2;
    }

    const predictedResult =
      homeProno > awayProno ? '1' : homeProno < awayProno ? '2' : 'N';

    if (predictedResult === result) {
      return isBonus ? 2 : 1;
    }

    return 0;
  }

  return prono.value === result ? 1 : 0;
}

export default function HomePage({ setPage }) {
  const [matches, setMatches] = useState([]);
  const [pronos, setPronos] = useState({});
  const [validations, setValidations] = useState({});
  const [bonusChoices, setBonusChoices] = useState({});
  const [favoriteTeam, setFavoriteTeam] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState('Manu');

  useEffect(() => {
    setMatches(JSON.parse(localStorage.getItem(MATCHS_KEY) || '[]'));
    setPronos(JSON.parse(localStorage.getItem(PRONOS_KEY) || '{}'));
    setValidations(JSON.parse(localStorage.getItem(VALIDATIONS_KEY) || '{}'));
    setBonusChoices(JSON.parse(localStorage.getItem(BONUS_CHOICES_KEY) || '{}'));
    setFavoriteTeam(localStorage.getItem(FAVORITE_TEAM_KEY) || '');
    setCurrentPlayer(localStorage.getItem(PLAYER_KEY) || 'Manu');
  }, []);

  const l1MatchesAll = matches.filter((match) => match.type !== 'BONUS');

  const journees = useMemo(() => {
    return [...new Set(matches.map((m) => String(m.journee || '').trim()).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));
  }, [matches]);

  const currentJournee = useMemo(() => {
    if (journees.length === 0) return '1';

    const firstOpen = journees.find((journee) => {
      const key = `${currentPlayer}-J${journee}`;
      return !validations[key];
    });

    return firstOpen || journees[0];
  }, [journees, validations, currentPlayer]);

  const matchesJournee = matches.filter(
    (match) => String(match.journee || '') === String(currentJournee)
  );

  const l1Matches = matchesJournee.filter((match) => match.type !== 'BONUS');
  const bonusMatches = matchesJournee.filter((match) => match.type === 'BONUS');

  const playerPronos = pronos[currentPlayer] || {};
  const validationKey = `${currentPlayer}-J${currentJournee}`;
  const bonusKey = `${currentPlayer}-J${currentJournee}`;
  const selectedBonusId = bonusChoices[bonusKey];
  const isValidated = Boolean(validations[validationKey]);

  const detailJournee = useMemo(() => {
    const journeesWithScores = journees.filter((journee) =>
      matches.some(
        (match) =>
          String(match.journee || "") === String(journee) &&
          match.scoreDomicile !== null &&
          match.scoreDomicile !== undefined &&
          match.scoreExterieur !== null &&
          match.scoreExterieur !== undefined
      )
    );

    if (journeesWithScores.length > 0) {
      return journeesWithScores[journeesWithScores.length - 1];
    }

    const validatedJournees = journees.filter((journee) =>
      Boolean(validations[`${currentPlayer}-J${journee}`])
    );

    if (validatedJournees.length > 0) {
      return validatedJournees[validatedJournees.length - 1];
    }

    return currentJournee;
  }, [journees, matches, validations, currentPlayer, currentJournee]);

  const detailMatchesJournee = matches.filter(
    (match) => String(match.journee || "") === String(detailJournee)
  );

  const detailL1Matches = detailMatchesJournee.filter((match) => match.type !== "BONUS");
  const detailBonusMatches = detailMatchesJournee.filter((match) => match.type === "BONUS");
  const detailBonusKey = `${currentPlayer}-J${detailJournee}`;
  const detailSelectedBonusId = bonusChoices[detailBonusKey];

  function isFavoriteMatch(match) {
    return (
      favoriteTeam &&
      (clean(match.domicile) === clean(favoriteTeam) ||
        clean(match.exterieur) === clean(favoriteTeam))
    );
  }

  const seasonStart = useMemo(() => {
    const dates = l1MatchesAll.map(getMatchDate).filter(Boolean).sort((a, b) => a - b);
    return dates[0] || null;
  }, [l1MatchesAll]);

  const seasonStarted = seasonStart ? new Date() >= seasonStart : false;

  const pronosStats = useMemo(() => {
    const l1Done = l1Matches.filter((match) => {
      const prono = playerPronos[match.id];

      if (isFavoriteMatch(match)) return hasScoreProno(prono);

      return Boolean(prono?.value);
    }).length;

    const selectedBonusProno = selectedBonusId ? playerPronos[selectedBonusId] : null;
    const bonusDone = selectedBonusId && hasScoreProno(selectedBonusProno) ? 1 : 0;

    const total = l1Matches.length + (bonusMatches.length > 0 ? 1 : 0);
    const done = l1Done + bonusDone;

    return {
      done,
      total,
      remaining: Math.max(total - done, 0),
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [l1Matches, bonusMatches, playerPronos, favoriteTeam, selectedBonusId]);

  const pointsStats = useMemo(() => {
    const normalMatches = detailL1Matches.filter((match) => !isFavoriteMatch(match));
    const favoriteMatches = detailL1Matches.filter((match) => isFavoriteMatch(match));

    const normalPoints = normalMatches.reduce((total, match) => {
      const prono = playerPronos[match.id];
      return total + getPoints(match, prono, false, false);
    }, 0);

    const favoritePoints = favoriteMatches.reduce((total, match) => {
      const prono = playerPronos[match.id];
      return total + getPoints(match, prono, true, false);
    }, 0);

    const selectedBonus = detailBonusMatches.find((match) => match.id === detailSelectedBonusId);
    const bonusPoints = selectedBonus
      ? getPoints(selectedBonus, playerPronos[selectedBonus.id], true, true)
      : 0;

    const totalPoints = normalPoints + favoritePoints + bonusPoints;

    return {
      journee: detailJournee,
      totalPoints,
      totalMax: 13,
      normalPoints,
      normalMax: 8,
      favoritePoints,
      favoriteMax: 2,
      bonusPoints,
      bonusMax: 3,
      remaining: Math.max(13 - totalPoints, 0),
      percent: Math.round((totalPoints / 13) * 100),
    };
  }, [detailJournee, detailL1Matches, detailBonusMatches, playerPronos, favoriteTeam, detailSelectedBonusId]);

  const nextFavoriteMatch = useMemo(() => {
    if (!favoriteTeam) return null;

    const all = l1MatchesAll
      .filter(
        (match) =>
          clean(match.domicile) === clean(favoriteTeam) ||
          clean(match.exterieur) === clean(favoriteTeam)
      )
      .sort((a, b) => {
        const da = getMatchDate(a);
        const db = getMatchDate(b);
        return (da?.getTime() || 0) - (db?.getTime() || 0);
      });

    const upcoming = all.find((match) => {
      const d = getMatchDate(match);
      return d && d >= new Date();
    });

    return upcoming || all[0] || null;
  }, [l1MatchesAll, favoriteTeam]);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div>
          <p>PRONO LIGUE 1 LM</p>
          <h1>Saison 2026/2027</h1>
          <span>
            {matches.length > 0
              ? `${journees.length} journée(s) chargée(s) · ${l1MatchesAll.length} matchs Ligue 1`
              : 'Aucun match chargé pour le moment'}
          </span>
        </div>

        <div className="home-hero-right">
          <div className={`home-season-status ${seasonStarted ? 'started' : 'waiting'}`}>
            {seasonStarted ? 'Saison en cours' : 'Avant saison'}
          </div>

          <div className="home-points-big">
            <span>Points J{pointsStats.journee}</span>
            <strong>{pointsStats.totalPoints}/{pointsStats.totalMax}</strong>
            <small>{pointsStats.remaining} pts manqué(s)</small>
          </div>
        </div>
      </section>

      <section className="home-dashboard">
        <article className="home-card">
          <span>Journée actuelle</span>
          <strong>J{currentJournee}</strong>
          <small>{isValidated ? 'Validée 🔒' : 'Modifiable 🔓'}</small>
        </article>

        <article className="home-card">
          <span>Mes pronos</span>
          <strong>{pronosStats.done}/{pronosStats.total}</strong>
          <small>{pronosStats.remaining} restant(s)</small>
        </article>

        <article className="home-card">
          <span>Bonus</span>
          <strong>{selectedBonusId ? 'Choisi' : 'À choisir'}</strong>
          <small>{bonusMatches.length} proposé(s)</small>
        </article>

        <article className="home-card">
          <span>Club favori</span>
          <strong>{favoriteTeam ? 'Validé' : 'À choisir'}</strong>
          <small>{favoriteTeam || 'aucun club'}</small>
        </article>
      </section>

      <section className="home-progress-panel">
        <div className="home-progress-line">
          <div className="home-progress-top">
            <span>Progression pronos J{currentJournee}</span>
            <strong>{pronosStats.percent}%</strong>
          </div>

          <div className="home-progress-bar">
            <div style={{ width: `${pronosStats.percent}%` }} />
          </div>
        </div>

        <div className="home-progress-line">
          <div className="home-progress-top">
            <span>Points journée passée / 13 max</span>
            <strong>{pointsStats.percent}%</strong>
          </div>

          <div className="home-progress-bar points">
            <div style={{ width: `${pointsStats.percent}%` }} />
          </div>
        </div>
      </section>

      <section className="home-main-grid">
        <article className="home-panel">
          <div className="home-panel-title">
            <h2>Prochain match favori</h2>
            <span>Score exact</span>
          </div>

          {nextFavoriteMatch ? (
            <div className="home-next-match">
              <strong>{nextFavoriteMatch.domicile}</strong>
              <span>vs</span>
              <strong>{nextFavoriteMatch.exterieur}</strong>
              <small>
                {nextFavoriteMatch.date || 'Date à définir'} · {nextFavoriteMatch.heure || '--:--'}
              </small>
            </div>
          ) : (
            <div className="home-empty-mini">
              Choisis ton club favori pour afficher son prochain match.
            </div>
          )}
        </article>

        <article className="home-panel">
          <div className="home-panel-title">
            <h2>Détail des points</h2>
            <span>J{pointsStats.journee}</span>
          </div>

          <div className="home-points-detail">
            <div>
              <span>1N2 classique</span>
              <strong>{pointsStats.normalPoints}/{pointsStats.normalMax} pts</strong>
            </div>

            <div>
              <span>Équipe favorite</span>
              <strong>{pointsStats.favoritePoints}/{pointsStats.favoriteMax} pts</strong>
            </div>

            <div>
              <span>Match bonus</span>
              <strong>{pointsStats.bonusPoints}/{pointsStats.bonusMax} pts</strong>
            </div>

            <div className="total">
              <span>Total journée</span>
              <strong>{pointsStats.totalPoints}/{pointsStats.totalMax} pts</strong>
            </div>
          </div>
        </article>

        <article className="home-panel">
          <div className="home-panel-title">
            <h2>Accès rapide</h2>
          </div>

          <div className="home-actions">
            <button type="button" onClick={() => setPage('Pronos')}>
              Faire mes pronos
            </button>

            <button type="button" onClick={() => setPage('Classement')}>
              Classement
            </button>

            <button type="button" onClick={() => setPage('Admin')}>
              Admin
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}


