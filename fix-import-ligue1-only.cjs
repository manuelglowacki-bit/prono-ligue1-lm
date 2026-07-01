const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-fix-import-ligue1-only", code);

function findFunctionRange(src, functionName) {
  const re = new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`);
  const match = re.exec(src);

  if (!match) return null;

  const start = match.index;
  const open = src.indexOf("{", start);

  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }

      if (ch === quote) {
        quote = null;
      }

      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
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

const range = findFunctionRange(code, "handleExcelImport");

if (!range) {
  console.error("❌ Fonction handleExcelImport introuvable.");
  process.exit(1);
}

const newFunction = `function handleExcelImport(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    function normalizeImportHeader(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
    }

    function getImportCell(row, names) {
      const wanted = names.map(normalizeImportHeader);

      for (const key of Object.keys(row)) {
        if (wanted.includes(normalizeImportHeader(key))) {
          return row[key];
        }
      }

      return "";
    }

    function toImportDate(value) {
      if (!value) return "";

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        return \`\${year}-\${month}-\${day}\`;
      }

      if (typeof value === "number" && typeof XLSX !== "undefined") {
        const parsed = XLSX.SSF.parse_date_code(value);

        if (parsed) {
          const year = parsed.y;
          const month = String(parsed.m).padStart(2, "0");
          const day = String(parsed.d).padStart(2, "0");
          return \`\${year}-\${month}-\${day}\`;
        }
      }

      const raw = String(value || "").trim();

      if (/^\\d{4}-\\d{2}-\\d{2}/.test(raw)) {
        return raw.slice(0, 10);
      }

      const fr = raw.match(/^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})/);

      if (fr) {
        return \`\${fr[3]}-\${fr[2].padStart(2, "0")}-\${fr[1].padStart(2, "0")}\`;
      }

      return "";
    }

    function toImportTime(value) {
      if (!value) return "";

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const hour = String(value.getHours()).padStart(2, "0");
        const minute = String(value.getMinutes()).padStart(2, "0");
        return \`\${hour}:\${minute}\`;
      }

      if (typeof value === "number") {
        if (value > 0 && value < 1) {
          const totalMinutes = Math.round(value * 24 * 60);
          const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
          const minute = String(totalMinutes % 60).padStart(2, "0");
          return \`\${hour}:\${minute}\`;
        }

        if (typeof XLSX !== "undefined") {
          const parsed = XLSX.SSF.parse_date_code(value);

          if (parsed) {
            const hour = String(parsed.H || 0).padStart(2, "0");
            const minute = String(parsed.M || 0).padStart(2, "0");
            return \`\${hour}:\${minute}\`;
          }
        }
      }

      const raw = String(value || "").trim();
      const match = raw.match(/(\\d{1,2})[:hH](\\d{2})/);

      if (match) {
        return \`\${match[1].padStart(2, "0")}:\${match[2]}\`;
      }

      return "";
    }

    function rowMatchesCurrentJournee(row) {
      const value = getImportCell(row, [
        "Journée",
        "Journee",
        "J",
        "N° journée",
        "Numero journee",
        "Round"
      ]);

      if (!value) return true;

      const raw = String(value).toLowerCase().replace(/\\s+/g, "");
      const currentNumber = String(selectedJournee.number || "").toLowerCase();
      const currentTitle = String(selectedJournee.title || "").toLowerCase().replace(/\\s+/g, "");

      return raw === currentNumber || raw === currentTitle || raw === \`j\${currentNumber}\`;
    }

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);

        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true
        });

        const rows = workbook.SheetNames.flatMap((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return XLSX.utils.sheet_to_json(sheet, { defval: "" });
        });

        const currentMatches = Array.isArray(selectedJournee.matches)
          ? selectedJournee.matches
          : [];

        const importedMatches = rows
          .filter(rowMatchesCurrentJournee)
          .map((row, index) => {
            const previous = currentMatches[index] || {};

            const home = getImportCell(row, [
              "Domicile",
              "Equipe domicile",
              "Équipe domicile",
              "Home",
              "Home Team"
            ]);

            const away = getImportCell(row, [
              "Extérieur",
              "Exterieur",
              "Equipe exterieur",
              "Équipe extérieur",
              "Away",
              "Away Team"
            ]);

            const rawDate = getImportCell(row, [
              "Date",
              "Jour",
              "Date match",
              "Match date"
            ]);

            const rawTime = getImportCell(row, [
              "Heure",
              "Horaire",
              "Time",
              "Kickoff",
              "Coup d'envoi"
            ]);

            return {
              ...previous,
              id: previous.id || \`\${selectedJournee.id}-match-\${index + 1}\`,
              home: String(home || "").trim(),
              away: String(away || "").trim(),
              date: toImportDate(rawDate),
              time: toImportTime(rawTime) || toImportTime(rawDate),
              homeScore: previous.homeScore || "",
              awayScore: previous.awayScore || "",
              adminValidated: false,
              validated: false,
              isValidated: false
            };
          })
          .filter((match) => match.home && match.away);

        if (!importedMatches.length) {
          setMessage("Import Ligue 1 impossible : aucun match trouvé pour cette journée.");
          return;
        }

        updateSelectedJournee({
          matches: importedMatches
        });

        setMessage(\`\${importedMatches.length} match(s) Ligue 1 importé(s) avec date et heure.\`);
      } catch (error) {
        console.error(error);
        setMessage("Erreur import Excel Ligue 1.");
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }`;

code = code.slice(0, range.start) + newFunction + code.slice(range.end);

fs.writeFileSync(file, code);

console.log("✅ Import Ligue 1 corrigé sans toucher aux matchs bonus.");
console.log("✅ Date + heure récupérées automatiquement.");
