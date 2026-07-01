import React, { useEffect, useState } from 'react';
import AuthPage from '../pages/AuthPage';
import '../styles/auth.css';
import { ensureFavoriteTeam, ensureFavoriteTeamsForAccounts } from '../utils/favoriteTeam';

const SESSION_KEY = 'prono_ligue1_lm_session';

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
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

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureFavoriteTeamsForAccounts();

    const savedSession = safeJson(SESSION_KEY, null);

    if (savedSession) {
      ensureFavoriteTeam(savedSession.player);

      const fixedSession = {
        ...savedSession,
        role: savedSession.role || (savedSession.player === 'Manu' ? 'admin' : 'player'),
      };

      localStorage.setItem(SESSION_KEY, JSON.stringify(fixedSession));
      setSession(fixedSession);
    }

    setReady(true);
  }, []);

  function handleLogin(nextSession) {
    ensureFavoriteTeam(nextSession.player);
    setSession(nextSession);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  if (!ready) return null;

  if (!session) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <>
      <div className="auth-logout-fixed">
        <div>
          <strong>
            {session.displayName || session.player}
            {session.role === 'admin' ? ' · Admin' : ''}
          </strong>
          <span>{session.email}</span>
        </div>

        <button type="button" onClick={logout}>
          Déconnexion
        </button>
      </div>

      {children}
    </>
  );
}
