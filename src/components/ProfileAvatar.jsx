import React, { useEffect, useState } from 'react';
import '../styles/profileAvatar.css';

const PROFILE_PHOTOS_KEY = 'prono_ligue1_lm_profile_photos';

function readPhotos() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_PHOTOS_KEY) || '{}');
  } catch {
    return {};
  }
}

export default function ProfileAvatar({ player = 'Manu', size = 34 }) {
  const [photo, setPhoto] = useState('');

  useEffect(() => {
    const photos = readPhotos();
    setPhoto(photos[player] || '');
  }, [player]);

  return (
    <div
      className="profile-avatar-mini"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
      }}
    >
      {photo ? (
        <img src={photo} alt={player} />
      ) : (
        <span>{player.slice(0, 1)}</span>
      )}
    </div>
  );
}
