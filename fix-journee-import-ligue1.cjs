const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-fix-journee-import-ligue1", code);

function findFunctionRange(src, functionName) {
  const re = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`);
  const match = re.exec(src);

  if (!match) return null;

  const start = match.index;
  const open = src.indexOf("{", start);

  let depth = 0;
  let quote = null;

  for (let i = open; i < src.length; i++) {
    const ch = src[i];

    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }

      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;

    if (ch === "}") {
      depth--;

      if (depth === 0) {
        return {
          start,
          end: i + 1
        };
      }
    }
  }

  return null;
}

const range = findFunctionRange(code, "rowMatchesCurrentJournee");

if (!range) {
  console.error("❌ rowMatchesCurrentJournee introuvable.");
  process.exit(1);
}

const newFunction = `function rowMatchesCurrentJournee(row) {
      const value = getImportCell(row, [
        "Journée",
        "Journee",
        "J",
        "N° journée",
        "Numero journee",
        "Numéro journée",
        "Round",
        "Journée Ligue 1",
        "Journee Ligue 1"
      ]);

      const currentRaw = [
        selectedJournee.number,
        selectedJournee.title,
        selectedJournee.id
      ].filter(Boolean).join(" ");

      const currentNumberMatch = String(currentRaw || "").match(/\\d+/);
      const currentNumber = currentNumberMatch ? Number(currentNumberMatch[0]) : null;

      // Si l'Excel n'a pas de colonne journée, on importe les lignes trouvées.
      if (!value) return true;

      // Si le site ne trouve pas le numéro de journée, on ne bloque pas l'import.
      if (!currentNumber) return true;

      const raw = String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

      const excelNumberMatch = raw.match(/\\d+/);
      const excelNumber = excelNumberMatch ? Number(excelNumberMatch[0]) : null;

      if (excelNumber !== null) {
        return excelNumber === currentNumber;
      }

      return (
        raw === String(currentNumber) ||
        raw === \`j\${currentNumber}\` ||
        raw === \`journee\${currentNumber}\`
      );
    }`;

code = code.slice(0, range.start) + newFunction + code.slice(range.end);

code = code.replace(
  "Import Ligue 1 impossible : aucun match trouvé pour cette journée.",
  "Import Ligue 1 impossible : aucune ligne ne correspond à la journée sélectionnée. Vérifie la colonne Journée de ton Excel."
);

fs.writeFileSync(file, code);

console.log("✅ Filtre journée Ligue 1 corrigé.");
console.log("✅ Accepte maintenant J1, Journée 1, Journee 1, 1ère journée, etc.");
