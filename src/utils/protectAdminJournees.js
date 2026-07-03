const KEY = "admin_journees";
const BACKUP_KEY = "admin_journees_backup_safe";

function parseSafe(raw) {
  try {
    if (!raw) return [];
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
}

function getScore(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function hasRealScore(match) {
  const home = getScore(match, [
    "homeScore",
    "scoreHome",
    "scoreDomicile",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);

  const away = getScore(match, [
    "awayScore",
    "scoreAway",
    "scoreExterieur",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);

  return home !== "" && away !== "";
}

function countScores(journees) {
  if (!Array.isArray(journees)) return 0;

  let total = 0;

  journees.forEach((journee) => {
    const matches = Array.isArray(journee.matches) ? journee.matches : [];
    const bonus = Array.isArray(journee.bonus) ? journee.bonus : [];

    [...matches, ...bonus].forEach((match) => {
      if (hasRealScore(match)) total += 1;
    });
  });

  return total;
}

function restoreBackupIfBetter() {
  const currentRaw = localStorage.getItem(KEY);
  const backupRaw = localStorage.getItem(BACKUP_KEY);

  const currentCount = countScores(parseSafe(currentRaw));
  const backupCount = countScores(parseSafe(backupRaw));

  if (backupCount > currentCount) {
    localStorage.setItem(KEY, backupRaw);
  }
}

if (typeof window !== "undefined" && !window.__adminJourneesProtected) {
  window.__adminJourneesProtected = true;

  restoreBackupIfBetter();

  const originalSetItem = localStorage.setItem.bind(localStorage);

  localStorage.setItem = function protectedSetItem(key, value) {
    if (key === KEY) {
      const oldRaw = localStorage.getItem(KEY);
      const oldCount = countScores(parseSafe(oldRaw));
      const newCount = countScores(parseSafe(value));

      if (oldCount > 0 && newCount < oldCount) {
        console.warn("Protection admin_journees : suppression de resultats bloquee.");
        return;
      }

      originalSetItem(key, value);
      originalSetItem(BACKUP_KEY, value);
      return;
    }

    originalSetItem(key, value);
  };
}
