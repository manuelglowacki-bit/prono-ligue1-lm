import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_JOURNEES = [
  {
    id: "j1",
    number: 1,
    title: "J1",
    locked: false,
    lockAt: "",
    matches: [
      { id: "j1-m1", home: "RC Lens", away: "OL", date: "2026-08-22", time: "20:45", status: "Ouvert" },
      { id: "j1-m2", home: "PSG", away: "Nantes", date: "2026-08-23", time: "17:00", status: "Ouvert" },
      { id: "j1-m3", home: "OM", away: "Rennes", date: "2026-08-23", time: "21:00", status: "Ouvert" }
    ],
    bonus: []
  }
];

const PRONOS_KEY = "prono_lm_clean_pronos";
const BONUS_KEY = "prono_lm_bonus_selected";
const CLUB_KEY = "favoriteTeam";
const SELECTED_JOURNEE_KEY = "selected_prono_journee";

const CLUBS = [
  "RC Lens",
  "PSG",
  "OM",
  "LOSC",
  "OL",
  "Monaco",
  "Rennes",
  "Nantes",
  "Nice",
  "Strasbourg",
  "Toulouse",
  "Brest",
  "Angers",
  "Metz",
  "Le Havre",
  "Auxerre",
  "Paris FC",
  "Lorient"
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getRawScore(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}
function normalizeJournees(data) {
  if (!Array.isArray(data) || data.length === 0) return DEFAULT_JOURNEES;

  function pick(value, fallback = "") {
    return value !== undefined && value !== null ? value : fallback;
  }

  function normalizeMatch(match, id, type = "normal") {
    const home =
      match.home ||
      match.homeTeam ||
      match.domicile ||
      match.equipeDomicile ||
      match.equipe1 ||
      match.club1 ||
      "";

    const away =
      match.away ||
      match.awayTeam ||
      match.exterieur ||
      match.equipeExterieur ||
      match.equipe2 ||
      match.club2 ||
      "";

    const homeScore = pick(
      match.homeScore ??
        match.scoreHome ??
        match.scoreDomicile ??
        match.score1 ??
        match.resultHome ??
        match.resultatDomicile,
      ""
    );

    const awayScore = pick(
      match.awayScore ??
        match.scoreAway ??
        match.scoreExterieur ??
        match.score2 ??
        match.resultAway ??
        match.resultatExterieur,
      ""
    );

    return {
      ...match,
      id,
      type,
      home,
      away,
      date: match.date || match.matchDate || match.dateMatch || "",
      time: match.time || match.heure || match.hour || "",
      league: match.league || match.championnat || match.competition || (type === "bonus" ? "Bonus" : "Ligue 1"),
      status: match.status || match.statut || "Ouvert",
      homeScore,
      awayScore,
      scoreDomicile: homeScore,
      scoreExterieur: awayScore
    };
  }

  return data.map((j, index) => {
    const journeeId = j.id || `j${index + 1}`;
    const number = j.number || j.numero || index + 1;

    return {
      ...j,
      id: journeeId,
      number,
      title: j.title || `J${number}`,
      locked: Boolean(j.locked),
      lockAt: j.lockAt || "",
      matches: Array.isArray(j.matches)
        ? j.matches.map((m, i) =>
            normalizeMatch(m, m.id || `${journeeId}-m${i + 1}`, "normal")
          )
        : [],
      bonus: Array.isArray(j.bonus)
        ? j.bonus.slice(0, 3).map((b, i) =>
            normalizeMatch(b, b.id || `${journeeId}-b${i + 1}`, "bonus")
          )
        : []
    };
  });
}

function loadJournees() {
  const keys = [
    "admin_journees",
    "journees",
    "prono_ligue1_journees",
    "ligue1_journees",
    "imported_journees"
  ];

  for (const key of keys) {
    const data = loadJson(key, null);

    if (Array.isArray(data) && data.length > 0) {
      return normalizeJournees(data);
    }
  }

  return DEFAULT_JOURNEES;
}

function isTimeLocked(lockAt) {
  if (!lockAt) return false;

  const lockDate = new Date(lockAt);
  if (Number.isNaN(lockDate.getTime())) return false;

  return new Date() >= lockDate;
}

function formatLockDate(lockAt) {
  if (!lockAt) return "aucune heure globale definie";

  const date = new Date(lockAt);
  if (Number.isNaN(date.getTime())) return "heure invalide";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getMatchDateTime(match) {
  const date = String(match.date || "").trim();
  const time = String(match.time || "").trim();

  if (!date || !time) return null;

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const timeOk = /^\d{2}:\d{2}$/.test(time);

  if (!dateOk || !timeOk) return null;

  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function getMatchLockDate(match) {
  const startDate = getMatchDateTime(match);

  if (!startDate) return null;

  return new Date(startDate.getTime() - 5 * 60 * 1000);
}

function isAutoMatchLocked(match) {
  const lockDate = getMatchLockDate(match);

  if (!lockDate) return false;

  return new Date() >= lockDate;
}

function formatMatchDate(dateValue) {
  const raw = String(dateValue || "").trim();

  if (!raw) return "Date";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    const date = new Date(Number(year), Number(month) - 1, Number(day));

    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  return raw;
}

function formatMatchDateTime(dateValue, timeValue) {
  const date = formatMatchDate(dateValue);
  const time = String(timeValue || "").trim() || "Heure";
  return `${date} - ${time}`;
}

function formatAutoLock(match) {
  const lockDate = getMatchLockDate(match);

  if (!lockDate) return "Blocage auto indisponible";

  return lockDate.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeClubName(value) {
  const raw = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  const aliases = {
    lens: "lens",
    rclens: "lens",
    racingclublens: "lens",

    psg: "psg",
    parissg: "psg",
    parissaintgermain: "psg",

    om: "marseille",
    marseille: "marseille",
    olympiquedemarseille: "marseille",

    ol: "lyon",
    lyon: "lyon",
    olympiquelyonnais: "lyon",

    losc: "lille",
    lille: "lille",
    lilleosc: "lille",

    monaco: "monaco",
    asmonaco: "monaco",

    rennes: "rennes",
    staderennais: "rennes",

    nantes: "nantes",
    fcnantes: "nantes",

    nice: "nice",
    ogcnice: "nice",

    strasbourg: "strasbourg",
    rcstrasbourg: "strasbourg",

    toulouse: "toulouse",
    toulousefc: "toulouse",

    brest: "brest",
    stadebrestois: "brest",

    angers: "angers",
    angerssco: "angers",

    metz: "metz",
    fcmetz: "metz",

    lehavre: "lehavre",
    hac: "lehavre",

    auxerre: "auxerre",
    aja: "auxerre",

    parisfc: "parisfc",
    lorient: "lorient",
    fclorient: "lorient"
  };

  return aliases[raw] || raw;
}

function sameClub(a, b) {
  return normalizeClubName(a) === normalizeClubName(b);
}

function cleanFavoriteClubDisplay(value) {
  if (!value) return "Non choisi";

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.favoriteTeam || parsed.club || parsed.Manu || Object.values(parsed).find(Boolean) || "Non choisi";
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return value.favoriteTeam || value.club || value.Manu || Object.values(value).find(Boolean) || "Non choisi";
  }

  return String(value);
}

function hasRealScore(match) {
  const home = getRawScore(match, ["scoreDomicile", "scoreHome", "homeScore", "score1", "resultHome", "resultatDomicile"]);
  const away = getRawScore(match, ["scoreExterieur", "scoreAway", "awayScore", "score2", "resultAway", "resultatExterieur"]);

  return home !== "" && away !== "";
}

function getResult1N2FromScores(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function getPronoPointsDisplay(match, prono, type) {
  if (!hasRealScore(match)) {
    return {
      className: "waiting",
      label: "Resultat en attente",
      detail: "Le score reel n'est pas encore saisi."
    };
  }

  const realHome = getRawScore(match, ["scoreDomicile", "scoreHome", "homeScore", "score1", "resultHome", "resultatDomicile"]);
  const realAway = getRawScore(match, ["scoreExterieur", "scoreAway", "awayScore", "score2", "resultAway", "resultatExterieur"]);
  const realResult = getResult1N2FromScores(realHome, realAway);

  if (type === "normal") {
    if (!prono?.result) {
      return {
        className: "waiting",
        label: `Resultat reel : ${realHome}-${realAway}`,
        detail: "Aucun prono valide."
      };
    }

    const ok = prono.result === realResult;

    return {
      className: ok ? "good" : "miss",
      label: ok ? "✅ Bon 1N2 +1 pt" : "❌ Rate 0 pt",
      detail: `Resultat reel : ${realHome}-${realAway}`
    };
  }

  const ph = Number(prono?.homeScore);
  const pa = Number(prono?.awayScore);

  if (Number.isNaN(ph) || Number.isNaN(pa)) {
    return {
      className: "waiting",
      label: `Resultat reel : ${realHome}-${realAway}`,
      detail: "Aucun score prono."
    };
  }

  const exact = ph === Number(realHome) && pa === Number(realAway);
  const good1N2 = getResult1N2FromScores(ph, pa) === realResult;

  if (type === "bonus") {
    if (exact) {
      return {
        className: "exact",
        label: "🔥 Score exact bonus +3 pts",
        detail: `Resultat reel : ${realHome}-${realAway}`
      };
    }

    if (good1N2) {
      return {
        className: "good",
        label: "✅ Bon bonus +2 pts",
        detail: `Resultat reel : ${realHome}-${realAway}`
      };
    }

    return {
      className: "miss",
      label: "❌ Bonus rate 0 pt",
      detail: `Resultat reel : ${realHome}-${realAway}`
    };
  }

  if (exact) {
    return {
      className: "exact",
      label: "🎯 Score exact favori +2 pts",
      detail: `Resultat reel : ${realHome}-${realAway}`
    };
  }

  if (good1N2) {
    return {
      className: "good",
      label: "✅ Bon favori +1 pt",
      detail: `Resultat reel : ${realHome}-${realAway}`
    };
  }

  return {
    className: "miss",
    label: "❌ Favori rate 0 pt",
    detail: `Resultat reel : ${realHome}-${realAway}`
  };
}

/* prono-result-final */
function getResultScoreValue(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function getRealHomeScore(match) {
  return getResultScoreValue(match, [
    "homeScore",
    "scoreHome",
    "scoreDomicile",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);
}

function getRealAwayScore(match) {
  return getResultScoreValue(match, [
    "awayScore",
    "scoreAway",
    "scoreExterieur",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);
}

function hasRealResult(match) {
  return getRealHomeScore(match) !== "" && getRealAwayScore(match) !== "";
}

function getResultFromScores(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function getPronoResultBadge(match, prono, type) {
  if (!hasRealResult(match)) {
    return {
      className: "waiting",
      text: "En attente du resultat"
    };
  }

  const realHome = Number(getRealHomeScore(match));
  const realAway = Number(getRealAwayScore(match));
  const realResult = getResultFromScores(realHome, realAway);

  if (type === "normal") {
    if (!prono?.result) {
      return {
        className: "waiting",
        text: "Prono non joue"
      };
    }

    return prono.result === realResult
      ? { className: "good", text: "Bon 1N2 +1 pt" }
      : { className: "miss", text: "Rate 0 pt" };
  }

  const pronoHomeRaw = getPronoHomeValue(prono);
  const pronoAwayRaw = getPronoAwayValue(prono);

  if (pronoHomeRaw === "" || pronoAwayRaw === "") {
    return {
      className: "waiting",
      text: "Score prono non saisi"
    };
  }

  const pronoHome = Number(pronoHomeRaw);
  const pronoAway = Number(pronoAwayRaw);

  if (Number.isNaN(pronoHome) || Number.isNaN(pronoAway)) {
    return {
      className: "waiting",
      text: "Score prono invalide"
    };
  }

  const exact = realHome === pronoHome && realAway === pronoAway;
  const goodResult = getResultFromScores(pronoHome, pronoAway) === realResult;

  if (type === "bonus") {
    if (exact) return { className: "exact", text: "Score exact bonus +3 pts" };
    if (goodResult) return { className: "good", text: "Bon bonus +2 pts" };
    return { className: "miss", text: "Bonus rate 0 pt" };
  }

  if (exact) return { className: "exact", text: "Score exact favori +2 pts" };
  if (goodResult) return { className: "good", text: "Bon favori +1 pt" };

  return { className: "miss", text: "Favori rate 0 pt" };
}

function PronoResultBadge({ match, prono, type }) {
  const badge = getPronoResultBadge(match, prono, type);

  return (
    <div className={`prono-result-clean ${badge.className}`}>
      {badge.text}
    </div>
  );
}

function getPronoHomeValue(prono) {
  const value = prono?.homeScore ?? prono?.home ?? "";
  return value === null || value === undefined ? "" : String(value);
}

function getPronoAwayValue(prono) {
  const value = prono?.awayScore ?? prono?.away ?? "";
  return value === null || value === undefined ? "" : String(value);
}

/* bonus-score-display-final */
function bonusGetScore(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function bonusRealHome(match) {
  return bonusGetScore(match, [
    "homeScore",
    "scoreHome",
    "scoreDomicile",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);
}

function bonusRealAway(match) {
  return bonusGetScore(match, [
    "awayScore",
    "scoreAway",
    "scoreExterieur",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);
}

function bonusHasRealScore(match) {
  return bonusRealHome(match) !== "" && bonusRealAway(match) !== "";
}

function bonusResult(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function bonusPronoHome(prono) {
  const value = prono?.homeScore ?? prono?.home ?? "";
  return value === null || value === undefined ? "" : String(value);
}

function bonusPronoAway(prono) {
  const value = prono?.awayScore ?? prono?.away ?? "";
  return value === null || value === undefined ? "" : String(value);
}

function BonusResultBadge({ match, prono }) {
  if (!bonusHasRealScore(match)) {
    return (
      <div className="bonus-result-badge waiting">
        Resultat en attente
      </div>
    );
  }

  const realHome = Number(bonusRealHome(match));
  const realAway = Number(bonusRealAway(match));
  const pronoHomeRaw = bonusPronoHome(prono);
  const pronoAwayRaw = bonusPronoAway(prono);

  if (pronoHomeRaw === "" || pronoAwayRaw === "") {
    return (
      <div className="bonus-result-badge waiting">
        Score prono non saisi
        <small>Resultat reel : {realHome}-{realAway}</small>
      </div>
    );
  }

  const pronoHome = Number(pronoHomeRaw);
  const pronoAway = Number(pronoAwayRaw);

  const exact = realHome === pronoHome && realAway === pronoAway;
  const goodResult = bonusResult(realHome, realAway) === bonusResult(pronoHome, pronoAway);

  if (exact) {
    return (
      <div className="bonus-result-badge exact">
        🎯 Score exact bonus +3 pts
        <small>Resultat reel : {realHome}-{realAway}</small>
        <small>Resultat reel : {realHome}-{realAway}</small>
      </div>
    );
  }

  if (goodResult) {
    return (
      <div className="bonus-result-badge good">
        ✅ Bon bonus +2 pts
        <small>Resultat reel : {realHome}-{realAway}</small>
        <small>Resultat reel : {realHome}-{realAway}</small>
      </div>
    );
  }

  return (
    <div className="bonus-result-badge miss">
      ❌ Bonus rate 0 pt
      <small>Resultat reel : {realHome}-{realAway}</small>
      <small>Resultat reel : {realHome}-{realAway}</small>
    </div>
  );
}

/* bonus-display-score-line-final */
function getDisplayMatchLabel(match) {
  return (
    match?.label ||
    match?.affiche ||
    match?.match ||
    match?.rencontre ||
    match?.name ||
    match?.title ||
    ""
  );
}

function splitTeamsFromLabel(match) {
  const label = String(getDisplayMatchLabel(match) || "").trim();

  if (!label) return ["", ""];

  const parts = label
    .split(/\s+(?:vs|v|-)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join(" - ")];
  }

  return ["", ""];
}

function getDisplayHome(match) {
  const parsed = splitTeamsFromLabel(match);

  return (
    match?.home ||
    match?.homeTeam ||
    match?.domicile ||
    match?.equipeDomicile ||
    match?.club1 ||
    match?.equipe1 ||
    parsed[0] ||
    "Match bonus"
  );
}

function getDisplayAway(match) {
  const parsed = splitTeamsFromLabel(match);

  return (
    match?.away ||
    match?.awayTeam ||
    match?.exterieur ||
    match?.equipeExterieur ||
    match?.club2 ||
    match?.equipe2 ||
    parsed[1] ||
    ""
  );
}

function displayScoreValue(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function displayRealHome(match) {
  return displayScoreValue(match, [
    "homeScore",
    "scoreHome",
    "scoreDomicile",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);
}

function displayRealAway(match) {
  return displayScoreValue(match, [
    "awayScore",
    "scoreAway",
    "scoreExterieur",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);
}

function DisplayRealScoreLine({ match }) {
  const home = displayRealHome(match);
  const away = displayRealAway(match);

  if (home === "" || away === "") {
    return (
      <div className="real-score-mini waiting">
        Resultat reel : en attente
      </div>
    );
  }

  return (
    <div className="real-score-mini">
      Resultat reel : {home}-{away}
    </div>
  );
}

function bonusFinalPick(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function bonusFinalRealHome(match) {
  return bonusFinalPick(match, [
    "homeScore",
    "scoreHome",
    "scoreDomicile",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);
}

function bonusFinalRealAway(match) {
  return bonusFinalPick(match, [
    "awayScore",
    "scoreAway",
    "scoreExterieur",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);
}

function bonusFinalPronoHome(prono) {
  const value = prono?.homeScore ?? prono?.home ?? "";
  return value === null || value === undefined ? "" : String(value);
}

function bonusFinalPronoAway(prono) {
  const value = prono?.awayScore ?? prono?.away ?? "";
  return value === null || value === undefined ? "" : String(value);
}

function bonusFinalResult(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function BonusResultBadgeFinal({ match, prono }) {
  const realHomeRaw = bonusFinalRealHome(match);
  const realAwayRaw = bonusFinalRealAway(match);

  if (realHomeRaw === "" || realAwayRaw === "") {
    return (
      <div className="bonus-result-badge waiting">
        <span>Resultat en attente</span>
        <small>Score reel non saisi</small>
      </div>
    );
  }

  const pronoHomeRaw = bonusFinalPronoHome(prono);
  const pronoAwayRaw = bonusFinalPronoAway(prono);

  if (pronoHomeRaw === "" || pronoAwayRaw === "") {
    return (
      <div className="bonus-result-badge waiting">
        <span>Score prono non saisi</span>
        <small>Resultat reel : {realHomeRaw}-{realAwayRaw}</small>
      </div>
    );
  }

  const realHome = Number(realHomeRaw);
  const realAway = Number(realAwayRaw);
  const pronoHome = Number(pronoHomeRaw);
  const pronoAway = Number(pronoAwayRaw);

  const exact = realHome === pronoHome && realAway === pronoAway;
  const goodResult =
    bonusFinalResult(realHome, realAway) === bonusFinalResult(pronoHome, pronoAway);

  if (exact) {
    return (
      <div className="bonus-result-badge exact">
        <span>🎯 Score exact bonus +3 pts</span>
        <small>Resultat reel : {realHomeRaw}-{realAwayRaw}</small>
      </div>
    );
  }

  if (goodResult) {
    return (
      <div className="bonus-result-badge good">
        <span>✅ Bon bonus +2 pts</span>
        <small>Resultat reel : {realHomeRaw}-{realAwayRaw}</small>
      </div>
    );
  }

  return (
    <div className="bonus-result-badge miss">
      <span>❌ Bonus rate 0 pt</span>
      <small>Resultat reel : {realHomeRaw}-{realAwayRaw}</small>
    </div>
  );
}
export default function PronosPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const journees = useMemo(() => loadJournees(), [refreshKey]);

  const [selectedJourneeId, setSelectedJourneeId] = useState(() => {
    return localStorage.getItem(SELECTED_JOURNEE_KEY) || journees[0]?.id || "j1";
  });

  const selectedJournee =
    journees.find((j) => j.id === selectedJourneeId) ||
    journees[0] ||
    DEFAULT_JOURNEES[0];

  const [clubFavori, setClubFavori] = useState(() => {
    return localStorage.getItem(CLUB_KEY) || "RC Lens";
  });

  const [pronos, setPronos] = useState(() => loadJson(PRONOS_KEY, {}));

  const [bonusSelected, setBonusSelected] = useState(() => {
    return localStorage.getItem(BONUS_KEY) || "";
  });

  const journeeLocked = Boolean(selectedJournee.locked) || isTimeLocked(selectedJournee.lockAt);
  const lockLabel = formatLockDate(selectedJournee.lockAt);

  useEffect(() => {
    function syncFavorite() {
      setClubFavori(localStorage.getItem(CLUB_KEY) || "RC Lens");
    }

    window.addEventListener("favorite-team-updated", syncFavorite);
    window.addEventListener("storage", syncFavorite);

    return () => {
      window.removeEventListener("favorite-team-updated", syncFavorite);
      window.removeEventListener("storage", syncFavorite);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(PRONOS_KEY, JSON.stringify(pronos));
  }, [pronos]);

  useEffect(() => {
    localStorage.setItem(CLUB_KEY, clubFavori);
  }, [clubFavori]);

  useEffect(() => {
    localStorage.setItem(BONUS_KEY, bonusSelected);
  }, [bonusSelected]);

  useEffect(() => {
    localStorage.setItem(SELECTED_JOURNEE_KEY, selectedJournee.id);
  }, [selectedJournee.id]);

  function changeJournee(id) {
    setSelectedJourneeId(id);
    setBonusSelected("");
  }

  function previousJournee() {
    const index = journees.findIndex((j) => j.id === selectedJournee.id);
    const previous = journees[Math.max(0, index - 1)];
    if (previous) changeJournee(previous.id);
  }

  function nextJournee() {
    const index = journees.findIndex((j) => j.id === selectedJournee.id);
    const next = journees[Math.min(journees.length - 1, index + 1)];
    if (next) changeJournee(next.id);
  }

  function isMatchBlocked(match) {
    return (
      journeeLocked ||
      match.status === "Bloque" ||
      match.status === "FermÃƒÂ©" ||
      match.status === "Ferme" ||
      isAutoMatchLocked(match)
    );
  }

  function getBlockReason(match) {
    if (journeeLocked) return "Journee bloquee";
    if (match.status === "Bloque" || match.status === "FermÃƒÂ©" || match.status === "Ferme") return "Bloque manuel";
    if (isAutoMatchLocked(match)) return "Bloque auto";
    return "Ouvert";
  }

  function updateProno(match, patch) {
    if (isMatchBlocked(match)) return;

    const key = selectedJournee.id;

    const normalizedPatch = { ...patch };

    if (Object.prototype.hasOwnProperty.call(normalizedPatch, "homeScore")) {
      normalizedPatch.home = normalizedPatch.homeScore;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedPatch, "awayScore")) {
      normalizedPatch.away = normalizedPatch.awayScore;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedPatch, "result")) {
      normalizedPatch.value = normalizedPatch.result;
    }

    setPronos((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [match.id]: {
          ...((prev[key] || {})[match.id] || {}),
          ...normalizedPatch
        }
      }
    }));

    window.dispatchEvent(new CustomEvent("pronos-updated"));
  }

  function getProno(id) {
    return pronos[selectedJournee.id]?.[id] || {};
  }

  function isFavoriteMatch(match) {
    return sameClub(match.home, clubFavori) || sameClub(match.away, clubFavori);
  }

  const matches = selectedJournee.matches || [];
  const bonus = (selectedJournee.bonus || []).slice(0, 3);

  return (
    <div className="pronos-page-clean">
      <style>{`

        /* validation-buttons-disabled-final */
        .match-valid-btn,
        .bonus-valid-btn {
          display: none !important;
        }
        .pronos-page-clean {
          color: #ffffff;
        }

        .prono-top-clean {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 18px;
        }

        .prono-title-clean h1 {
          margin: 0;
          font-size: 38px;
          line-height: 1;
          font-weight: 950;
        }

        .prono-title-clean p {
          margin: 10px 0 0;
          color: #cbd5e1;
          font-weight: 800;
        }

        .prono-actions-clean {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
          max-width: 820px;
        }

        .prono-btn-clean,
        .prono-select-clean {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(34,197,94,.13);
          color: #f8fafc;
          border-radius: 16px;
          padding: 13px 16px;
          font-weight: 950;
          cursor: pointer;
          outline: none;
          min-width: 130px;
        }

        .prono-select-clean {
          background: #111827;
          border-color: rgba(186,255,0,.35);
        }

        .prono-lock-banner-clean {
          margin-bottom: 18px;
          padding: 15px 18px;
          border-radius: 18px;
          background: rgba(34,197,94,.10);
          border: 1px solid rgba(34,197,94,.30);
          color: #bbf7d0;
          font-weight: 950;
        }

        .prono-lock-banner-clean.locked {
          background: rgba(239,68,68,.13);
          border-color: rgba(239,68,68,.35);
          color: #fecaca;
        }

        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 26px 0 14px;
        }

        .section-head h2 {
          margin: 0;
          font-size: 28px;
          font-weight: 950;
        }

        .section-head span {
          color: #b6c2d9;
          font-weight: 950;
        }

        .match-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .match-card {
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 16px 38px rgba(0,0,0,.28);
        }

        .match-card.favorite {
          border-color: rgba(186,255,0,.65);
        }

        .match-card.selected {
          border-color: rgba(34,197,94,.65);
        }

        .match-card.blocked {
          border-color: rgba(239,68,68,.35);
          opacity: .72;
        }

        .match-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #9fb0ca;
          font-size: 13px;
          font-weight: 900;
          margin-bottom: 14px;
        }

        .badge {
          background: rgba(186,255,0,.14);
          color: #c6ff00;
          border: 1px solid rgba(186,255,0,.28);
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 950;
        }

        .badge.green {
          background: rgba(34,197,94,.15);
          color: #86efac;
          border-color: rgba(34,197,94,.35);
        }

        .badge.red {
          background: rgba(239,68,68,.15);
          color: #fca5a5;
          border-color: rgba(239,68,68,.35);
        }

        .teams {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
        }

        .team {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 18px;
          font-weight: 950;
        }

        .team small {
          color: #64748b;
          font-size: 12px;
        }

        .choices {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }

        .choice {
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.07);
          color: white;
          border-radius: 13px;
          padding: 11px 0;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
        }

        .choice.active {
          background: #baff00;
          border-color: #baff00;
          color: #07111f;
        }

        .choice:disabled,
        .score-inputs input:disabled,
        .bonus-btn:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .score-box {
          background: rgba(186,255,0,.08);
          border: 1px solid rgba(186,255,0,.22);
          border-radius: 16px;
          padding: 12px;
          margin-top: 8px;
        }

        .score-title {
          color: #d9ff66;
          font-size: 12px;
          font-weight: 950;
          margin-bottom: 9px;
        }

        .score-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .score-inputs input {
          width: 56px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.16);
          background: #111827;
          color: white;
          padding: 10px 6px;
          text-align: center;
          font-weight: 950;
          outline: none;
        }

        .muted {
          color: #94a3b8;
          font-size: 12px;
          margin-top: 9px;
          font-weight: 800;
        }

        .bonus-btn {
          width: 100%;
          border: 1px solid rgba(34,197,94,.35);
          background: rgba(34,197,94,.14);
          color: #bbf7d0;
          border-radius: 14px;
          padding: 11px;
          font-weight: 950;
          cursor: pointer;
          margin-bottom: 13px;
        }

        .bonus-btn.active {
          background: #22c55e;
          color: #052e16;
        }

        .prono-result-clean {
          margin-top: 12px;
          padding: 11px 12px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,.12);
        }

        .prono-result-clean small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          font-weight: 800;
          opacity: .86;
        }

        .prono-result-clean.waiting {
          background: rgba(148,163,184,.12);
          color: #cbd5e1;
          border-color: rgba(148,163,184,.22);
        }

        .prono-result-clean.good {
          background: rgba(34,197,94,.15);
          color: #bbf7d0;
          border-color: rgba(34,197,94,.35);
        }

        .prono-result-clean.exact {
          background: rgba(250,204,21,.16);
          color: #fde68a;
          border-color: rgba(250,204,21,.45);
        }

        .prono-result-clean.miss {
          background: rgba(239,68,68,.15);
          color: #fecaca;
          border-color: rgba(239,68,68,.35);
        }

        /* hide-validated-buttons */
        .match-card.blocked .match-valid-btn,
        .match-card.blocked .bonus-valid-btn {
          display: none !important;
        }

        .match-card:has(.prono-result-clean.good) .match-valid-btn,
        .match-card:has(.prono-result-clean.exact) .match-valid-btn,
        .match-card:has(.prono-result-clean.miss) .match-valid-btn,
        .match-card:has(.prono-result-clean.good) .bonus-valid-btn,
        .match-card:has(.prono-result-clean.exact) .bonus-valid-btn,
        .match-card:has(.prono-result-clean.miss) .bonus-valid-btn {
          display: none !important;
        }

        /* pronos-design-site-final */
        .pronos-page-clean {
          color: #f8fafc;
        }

        .pronos-header-clean,
        .pronos-top-clean,
        .pronos-hero-clean {
          margin-bottom: 18px !important;
          padding: 28px !important;
          border-radius: 30px !important;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.34)) !important;
          border: 1px solid rgba(255,255,255,.10) !important;
          box-shadow: 0 24px 70px rgba(0,0,0,.28) !important;
        }

        .pronos-header-clean h1,
        .pronos-top-clean h1,
        .pronos-hero-clean h1 {
          margin: 0 !important;
          font-size: 40px !important;
          line-height: 1 !important;
          font-weight: 950 !important;
          letter-spacing: -.04em !important;
        }

        .match-card,
        .bonus-card,
        .bonus-match-card,
        .prono-card-clean {
          border-radius: 24px !important;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98)) !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          box-shadow: 0 16px 38px rgba(0,0,0,.22) !important;
        }

        .match-card.favorite,
        .match-card.is-favorite,
        .bonus-card.selected,
        .bonus-match-card.selected,
        .bonus-card.is-selected,
        .bonus-match-card.is-selected {
          border-color: rgba(186,255,0,.55) !important;
          box-shadow:
            0 0 0 1px rgba(186,255,0,.18),
            0 18px 42px rgba(0,0,0,.28) !important;
        }

        .choice-btn,
        .prono-choice-btn,
        .bonus-choice-btn {
          border-radius: 16px !important;
          min-height: 52px !important;
          font-weight: 950 !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          background: rgba(255,255,255,.07) !important;
          color: #ffffff !important;
        }

        .choice-btn.active,
        .choice-btn.selected,
        .prono-choice-btn.active,
        .prono-choice-btn.selected,
        .bonus-choice-btn.active,
        .bonus-choice-btn.selected {
          background: #baff00 !important;
          color: #07111f !important;
          border-color: #baff00 !important;
          box-shadow: 0 12px 26px rgba(186,255,0,.18) !important;
        }

        .score-box,
        .score-zone,
        .favorite-score-box,
        .bonus-score-box {
          border-radius: 22px !important;
          background: rgba(186,255,0,.06) !important;
          border: 1px solid rgba(186,255,0,.28) !important;
        }

        .score-inputs input,
        .score-input,
        input[type="number"] {
          border-radius: 16px !important;
          background: rgba(15,23,42,.96) !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          color: #ffffff !important;
          font-weight: 950 !important;
        }

        .status-pill,
        .match-status,
        .bonus-pill {
          border-radius: 999px !important;
          background: rgba(34,197,94,.14) !important;
          border: 1px solid rgba(34,197,94,.32) !important;
          color: #bbf7d0 !important;
          font-weight: 950 !important;
        }

        .prono-result-clean,
        .bonus-result-badge,
        .real-score-mini {
          border-radius: 16px !important;
          font-weight: 950 !important;
        }

        .prono-result-clean.good,
        .bonus-result-badge.good {
          background: rgba(34,197,94,.15) !important;
          border: 1px solid rgba(34,197,94,.35) !important;
          color: #bbf7d0 !important;
        }

        .prono-result-clean.exact,
        .bonus-result-badge.exact {
          background: rgba(186,255,0,.16) !important;
          border: 1px solid rgba(186,255,0,.38) !important;
          color: #d9ff66 !important;
        }

        .prono-result-clean.miss,
        .bonus-result-badge.miss {
          background: rgba(239,68,68,.15) !important;
          border: 1px solid rgba(239,68,68,.35) !important;
          color: #fecaca !important;
        }

        .real-score-mini {
          background: rgba(255,255,255,.07) !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          color: #dbeafe !important;
        }

        /* bonus-design-clean-final */
        .bonus-card,
        .bonus-match-card {
          padding: 22px !important;
          border-radius: 26px !important;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98)) !important;
          border: 1px solid rgba(255,255,255,.12) !important;
          box-shadow: 0 16px 38px rgba(0,0,0,.22) !important;
        }

        .bonus-card.selected,
        .bonus-match-card.selected,
        .bonus-card.is-selected,
        .bonus-match-card.is-selected {
          border-color: rgba(34,197,94,.65) !important;
          box-shadow:
            0 0 0 1px rgba(34,197,94,.20),
            0 18px 42px rgba(0,0,0,.28) !important;
        }

        .bonus-selected-btn,
        .bonus-select-btn,
        .bonus-choice-btn {
          width: 100% !important;
          min-height: 50px !important;
          border-radius: 16px !important;
          border: 1px solid rgba(34,197,94,.35) !important;
          background: rgba(34,197,94,.13) !important;
          color: #bbf7d0 !important;
          font-weight: 950 !important;
        }

        .bonus-selected-btn,
        .bonus-choice-btn.selected,
        .bonus-choice-btn.active {
          background: #22c55e !important;
          color: #07111f !important;
          border-color: #22c55e !important;
        }

        .bonus-result-badge {
          margin-top: 12px !important;
          padding: 13px 15px !important;
          border-radius: 16px !important;
          font-size: 14px !important;
          font-weight: 950 !important;
          display: grid !important;
          gap: 5px !important;
        }

        .bonus-result-badge small {
          display: block !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          opacity: .9 !important;
        }

        .bonus-result-badge.good {
          background: rgba(34,197,94,.15) !important;
          border: 1px solid rgba(34,197,94,.35) !important;
          color: #bbf7d0 !important;
        }

        .bonus-result-badge.exact {
          background: rgba(186,255,0,.16) !important;
          border: 1px solid rgba(186,255,0,.38) !important;
          color: #d9ff66 !important;
        }

        .bonus-result-badge.miss {
          background: rgba(239,68,68,.15) !important;
          border: 1px solid rgba(239,68,68,.35) !important;
          color: #fecaca !important;
        }

        .bonus-result-badge.waiting {
          background: rgba(148,163,184,.14) !important;
          border: 1px solid rgba(148,163,184,.28) !important;
          color: #cbd5e1 !important;
        }

        .real-score-mini {
          display: none !important;
        }

        /* bonus-score-visible-final */
        .bonus-result-badge {
          margin-top: 12px !important;
          padding: 13px 15px !important;
          border-radius: 16px !important;
          font-size: 14px !important;
          font-weight: 950 !important;
          display: grid !important;
          gap: 6px !important;
        }

        .bonus-result-badge span {
          display: block !important;
        }

        .bonus-result-badge small {
          display: block !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          opacity: .9 !important;
        }
        @media (max-width: 1100px) {
          .match-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
          .match-valid-btn {
            width: 100%;
            margin-top: 14px;
            height: 46px;
            border-radius: 14px;
            border: 1px solid rgba(163, 230, 53, 0.35);
            background: rgba(8, 35, 27, 0.85);
            color: #ffffff;
            font-size: 13px;
            font-weight: 900;
            cursor: pointer;
            transition: 0.2s ease;
          }

          .match-valid-btn:hover {
            transform: translateY(-1px);
          }

          .match-valid-btn.is-valid {
            background: linear-gradient(135deg, #22c55e, #a3e635) !important;
            color: #052e16 !important;
            border-color: rgba(163, 230, 53, 0.95) !important;
            box-shadow: 0 0 22px rgba(34, 197, 94, 0.45);
          }
          .bonus-valid-btn {
            width: 100%;
            margin-top: 12px;
            height: 46px;
            border-radius: 14px;
            border: 1px solid rgba(163, 230, 53, 0.35);
            background: rgba(8, 35, 27, 0.85);
            color: #ffffff;
            font-size: 13px;
            font-weight: 900;
            cursor: pointer;
            transition: 0.2s ease;
          }

          .bonus-valid-btn:hover {
            transform: translateY(-1px);
          }

          .bonus-valid-btn.is-valid {
            background: linear-gradient(135deg, #22c55e, #a3e635) !important;
            color: #052e16 !important;
            border-color: rgba(163, 230, 53, 0.95) !important;
            box-shadow: 0 0 22px rgba(34, 197, 94, 0.45);
          }

        @media (max-width: 760px) {
          .prono-top-clean {
            flex-direction: column;
          }

          .prono-actions-clean,
          .prono-btn-clean,
          .prono-select-clean {
            width: 100%;
            max-width: none;
          }

          .match-grid {
            grid-template-columns: 1fr;
          }

          .prono-title-clean h1 {
            font-size: 30px;
          }
        }
      `}</style>

      <div className="prono-top-clean">
        <div className="prono-title-clean">
          <h1>Mes pronos</h1>
          <p>
            Les matchs se bloquent automatiquement 5 minutes avant le debut.
          </p>
        </div>

        <div className="prono-actions-clean">
          <button className="prono-btn-clean" type="button" onClick={previousJournee}>
            Journee avant
          </button>

          <select
            className="prono-select-clean"
            value={selectedJournee.id}
            onChange={(e) => changeJournee(e.target.value)}
          >
            {journees.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>

          <button className="prono-btn-clean" type="button" onClick={nextJournee}>
            Journee apres
          </button>

        </div>
      </div>

      <div className={`prono-lock-banner-clean ${journeeLocked ? "locked" : ""}`}>
        {journeeLocked
          ? `Journee bloquee pour ${selectedJournee.title}`
          : `Blocage global : ${lockLabel}. Chaque match se bloque aussi 5 minutes avant son coup d'envoi.`}
      </div>

      <div className="section-head">
        <h2>Matchs Ligue 1 - {selectedJournee.title}</h2>
        <span>{matches.length} matchs</span>
      </div>

      <div className="match-grid">
        {matches.map((match) => {
          const prono = getProno(match.id);
          const favorite = isFavoriteMatch(match);
          const blocked = isMatchBlocked(match);
          const reason = getBlockReason(match);

          return (
            <div
              key={match.id}
              className={`match-card ${favorite ? "favorite" : ""} ${blocked ? "blocked" : ""}`}
            >
              <div className="match-meta">
                <span>{formatMatchDateTime(match.date, match.time)}</span>
                <span className={blocked ? "badge red" : "badge green"}>
                  {blocked ? reason : "Ouvert"}
                </span>
              </div>

              <div className="teams">
                <div className="team">
                  <span>{getDisplayHome(match)}</span>
                  <small>DOM</small>
                </div>
                <div className="team">
                  <span>{getDisplayAway(match)}</span>
                  <small>EXT</small>
                </div>
              </div>

              {favorite ? (
                <div className="score-box">
                  <div className="score-title">Score exact club favori</div>
                  <div className="score-inputs">
                    <input
                      type="number"
                      min="0"
                      disabled={blocked}
                      value={getPronoHomeValue(prono)}
                      onChange={(e) =>
                        updateProno(match, {
                          homeScore: e.target.value,
                          result: ""
                        })
                      }
                      placeholder="0"
                    />
                    <strong>-</strong>
                    <input
                      type="number"
                      min="0"
                      disabled={blocked}
                      value={getPronoAwayValue(prono)}
                      onChange={(e) =>
                        updateProno(match, {
                          awayScore: e.target.value,
                          result: ""
                        })
                      }
                      placeholder="0"
                    />
                  </div>
                  <PronoResultBadge match={match} prono={prono} type="favorite" />
                  <div className="muted">
                    {blocked
                      ? "Ce match est bloque."
                      : `Blocage auto a ${formatAutoLock(match)}.`}
                  </div>
                </div>
              ) : (
                <>
                  <div className="choices">
                    {["1", "N", "2"].map((choice) => (
                      <button
                        key={choice}
                        disabled={blocked}
                        className={`choice ${prono.result === choice ? "active" : ""}`}
                        onClick={() =>
                          updateProno(match, {
                            result: choice,
                            homeScore: "",
                            awayScore: ""
                          })
                        }
                      >
                        {choice}
                      </button>
                    ))}
                  </div>

                  <div className="muted">
                    {blocked
                      ? "Ce match est bloque."
                      : `Blocage auto a ${formatAutoLock(match)}.`}
                  </div>
                </>
              )}
              {(() => {
                const evaluation = getPronoPointsDisplay(match, prono, favorite ? "favorite" : "normal");

                return (
                  <div className={`prono-result-clean ${evaluation.className}`}>
                    {evaluation.label}
                    <small>{evaluation.detail}</small>
                  </div>
                );
              })()}

              <button                className="match-valid-btn"
                type="button"
                onClick={(e) => {
                  const button = e.currentTarget;
                  const isValid = button.classList.toggle("is-valid");
                  button.textContent = isValid ? "Match valide" : "Valider match";
                }}
              >
                Valider match
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Les 3 matchs bonus - {selectedJournee.title}</h2>
        <span>{bonusSelected ? "1/3 choisi" : "0/3"}</span>
      </div>

      {bonus.length === 0 ? (
        <div className="match-card">
          Aucun bonus importe pour cette journee.
        </div>
      ) : (
        <div className="match-grid">
          {bonus.map((match) => {
            const prono = getProno(match.id);
            const selected = bonusSelected === match.id;
            const blocked = journeeLocked || isAutoMatchLocked(match);

            return (
              <div key={match.id} className={`match-card ${selected ? "selected" : ""} ${blocked ? "blocked" : ""}`}>
                <div className="match-meta">
                  <span>{formatMatchDateTime(match.date, match.time)}</span>
                  <span className={blocked ? "badge red" : "badge green"}>
                    {blocked ? "Bloque auto" : match.league}
                  </span>
                </div>

                <button
                  className={`bonus-btn ${selected ? "active" : ""}`}
                  disabled={blocked}
                  onClick={() => {
                    if (!blocked) setBonusSelected(match.id);
                  }}
                >
                  {selected ? "Bonus selectionne" : "Choisir ce bonus"}
                </button>

            <button
              className="bonus-valid-btn"
              type="button"
              onClick={(e) => {
                const button = e.currentTarget;
                const isValid = button.classList.toggle("is-valid");
                button.textContent = isValid ? "Bonus valide" : "Valider bonus";
              }}
            >
              Valider bonus
            </button>

                <div className="teams">
                  <div className="team">
                    <span>{getDisplayHome(match)}</span>
                    <small>DOM</small>
                  </div>
                  <div className="team">
                    <span>{getDisplayAway(match)}</span>
                    <small>EXT</small>
                  </div>
                </div>

                {selected ? (
                  <div className="score-box">
                    <div className="score-title">Score exact bonus</div>
                    <div className="score-inputs">
                      <input
                        type="number"
                        min="0"
                        disabled={blocked}
                        value={getPronoHomeValue(prono)}
                        onChange={(e) =>
                          updateProno(match, {
                            homeScore: e.target.value,
                            result: ""
                          })
                        }
                        placeholder="0"
                      />
                      <strong>-</strong>
                      <input
                        type="number"
                        min="0"
                        disabled={blocked}
                        value={getPronoAwayValue(prono)}
                        onChange={(e) =>
                          updateProno(match, {
                            awayScore: e.target.value,
                            result: ""
                          })
                        }
                        placeholder="0"
                      />
                    </div>
                    <BonusResultBadgeFinal match={match} prono={prono} />

                    <div className="muted">
                      {blocked
                        ? "Ce bonus est bloque."
                        : `Blocage auto a ${formatAutoLock(match)}.`}
                    </div>
                  </div>
                ) : (
                  <div className="muted">
                    {blocked
                      ? "Ce bonus est bloque."
                      : "Choisis ce bonus pour entrer ton score exact."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}














