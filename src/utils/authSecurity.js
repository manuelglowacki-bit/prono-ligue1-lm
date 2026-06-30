export const ACCOUNTS_KEY = 'prono_ligue1_lm_accounts';
export const SESSION_KEY = 'prono_ligue1_lm_session';
export const PLAYER_KEY = 'prono_ligue1_lm_current_player';
export const DISPLAY_NAMES_KEY = 'prono_ligue1_lm_display_names';

export function safeJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function getSession() {
  return safeJson(SESSION_KEY, null);
}

export function isAdminSession() {
  const session = getSession();
  return session?.role === 'admin';
}

export function createSalt() {
  try {
    if (window.crypto?.getRandomValues) {
      const array = new Uint8Array(16);
      window.crypto.getRandomValues(array);

      return Array.from(array)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback
  }

  return `${Date.now()}-${Math.random()}-${Math.random()}`;
}

export function oldSimpleHash(value) {
  let hash = 0;
  const text = String(value || '');

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  return String(hash);
}

export async function secureHashPassword(password, salt) {
  const text = `${salt}:${password}`;

  try {
    if (window.crypto?.subtle && window.TextEncoder) {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

      return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // fallback mobile / http local
  }

  return oldSimpleHash(text);
}

export function saveDisplayName(player, displayName) {
  const names = safeJson(DISPLAY_NAMES_KEY, {});
  const cleanName = String(displayName || '').trim();

  if (cleanName && cleanName !== player) {
    names[player] = cleanName;
  } else {
    delete names[player];
  }

  localStorage.setItem(DISPLAY_NAMES_KEY, JSON.stringify(names));
}
