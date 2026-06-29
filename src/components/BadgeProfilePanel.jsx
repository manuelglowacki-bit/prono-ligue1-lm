import React, { useEffect, useState } from 'react';
import PlayerBadges from './PlayerBadges';
import { getPlayerOwnedBadges } from '../utils/badgeOwners';
import '../styles/playerBadges.css';

const PLAYER_KEY = 'prono_ligue1_lm_current_player';

export default function BadgeProfilePanel() {
  const [currentPlayer, setCurrentPlayer] = useState('Manu');
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    const player = localStorage.getItem(PLAYER_KEY) || 'Manu';

    setCurrentPlayer(player);
    setBadges(getPlayerOwnedBadges(player));
  }, []);

  return (
    <section className="profile-badge-panel">
      <div>
        <p>BADGES ATTRIBUÉS</p>
        <h2>Badges de {currentPlayer}</h2>
        <span>
          {badges.length > 0
            ? `${badges.length} badge(s) actuellement détenu(s)`
            : 'Aucun badge détenu pour le moment'}
        </span>
      </div>

      <PlayerBadges player={currentPlayer} />
    </section>
  );
}
