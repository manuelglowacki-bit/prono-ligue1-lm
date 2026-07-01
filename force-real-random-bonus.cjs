const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-force-real-random-bonus", code);

if (!code.includes("function handleBonusExcelImport")) {
  console.error("❌ handleBonusExcelImport introuvable.");
  process.exit(1);
}

// Supprime les anciennes fonctions random si elles existent
code = code.replace(
/\s*function shuffleBonusMatches\(list\) \{[\s\S]*?\n\s*\}\n\s*\n\s*function pickRandomBonusMatches\(matches, limit = 3\) \{[\s\S]*?\n\s*\}\n/g,
"\n"
);

// Ajoute un vrai tirage aléatoire simple
const randomHelpers = `
  function shuffleBonusMatches(list) {
    const arr = [...list];

    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }

    return arr;
  }

  function pickRandomBonusMatches(matches, limit = 3) {
    const clean = shuffleBonusMatches(
      matches.filter((match) =>
        isAllowedBonusLeague(match.league) &&
        match.home &&
        match.away
      )
    );

    const selected = [];
    const usedLeagues = new Set();

    // 1. On essaie d'abord de prendre des championnats différents
    for (const match of clean) {
      const league = normalizeBonusLeague(match.league);

      if (!usedLeagues.has(league)) {
        selected.push({
          ...match,
          league
        });

        usedLeagues.add(league);
      }

      if (selected.length >= limit) {
        return shuffleBonusMatches(selected).slice(0, limit);
      }
    }

    // 2. S'il manque des matchs, on complète avec le reste au hasard
    for (const match of clean) {
      const key = [match.league, match.home, match.away, match.date, match.time].join("|");

      const alreadyTaken = selected.some((taken) => {
        const takenKey = [taken.league, taken.home, taken.away, taken.date, taken.time].join("|");
        return takenKey === key;
      });

      if (!alreadyTaken) {
        selected.push(match);
      }

      if (selected.length >= limit) {
        break;
      }
    }

    return shuffleBonusMatches(selected).slice(0, limit);
  }
`;

code = code.replace(
  "  function handleBonusExcelImport(event) {",
  randomHelpers + "\n\n  function handleBonusExcelImport(event) {"
);

// Remplace le bloc qui prend les bonus pour enlever définitivement le .slice(0, 3)
const startText = "        const availableBonusRows = rows";
let start = code.indexOf(startText);

if (start === -1) {
  start = code.indexOf("        const bonusRows = rows");
}

if (start === -1) {
  console.error("❌ Bloc bonusRows introuvable.");
  process.exit(1);
}

const nextText = "        if (!bonusRows.length)";
const end = code.indexOf(nextText, start);

if (end === -1) {
  console.error("❌ Fin du bloc bonusRows introuvable.");
  process.exit(1);
}

const newBlock = `        const availableBonusRows = rows
          .filter((row) => {
            if (!hasBonusDateRange()) {
              return rowMatchesSelectedJournee(row);
            }

            const dateValue = getBonusCell(row, ["Date", "Jour", "Match date"]);
            return isBonusDateInRange(bonusDateInputValue(dateValue));
          })
          .map((row) => {
            const leagueRaw = getBonusCell(row, [
              "Championnat",
              "Competition",
              "Compétition",
              "League",
              "Ligue"
            ]);

            const home = getBonusCell(row, [
              "Domicile",
              "Equipe domicile",
              "Équipe domicile",
              "Home",
              "Home Team"
            ]);

            const away = getBonusCell(row, [
              "Extérieur",
              "Exterieur",
              "Equipe exterieur",
              "Équipe extérieur",
              "Away",
              "Away Team"
            ]);

            const date = getBonusCell(row, ["Date", "Jour", "Match date"]);
            const time = getBonusCell(row, ["Heure", "Horaire", "Time", "Kickoff"]);

            return {
              league: normalizeBonusLeague(leagueRaw),
              home: String(home || "").trim(),
              away: String(away || "").trim(),
              date: bonusDateInputValue(date),
              time: bonusTimeInputValue(time)
            };
          })
          .filter((match) =>
            isAllowedBonusLeague(match.league) &&
            match.home &&
            match.away
          );

        const bonusRows = pickRandomBonusMatches(availableBonusRows, 3);

`;

code = code.slice(0, start) + newBlock + code.slice(end);

// Message plus clair
code = code.replace(
  /setMessage\(`\$\{bonusRows\.length\}[^`]*`\);/g,
  'setMessage(`${bonusRows.length} match(s) bonus tiré(s) au hasard entre les dates choisies.`);'
);

fs.writeFileSync(file, code);

console.log("✅ Vrai mode aléatoire forcé.");
console.log("✅ Plus de .slice(0, 3) sur les premiers matchs.");
console.log("✅ Le tirage change à chaque import.");
