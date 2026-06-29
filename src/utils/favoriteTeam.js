export const FAVORITE_TEAM_KEY = 'prono_ligue1_lm_favorite_team';
export const ACCOUNTS_KEY = 'prono_ligue1_lm_accounts';
export const DEFAULT_FAVORITE_TEAM = 'RC Lens';

function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function ensureFavoriteTeam(player) {
  const cleanPlayer = String(player || '').trim();

  if (!cleanPlayer) return DEFAULT_FAVORITE_TEAM;

  const playerKey = `${FAVORITE_TEAM_KEY}_${cleanPlayer}`;
  const currentFavorite = localStorage.getItem(playerKey);

  if (!currentFavorite) {
    localStorage.setItem(playerKey, DEFAULT_FAVORITE_TEAM);
  }

  if (!localStorage.getItem(FAVORITE_TEAM_KEY)) {
    localStorage.setItem(FAVORITE_TEAM_KEY, DEFAULT_FAVORITE_TEAM);
  }

  return localStorage.getItem(playerKey) || DEFAULT_FAVORITE_TEAM;
}

export function ensureFavoriteTeamsForAccounts() {
  const accounts = safeJson(ACCOUNTS_KEY, []);

  if (!Array.isArray(accounts)) return;

  accounts.forEach((account) => {
    if (account?.player) {
      ensureFavoriteTeam(account.player);
    }
  });
}

export function getFavoriteTeam(player) {
  const cleanPlayer = String(player || '').trim();

  if (!cleanPlayer) {
    return localStorage.getItem(FAVORITE_TEAM_KEY) || DEFAULT_FAVORITE_TEAM;
  }

  return (
    localStorage.getItem(`${FAVORITE_TEAM_KEY}_${cleanPlayer}`) ||
    localStorage.getItem(FAVORITE_TEAM_KEY) ||
    DEFAULT_FAVORITE_TEAM
  );
}
