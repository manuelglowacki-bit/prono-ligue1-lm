const fs = require("fs");

const file = "src/pages/TrophiesPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ TrophiesPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-branch-admin-journees", code);

const helper = `
const TROPHY_ADMIN_JOURNEES_KEY = "admin_journees";
const TROPHY_ADMIN_MANAGER_KEY = "admin_pronos_manager_v3";

function readTrophyJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function flattenAdminJourneesForTrophies() {
  const journees =
    readTrophyJson(TROPHY_ADMIN_JOURNEES_KEY, null) ||
    readTrophyJson(TROPHY_ADMIN_MANAGER_KEY, null) ||
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
          date: match.date || "",
          time: match.time || "",
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          result: match.result || match.resultat || match.resultatFinal || "",
          resultat: match.resultat || match.result || match.resultatFinal || "",
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
          date: match.date || "",
          time: match.time || "",
          status: match.status || match.statut || "Ouvert",
          homeScore: match.homeScore ?? match.scoreDomicile ?? match.scoreHome ?? "",
          awayScore: match.awayScore ?? match.scoreExterieur ?? match.scoreAway ?? "",
          result: match.result || match.resultat || match.resultatFinal || "",
          resultat: match.resultat || match.result || match.resultatFinal || "",
          adminValidated: Boolean(match.adminValidated || match.validated || match.isValidated)
        }))
      : [];

    return [...ligue1Matches, ...bonusMatches];
  });
}

function loadTrophyMatchesFromAdminOrLegacy(legacyKey) {
  const adminMatches = flattenAdminJourneesForTrophies();

  if (adminMatches.length) {
    try {
      localStorage.setItem(legacyKey, JSON.stringify(adminMatches));
    } catch {
      // ignore storage errors
    }

    return adminMatches;
  }

  return readTrophyJson(legacyKey, []);
}
`;

if (!code.includes("function flattenAdminJourneesForTrophies")) {
  const lines = code.split("\n");
  let lastImportLine = -1;

  lines.forEach((line, index) => {
    if (line.trim().startsWith("import ")) {
      lastImportLine = index;
    }
  });

  if (lastImportLine !== -1) {
    lines.splice(lastImportLine + 1, 0, helper);
    code = lines.join("\n");
  } else {
    code = helper + "\n" + code;
  }
}

let replacements = 0;

// Remplace les lectures classiques des matchs par les matchs Admin
code = code.replace(
  /JSON\.parse\(\s*localStorage\.getItem\(\s*((?:[A-Z0-9_]*MATCH[A-Z0-9_]*|["'`][^"'`]*(?:match|matchs|matches)[^"'`]*["'`]))\s*\)\s*\|\|\s*(['"`])\[\]\2\s*\)/gi,
  (match, keyExpr) => {
    replacements++;
    return `loadTrophyMatchesFromAdminOrLegacy(${keyExpr})`;
  }
);

fs.writeFileSync(file, code);

console.log("✅ TrophiesPage modifiée.");
console.log("✅ Elle lit maintenant admin_journees / admin_pronos_manager_v3.");
console.log("✅ Remplacement(s) effectué(s) :", replacements);

if (replacements === 0) {
  console.log("⚠️ Je n'ai pas trouvé la lecture des matchs automatiquement.");
  console.log("Si le build passe mais que les trophées ne changent pas, envoie TrophiesPage.jsx.");
}
