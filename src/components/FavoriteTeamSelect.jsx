import React, { useEffect, useMemo, useState } from 'react';

const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
const FAVORITE_VALIDATED_KEY = 'prono_ligue1_lm_favorite_team_validated';
const PLAYER_KEY = 'prono_ligue1_lm_current_player';
const SESSION_KEY = 'prono_ligue1_lm_session';
const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const DEFAULT_FAVORITE_TEAM = 'RC Lens';

const TEAMS = [
  'RC Lens',
  'PSG',
  'OM',
  'LOSC',
  'OL',
  'Monaco',
  'Rennes',
  'Nice',
  'Strasbourg',
  'Nantes',
  'Toulouse',
  'Brest',
  'Reims',
  'Angers',
  'Auxerre',
  'Lorient',
  'Metz',
  'Paris FC',
];

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function getCurrentPlayer() {
  const session = safeJson(SESSION_KEY, null);
  return session?.player || localStorage.getItem(PLAYER_KEY) || 'Joueur';
}

function playerFavoriteKey(player) {
  return `${FAVORITE_TEAM_KEY}_${player}`;
}

function playerValidatedKey(player) {
  return `${FAVORITE_VALIDATED_KEY}_${player}`;
}

function normalizeDate(value) {
  const date = String(value || '').trim();

  if (!date) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split('/');
    return `${year}-${month}-${day}`;
  }

  return date;
}

function getMatchStart(match) {
  const date = normalizeDate(match.date);
  const hour = String(match.heure || match.time || '00:00').trim();

  if (!date) return null;

  const parsed = new Date(`${date}T${hour}`);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}

function getSeasonStartDate() {
  const matches = safeJson(MATCHS_KEY, []);

  if (!Array.isArray(matches) || matches.length === 0) return null;

  const dates = matches
    .map(getMatchStart)
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[0] || null;
}

function isSeasonStarted() {
  const start = getSeasonStartDate();

  if (!start) return false;

  return new Date().getTime() >= start.getTime();
}

export default function FavoriteTeamSelect() {
  const [player, setPlayer] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(DEFAULT_FAVORITE_TEAM);
  const [validatedTeam, setValidatedTeam] = useState('');
  const [validated, setValidated] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [seasonStarted, setSeasonStarted] = useState(false);

  useEffect(() => {
    const currentPlayer = getCurrentPlayer();
    const favoriteKey = playerFavoriteKey(currentPlayer);
    const validatedKey = playerValidatedKey(currentPlayer);

    const savedFavorite =
      localStorage.getItem(favoriteKey) ||
      localStorage.getItem(FAVORITE_TEAM_KEY) ||
      DEFAULT_FAVORITE_TEAM;

    const savedValidated = localStorage.getItem(validatedKey) === 'true';
    const started = isSeasonStarted();

    if (!localStorage.getItem(favoriteKey)) {
      localStorage.setItem(favoriteKey, savedFavorite);
    }

    if (!localStorage.getItem(FAVORITE_TEAM_KEY)) {
      localStorage.setItem(FAVORITE_TEAM_KEY, savedFavorite);
    }

    if (started && !savedValidated) {
      localStorage.setItem(favoriteKey, DEFAULT_FAVORITE_TEAM);
      localStorage.setItem(FAVORITE_TEAM_KEY, DEFAULT_FAVORITE_TEAM);
      localStorage.setItem(validatedKey, 'true');

      setSelectedTeam(DEFAULT_FAVORITE_TEAM);
      setValidatedTeam(DEFAULT_FAVORITE_TEAM);
      setValidated(true);
      setSavedMessage('Saison commencée : RC Lens a été validé par défaut.');
    } else {
      setSelectedTeam(savedFavorite);
      setValidatedTeam(savedFavorite);
      setValidated(savedValidated);
    }

    setPlayer(currentPlayer);
    setSeasonStarted(started);
  }, []);

  const locked = useMemo(() => {
    return seasonStarted && validated;
  }, [seasonStarted, validated]);

  function validateTeam() {
    const currentPlayer = player || getCurrentPlayer();
    const team = selectedTeam || DEFAULT_FAVORITE_TEAM;

    localStorage.setItem(playerFavoriteKey(currentPlayer), team);
    localStorage.setItem(FAVORITE_TEAM_KEY, team);
    localStorage.setItem(playerValidatedKey(currentPlayer), 'true');

    setValidated(true);
    setValidatedTeam(team);
    setSavedMessage(`Club favori validé : ${team}`);

    setTimeout(() => {
      setSavedMessage('');
    }, 3000);
  }

  function changeTeam(team) {
    if (locked) return;

    setSelectedTeam(team);
    setSavedMessage('');
  }

  function unlockBeforeSeason() {
    if (seasonStarted) return;

    const currentPlayer = player || getCurrentPlayer();

    localStorage.removeItem(playerValidatedKey(currentPlayer));

    setValidated(false);
    setSavedMessage('Tu peux modifier ton club avant le début de saison.');
  }

  return (
    <section className="favorite-team-card">
      <div className="favorite-team-header">
        <div>
          <p>CLUB FAVORI</p>
          <h2>{validated ? validatedTeam : selectedTeam}</h2>

          <span>
            {locked
              ? 'Choix bloqué : la saison a commencé.'
              : 'Choisis ton club puis clique sur Valider. Sans choix, RC Lens sera pris par défaut.'}
          </span>
        </div>

        <strong>{player}</strong>
      </div>

      <div className="favorite-team-grid">
        {TEAMS.map((team) => (
          <button
            key={team}
            type="button"
            disabled={locked}
            className={selectedTeam === team ? 'active' : ''}
            onClick={() => changeTeam(team)}
          >
            {team}
          </button>
        ))}
      </div>

      <div className="favorite-team-actions">
        <button
          type="button"
          className="favorite-validate-btn"
          disabled={locked}
          onClick={validateTeam}
        >
          Valider mon club
        </button>

        {validated && !seasonStarted && (
          <button
            type="button"
            className="favorite-edit-btn"
            onClick={unlockBeforeSeason}
          >
            Modifier avant saison
          </button>
        )}
      </div>

      <div className={locked ? 'favorite-team-lock locked' : 'favorite-team-lock'}>
        {locked ? (
          <>🔒 Club bloqué : {validatedTeam}</>
        ) : validated ? (
          <>✅ Club validé : {validatedTeam}. Modifiable jusqu’au début de saison.</>
        ) : (
          <>⚠️ Pas encore validé. RC Lens sera appliqué automatiquement si tu oublies.</>
        )}
      </div>

      {savedMessage && (
        <div className="favorite-team-saved">
          {savedMessage}
        </div>
      )}
    </section>
  );
}
