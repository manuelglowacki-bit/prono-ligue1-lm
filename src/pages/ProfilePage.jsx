import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRegisteredPlayers } from '../utils/players';
import '../styles/profile.css';
import {
  getDisplayNames,
  getDisplayName,
  saveDisplayNameForPlayer,
  resetDisplayNameForPlayer,
} from '../utils/displayNames';

/* =========================
   CLÉS LOCALSTORAGE
========================= */

const PLAYER_KEY = 'prono_ligue1_lm_current_player';
const PROFILE_PHOTOS_KEY = 'prono_ligue1_lm_profile_photos';
const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';
const BONUS_CHOICES_KEY = 'prono_ligue1_lm_bonus_choices';

const PLAYERS = getRegisteredPlayers();

/* =========================
   OUTILS
========================= */

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
  const playerFavorite = localStorage.getItem(`${FAVORITE_TEAM_KEY}_${player}`);

  if (playerFavorite) return playerFavorite;

  if (player === currentPlayer) {
    return localStorage.getItem(FAVORITE_TEAM_KEY) || '';
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

/* =========================
   CALCUL POINTS
========================= */

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

function isCorrectResult(match, prono, scoreExactMode) {
  const result = getResult(match);

  if (!result || !prono) return false;

  if (scoreExactMode) {
    if (!hasScoreProno(prono)) return false;

    const pronoHome = Number(prono.home);
    const pronoAway = Number(prono.away);

    const predictedResult =
      pronoHome > pronoAway ? '1' : pronoHome < pronoAway ? '2' : 'N';

    return predictedResult === result;
  }

  return prono.value === result;
}

/* =========================
   PHOTO PROFIL
========================= */

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 420;

        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }

        if (height > width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* =========================
   STATS JOUEUR
========================= */

function calculatePlayerStats(player, matches, pronos, bonusChoices, currentPlayer) {
  const playerPronos = pronos[player] || {};
  const favoriteTeam = getPlayerFavorite(player, currentPlayer);

  const stats = {
    player,
    totalPoints: 0,
    scoresExacts: 0,
    bonsResultats: 0,
    pronosJoues: 0,
    bonusPoints: 0,
    points1N2: 0,
    recentDays: {},
  };

  matches.filter(hasScore).forEach((match) => {
    const journee = String(match.journee || '');
    const isBonus = match.type === 'BONUS';

    const bonusKey = `${player}-J${journee}`;
    const selectedBonusId = bonusChoices[bonusKey];

    if (isBonus && selectedBonusId !== match.id) return;

    const favorite = isFavoriteMatch(match, favoriteTeam);
    const scoreExactMode = favorite || isBonus;
    const prono = playerPronos[match.id];

    const attempted = scoreExactMode ? hasScoreProno(prono) : Boolean(prono?.value);
    if (!attempted) return;

    if (!stats.recentDays[journee]) {
      stats.recentDays[journee] = 0;
    }

    const points = getPoints(match, prono, scoreExactMode, isBonus);
    const exact = isExactScore(match, prono, scoreExactMode);
    const correct = isCorrectResult(match, prono, scoreExactMode);

    stats.totalPoints += points;
    stats.pronosJoues += 1;
    stats.recentDays[journee] += points;

    if (correct) stats.bonsResultats += 1;
    if (exact) stats.scoresExacts += 1;

    if (isBonus) {
      stats.bonusPoints += points;
    } else if (!favorite) {
      stats.points1N2 += points;
    }
  });

  stats.successRate = stats.pronosJoues
    ? Math.round((stats.bonsResultats / stats.pronosJoues) * 100)
    : 0;

  stats.lastDays = Object.entries(stats.recentDays)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, 3)
    .map(([journee, points]) => ({
      journee,
      points,
    }));

  return stats;
}

function getOwnedLeaderBadges(currentPlayer, rankingStats) {
  const badgeRules = [
    {
      icon: '🏆',
      title: 'Machine à points',
      stat: 'totalPoints',
      unit: 'pts',
    },
    {
      icon: '🎯',
      title: 'Roi du bonus',
      stat: 'bonusPoints',
      unit: 'pts',
    },
    {
      icon: '💎',
      title: 'Expert exact',
      stat: 'scoresExacts',
      unit: 'exact',
    },
    {
      icon: '⚽',
      title: 'Meilleur 1N2',
      stat: 'points1N2',
      unit: 'pts',
    },
  ];

  return badgeRules
    .map((badge) => {
      const winner = [...rankingStats].sort((a, b) => {
        const statDiff = b[badge.stat] - a[badge.stat];
        if (statDiff !== 0) return statDiff;
        return b.totalPoints - a.totalPoints;
      })[0];

      if (!winner || winner.player !== currentPlayer || winner[badge.stat] <= 0) {
        return null;
      }

      return {
        ...badge,
        value: winner[badge.stat],
      };
    })
    .filter(Boolean);
}

/* =========================
   PAGE PROFIL
========================= */

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

export default function ProfilePage() {
  const fileInputRef = useRef(null);

  const [currentPlayer, setCurrentPlayer] = useState('Manu');
  const [displayNames, setDisplayNames] = useState({});
  const [nameDraft, setNameDraft] = useState('');
  const [photos, setPhotos] = useState({});
  const [matches, setMatches] = useState([]);
  const [pronos, setPronos] = useState({});
  const [bonusChoices, setBonusChoices] = useState({});

  useEffect(() => {
    const savedPlayer = localStorage.getItem(PLAYER_KEY) || 'Manu';
    const savedDisplayNames = getDisplayNames();

    setCurrentPlayer(savedPlayer);
    setDisplayNames(savedDisplayNames);
    setNameDraft(getDisplayName(savedPlayer));
    setPhotos(safeJson(PROFILE_PHOTOS_KEY, {}));
    setMatches(safeJson(MATCHS_KEY, []));
    setPronos(safeJson(PRONOS_KEY, {}));
    setBonusChoices(safeJson(BONUS_CHOICES_KEY, {}));
  }, []);

  const photo = photos[currentPlayer] || '';
  const displayName = displayNames[currentPlayer] || currentPlayer;
  const favoriteTeam = getPlayerFavorite(currentPlayer, currentPlayer);

  const rankingStats = useMemo(() => {
    return PLAYERS.map((player) =>
      calculatePlayerStats(player, matches, pronos, bonusChoices, currentPlayer)
    ).sort((a, b) => {
      const pointsDiff = b.totalPoints - a.totalPoints;
      if (pointsDiff !== 0) return pointsDiff;
      return b.scoresExacts - a.scoresExacts;
    });
  }, [matches, pronos, bonusChoices, currentPlayer]);

  const playerStats = rankingStats.find((item) => item.player === currentPlayer) || {
    totalPoints: 0,
    scoresExacts: 0,
    successRate: 0,
    lastDays: [],
  };

  const playerRank = rankingStats.findIndex((item) => item.player === currentPlayer) + 1;
  const ownedBadges = getOwnedLeaderBadges(currentPlayer, rankingStats);

  function changePlayer(value) {
    setCurrentPlayer(value);
    localStorage.setItem(PLAYER_KEY, value);
    setNameDraft(displayNames[value] || value);
  }

  function saveCustomName() {
    const nextNames = saveDisplayNameForPlayer(currentPlayer, nameDraft);
    setDisplayNames(nextNames);
    setNameDraft(nextNames[currentPlayer] || currentPlayer);
  }

  function resetCustomName() {
    const nextNames = resetDisplayNameForPlayer(currentPlayer);
    setDisplayNames(nextNames);
    setNameDraft(currentPlayer);
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Choisis une vraie image.');
      return;
    }

    const resizedPhoto = await resizeImage(file);

    const nextPhotos = {
      ...photos,
      [currentPlayer]: resizedPhoto,
    };

    setPhotos(nextPhotos);
    localStorage.setItem(PROFILE_PHOTOS_KEY, JSON.stringify(nextPhotos));

    event.target.value = '';
  }

  function removePhoto() {
    const nextPhotos = { ...photos };
    delete nextPhotos[currentPlayer];

    setPhotos(nextPhotos);
    localStorage.setItem(PROFILE_PHOTOS_KEY, JSON.stringify(nextPhotos));
  }

  return (
    <div className="profile-page">
      <section className="profile-header">
        <div>
          <p>PROFIL</p>
          <h1>Fiche joueur</h1>
          <span>Photo, statistiques, badges et préférences.</span>
        </div>

        
      </section>

      <section className="profile-hero">
        <div className="profile-photo-zone">
          <div className="profile-photo">
            {photo ? (
              <img src={photo} alt={`Profil ${currentPlayer}`} />
            ) : (
              <span>{displayName.slice(0, 1)}</span>
            )}
          </div>

          <div className="profile-photo-actions">
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Changer la photo
            </button>

            {photo && (
              <button type="button" className="remove" onClick={removePhoto}>
                Supprimer
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              hidden
            />
          </div>
        </div>

        <div className="profile-main-info">
          <div className="profile-name-row">
            <div>
              <span>Joueur</span>
              <h2>{displayName}</h2>
            </div>

            <strong>Manager</strong>
          </div>

          <div className="profile-identity-grid">
            <div>
              <span>Club favori</span>
              <strong>{favoriteTeam || 'Non choisi'}</strong>
            </div>

            <div>
              <span>Classement actuel</span>
              <strong>#{playerRank || '-'}</strong>
            </div>

            <div>
              <span>Statut</span>
              <strong>Profil actif</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="profile-stats-grid">
        <article>
          <span>Points</span>
          <strong>{playerStats.totalPoints}</strong>
          <small>Total saison</small>
        </article>

        <article>
          <span>Scores exacts</span>
          <strong>{playerStats.scoresExacts}</strong>
          <small>Favori + bonus</small>
        </article>

        <article>
          <span>Réussite</span>
          <strong>{playerStats.successRate}%</strong>
          <small>{playerStats.bonsResultats || 0}/{playerStats.pronosJoues || 0} bons</small>
        </article>

        <article>
          <span>Badges détenus</span>
          <strong>{ownedBadges.length}</strong>
          <small>Badges leader</small>
        </article>
      </section>

      <section className="profile-bottom-grid">
        <article className="profile-panel">
          <div className="profile-panel-title">
            <h3>Badges détenus</h3>
            <span>attribués automatiquement</span>
          </div>

          <div className="profile-badges-list">
            {ownedBadges.length > 0 ? (
              ownedBadges.map((badge) => (
                <div key={badge.title} className="profile-badge-card">
                  <strong>{badge.icon}</strong>
                  <div>
                    <span>{badge.title}</span>
                    <small>{badge.value} {badge.unit}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="profile-empty">
                Aucun badge leader pour le moment.
              </div>
            )}
          </div>
        </article>

        <article className="profile-panel">
          <div className="profile-panel-title">
            <h3>Dernières journées</h3>
            <span>forme récente</span>
          </div>

          <div className="profile-recent-list">
            {playerStats.lastDays.length > 0 ? (
              playerStats.lastDays.map((day) => (
                <div key={day.journee} className="profile-recent-row">
                  <span>J{day.journee}</span>
                  <strong>{day.points} pts</strong>
                </div>
              ))
            ) : (
              <div className="profile-empty">
                Aucun résultat enregistré.
              </div>
            )}
          </div>
        </article>

        <article className="profile-panel">
          <div className="profile-panel-title">
            <h3>Préférences joueur</h3>
            <span>identité</span>
          </div>

          <div className="profile-preferences">
            

            

            <div className="profile-name-editor">
              <span>Nom affiché</span>

              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Nom affiché"
              />

              <div className="profile-name-actions">
                <button type="button" onClick={saveCustomName}>
                  Enregistrer
                </button>

                <button type="button" className="reset" onClick={resetCustomName}>
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}


