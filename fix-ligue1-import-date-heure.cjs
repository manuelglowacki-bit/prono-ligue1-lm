const fs = require("fs");

const file = "src/pages/AdminPage.jsx";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-ligue1-import-date-heure", code);

if (!code.includes("function handleExcelImport")) {
  console.error("❌ Import Excel Ligue 1 introuvable.");
  process.exit(1);
}

// 1. Ajoute helpers Date/Heure pour import Ligue 1
if (!code.includes("function getLigue1ExcelCell")) {
  const helper = `
  function normalizeLigue1Header(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function getLigue1ExcelCell(row, names) {
    const wanted = names.map(normalizeLigue1Header);

    for (const key of Object.keys(row)) {
      if (wanted.includes(normalizeLigue1Header(key))) {
        return row[key];
      }
    }

    return "";
  }

  function ligue1DateInputValue(value) {
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

    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) {
      return raw;
    }

    const fr = raw.match(/^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$/);

    if (fr) {
      return \`\${fr[3]}-\${fr[2].padStart(2, "0")}-\${fr[1].padStart(2, "0")}\`;
    }

    return "";
  }

  function ligue1TimeInputValue(value) {
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
`;

  code = code.replace(
    /(\s*)function handleExcelImport\(event\) \{/,
    `${helper}

  function handleExcelImport(event) {`
  );
}

// 2. Dans l'import Ligue 1, ajoute date + heure dans chaque match importé
if (!code.includes("const importedDate = ligue1DateInputValue")) {
  code = code.replace(
    /const home\s*=\s*getExcelValue\([^;]+;\n\s*const away\s*=\s*getExcelValue\([^;]+;/,
    (match) => `${match}

            const importedDate = ligue1DateInputValue(
              getLigue1ExcelCell(row, ["Date", "Jour", "Date match", "Match date"])
            );

            const importedTime = ligue1TimeInputValue(
              getLigue1ExcelCell(row, ["Heure", "Horaire", "Time", "Kickoff", "Coup d'envoi"])
            );`
  );
}

// 3. Ajoute date/time dans le return du match importé
if (!code.includes("date: importedDate ||")) {
  code = code.replace(
    /home:\s*String\(home\s*\|\|\s*""\)\.trim\(\),\n\s*away:\s*String\(away\s*\|\|\s*""\)\.trim\(\),/,
    `home: String(home || "").trim(),
              away: String(away || "").trim(),
              date: importedDate || "",
              time: importedTime || "",`
  );
}

// Variante si ton fichier utilise teamHome/teamAway
if (!code.includes("date: importedDate ||")) {
  code = code.replace(
    /teamHome:\s*String\(home\s*\|\|\s*""\)\.trim\(\),\n\s*teamAway:\s*String\(away\s*\|\|\s*""\)\.trim\(\),/,
    `teamHome: String(home || "").trim(),
              teamAway: String(away || "").trim(),
              date: importedDate || "",
              time: importedTime || "",`
  );
}

fs.writeFileSync(file, code);

console.log("✅ Import Ligue 1 amélioré.");
console.log("✅ Les colonnes Date et Heure seront maintenant récupérées automatiquement.");
