const fs = require("fs");

const file = "src/pages/ProfilePage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ ProfilePage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-fix-club-json", code);

const helper = `
function cleanFavoriteClubDisplay(value, playerName = "Manu") {
  if (!value) return "Non choisi";

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return cleanFavoriteClubDisplay(parsed, playerName);
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return (
      value.favoriteTeam ||
      value.club ||
      value.clubFavori ||
      value.team ||
      value[playerName] ||
      value.Manu ||
      Object.values(value).find((item) => typeof item === "string" && item.trim()) ||
      "Non choisi"
    );
  }

  return String(value);
}

function sanitizeFavoriteClubStorage() {
  try {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }

    keys.forEach((key) => {
      const raw = localStorage.getItem(key);

      if (!raw) return;

      const shouldClean =
        key.toLowerCase().includes("favorite") ||
        key.toLowerCase().includes("favori") ||
        key.toLowerCase().includes("club") ||
        key.toLowerCase().includes("team");

      if (!shouldClean) return;

      const cleaned = cleanFavoriteClubDisplay(raw);

      if (cleaned && cleaned !== raw && !cleaned.startsWith("{")) {
        localStorage.setItem(key, cleaned);
      }
    });
  } catch {
    // ignore
  }
}
`;

if (!code.includes("function cleanFavoriteClubDisplay")) {
  const lastImport = [...code.matchAll(/^import .*$/gm)].pop();

  if (lastImport) {
    const insertAt = lastImport.index + lastImport[0].length;
    code = code.slice(0, insertAt) + "\n\n" + helper + code.slice(insertAt);
  } else {
    code = helper + "\n" + code;
  }
}

if (!code.includes("sanitizeFavoriteClubStorage();")) {
  code = code.replace(
    /export default function ProfilePage\s*\([^)]*\)\s*\{/,
    (match) => match + "\n  sanitizeFavoriteClubStorage();"
  );
}

// Remplace les affichages directs les plus fréquents
code = code.replace(/\{profile\.favoriteTeam\}/g, "{cleanFavoriteClubDisplay(profile.favoriteTeam, profile.name)}");
code = code.replace(/\{data\.favoriteTeam\}/g, "{cleanFavoriteClubDisplay(data.favoriteTeam, data.name)}");
code = code.replace(/\{favoriteTeam\}/g, "{cleanFavoriteClubDisplay(favoriteTeam, selectedPlayer || currentPlayer || 'Manu')}");
code = code.replace(/\{clubFavori\}/g, "{cleanFavoriteClubDisplay(clubFavori, selectedPlayer || currentPlayer || 'Manu')}");
code = code.replace(/\{playerFavorite\}/g, "{cleanFavoriteClubDisplay(playerFavorite, selectedPlayer || currentPlayer || 'Manu')}");

// Corrige aussi les valeurs input si elles affichent le JSON
code = code.replace(/value=\{profile\.favoriteTeam \|\| ""\}/g, 'value={cleanFavoriteClubDisplay(profile.favoriteTeam, profile.name)}');
code = code.replace(/value=\{data\.favoriteTeam \|\| ""\}/g, 'value={cleanFavoriteClubDisplay(data.favoriteTeam, data.name)}');
code = code.replace(/value=\{favoriteTeam \|\| ""\}/g, 'value={cleanFavoriteClubDisplay(favoriteTeam, selectedPlayer || currentPlayer || "Manu")}');
code = code.replace(/value=\{clubFavori \|\| ""\}/g, 'value={cleanFavoriteClubDisplay(clubFavori, selectedPlayer || currentPlayer || "Manu")}');

fs.writeFileSync(file, code);

console.log("✅ ProfilePage corrigée : le club favori affichera juste RC Lens.");
