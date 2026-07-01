const fs = require("fs");

const file = "src/pages/StatsPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ StatsPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-branch-admin-journees", code);

const helper = `
const ADMIN_JOURNEES_KEY = "admin_journees";
const ADMIN_MANAGER_KEY = "admin_pronos_manager_v3";

function readStatsJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAdminStatsDate(value) {
  return String(value || "").trim();
}

function normalizeAdminStatsTime(value) {
  return String(value || "").trim();
}

function flattenAdminJourneesForStats() {
  const journees =
    readStatsJson(ADMIN_JOURNEES_KEY, null) ||
    readStatsJson(ADMIN_MANAGER_KEY, null) ||
    [];

  if (!Array.isArray(journees) || !journees.length) {
    return [];
  }

  return journees.flatMap((journee, journeeIndex) => {
    const journeeId = journee.id || \`j\${journeeIndex + 1}\`;
    const journeeTitle = journee.title || \`J\${journee.number || journeeIndex + 1}\`;

    const ligue1Matches = Array.isArray(journee.matches)
      ? journee.matches.map((match, matchIndex) => ({
          ...match,
          id: match.id || \`\${journeeId}-m\${matchIndex + 1}\`,
          journeeId,
          journeeTitle,
          journeeNumber: journee.number || journeeIndex + 1,
          type: "ligue1",
          isBonus: false,
          home: match.home || match.homeTeam || match.domicile || "",
          away: match.away || match.awayTeam || match.exterieur || "",
          date: normalizeAdminStatsDate(match.date),
          time: normalizeAdminStatsTime(match.time),
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          adminValidated: Boolean(match.adminValidated || match.validated || match.isValidated)
        }))
      : [];

    const bonusMatches = Array.isArray(journee.bonus)
      ? journee.bonus.map((match, matchIndex) => ({
          ...match,
          id: match.id || \`\${journeeId}-b\${matchIndex + 1}\`,
          journeeId,
          journeeTitle,
          journeeNumber: journee.number || journeeIndex + 1,
          type: "bonus",
          isBonus: true,
          league: match.league || match.competition || "",
          home: match.home || match.homeTeam || match.domicile || "",
          away: match.away || match.awayTeam || match.exterieur || "",
          date: normalizeAdminStatsDate(match.date),
          time: normalizeAdminStatsTime(match.time),
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          adminValidated: Boolean(match.adminValidated || match.validated || match.isValidated)
        }))
      : [];

    return [...ligue1Matches, ...bonusMatches];
  });
}

function loadStatsMatchesFromAdminOrLegacy(legacyKey) {
  const adminMatches = flattenAdminJourneesForStats();

  if (adminMatches.length) {
    try {
      localStorage.setItem(legacyKey, JSON.stringify(adminMatches));
    } catch {
      // ignore storage errors
    }

    return adminMatches;
  }

  return readStatsJson(legacyKey, []);
}
`;

if (!code.includes("function flattenAdminJourneesForStats")) {
  const importEnd = code.lastIndexOf("import ");
  const firstConst = code.indexOf("const ", importEnd);

  if (firstConst !== -1) {
    code = code.slice(0, firstConst) + helper + "\n" + code.slice(firstConst);
  } else {
    code = helper + "\n" + code;
  }
}

code = code.replace(
  /setMatches\(JSON\.parse\(localStorage\.getItem\(MATCHS_KEY\)\s*\|\|\s*['"`]\[\]['"`]\)\);/g,
  "setMatches(loadStatsMatchesFromAdminOrLegacy(MATCHS_KEY));"
);

fs.writeFileSync(file, code);

console.log("✅ StatsPage modifiée.");
console.log("✅ Elle lit maintenant admin_journees / admin_pronos_manager_v3.");
console.log("✅ Les matchs Admin sont aussi recopiés dans MATCHS_KEY pour garder la compatibilité.");
