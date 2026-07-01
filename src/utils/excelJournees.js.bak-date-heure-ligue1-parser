import * as XLSX from "xlsx";

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[_\-’']/g, "");
}

function excelDateToText(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return value.toLocaleDateString("fr-FR");
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const day = String(parsed.d).padStart(2, "0");
      const month = String(parsed.m).padStart(2, "0");
      return `${day}/${month}/${parsed.y}`;
    }
  }

  return clean(value);
}

function findHeaderRow(matrix) {
  let bestIndex = 0;
  let bestScore = -1;

  matrix.slice(0, 40).forEach((row, index) => {
    const cells = row.map(normalize);

    let score = 0;

    for (const cell of cells) {
      if (cell.includes("idmatch")) score += 3;
      if (cell.includes("journee")) score += 3;
      if (cell.includes("domicile")) score += 4;
      if (cell.includes("exterieur")) score += 4;
      if (cell.includes("exterieur")) score += 4;
      if (cell.includes("equipe1")) score += 3;
      if (cell.includes("equipe2")) score += 3;
      if (cell.includes("club1")) score += 3;
      if (cell.includes("club2")) score += 3;
      if (cell.includes("match")) score += 2;
      if (cell.includes("date")) score += 2;
      if (cell.includes("heure") || cell.includes("horaire")) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function rowsFromSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true
  });

  if (!matrix.length) return [];

  const headerIndex = findHeaderRow(matrix);
  const headers = matrix[headerIndex].map((h, i) => {
    const value = clean(h);
    return value || `col_${i}`;
  });

  const rows = [];

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const line = matrix[i];

    if (!line || line.every((cell) => clean(cell) === "")) continue;

    const row = {};

    headers.forEach((header, index) => {
      row[header] = line[index] ?? "";
    });

    rows.push(row);
  }

  return rows;
}

function getValue(row, possibleNames) {
  const keys = Object.keys(row);
  const wanted = possibleNames.map(normalize);

  for (const key of keys) {
    const normalizedKey = normalize(key);

    if (wanted.includes(normalizedKey)) {
      return clean(row[key]);
    }
  }

  return "";
}

function getByContains(row, possibleParts) {
  const keys = Object.keys(row);
  const wanted = possibleParts.map(normalize);

  for (const key of keys) {
    const normalizedKey = normalize(key);

    if (wanted.some((part) => normalizedKey.includes(part))) {
      return clean(row[key]);
    }
  }

  return "";
}

function splitMatchText(value) {
  const raw = clean(value);

  if (!raw) return { home: "", away: "" };

  const separators = [" vs ", " VS ", " - ", "-", " v ", " V ", " / ", "/"];

  for (const separator of separators) {
    if (raw.includes(separator)) {
      const parts = raw.split(separator).map(clean).filter(Boolean);

      if (parts.length >= 2) {
        return {
          home: parts[0],
          away: parts[1]
        };
      }
    }
  }

  return { home: "", away: "" };
}

function normalizeJournee(value, idMatch, fallbackIndex) {
  const fromId = clean(idMatch).match(/J0?(\d{1,2})/i);

  if (fromId?.[1]) {
    return `J${Number(fromId[1])}`;
  }

  const raw = clean(value);
  const number = raw.match(/\d+/)?.[0];

  if (number) return `J${Number(number)}`;

  return `J${fallbackIndex + 1}`;
}

function makeMatchId(journee, type, index) {
  return `${journee.toLowerCase()}-${type}${index + 1}`;
}

function parseRows(rows) {
  const grouped = {};

  rows.forEach((row, index) => {
    const idMatch = getValue(row, [
      "ID match",
      "Id match",
      "ID",
      "Match ID",
      "Identifiant"
    ]);

    const journee = normalizeJournee(
      getValue(row, [
        "Journee",
        "Journée",
        "Numero journee",
        "Numéro journée",
        "N° journée",
        "Round",
        "J"
      ]),
      idMatch,
      index
    );

    let home =
      getValue(row, [
        "Domicile",
        "Equipe domicile",
        "Équipe domicile",
        "Club domicile",
        "Recevant",
        "Home",
        "Home Team",
        "Equipe 1",
        "Équipe 1",
        "Club 1",
        "Equipe A",
        "Équipe A"
      ]) ||
      getByContains(row, [
        "domicile",
        "recevant",
        "hometeam"
      ]);

    let away =
      getValue(row, [
        "Exterieur",
        "Extérieur",
        "Equipe exterieur",
        "Équipe extérieur",
        "Club exterieur",
        "Club extérieur",
        "Visiteur",
        "Away",
        "Away Team",
        "Equipe 2",
        "Équipe 2",
        "Club 2",
        "Equipe B",
        "Équipe B"
      ]) ||
      getByContains(row, [
        "exterieur",
        "exterieur",
        "visiteur",
        "awayteam"
      ]);

    if (!home || !away) {
      const matchText =
        getValue(row, ["Match", "Rencontre", "Affiche", "Fixture", "Game", "Libelle", "Libellé"]) ||
        getByContains(row, ["match", "rencontre", "affiche", "libelle"]);

      const split = splitMatchText(matchText);
      home = home || split.home;
      away = away || split.away;
    }

    if (!home || !away) return;

    const date = excelDateToText(
      getValue(row, ["Date", "Jour", "Date match", "Date du match"])
    );

    const time =
      getValue(row, ["Heure", "Horaire", "Time", "Hour", "Coup d'envoi", "Coup d’envoi"]) ||
      getByContains(row, ["heure", "horaire"]);

    const competition =
      getValue(row, ["Competition", "Compétition", "Ligue", "League", "Championnat"]) ||
      getByContains(row, ["competition", "ligue", "league", "championnat"]);

    const type =
      getValue(row, ["Type", "Categorie", "Catégorie"]) ||
      getByContains(row, ["type", "categorie"]);

    const normalizedType = normalize(`${type} ${competition}`);

    const isBonus =
      normalizedType.includes("bonus") ||
      normalizedType.includes("premierleague") ||
      normalizedType.includes("liga") ||
      normalizedType.includes("seriea") ||
      normalizedType.includes("bundesliga");

    if (!grouped[journee]) {
      grouped[journee] = {
        id: journee.toLowerCase(),
        number: Number(journee.replace(/\D/g, "")) || index + 1,
        title: journee,
        matches: [],
        bonus: []
      };
    }

    if (isBonus) {
      grouped[journee].bonus.push({
        id: makeMatchId(journee, "b", grouped[journee].bonus.length),
        league: competition || type || "Bonus",
        home,
        away,
        date,
        time
      });
    } else {
      grouped[journee].matches.push({
        id: makeMatchId(journee, "m", grouped[journee].matches.length),
        home,
        away,
        date,
        time,
        status: "Ouvert",
        homeScore: "",
        awayScore: ""
      });
    }
  });

  return Object.values(grouped).sort((a, b) => a.number - b.number);
}

export function parseExcelWorkbookToJournees(workbook) {
  const allRows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = rowsFromSheet(sheet);
    allRows.push(...rows);
  });

  return parseRows(allRows);
}