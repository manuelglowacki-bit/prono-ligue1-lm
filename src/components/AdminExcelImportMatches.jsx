import React, { useState } from "react";
import * as XLSX from "xlsx";

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/-/g, "");
}

function getValue(row, possibleKeys) {
  const entries = Object.entries(row || {});
  const normalizedPossible = possibleKeys.map(normalizeKey);

  const found = entries.find(([key]) =>
    normalizedPossible.includes(normalizeKey(key))
  );

  return found ? found[1] : "";
}

function formatExcelDate(value) {
  if (!value) return "";

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";

    const year = parsed.y;
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return `${year}-${month}-${day}`;
  }

  return text;
}

function formatExcelHour(value) {
  if (!value && value !== 0) return "";

  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  const text = String(value).trim();

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const [h, m] = text.split(":");
    return `${String(h).padStart(2, "0")}:${m}`;
  }

  return text;
}

function buildJournees(matches) {
  return matches.reduce((acc, match) => {
    const key = String(match.journee || 1);
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
}

function isBonusMatch(match) {
  const type = String(match.type || "").toLowerCase();
  const championnat = String(match.championnat || "").toLowerCase();

  return (
    type.includes("bonus") ||
    championnat.includes("premier league") ||
    championnat.includes("liga") ||
    championnat.includes("serie a") ||
    championnat.includes("bundesliga")
  );
}

function saveMatches(matches, mode) {
  const oldMatches = JSON.parse(localStorage.getItem("matches") || "[]");
  const nextMatches = mode === "append" ? [...oldMatches, ...matches] : matches;

  const unique = [];
  const seen = new Set();

  nextMatches.forEach((match, index) => {
    const key =
      match.id ||
      `${match.journee}-${match.date}-${match.heure}-${match.domicile}-${match.exterieur}-${index}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(match);
    }
  });

  const bonusMatches = unique.filter(isBonusMatch);

  localStorage.setItem("matches", JSON.stringify(unique));
  localStorage.setItem("allMatches", JSON.stringify(unique));
  localStorage.setItem("ligue1Matches", JSON.stringify(unique));
  localStorage.setItem("matchs", JSON.stringify(unique));
  localStorage.setItem("journees", JSON.stringify(buildJournees(unique)));
  localStorage.setItem("bonusMatches", JSON.stringify(bonusMatches));
  localStorage.setItem("adminBonusMatches", JSON.stringify(bonusMatches));

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("matches-updated"));
  window.dispatchEvent(new CustomEvent("calendar-updated"));

  return unique.length;
}

export default function AdminExcelImportMatches() {
  const [mode, setMode] = useState("replace");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState([]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setPreview([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: true,
      });

      if (!rows.length) {
        throw new Error("Le fichier Excel est vide.");
      }

      const matches = rows
        .map((row, index) => {
          const journee =
            getValue(row, [
              "journÃ©e",
              "journee",
              "j",
              "round",
              "matchday",
              "numero journee",
              "numÃ©ro journÃ©e",
            ]) || 1;

          const date = formatExcelDate(
            getValue(row, ["date", "jour", "match date"])
          );

          const heure = formatExcelHour(
            getValue(row, ["heure", "horaire", "time", "kickoff"])
          );

          const domicile = String(
            getValue(row, [
              "domicile",
              "equipe domicile",
              "Ã©quipe domicile",
              "home",
              "home team",
              "club domicile",
            ])
          ).trim();

          const exterieur = String(
            getValue(row, [
              "exterieur",
              "extÃ©rieur",
              "equipe exterieur",
              "Ã©quipe extÃ©rieur",
              "away",
              "away team",
              "club extÃ©rieur",
            ])
          ).trim();

          const championnat =
            String(
              getValue(row, [
                "championnat",
                "competition",
                "compÃ©tition",
                "ligue",
                "league",
              ])
            ).trim() || "Ligue 1";

          const type =
            String(
              getValue(row, ["type", "categorie", "catÃ©gorie", "bonus"])
            ).trim() || (championnat === "Ligue 1" ? "LIGUE1" : "BONUS");

          if (!domicile || !exterieur) return null;

          const cleanJournee = Number(String(journee).replace(/\D/g, "")) || 1;

          return {
            id: `j${cleanJournee}-${index + 1}-${Date.now()}`,
            type,
            championnat,
            journee: cleanJournee,
            date,
            heure,
            domicile,
            exterieur,

            scoreDom: null,
            scoreExt: null,
            homeScore: null,
            awayScore: null,

            statut: "A_VENIR",
            status: "SCHEDULED",
            played: false,
            termine: false,
            valide: false,
            validated: false,
          };
        })
        .filter(Boolean);

      if (!matches.length) {
        throw new Error(
          "Aucun match reconnu. VÃ©rifie les colonnes : JournÃ©e, Date, Heure, Domicile, ExtÃ©rieur."
        );
      }

      const total = saveMatches(matches, mode);

      setPreview(matches.slice(0, 10));
      setMessage(`${matches.length} match(s) importÃ©(s). Total enregistrÃ© : ${total}.`);

      alert(`${matches.length} match(s) importÃ©(s) âœ…`);
    } catch (error) {
      console.error(error);
      setMessage(error.message);
      alert(error.message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="admin-excel-only-card">
      <div>
        <h3>ðŸ“¥ Import Excel des matchs</h3>
        <p>
          Gestion des journÃ©es simplifiÃ©e : importe uniquement les matchs depuis Excel.
        </p>
        <p className="admin-excel-help">
          Colonnes conseillÃ©es : JournÃ©e, Date, Heure, Domicile, ExtÃ©rieur, Championnat, Type.
        </p>
      </div>

      <div className="admin-excel-only-controls">
        <label>
          Mode import
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="replace">Remplacer les matchs</option>
            <option value="append">Ajouter aux matchs existants</option>
          </select>
        </label>

        <label className="admin-excel-only-button">
          Importer Excel
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
          />
        </label>
      </div>

      {message && <p className="admin-excel-only-message">{message}</p>}

      {preview.length > 0 && (
        <div className="admin-excel-only-preview">
          {preview.map((match) => (
            <div key={match.id}>
              <strong>J{match.journee}</strong>
              <span>{match.date}</span>
              <span>{match.heure}</span>
              <span>{match.domicile} - {match.exterieur}</span>
              <span>{match.championnat}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

