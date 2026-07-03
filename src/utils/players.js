export const ACCOUNTS_KEY = 'prono_ligue1_lm_accounts';

export function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function getAccounts() {
  return safeJson(ACCOUNTS_KEY, []);
}

export function getRegisteredPlayers() {
  return getAccounts()
    .map((account) => account.player)
    .filter(Boolean);
}

export function getAccountByPlayer(player) {
  return getAccounts().find((account) => account.player === player) || null;
}

export function getAccountByEmail(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  return getAccounts().find((account) => account.email === cleanEmail) || null;
}

export function isAdminPlayer(player) {
  const account = getAccountByPlayer(player);
  return account?.role === 'admin';
}

