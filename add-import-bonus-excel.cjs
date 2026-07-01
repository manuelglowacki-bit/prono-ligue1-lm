const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-import-bonus-excel", code);

// 1. Ajoute une deuxième ref pour l'import bonus
if (!code.includes("bonusFileInputRef")) {
  code = code.replace(
    `  const fileInputRef = useRef(null);`,
    `  const fileInputRef = useRef(null);
  const bonusFileInputRef = useRef(null);`
  );
}

// 2. Ajoute les fonctions d'import bonus Excel
const bonusImportCode = `
  function normalizeBonusHeader(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function getBonusCell(row, names) {
    const wanted = names.map(normalizeBonusHeader);

    for (const key of Object.keys(row)) {
      if (wanted.includes(normalizeBonusHeader(key))) {
        return row[key];
      }
    }

    return "";
  }

  function normalizeBonusLeague(value) {
    const raw = String(value || "").trim();
    const key = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "");

    if (key.includes("premier") || key.includes("angleterre") || key.includes("england")) {
      return "Premier League";
    }

    if (key.includes("liga") || key.includes("espagne") || key.includes("spain")) {
      return "Liga";
    }

    if (key.includes("serie") || key.includes("italie") || key.includes("italy")) {
      return "Serie A";
    }

    if (key.includes("bundesliga") || key.includes("allemagne") || key.includes("germany")) {
      return "Bundesliga";
    }

    return raw;
  }

  function isAllowedBonusLeague(value) {
    const league = normalizeBonusLeague(value);
    return ["Premier League", "Liga", "Serie A", "Bundesliga"].includes(league);
  }

  function bonusDateInputValue(value) {
    if (!value) return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return \`\${year}-\${month}-\${day}\`;
    }

    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const year = parsed.y;
        const month = String(parsed.m).padStart(2, "0");
        const day = String(parsed.d).padStart(2, "0");
        return \`\${year}-\${month}-\${day}\`;
      }
    }

    return toDateInputValue(value);
  }

  function bonusTimeInputValue(value) {
    if (!value) return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const hour = String(value.getHours()).padStart(2, "0");
      const minute = String(value.getMinutes()).padStart(2, "0");
      return \`\${hour}:\${minute}\`;
    }

    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const hour = String(parsed.H || 0).padStart(2, "0");
        const minute = String(parsed.M || 0).padStart(2, "0");
        return \`\${hour}:\${minute}\`;
      }
    }

    return toTimeInputValue(value);
  }

  function rowMatchesSelectedJournee(row) {
    const value = getBonusCell(row, [
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

    return (
      raw === currentNumber ||
      raw === currentTitle ||
      raw === \`j\${currentNumber}\`
    );
  }

  function handleBonusExcelImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

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

        const bonusRows = rows
          .filter(rowMatchesSelectedJournee)
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
          )
          .slice(0, 3);

        if (!bonusRows.length) {
          setMessage("Import bonus impossible : aucun match anglais, espagnol, italien ou allemand trouve pour cette journee.");
          return;
        }

        const currentBonus = ensureThreeBonus(selectedJournee).bonus;

        const nextBonus = [0, 1, 2].map((index) => {
          const imported = bonusRows[index];
          const previous = currentBonus[index] || makeEmptyBonus(selectedJournee.id, index);

          if (!imported) {
            return previous;
          }

          return {
            ...previous,
            league: imported.league,
            home: imported.home,
            away: imported.away,
            date: imported.date,
            time: imported.time,
            homeScore: "",
            awayScore: "",
            adminValidated: false,
            validated: false,
            isValidated: false
          };
        });

        updateSelectedJournee({
          bonus: nextBonus
        });

        setMessage(\`\${bonusRows.length} match(s) bonus importe(s) pour \${selectedJournee.title}.\`);
      } catch (error) {
        console.error(error);
        setMessage("Erreur import bonus Excel.");
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }
`;

if (!code.includes("function handleBonusExcelImport")) {
  const marker = `  const matches = selectedJournee.matches || [];`;

  if (!code.includes(marker)) {
    console.error("❌ Impossible de trouver l'endroit pour ajouter handleBonusExcelImport.");
    process.exit(1);
  }

  code = code.replace(marker, bonusImportCode + "\n\n" + marker);
}

// 3. Ajoute l'input fichier caché bonus
if (!code.includes('onChange={handleBonusExcelImport}')) {
  const inputMarker = `      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={handleExcelImport}
      />`;

  const bonusInput = `${inputMarker}

      <input
        ref={bonusFileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={handleBonusExcelImport}
      />`;

  if (!code.includes(inputMarker)) {
    console.error("❌ Input Excel principal introuvable.");
    process.exit(1);
  }

  code = code.replace(inputMarker, bonusInput);
}

// 4. Ajoute le bouton Importer bonus Excel
if (!code.includes("Importer bonus Excel")) {
  const buttonMarker = `          <button className="admin-btn green" type="button" onClick={() => fileInputRef.current?.click()}>
            Importer Excel
          </button>`;

  const buttonBonus = `${buttonMarker}

          <button className="admin-btn green" type="button" onClick={() => bonusFileInputRef.current?.click()}>
            Importer bonus Excel
          </button>`;

  if (!code.includes(buttonMarker)) {
    console.error("❌ Bouton Importer Excel introuvable.");
    process.exit(1);
  }

  code = code.replace(buttonMarker, buttonBonus);
}

fs.writeFileSync(file, code);

console.log("✅ Import bonus Excel ajouté.");
console.log("✅ Le bouton 'Importer bonus Excel' est maintenant dans la page Admin.");
console.log("✅ Il importe jusqu'à 3 matchs bonus : Premier League, Liga, Serie A, Bundesliga.");
