import React, { useEffect, useMemo, useState } from 'react';
import { getRegisteredPlayers } from '../utils/players';
import '../styles/ranking.css';
import { getDisplayName } from '../utils/displayNames';
import PlayerBadges from '../components/PlayerBadges';
import ProfileAvatar from '../components/ProfileAvatar';

const MATCHS_KEY = 'prono_ligue1_lm_matchs_admin';
const PRONOS_KEY = 'prono_ligue1_lm_pronos_joueurs';
const BONUS_CHOICES_KEY = 'prono_ligue1_lm_bonus_choices';
const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
const PLAYER_KEY = 'prono_ligue1_lm_current_player';

const DEFAULT_PLAYERS = getRegisteredPlayers();

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

  const h = Number(match.scoreDomicile);
  const a = Number(match.scoreExterieur);

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

function getExact(match, prono, scoreExactMode) {
  if (!scoreExactMode || !hasScore(match) || !hasScoreProno(prono)) return 0;

  return Number(prono.home) === Number(match.scoreDomicile) &&
    Number(prono.away) === Number(match.scoreExterieur)
    ? 1
    : 0;
}

function getPlayerFavorite(player, currentPlayer) {
  const playerKey = `${FAVORITE_TEAM_KEY}_${player}`;
  const savedPlayerTeam = localStorage.getItem(playerKey);

  if (savedPlayerTeam) return savedPlayerTeam;

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

function getRankIcon(index) {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return index + 1;
}

function getEvolutionLabel(evo) {
  if (evo > 0) return `↑ +${evo}`;
  if (evo < 0) return `↓ ${evo}`;
  return '→ 0';
}

function getEvolutionClass(evo) {
  if (evo > 0) return 'up';
  if (evo < 0) return 'down';
  return 'same';
}

export default function RankingPage() {
  const [matches, setMatches] = useState([]);
  const [pronos, setPronos] = useState({});
  const [bonusChoices, setBonusChoices] = useState({});
  const [currentPlayer, setCurrentPlayer] = useState('Manu');

  useEffect(() => {
    setMatches(JSON.parse(localStorage.getItem(MATCHS_KEY) || '[]'));
    setPronos(JSON.parse(localStorage.getItem(PRONOS_KEY) || '{}'));
    setBonusChoices(JSON.parse(localStorage.getItem(BONUS_CHOICES_KEY) || '{}'));
    setCurrentPlayer(localStorage.getItem(PLAYER_KEY) || 'Manu');
  }, []);

  const scoredMatches = useMemo(() => {
    return matches.filter(hasScore);
  }, [matches]);

  const scoredJournees = useMemo(() => {
    return [...new Set(scoredMatches.map((m) => String(m.journee || '').trim()).filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));
  }, [scoredMatches]);

  const lastJournee = scoredJournees[scoredJournees.length - 1] || '1';

  function calculatePlayer(player, onlyBeforeLast = false) {
    const favoriteTeam = getPlayerFavorite(player, currentPlayer);
    const playerPronos = pronos[player] || {};

    let total = 0;
    let exacts = 0;
    let lastPoints = 0;

    scoredMatches.forEach((match) => {
      const journee = String(match.journee || '');
      const isLast = journee === String(lastJournee);

      if (onlyBeforeLast && isLast) return;

      const isBonus = match.type === 'BONUS';
      const bonusKey = `${player}-J${journee}`;
      const selectedBonusId = bonusChoices[bonusKey];

      if (isBonus && selectedBonusId !== match.id) return;

      const favorite = isFavoriteMatch(match, favoriteTeam);
      const scoreExactMode = favorite || isBonus;
      const prono = playerPronos[match.id];

      const pts = getPoints(match, prono, scoreExactMode, isBonus);
      const exact = getExact(match, prono, scoreExactMode);

      total += pts;
      exacts += exact;

      if (isLast) {
        lastPoints += pts;
      }
    });

    return {
      player,
      total,
      exacts,
      lastPoints,
      favoriteTeam,
    };
  }

  const ranking = useMemo(() => {
    const current = DEFAULT_PLAYERS.map((player) => calculatePlayer(player, false))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return b.exacts - a.exacts;
      })
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    const beforeLast = DEFAULT_PLAYERS.map((player) => calculatePlayer(player, true))
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return b.exacts - a.exacts;
      })
      .map((item, index) => ({
        player: item.player,
        oldRank: index + 1,
      }));

    return current.map((item) => {
      const old = beforeLast.find((entry) => entry.player === item.player);
      const oldRank = old?.oldRank || item.rank;
      const evolution = oldRank - item.rank;

      return {
        ...item,
        oldRank,
        evolution,
      };
    });
  }, [matches, pronos, bonusChoices, currentPlayer, lastJournee]);

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);
  const leaderPoints = leader?.total || 0;

  const bestLastDay = ranking.reduce((best, player) => {
    if (!best || player.lastPoints > best.lastPoints) return player;
    return best;
  }, null);

  const bestProgress = ranking.reduce((best, player) => {
    if (!best || player.evolution > best.evolution) return player;
    return best;
  }, null);

  if (matches.length === 0) {
    return (
      <div className="ranking-page">
        <section className="ranking-header">
          <div>
            <p>CLASSEMENT</p>
            <h1>Classement général</h1>
            <span>Aucun match chargé pour le moment.</span>
          </div>
        </section>

        <div className="ranking-empty">
          Va dans Admin puis synchronise les matchs Ligue 1.
        </div>
      </div>
    );
  }

  return (
    <div className="ranking-page">
      <section className="ranking-header">
        <div>
          <p>CLASSEMENT</p>
          <h1>Classement général</h1>
          <span>
            Journée analysée : J{lastJournee} · {ranking.length} joueurs
          </span>
        </div>

        <div className="ranking-header-badge">
          {leader ? `👑 Leader : ${leader.player}` : 'Aucun leader'}
        </div>
      </section>

      <section className="ranking-kpis">
        <article>
          <span>Leader</span>
          <strong>{leader?.player || '-'}</strong>
          <small>{leader?.total || 0} pts</small>
        </article>

        <article>
          <span>Meilleure J{lastJournee}</span>
          <strong>{bestLastDay?.player || '-'}</strong>
          <small>+{bestLastDay?.lastPoints || 0} pts</small>
        </article>

        <article>
          <span>Progression</span>
          <strong>{bestProgress?.player || '-'}</strong>
          <small>{getEvolutionLabel(bestProgress?.evolution || 0)} place(s)</small>
        </article>
      </section>

      <section className="ranking-podium">
        {podium.map((player, index) => (
          <article key={player.player} className={`podium-card rank-${index + 1}`}>
            <div className="podium-medal">{getRankIcon(index)}</div>

            <div className="podium-player-photo">
              <ProfileAvatar player={player.player} size={58} />
            </div>

            <h2>{getDisplayName(player.player)}</h2>
            <strong>{player.total} pts</strong>
            <span>{player.exacts} score(s) exact(s)</span>
          </article>
        ))}
      </section>

      <section className="ranking-table-card">
        <div className="ranking-table-title">
          <h2>Tableau complet</h2>
          <span>Départage : points puis scores exacts</span>
        </div>

        <div className="ranking-table">
          <div className="ranking-row ranking-row-head">
            <span>Place</span>
            <span>Évo</span>
            <span>Joueur</span>
            <span>Points</span>
            <span>Exact</span>
            <span>J{lastJournee}</span>
            <span>Écart</span>
          </div>

          {ranking.map((player, index) => {
            const gap = leaderPoints - player.total;

            return (
              <div key={player.player} className="ranking-row">
                <span className="rank-place">{getRankIcon(index)}</span>

                <span className={`rank-evo ${getEvolutionClass(player.evolution)}`}>
                  {getEvolutionLabel(player.evolution)}
                </span>

                <span className="rank-player">
                  <span className="rank-player-name">
                    <ProfileAvatar player={player.player} size={28} />
                    <span>{getDisplayName(player.player)}</span>
                    {player.player === currentPlayer && <em>toi</em>}
                  </span>

                  <PlayerBadges player={player.player} compact />
                </span>

                <span className="rank-points">{player.total} pts</span>

                <span className="rank-exacts">{player.exacts}</span>

                <span className="rank-last">+{player.lastPoints}</span>

                <span className="rank-gap">
                  {gap === 0 ? 'Leader' : `-${gap} pts`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}






