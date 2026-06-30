export const DISPLAY_NAMES_KEY = 'prono_ligue1_lm_display_names';

export function getDisplayNames() {
  try {
    return JSON.parse(localStorage.getItem(DISPLAY_NAMES_KEY) || '{}');
  } catch {
    return {};
  }
}

export function getDisplayName(player) {
  const names = getDisplayNames();
  return names[player] || player;
}

export function saveDisplayNameForPlayer(player, name) {
  const names = getDisplayNames();
  const cleanName = String(name || '').trim();

  if (!cleanName || cleanName === player) {
    delete names[player];
  } else {
    names[player] = cleanName;
  }

  localStorage.setItem(DISPLAY_NAMES_KEY, JSON.stringify(names));
  return names;
}

export function resetDisplayNameForPlayer(player) {
  const names = getDisplayNames();
  delete names[player];

  localStorage.setItem(DISPLAY_NAMES_KEY, JSON.stringify(names));
  return names;
}
