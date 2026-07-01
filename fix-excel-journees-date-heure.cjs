const fs = require("fs");

const file = "src/utils/excelJournees.js";

if (!fs.existsSync(file)) {
  console.error("❌ src/utils/excelJournees.js introuvable");
  process.exit(1);
}

const old = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak-date-heure-ligue1-parser", old);

const content = `
import * as XLSX from "xlsx";

function cleanHeader(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function getCell(row, names) {
  const wanted = names.map(cleanHeader);

  for (const key of Object.keys(row)) {
    if (wanted.includes(cleanHeader(key))) {
      return row[key];
    }
  }

  return "";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate());
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return parsed.y + "-" + pad(parsed.m) + "-" + pad(parsed.d);
    }
  }

  const raw = String(value || "").trim();

  if (!raw) return "";

  if (/^\\d{4}-\\d{2}-\\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const fr = raw.match(/(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})/);

  if (fr) {
    return fr[3] + "-" + pad(fr[2]) + "-" + pad(fr[1]);
  }

  return "";
}

function toTimeInputValue(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return pad(value.getHours()) + ":" + pad(value.getMinutes());
  }

  if (typeof value === "number") {
    if (value > 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60);
      return pad(Math.floor(totalMinutes / 60)) + ":" + pad(totalMinutes % 60);
    }

    const parsed = XLSX.SSF.parse_date_code(value);

    if (parsed) {
      return pad(parsed.H || 0) + ":" + pad(parsed.M || 0);
    }
  }

  const raw = String(value || "").trim();
  const match = raw.match(/(\\d{1,2})[:hH](\\d{2})/);

  if (match) {
    return pad(match[1]) + ":" + match[2];
  }

  return "";
}

function getJourneeNumber(row, sheetName, rowIndex) {
  const value = getCell(row, [
    "Journée",
    "Journee",
    "J",
    "Round",
    "N° journée",
    "Numero journee",
    "Numéro journée",
    "Matchday"
  ]);

  const direct = String(value || "").match(/\\d+/);

  if (direct) {
    return Number(direct[0]);
  }

  const sheet = String(sheetName || "").match(/\\d+/);

  if (sheet) {
    return Number(sheet[0]);
  }

  return Math.floor(rowIndex / 9) + 1;
}

function getHome(row) {
  return getCell(row, [
    "Domicile",
    "Equipe domicile",
    "Équipe domicile",
    "Club domicile",
    "Home",
    "Home Team",
    "HomeTeam",
    "Equipe 1",
    "Équipe 1",
    "Team 1",
    "Local"
  ]);
}

function getAway(row) {
  return getCell(row, [
    "Extérieur",
    "Exterieur",
    "Equipe exterieur",
    "Équipe extérieur",
    "Club extérieur",
    "Away",
    "Away Team",
    "AwayTeam",
    "Equipe 2",
    "Équipe 2",
    "Team 2",
    "Visiteur"
  ]);
}

function splitMatchText(row) {
  const text = String(getCell(row, [
    "Match",
    "Affiche",
    "Rencontre",
    "Fixture",
    "Game"
  ]) || "").trim();

  if (!text) return { home: "", away: "" };

  const parts = text
    .replace(/\\s+vs\\s+/i, " - ")
    .replace(/\\s+v\\s+/i, " - ")
    .split(/\\s+-\\s+/);

  return {
    home: String(parts[0] || "").trim(),
    away: String(parts[1] || "").trim()
  };
}

function getDate(row) {
  return getCell(row, [
    "Date",
    "Jour",
    "Date match",
    "Match date",
    "Kickoff",
    "Coup d'envoi",
    "Coup denvoi"
  ]);
}

function getTime(row) {
  return getCell(row, [
    "Heure",
    "Horaire",
    "Time",
    "Kickoff",
    "Coup d'envoi",
    "Coup denvoi"
  ]);
}

export function parseExcelWorkbookToJournees(workbook) {
  const map = new Map();

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: "",
      raw: true
    });

    rows.forEach((row, rowIndex) => {
      const journeeNumber = getJourneeNumber(row, sheetName, rowIndex);

      let home = String(getHome(row) || "").trim();
      let away = String(getAway(row) || "").trim();

      if (!home || !away) {
        const fromText = splitMatchText(row);
        home = home || fromText.home;
        away = away || fromText.away;
      }

      if (!home || !away) return;

      const rawDate = getDate(row);
      const rawTime = getTime(row);

      const date = toDateInputValue(rawDate);
      const time = toTimeInputValue(rawTime) || toTimeInputValue(rawDate);

      const id = "j" + journeeNumber;

      if (!map.has(id)) {
        map.set(id, {
          id,
          number: journeeNumber,
          title: "J" + journeeNumber,
          locked: false,
          lockAt: "",
          matches: [],
          bonus: []
        });
      }

      const journee = map.get(id);
      const matchNumber = journee.matches.length + 1;

      journee.matches.push({
        id: id + "-m" + matchNumber,
        home,
        away,
        date,
        time,
        status: "Ouvert",
        homeScore: "",
        awayScore: "",
        adminValidated: false
      });
    });
  });

  return Array.from(map.values()).sort((a, b) => a.number - b.number);
}

export default parseExcelWorkbookToJournees;
`;

fs.writeFileSync(file, content);

console.log("✅ Lecteur Excel Ligue 1 corrigé.");
console.log("✅ Les colonnes Date et Heure seront maintenant envoyées vers AdminPage.");
console.log("✅ Les matchs bonus ne sont pas touchés.");
