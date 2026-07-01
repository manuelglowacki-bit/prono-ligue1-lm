const fs = require("fs");

const file = "src/pages/AdminPage.jsx";
const cssFile = "src/styles/layout.css";

if (!fs.existsSync(file)) {
  console.error("❌ AdminPage.jsx introuvable");
  process.exit(1);
}

let code = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
fs.writeFileSync(file + ".bak-random-bonus-date-range", code);

// 1. Ajouter les states date début / date fin
if (!code.includes("bonusRandomStartDate")) {
  const messageState = /(\s*const\s+\[message,\s*setMessage\]\s*=\s*useState\([^;]*\);\n)/;

  if (messageState.test(code)) {
    code = code.replace(
      messageState,
      `$1  const [bonusRandomStartDate, setBonusRandomStartDate] = useState("");
  const [bonusRandomEndDate, setBonusRandomEndDate] = useState("");
`
    );
  } else {
    const firstState = /(\s*const\s+\[[^\]]+\]\s*=\s*useState\([^;]*\);\n)/;

    code = code.replace(
      firstState,
      `$1  const [bonusRandomStartDate, setBonusRandomStartDate] = useState("");
  const [bonusRandomEndDate, setBonusRandomEndDate] = useState("");
`
    );
  }
}

// 2. Ajouter les fonctions de filtre par date
if (!code.includes("function hasBonusDateRange")) {
  const helper = `
  function hasBonusDateRange() {
    return Boolean(bonusRandomStartDate || bonusRandomEndDate);
  }

  function isBonusDateInRange(dateValue) {
    const date = String(dateValue || "").slice(0, 10);

    if (!date) return false;

    if (bonusRandomStartDate && date < bonusRandomStartDate) {
      return false;
    }

    if (bonusRandomEndDate && date > bonusRandomEndDate) {
      return false;
    }

    return true;
  }
`;

  code = code.replace(
    /(\s*)function handleBonusExcelImport\(event\) \{/,
    `${helper}

  function handleBonusExcelImport(event) {`
  );
}

// 3. Remplacer le filtre journée par filtre date si les dates sont remplies
if (!code.includes("if (!hasBonusDateRange())")) {
  code = code.replace(
    /\.filter\(rowMatchesSelectedJournee\)/,
    `.filter((row) => {
            if (!hasBonusDateRange()) {
              return rowMatchesSelectedJournee(row);
            }

            const dateValue = getBonusCell(row, ["Date", "Jour", "Match date"]);
            return isBonusDateInRange(bonusDateInputValue(dateValue));
          })`
  );
}

// 4. Ajouter les deux champs date avant le bouton import bonus
if (!code.includes("Date début bonus") && !code.includes("Date debut bonus")) {
  let labelIndex = code.indexOf("Importer bonus Excel aléatoire");

  if (labelIndex === -1) {
    labelIndex = code.indexOf("Importer bonus Excel");
  }

  if (labelIndex === -1) {
    console.error("❌ Bouton Importer bonus Excel introuvable.");
    process.exit(1);
  }

  const buttonStart = code.lastIndexOf("<button", labelIndex);

  if (buttonStart === -1) {
    console.error("❌ Début du bouton bonus introuvable.");
    process.exit(1);
  }

  const dateInputs = `          <label className="admin-bonus-date-filter">
            <span>Date début bonus</span>
            <input
              type="date"
              value={bonusRandomStartDate}
              onChange={(event) => setBonusRandomStartDate(event.target.value)}
            />
          </label>

          <label className="admin-bonus-date-filter">
            <span>Date fin bonus</span>
            <input
              type="date"
              value={bonusRandomEndDate}
              onChange={(event) => setBonusRandomEndDate(event.target.value)}
            />
          </label>

`;

  code = code.slice(0, buttonStart) + dateInputs + code.slice(buttonStart);
}

// 5. Renommer le bouton si besoin
code = code.replaceAll("Importer bonus Excel", "Importer bonus Excel aléatoire");

// 6. Message plus clair
code = code.replace(
  "Import bonus impossible : aucun match anglais, espagnol, italien ou allemand trouve pour cette journee.",
  "Import bonus impossible : aucun match trouve dans la periode choisie."
);

fs.writeFileSync(file, code);

// 7. CSS
if (fs.existsSync(cssFile)) {
  let css = fs.readFileSync(cssFile, "utf8");
  fs.writeFileSync(cssFile + ".bak-random-bonus-date-range", css);

  if (!css.includes("/* FILTRE DATE BONUS ALEATOIRE */")) {
    css += `

/* FILTRE DATE BONUS ALEATOIRE */
.admin-bonus-date-filter {
  display: inline-flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
  margin-right: 10px;
  color: rgba(255,255,255,0.78);
  font-size: 12px;
  font-weight: 700;
}

.admin-bonus-date-filter input {
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.88);
  color: #ffffff;
  padding: 0 10px;
  outline: none;
}

.admin-bonus-date-filter input:focus {
  border-color: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}
`;
    fs.writeFileSync(cssFile, css);
  }
}

console.log("✅ Filtre date début / date fin ajouté pour les bonus aléatoires.");
console.log("✅ Si les dates sont remplies, le tirage se fait uniquement entre ces dates.");
console.log("✅ Si les dates sont vides, l'ancien système par journée reste actif.");
