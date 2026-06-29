import React, { useMemo, useState } from "react";
import { CLUB_OPTIONS, isFavoriteClubMatch } from "../utils/clubNames.js";

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
  "bonus"
];

const USER_KEYS = [
  "currentUser",
  "user",
  "authUser",
  "loggedUser",
  "profile",
  "userProfile",
  "pronoUser"
];

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^0+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getHome(match) {
  return (
    match?.domicile ||
    match?.home ||
    match?.equipeDomicile ||
    match?.équipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    match?.clubDomicile ||
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
    match?.clubExterieur ||
    match?.clubExtérieur ||
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

function getLeague(match) {
  return match?.championnat || match?.competition || match?.compétition || match?.league || "Ligue 1";
}

function getMatchId(match) {
  return match?.id || match?.matchId || match?.idMatch || match?.match_id || "";
}

function looksLikeMatch(value) {
  return Boolean(value && typeof value === "object" && getHome(value) && getAway(value));
}

function flattenMatches(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenMatches(item));
  }

  if (typeof value === "object") {
    if (looksLikeMatch(value)) return [value];
    return Object.values(value).flatMap((item) => flattenMatches(item));
  }

  return [];
}

function collectMatches() {
  const all = MATCH_KEYS.flatMap((key) => flattenMatches(readJson(key, [])));
  const seen = new Set();
  const clean = [];

  all.forEach((match) => {
    if (!looksLikeMatch(match)) return;

    const key = matchKey(match);
    if (seen.has(key)) return;

    seen.add(key);
    clean.push(match);
  });

  return clean.sort((a, b) => {
    const roundA = Number(String(getRound(a)).replace(/\D/g, "")) || 999;
    const roundB = Number(String(getRound(b)).replace(/\D/g, "")) || 999;

    if (roundA !== roundB) return roundA - roundB;

    const dateCompare = String(getDate(a)).localeCompare(String(getDate(b)));
    if (dateCompare !== 0) return dateCompare;

    return String(getHour(a)).localeCompare(String(getHour(b)));
  });
}

function matchKey(match) {
  const id = getMatchId(match);
  if (id) return String(id);

  return [
    getRound(match),
    getDate(match),
    getHour(match),
    getHome(match),
    getAway(match),
    getLeague(match)
  ].map(normalize).join("|");
}

function isBonusMatch(match) {
  const type = normalize(match?.type);
  const id = normalize(getMatchId(match));
  const league = normalize(getLeague(match));

  return (
    type.includes("bonus") ||
    id.includes("bonus") ||
    league.includes("premier league") ||
    league.includes("liga") ||
    league.includes("serie a") ||
    league.includes("bundesliga")
  );
}

function getCurrentUser() {
  for (const key of USER_KEYS) {
    const user = readJson(key, null);
    if (user && typeof user === "object") return user;
  }

  return {};
}

function getFavoriteFromObject(value) {
  if (!value || typeof value !== "object") return "";

  return (
    value.clubFavori ||
    value.club ||
    value.favoriteTeam ||
    value.team ||
    value.equipeFavorite ||
    value.équipeFavorite ||
    value.selectedClub ||
    value.favClub ||
    ""
  );
}

function getFavoriteClub(user) {
  const fromUser = getFavoriteFromObject(user);

  if (fromUser) return fromUser;

  const possibleKeys = [
    "clubFavori",
    "favoriteTeam",
    "selectedClub",
    "favClub",
    "favoriteClub"
  ];

  for (const key of possibleKeys) {
    const value = readJson(key, "");
    if (typeof value === "string" && value) return value;
    const inside = getFavoriteFromObject(value);
    if (inside) return inside;
  }

  return "";
}

function getPlayerKey(user) {
  return (
    user?.email ||
    user?.id ||
    user?.uid ||
    user?.name ||
    user?.nom ||
    user?.pseudo ||
    user?.username ||
    "local-player"
  );
}

function getPronosKey(user) {
  return `pronos:${getPlayerKey(user)}`;
}

function readPronos(user) {
  const keys = [
    getPronosKey(user),
    "pronos",
    "pronostics",
    "userPronos"
  ];

  for (const key of keys) {
    const value = readJson(key, null);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }

  return {};
}

function savePronos(user, next) {
  localStorage.setItem(getPronosKey(user), JSON.stringify(next));
  localStorage.setItem("pronos", JSON.stringify(next));
  localStorage.setItem("pronostics", JSON.stringify(next));
  localStorage.setItem("userPronos", JSON.stringify(next));

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("pronos-updated"));
}

function resultFromScore(scoreDom, scoreExt) {
  if (scoreDom === "" || scoreExt === "") return "";

  const d = Number(scoreDom);
  const e = Number(scoreExt);

  if (Number.isNaN(d) || Number.isNaN(e)) return "";

  if (d > e) return "1";
  if (d < e) return "2";
  return "N";
}

function sameRound(match, selectedRound) {
  return normalize(getRound(match)) === normalize(selectedRound);
}

function roundNumber(value) {
  return Number(String(value || "").replace(/\D/g, "")) || 999;
}

function getRounds(matches) {
  const set = new Set();

  matches.forEach((match) => {
    const round = getRound(match);
    if (round !== "" && round !== null && round !== undefined) {
      set.add(String(round).replace(/^0+/, "") || String(round));
    }
  });

  return Array.from(set).sort((a, b) => roundNumber(a) - roundNumber(b));
}

function getBonusChoiceKey(user, selectedRound) {
  return `bonusChoice:${getPlayerKey(user)}:J${normalize(selectedRound)}`;
}

export default function PronosPage() {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");

  const user = useMemo(() => getCurrentUser(), [refresh]);
  const [manualFavorite, setManualFavorite] = useState(() => getFavoriteClub(user));

  const favoriteClub = manualFavorite || getFavoriteClub(user);

  const matches = useMemo(() => collectMatches(), [refresh]);
  const rounds = useMemo(() => getRounds(matches), [matches]);
  const [selectedRound, setSelectedRound] = useState(() => rounds[0] || "1");

  const currentRound = rounds.includes(String(selectedRound)) ? selectedRound : (rounds[0] || selectedRound || "1");

  const pronos = readPronos(user);
  const bonusChoiceKey = getBonusChoiceKey(user, currentRound);
  const selectedBonusId = readJson(bonusChoiceKey, "");

  const roundMatches = matches.filter((match) => sameRound(match, currentRound));
  const ligue1Matches = roundMatches.filter((match) => !isBonusMatch(match));
  const bonusMatches = roundMatches.filter((match) => isBonusMatch(match)).slice(0, 3);

  function updateProno(match, patch) {
    const key = matchKey(match);
    const current = readPronos(user);

    const next = {
      ...current,
      [key]: {
        ...(current[key] || {}),
        matchId: key,
        id: key,
        domicile: getHome(match),
        exterieur: getAway(match),
        journee: getRound(match),
        date: getDate(match),
        heure: getHour(match),
        championnat: getLeague(match),
        type: isBonusMatch(match) ? "BONUS" : "LIGUE1",
        ...patch,
        updatedAt: new Date().toISOString()
      }
    };

    savePronos(user, next);
    setMessage("Prono enregistré ✅");
    setRefresh((value) => value + 1);
  }

  function saveFavoriteClub(value) {
    setManualFavorite(value);
    localStorage.setItem("clubFavori", value);
    localStorage.setItem("favoriteTeam", value);
    localStorage.setItem("selectedClub", value);
    setMessage(`Club favori enregistré : ${value}`);
    setRefresh((v) => v + 1);
  }

  function save1N2(match, value) {
    updateProno(match, {
      mode: "1N2",
      prediction: value,
      resultat: value,
      resultat1N2: value,
      scoreDom: "",
      scoreExt: "",
      homeScore: "",
      awayScore: "",
      scoreExact: ""
    });
  }

  function saveExact(match, side, value) {
    const key = matchKey(match);
    const old = readPronos(user)[key] || {};

    const scoreDom = side === "home" ? value : old.scoreDom ?? "";
    const scoreExt = side === "away" ? value : old.scoreExt ?? "";
    const resultat1N2 = resultFromScore(scoreDom, scoreExt);

    updateProno(match, {
      mode: "SCORE_EXACT",
      scoreDom,
      scoreExt,
      homeScore: scoreDom,
      awayScore: scoreExt,
      scoreExact: scoreDom !== "" && scoreExt !== "" ? `${scoreDom}-${scoreExt}` : "",
      prediction: resultat1N2,
      resultat: resultat1N2,
      resultat1N2
    });
  }

  function chooseBonus(match) {
    localStorage.setItem(bonusChoiceKey, matchKey(match));
    updateProno(match, {
      bonusSelected: true,
      mode: "BONUS"
    });
  }

  function renderMatchCard(match, variant = "ligue1") {
    const key = matchKey(match);
    const prono = pronos[key] || {};
    const bonus = variant === "bonus";
    const favoriteMatch = isFavoriteClubMatch(match, favoriteClub);
    const canExact = favoriteMatch || bonus;
    const isSelectedBonus = selectedBonusId === key;

    return (
      <article className={`lm-prono-card ${bonus ? "bonus-card" : ""}`} key={key}>
        <div className="lm-prono-card-top">
          <div className="lm-prono-tags">
            <span>{bonus ? "BONUS" : "LIGUE 1"}</span>
            <span>J{getRound(match) || "-"}</span>
            <span>{getDate(match) || "Date ?"}</span>
            <span>{getHour(match) || "Heure ?"}</span>
          </div>

          {favoriteMatch && !bonus && (
            <span className="lm-fav-badge">⭐ Club favori</span>
          )}

          {bonus && isSelectedBonus && (
            <span className="lm-fav-badge bonus-selected">✅ Bonus choisi</span>
          )}
        </div>

        <div className="lm-prono-teams">
          <strong>{getHome(match)}</strong>
          <span>vs</span>
          <strong>{getAway(match)}</strong>
        </div>

        {!canExact && (
          <div className="lm-prono-actions">
            <button className={prono.resultat1N2 === "1" ? "active" : ""} onClick={() => save1N2(match, "1")}>
              1
            </button>
            <button className={prono.resultat1N2 === "N" ? "active" : ""} onClick={() => save1N2(match, "N")}>
              N
            </button>
            <button className={prono.resultat1N2 === "2" ? "active" : ""} onClick={() => save1N2(match, "2")}>
              2
            </button>
          </div>
        )}

        {canExact && (
          <div className="lm-score-zone">
            {bonus && !isSelectedBonus && (
              <button className="lm-choose-bonus" onClick={() => chooseBonus(match)}>
                Choisir ce bonus
              </button>
            )}

            {(!bonus || isSelectedBonus) && (
              <>
                <div className="lm-score-inputs">
                  <input
                    type="number"
                    min="0"
                    value={prono.scoreDom ?? ""}
                    onChange={(event) => {
                      if (bonus) chooseBonus(match);
                      saveExact(match, "home", event.target.value);
                    }}
                    placeholder="Dom."
                  />

                  <span>-</span>

                  <input
                    type="number"
                    min="0"
                    value={prono.scoreExt ?? ""}
                    onChange={(event) => {
                      if (bonus) chooseBonus(match);
                      saveExact(match, "away", event.target.value);
                    }}
                    placeholder="Ext."
                  />
                </div>

                <small>
                  {bonus ? "Score exact bonus" : "Score exact club favori"}
                </small>
              </>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <main className="lm-prono-page">
      <section className="lm-prono-hero">
        <div>
          <p className="lm-kicker">Prono Ligue 1 LM</p>
          <h1>📝 Mes pronos</h1>
          <p className="lm-subtitle">
            3 matchs par ligne, Ligue 1 d’abord, puis les 3 bonus à la fin.
          </p>
        </div>

        <button className="lm-refresh" onClick={() => setRefresh((value) => value + 1)}>
          Actualiser
        </button>
      </section>

      <section className="lm-prono-toolbar">
        <label>
          Journée
          <select value={currentRound} onChange={(event) => setSelectedRound(event.target.value)}>
            {rounds.map((round) => (
              <option key={round} value={round}>
                Journée {round}
              </option>
            ))}
          </select>
        </label>

        <label>
          Club favori
          <select value={favoriteClub || ""} onChange={(event) => saveFavoriteClub(event.target.value)}>
            <option value="">Choisir mon club</option>
            {CLUB_OPTIONS.map((club) => (
              <option key={club} value={club}>
                {club}
              </option>
            ))}
          </select>
        </label>

        <div className="lm-toolbar-stat">
          <strong>{matches.length}</strong>
          <span>matchs importés</span>
        </div>
      </section>

      {message && <p className="lm-prono-message">{message}</p>}

      <section className="lm-prono-section">
        <div className="lm-section-head">
          <div>
            <p className="lm-kicker">Journée {currentRound}</p>
            <h2>Matchs Ligue 1</h2>
          </div>
          <span>{ligue1Matches.length} matchs</span>
        </div>

        {ligue1Matches.length === 0 ? (
          <div className="lm-empty-card">
            Aucun match Ligue 1 trouvé pour cette journée.
          </div>
        ) : (
          <div className="lm-prono-grid">
            {ligue1Matches.map((match) => renderMatchCard(match, "ligue1"))}
          </div>
        )}
      </section>

      <section className="lm-prono-section bonus-section">
        <div className="lm-section-head">
          <div>
            <p className="lm-kicker">Bonus admin</p>
            <h2>Les 3 matchs bonus</h2>
          </div>
          <span>{bonusMatches.length}/3</span>
        </div>

        {bonusMatches.length === 0 ? (
          <div className="lm-empty-card">
            Aucun bonus trouvé pour cette journée.
          </div>
        ) : (
          <div className="lm-prono-grid bonus-grid">
            {bonusMatches.map((match) => renderMatchCard(match, "bonus"))}
          </div>
        )}
      </section>
    </main>
  );
}
