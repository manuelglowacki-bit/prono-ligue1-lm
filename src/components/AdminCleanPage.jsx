import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const DEFAULT_PLAYERS = [
  "Laurent",
  "Quentin",
  "Jo B",
  "Jonathan",
  "Eric L",
  "Yannis",
  "Giovani",
  "Manu",
  "David J",
  "Samuel",
];

const MATCH_KEYS = [
  "matches",
  "allMatches",
  "ligue1Matches",
  "matchs",
  "journees",
  "calendar",
  "fixtures",
  "bonusMatches",
  "adminBonusMatches",
  "bonus",
];

const PRONO_KEYS = [
  "pronos",
  "pronostics",
  "predictions",
  "userPronos",
  "userPredictions",
  "allPronos",
];

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("paris saint-germain", "psg")
    .replace("paris saint germain", "psg")
    .replace("paris sg", "psg")
    .replace("olympique de marseille", "marseille")
    .replace("om", "marseille")
    .replace("olympique lyonnais", "lyon")
    .replace("ol", "lyon")
    .replace("rc lens", "lens")
    .replace("losc lille", "lille")
    .replace("lille osc", "lille")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const found = entries.find(([key]) => normalizedPossible.includes(normalizeKey(key)));
  return found ? found[1] : "";
}

function flatten(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flatten(item));
  }

  if (typeof value === "object") {
    if (getHome(value) && getAway(value)) return [value];

    const looksLikeProno =
      value.matchId ||
      value.idMatch ||
      value.match_id ||
      value.scoreDom !== undefined ||
      value.scoreExt !== undefined ||
      value.prono !== undefined ||
      value.prediction !== undefined;

    const looksLikePlayer =
      value.nom || value.name || value.pseudo || value.joueur || value.player;

    if (looksLikeProno || looksLikePlayer) return [value];

    return Object.values(value).flatMap((item) => flatten(item));
  }

  return [value];
}

function getId(match) {
  return match?.id || match?.matchId || match?.idMatch || match?.match_id || "";
}

function getHome(match) {
  return (
    match?.domicile ||
    match?.home ||
    match?.equipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    ""
  );
}

function getAway(match) {
  return (
    match?.exterieur ||
    match?.extérieur ||
    match?.away ||
    match?.equipeExterieur ||
    match?.equipeExtérieur ||
    match?.teamAway ||
    match?.awayTeam ||
    ""
  );
}

function getRound(match) {
  return (
    match?.journee ||
    match?.journée ||
    match?.round ||
    match?.matchday ||
    match?.numeroJournee ||
    match?.numeroJournée ||
    ""
  );
}

function getDate(match) {
  return match?.date || match?.jour || match?.matchDate || "";
}

function getHour(match) {
  return match?.heure || match?.horaire || match?.time || match?.kickoff || "";
}

function getChampionnat(match) {
  return match?.championnat || match?.competition || match?.compétition || "Ligue 1";
}

function getScoreHome(match) {
  return (
    match?.scoreDom ??
    match?.homeScore ??
    match?.butsDomicile ??
    match?.scoreDomicile ??
    ""
  );
}

function getScoreAway(match) {
  return (
    match?.scoreExt ??
    match?.awayScore ??
    match?.butsExterieur ??
    match?.butsExtérieur ??
    match?.scoreExterieur ??
    ""
  );
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

function isBonusMatch(match) {
  const type = normalize(match?.type);
  const id = normalize(getId(match));
  const champ = normalize(getChampionnat(match));

  return (
    type.includes("bonus") ||
    id.includes("bonus") ||
    champ.includes("premier league") ||
    champ.includes("liga") ||
    champ.includes("serie a") ||
    champ.includes("bundesliga")
  );
}

function matchKey(match) {
  const id = getId(match);
  if (id) return `id:${id}`;

  return [
    normalize(getRound(match)),
    normalize(getDate(match)),
    normalize(getHour(match)),
    normalize(getHome(match)),
    normalize(getAway(match)),
  ].join("|");
}

function buildJournees(matches) {
  return matches.reduce((acc, match) => {
    const key = String(match.journee || 1);
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {});
}

function saveImportedMatches(matches, mode) {
  const oldMatches = readJson("matches", []);
  const nextMatches = mode === "append" ? [...oldMatches, ...matches] : matches;

  const unique = [];
  const seen = new Set();

  nextMatches.forEach((match) => {
    const key = matchKey(match);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(match);
    }
  });

  localStorage.setItem("matches", JSON.stringify(unique));
  localStorage.setItem("allMatches", JSON.stringify(unique));
  localStorage.setItem("ligue1Matches", JSON.stringify(unique));
  localStorage.setItem("matchs", JSON.stringify(unique));
  localStorage.setItem("journees", JSON.stringify(buildJournees(unique)));

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("matches-updated"));
  window.dispatchEvent(new CustomEvent("calendar-updated"));

  return unique.length;
}

function collectMatches() {
  const all = MATCH_KEYS.flatMap((key) => flatten(readJson(key, [])))
    .filter((item) => getHome(item) && getAway(item));

  const seen = new Set();

  return all
    .filter((match) => {
      const key = matchKey(match);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const roundA = Number(String(getRound(a)).replace(/\D/g, "")) || 999;
      const roundB = Number(String(getRound(b)).replace(/\D/g, "")) || 999;
      if (roundA !== roundB) return roundA - roundB;

      const dateCompare = String(getDate(a)).localeCompare(String(getDate(b)));
      if (dateCompare !== 0) return dateCompare;

      return String(getHour(a)).localeCompare(String(getHour(b)));
    });
}

function sameMatch(a, b) {
  const idA = getId(a);
  const idB = getId(b);

  if (idA && idB && String(idA) === String(idB)) return true;

  const sameTeams =
    normalize(getHome(a)) === normalize(getHome(b)) &&
    normalize(getAway(a)) === normalize(getAway(b));

  if (!sameTeams) return false;

  const sameDate =
    !getDate(a) || !getDate(b) || normalize(getDate(a)) === normalize(getDate(b));

  const sameHour =
    !getHour(a) || !getHour(b) || normalize(getHour(a)) === normalize(getHour(b));

  const sameRound =
    !getRound(a) || !getRound(b) || normalize(getRound(a)) === normalize(getRound(b));

  return sameDate && sameHour && sameRound;
}

function applyScore(match, scoreDom, scoreExt) {
  const finalScore = `${scoreDom}-${scoreExt}`;

  return {
    ...match,
    scoreDom,
    scoreExt,
    homeScore: scoreDom,
    awayScore: scoreExt,
    butsDomicile: scoreDom,
    butsExterieur: scoreExt,
    scoreDomicile: scoreDom,
    scoreExterieur: scoreExt,
    resultatFinal: finalScore,
    scoreFinal: finalScore,
    statut: "TERMINE",
    status: "FINISHED",
    played: true,
    termine: true,
    valide: true,
    validated: true,
    manualScore: true,
    sourceScore: "admin-manuel",
    updatedAt: new Date().toISOString(),
  };
}

function clearScore(match) {
  return {
    ...match,
    scoreDom: null,
    scoreExt: null,
    homeScore: null,
    awayScore: null,
    butsDomicile: null,
    butsExterieur: null,
    scoreDomicile: null,
    scoreExterieur: null,
    resultatFinal: "",
    scoreFinal: "",
    statut: "A_VENIR",
    status: "SCHEDULED",
    played: false,
    termine: false,
    valide: false,
    validated: false,
    manualScore: false,
    sourceScore: "",
    updatedAt: new Date().toISOString(),
  };
}

function patchDeep(value, targetMatch, action, scoreDom, scoreExt) {
  let changed = 0;

  if (Array.isArray(value)) {
    const next = value.map((item) => {
      const patched = patchDeep(item, targetMatch, action, scoreDom, scoreExt);
      changed += patched.changed;
      return patched.value;
    });

    return { value: next, changed };
  }

  if (value && typeof value === "object") {
    if (getHome(value) && getAway(value) && sameMatch(value, targetMatch)) {
      return {
        value: action === "clear" ? clearScore(value) : applyScore(value, scoreDom, scoreExt),
        changed: 1,
      };
    }

    const next = {};

    Object.entries(value).forEach(([key, item]) => {
      const patched = patchDeep(item, targetMatch, action, scoreDom, scoreExt);
      changed += patched.changed;
      next[key] = patched.value;
    });

    return { value: next, changed };
  }

  return { value, changed: 0 };
}

function saveScoreEverywhere(targetMatch, scoreDom, scoreExt) {
  let totalChanged = 0;

  MATCH_KEYS.forEach((key) => {
    const current = readJson(key, null);
    if (!current) return;

    const patched = patchDeep(current, targetMatch, "save", scoreDom, scoreExt);

    if (patched.changed > 0) {
      localStorage.setItem(key, JSON.stringify(patched.value));
      totalChanged += patched.changed;
    }
  });

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("matches-updated"));
  window.dispatchEvent(new CustomEvent("scores-updated"));
  window.dispatchEvent(new CustomEvent("ranking-updated"));

  return totalChanged;
}

function clearScoreEverywhere(targetMatch) {
  let totalChanged = 0;

  MATCH_KEYS.forEach((key) => {
    const current = readJson(key, null);
    if (!current) return;

    const patched = patchDeep(current, targetMatch, "clear");

    if (patched.changed > 0) {
      localStorage.setItem(key, JSON.stringify(patched.value));
      totalChanged += patched.changed;
    }
  });

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("matches-updated"));
  window.dispatchEvent(new CustomEvent("scores-updated"));
  window.dispatchEvent(new CustomEvent("ranking-updated"));

  return totalChanged;
}

function collectPronos() {
  return PRONO_KEYS.flatMap((key) => flatten(readJson(key, [])));
}

function getPlayerName(player) {
  if (typeof player === "string") return player;

  return (
    player?.nom ||
    player?.name ||
    player?.pseudo ||
    player?.joueur ||
    player?.player ||
    player?.userName ||
    ""
  );
}

function getPronoPlayer(prono) {
  return (
    prono?.joueur ||
    prono?.player ||
    prono?.nom ||
    prono?.pseudo ||
    prono?.user ||
    prono?.userName ||
    prono?.participant ||
    ""
  );
}

function getPronoMatchId(prono) {
  return (
    prono?.matchId ||
    prono?.idMatch ||
    prono?.match_id ||
    prono?.match?.id ||
    prono?.id ||
    ""
  );
}

function getPronoHomeScore(prono) {
  return (
    prono?.scoreDom ??
    prono?.homeScore ??
    prono?.pronoDom ??
    prono?.domicileScore ??
    prono?.butsDomicile ??
    null
  );
}

function getPronoAwayScore(prono) {
  return (
    prono?.scoreExt ??
    prono?.awayScore ??
    prono?.pronoExt ??
    prono?.exterieurScore ??
    prono?.butsExterieur ??
    null
  );
}

function resultFromScores(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return "";
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function getPronoResult(prono) {
  const home = getPronoHomeScore(prono);
  const away = getPronoAwayScore(prono);

  if (home !== null && away !== null && home !== "" && away !== "") {
    return resultFromScores(home, away);
  }

  const raw = normalize(
    prono?.resultat ||
      prono?.résultat ||
      prono?.result ||
      prono?.prono ||
      prono?.prediction ||
      ""
  );

  if (raw === "1" || raw.includes("domicile") || raw.includes("home")) return "1";
  if (raw === "2" || raw.includes("exterieur") || raw.includes("away")) return "2";
  if (raw === "n" || raw === "x" || raw.includes("nul") || raw.includes("draw")) return "N";

  return "";
}

function collectPlayers(pronos) {
  const fromStorage = ["players", "joueurs", "users", "participants"]
    .flatMap((key) => flatten(readJson(key, [])))
    .map(getPlayerName)
    .filter(Boolean);

  const fromPronos = pronos.map(getPronoPlayer).filter(Boolean);

  const unique = [...new Set([...fromStorage, ...fromPronos])];

  return unique.length > 0 ? unique : DEFAULT_PLAYERS;
}

function getFavoriteTeam(playerName) {
  const keys = ["favoriteTeams", "clubsFavoris", "playerFavoriteTeams"];

  for (const key of keys) {
    const data = readJson(key, null);

    if (data && typeof data === "object") {
      const direct = data[playerName] || data[normalize(playerName)] || data[String(playerName).trim()];
      if (direct) return direct;
    }
  }

  const players = ["players", "joueurs", "users", "participants"]
    .flatMap((key) => flatten(readJson(key, [])));

  const player = players.find((item) => normalize(getPlayerName(item)) === normalize(playerName));

  return player?.club || player?.clubFavori || player?.favoriteTeam || player?.team || "";
}

function findProno(playerName, match, pronos) {
  const id = String(getId(match) || "").trim();
  const home = normalize(getHome(match));
  const away = normalize(getAway(match));

  return pronos.find((prono) => {
    const samePlayer = normalize(getPronoPlayer(prono)) === normalize(playerName);
    if (!samePlayer) return false;

    const pronoId = String(getPronoMatchId(prono) || "").trim();

    if (id && pronoId && id === pronoId) return true;

    const pronoHome = normalize(getHome(prono));
    const pronoAway = normalize(getAway(prono));

    return pronoHome === home && pronoAway === away;
  });
}

function calculateRanking() {
  const matches = collectMatches();
  const pronos = collectPronos();
  const players = collectPlayers(pronos);

  const ranking = players.map((playerName) => ({
    joueur: playerName,
    name: playerName,
    player: playerName,
    clubFavori: getFavoriteTeam(playerName),
    pts: 0,
    points: 0,
    exacts: 0,
    scoresExacts: 0,
    bonsResultats: 0,
    joues: 0,
  }));

  matches.forEach((match) => {
    const scoreDom = getScoreHome(match);
    const scoreExt = getScoreAway(match);

    if (scoreDom === null || scoreExt === null || scoreDom === "" || scoreExt === "") return;

    const actualResult = resultFromScores(scoreDom, scoreExt);
    const bonus = isBonusMatch(match);

    ranking.forEach((player) => {
      const prono = findProno(player.joueur, match, pronos);
      if (!prono) return;

      const pronoHome = getPronoHomeScore(prono);
      const pronoAway = getPronoAwayScore(prono);
      const pronoResult = getPronoResult(prono);

      if (!pronoResult) return;

      const exact =
        pronoHome !== null &&
        pronoAway !== null &&
        Number(pronoHome) === Number(scoreDom) &&
        Number(pronoAway) === Number(scoreExt);

      const goodResult = pronoResult === actualResult;

      let earned = 0;
      let exactCount = 0;

      const fav = normalize(player.clubFavori);
      const isFavMatch =
        fav &&
        (normalize(getHome(match)).includes(fav) || normalize(getAway(match)).includes(fav));

      if (bonus) {
        if (exact) {
          earned = 3;
          exactCount = 1;
        } else if (goodResult) {
          earned = 2;
        }
      } else if (isFavMatch) {
        if (exact) {
          earned = 2;
          exactCount = 1;
        } else if (goodResult) {
          earned = 1;
        }
      } else if (goodResult) {
        earned = 1;
      }

      player.pts += earned;
      player.points = player.pts;
      player.exacts += exactCount;
      player.scoresExacts = player.exacts;
      if (goodResult) player.bonsResultats += 1;
      player.joues += 1;
    });
  });

  ranking.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;
    return a.joueur.localeCompare(b.joueur);
  });

  return ranking.map((player, index) => ({
    ...player,
    rang: index + 1,
    position: index + 1,
  }));
}

function buildGazette(ranking) {
  if (!ranking.length) {
    return "Aucun classement disponible.";
  }

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);
  const bestExact = [...ranking].sort((a, b) => b.exacts - a.exacts)[0];

  return [
    "📰 LA GAZETTE DES PRONOS",
    "",
    `👑 Leader : ${leader.joueur} avec ${leader.pts} point(s).`,
    "",
    "🏆 Podium :",
    ...podium.map((p) => `${p.rang}. ${p.joueur} — ${p.pts} pts / ${p.exacts} exact(s)`),
    "",
    `🎯 Scores exacts : ${bestExact.joueur} domine avec ${bestExact.exacts} exact(s).`,
    "",
    "📊 Classement complet :",
    ...ranking.map((p) => `${p.rang}. ${p.joueur} — ${p.pts} pts`),
  ].join("\n");
}

export default function AdminCleanPage() {
  const [importMode, setImportMode] = useState("replace");
  const [importMessage, setImportMessage] = useState("");
  const [preview, setPreview] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("all");
  const [journeeFilter, setJourneeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [inputs, setInputs] = useState({});
  const [scoreMessage, setScoreMessage] = useState("");
  const [ranking, setRanking] = useState(() => readJson("classement", []));
  const [gazette, setGazette] = useState(() => readJson("gazetteText", "") || "");

  const matches = useMemo(() => collectMatches(), [refresh]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const bonus = isBonusMatch(match);

      if (filter === "ligue1" && bonus) return false;
      if (filter === "bonus" && !bonus) return false;

      if (journeeFilter) {
        const j = String(getRound(match) || "");
        if (j !== String(journeeFilter)) return false;
      }

      if (search.trim()) {
        const text = normalize(`${getHome(match)} ${getAway(match)} ${getChampionnat(match)}`);
        if (!text.includes(normalize(search))) return false;
      }

      return true;
    });
  }, [matches, filter, journeeFilter, search]);

  async function handleExcelImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportMessage("");
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

      if (!rows.length) throw new Error("Le fichier Excel est vide.");

      const importedMatches = rows
        .map((row, index) => {
          const journee =
            getValue(row, ["journée", "journee", "j", "round", "matchday", "numero journee"]) || 1;

          const date = formatExcelDate(getValue(row, ["date", "jour", "match date"]));
          const heure = formatExcelHour(getValue(row, ["heure", "horaire", "time", "kickoff"]));

          const domicile = String(
            getValue(row, ["domicile", "equipe domicile", "équipe domicile", "home", "home team"])
          ).trim();

          const exterieur = String(
            getValue(row, ["exterieur", "extérieur", "equipe exterieur", "équipe extérieur", "away", "away team"])
          ).trim();

          const championnat =
            String(getValue(row, ["championnat", "competition", "compétition", "ligue", "league"])).trim() ||
            "Ligue 1";

          const type =
            String(getValue(row, ["type", "bonus", "categorie", "catégorie"])).trim() ||
            (championnat === "Ligue 1" ? "LIGUE1" : "BONUS");

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

      if (!importedMatches.length) {
        throw new Error("Aucun match reconnu. Vérifie les colonnes : Journée, Date, Heure, Domicile, Extérieur.");
      }

      const total = saveImportedMatches(importedMatches, importMode);

      setPreview(importedMatches.slice(0, 8));
      setImportMessage(`${importedMatches.length} match(s) importé(s). Total enregistré : ${total}.`);
      setRefresh((value) => value + 1);

      alert(`${importedMatches.length} match(s) importé(s) ✅`);
    } catch (error) {
      console.error(error);
      setImportMessage(error.message);
      alert(error.message);
    } finally {
      event.target.value = "";
    }
  }

  function getInputValue(match, side) {
    const key = matchKey(match);
    const current = inputs[key];

    if (current && current[side] !== undefined) return current[side];

    return side === "home" ? getScoreHome(match) : getScoreAway(match);
  }

  function updateInput(match, side, value) {
    const key = matchKey(match);

    setInputs((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [side]: value,
      },
    }));
  }

  function handleSaveScore(match) {
    const homeValue = getInputValue(match, "home");
    const awayValue = getInputValue(match, "away");

    if (homeValue === "" || awayValue === "") {
      alert("Mets les deux scores avant de valider.");
      return;
    }

    const scoreDom = Number(homeValue);
    const scoreExt = Number(awayValue);

    if (Number.isNaN(scoreDom) || Number.isNaN(scoreExt) || scoreDom < 0 || scoreExt < 0) {
      alert("Score invalide.");
      return;
    }

    const changed = saveScoreEverywhere(match, scoreDom, scoreExt);

    if (changed === 0) {
      alert("Score non enregistré : match non retrouvé.");
      return;
    }

    setScoreMessage(`Score enregistré : ${getHome(match)} ${scoreDom}-${scoreExt} ${getAway(match)}`);
    setRefresh((value) => value + 1);

    alert("Score enregistré ✅");
  }

  function handleClearScore(match) {
    const confirmed = window.confirm(`Remettre ce match à venir ?\n\n${getHome(match)} - ${getAway(match)}`);
    if (!confirmed) return;

    const changed = clearScoreEverywhere(match);

    if (changed === 0) {
      alert("Correction impossible : match non retrouvé.");
      return;
    }

    setScoreMessage(`Score supprimé : ${getHome(match)} - ${getAway(match)}`);
    setRefresh((value) => value + 1);

    alert("Score supprimé ✅");
  }

  function recalculateRanking() {
    const nextRanking = calculateRanking();
    const nextGazette = buildGazette(nextRanking);

    localStorage.setItem("ranking", JSON.stringify(nextRanking));
    localStorage.setItem("classement", JSON.stringify(nextRanking));
    localStorage.setItem("leaderboard", JSON.stringify(nextRanking));
    localStorage.setItem("gazetteText", JSON.stringify(nextGazette));
    localStorage.setItem("gazette", JSON.stringify({ text: nextGazette, updatedAt: new Date().toISOString() }));

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("ranking-updated"));
    window.dispatchEvent(new CustomEvent("gazette-updated"));

    setRanking(nextRanking);
    setGazette(nextGazette);

    alert("Classement + Gazette recalculés ✅");
  }

  return (
    <div className="admin-clean-page">
      <section className="admin-clean-card">
        <div className="admin-clean-head">
          <div>
            <h2>⚙️ Administration</h2>
            <p>Gestion simple : import Excel, scores manuels, classement et Gazette.</p>
          </div>
        </div>
      </section>

      <section className="admin-clean-card">
        <h3>📥 Import Excel des matchs</h3>
        <p>Colonnes conseillées : Journée, Date, Heure, Domicile, Extérieur, Championnat, Type.</p>

        <div className="admin-clean-controls">
          <label>
            Mode import
            <select value={importMode} onChange={(event) => setImportMode(event.target.value)}>
              <option value="replace">Remplacer les matchs</option>
              <option value="append">Ajouter aux matchs existants</option>
            </select>
          </label>

          <label className="admin-clean-file">
            Importer Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} />
          </label>
        </div>

        {importMessage && <p className="admin-clean-message">{importMessage}</p>}

        {preview.length > 0 && (
          <div className="admin-clean-preview">
            {preview.map((match) => (
              <div key={match.id}>
                <strong>J{match.journee}</strong>
                <span>{match.date}</span>
                <span>{match.heure}</span>
                <span>{getHome(match)} - {getAway(match)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-clean-card">
        <div className="admin-clean-head">
          <div>
            <h3>✍️ Scores manuels / corrections</h3>
            <p>Mets ou corrige les scores pour Ligue 1 et bonus.</p>
          </div>

          <button className="admin-clean-secondary" onClick={() => setRefresh((value) => value + 1)}>
            Actualiser
          </button>
        </div>

        <div className="admin-clean-controls">
          <label>
            Type
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Tous</option>
              <option value="ligue1">Ligue 1</option>
              <option value="bonus">Bonus</option>
            </select>
          </label>

          <label>
            Journée
            <input value={journeeFilter} onChange={(event) => setJourneeFilter(event.target.value)} placeholder="1" />
          </label>

          <label>
            Recherche
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lens, PSG..." />
          </label>
        </div>

        {scoreMessage && <p className="admin-clean-message">{scoreMessage}</p>}

        <div className="admin-clean-match-list">
          {filteredMatches.length === 0 && (
            <div className="admin-clean-empty">Aucun match trouvé.</div>
          )}

          {filteredMatches.map((match) => {
            const bonus = isBonusMatch(match);

            return (
              <div className="admin-clean-match" key={matchKey(match)}>
                <div>
                  <div className="admin-clean-tags">
                    <span className={bonus ? "tag-bonus" : "tag-ligue1"}>
                      {bonus ? "BONUS" : "LIGUE 1"}
                    </span>
                    <span>J{getRound(match) || "-"}</span>
                    <span>{getDate(match) || "Date ?"}</span>
                    <span>{getHour(match) || "Heure ?"}</span>
                  </div>

                  <strong>{getHome(match)} - {getAway(match)}</strong>
                  <small>{getChampionnat(match)}</small>
                </div>

                <div className="admin-clean-score-inputs">
                  <input
                    type="number"
                    min="0"
                    value={getInputValue(match, "home")}
                    onChange={(event) => updateInput(match, "home", event.target.value)}
                    placeholder="0"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    min="0"
                    value={getInputValue(match, "away")}
                    onChange={(event) => updateInput(match, "away", event.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="admin-clean-actions">
                  <button onClick={() => handleSaveScore(match)}>Valider / corriger</button>
                  <button className="danger" onClick={() => handleClearScore(match)}>Remettre à venir</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="admin-clean-card">
        <div className="admin-clean-head">
          <div>
            <h3>📊 Classement & Gazette</h3>
            <p>Calcul automatique des points selon les règles du jeu, sans IA.</p>
          </div>

          <button className="admin-clean-primary" onClick={recalculateRanking}>
            Recalculer classement + Gazette
          </button>
        </div>

        {ranking.length > 0 && (
          <div className="admin-clean-ranking">
            {ranking.slice(0, 10).map((player) => (
              <div key={player.joueur}>
                <strong>#{player.rang} {player.joueur}</strong>
                <span>{player.pts} pts — {player.exacts} exact(s)</span>
              </div>
            ))}
          </div>
        )}

        {gazette && (
          <textarea
            className="admin-clean-gazette"
            value={gazette}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        )}
      </section>
    </div>
  );
}
