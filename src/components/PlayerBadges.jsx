import React, { useEffect, useState } from 'react';
import { getPlayerOwnedBadges } from '../utils/badgeOwners';
import '../styles/playerBadges.css';

export default function PlayerBadges({ player, compact = false }) {
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    setBadges(getPlayerOwnedBadges(player));
  }, [player]);

  if (!badges.length) return null;

  return (
    <div className={`player-badges ${compact ? 'compact' : ''}`}>
      {badges.map((badge) => (
        <div
          key={badge.id}
          className="player-badge-chip"
          title={`${badge.label} : ${badge.value} ${badge.unit}`}
        >
          <strong>{badge.icon}</strong>
          {!compact && <span>{badge.shortLabel}</span>}
        </div>
      ))}
    </div>
  );
}
