import React, { useState } from 'react';
import '../styles/auth.css';
import { ensureFavoriteTeam } from '../utils/favoriteTeam';

import {
  ACCOUNTS_KEY,
  SESSION_KEY,
  PLAYER_KEY,
  safeJson,
  createSalt,
  secureHashPassword,
  oldSimpleHash,
  saveDisplayName,
} from '../utils/authSecurity';

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

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');

  const [player, setPlayer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function createAccount() {
    const cleanPlayer = player.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanPlayer || !cleanEmail || !cleanPassword) {
      setMessage('Mets ton pseudo, ton adresse mail et ton mot de passe.');
      return;
    }

    if (cleanPassword.length < 6) {
      setMessage('Mot de passe trop court : minimum 6 caractères.');
      return;
    }

    if (!/[A-Z]/.test(cleanPassword)) {
      setMessage('Le mot de passe doit contenir au moins une majuscule.');
      return;
    }

    if (!/[0-9]/.test(cleanPassword)) {
      setMessage('Le mot de passe doit contenir au moins un chiffre.');
      return;
    }

    const accounts = safeJson(ACCOUNTS_KEY, []);

    if (accounts.some((account) => account.email === cleanEmail)) {
      setMessage('Cette adresse mail est déjà utilisée.');
      return;
    }

    if (accounts.some((account) => account.player.toLowerCase() === cleanPlayer.toLowerCase())) {
      setMessage('Ce pseudo existe déjà.');
      return;
    }

    setLoading(true);

    const isFirstAccount = accounts.length === 0;
    const salt = createSalt();
    const passwordHash = await secureHashPassword(cleanPassword, salt);

    const newAccount = {
      player: cleanPlayer,
      displayName: cleanPlayer,
      email: cleanEmail,
      passwordSalt: salt,
      passwordHash,
      role: isFirstAccount ? 'admin' : 'player',
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, newAccount]));
    saveDisplayName(cleanPlayer, cleanPlayer);
    ensureFavoriteTeam(cleanPlayer);

    setLoading(false);
    setPassword('');
    setMode('login');

    setMessage(
      isFirstAccount
        ? 'Compte admin créé. Tu peux te connecter.'
        : 'Compte joueur créé. Tu peux te connecter.'
    );
  }

  async function login() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setMessage('Mets ton adresse mail et ton mot de passe.');
      return;
    }

    const accounts = safeJson(ACCOUNTS_KEY, []);
    const account = accounts.find((item) => item.email === cleanEmail);

    if (!account) {
      setMessage('Adresse mail ou mot de passe incorrect.');
      return;
    }

    setLoading(true);

    let passwordOk = false;

    if (account.passwordSalt) {
      const secureHash = await secureHashPassword(cleanPassword, account.passwordSalt);
      passwordOk = secureHash === account.passwordHash;
    } else {
      passwordOk = oldSimpleHash(cleanPassword) === account.passwordHash;
    }

    if (!passwordOk) {
      setLoading(false);
      setMessage('Adresse mail ou mot de passe incorrect.');
      return;
    }

    const session = {
      player: account.player,
      displayName: account.displayName || account.player,
      email: account.email,
      role: account.role || 'player',
      loggedAt: new Date().toISOString(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(PLAYER_KEY, account.player);
    saveDisplayName(account.player, account.displayName || account.player);
    ensureFavoriteTeam(account.player);

    setLoading(false);
    onLogin(session);

    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">PL</div>

          <div>
            <p>PRONO LIGUE 1 LM</p>
            <h1>{mode === 'login' ? 'Connexion' : 'Inscription'}</h1>
            <span>
              {mode === 'login'
                ? 'Connecte-toi avec ton adresse mail.'
                : 'Crée ton compte joueur avec ton pseudo.'}
            </span>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login');
              setMessage('');
            }}
          >
            Connexion
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register');
              setMessage('');
            }}
          >
            Inscription
          </button>
        </div>

        <div className="auth-form">
          {mode === 'register' && (
            <label>
              Pseudo joueur
              <input
                value={player}
                onChange={(event) => setPlayer(event.target.value)}
                placeholder="Ex : Manu, Laurent, Quentin..."
              />
            </label>
          )}

          <label>
            Adresse mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="joueur@email.com"
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ex : Manu2026"
            />
                      <small className="auth-password-rule">
              Minimum 6 caractères, 1 majuscule et 1 chiffre.
            </small>
          </label>

          {message && <div className="auth-message">{message}</div>}

          {mode === 'login' ? (
            <button type="button" className="auth-submit" onClick={login} disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          ) : (
            <button type="button" className="auth-submit" onClick={createAccount} disabled={loading}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}




