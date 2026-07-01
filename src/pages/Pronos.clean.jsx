import React, { useEffect, useMemo, useState } from "react";

const DEFAULT_MATCHS = [
  { id: "m1", home: "RC Lens", away: "OL", day: "Vendredi", hour: "20:45" },
  { id: "m2", home: "PSG", away: "Nantes", day: "Samedi", hour: "17:00" },
  { id: "m3", home: "OM", away: "Rennes", day: "Samedi", hour: "21:00" },
  { id: "m4", home: "LOSC", away: "Nice", day: "Dimanche", hour: "15:00" },
  { id: "m5", home: "Monaco", away: "Strasbourg", day: "Dimanche", hour: "17:15" },
  { id: "m6", home: "Toulouse", away: "Brest", day: "Dimanche", hour: "17:15" },
  { id: "m7", home: "Angers", away: "Metz", day: "Dimanche", hour: "17:15" },
  { id: "m8", home: "Le Havre", away: "Auxerre", day: "17:15" },
  { id: "m9", home: "Paris FC", away: "Lorient", day: "Dimanche", hour: "20:45" }
];

const DEFAULT_BONUS = [
  { id: "b1", league: "Premier League", home: "Liverpool", away: "Arsenal", day: "Samedi", hour: "18:30" },
  { id: "b2", league: "Liga", home: "Real Madrid", away: "AtlÃƒÂ©tico Madrid", day: "Dimanche", hour: "21:00" },
  { id: "b3", league: "Serie A", home: "Inter", away: "Juventus", day: "Dimanche", hour: "20:45" }
];

const PRONOS_KEY = "prono_lm_clean_pronos";
const BONUS_KEY = "prono_lm_bonus_selected";
const CLUB_KEY = "favoriteTeam";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getImportedData() {
  const keys = [
    "journees",
    "admin_journees",
    "prono_ligue1_journees",
    "ligue1_journees",
    "imported_journees",
    "matchs_ligue1"
  ];

  for (const key of keys) {
    const data = loadJson(key, null);

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];

      const matchs =
        first?.matches ||
        first?.matchs ||
        first?.ligue1 ||
        first?.games ||
        [];

      const bonus =
        first?.bonus ||
        first?.matchsBonus ||
        first?.bonusMatches ||
        [];

      if (Array.isArray(matchs) && matchs.length > 0) {
        return {
          matchs: matchs.map((m, i) => ({
            id: m.id || `m${i + 1}`,
            home: m.home || m.domicile || m.equipe1 || m.club1 || m.teamHome || "",
            away: m.away || m.exterieur || m.equipe2 || m.club2 || m.teamAway || "",
            day: m.day || m.date || m.jour || "",
            hour: m.hour || m.time || m.heure || ""
          })),
          bonus: Array.isArray(bonus) && bonus.length > 0
            ? bonus.map((m, i) => ({
                id: m.id || `b${i + 1}`,
                league: m.league || m.ligue || m.competition || "Bonus",
                home: m.home || m.domicile || m.equipe1 || m.club1 || m.teamHome || "",
                away: m.away || m.exterieur || m.equipe2 || m.club2 || m.teamAway || "",
                day: m.day || m.date || m.jour || "",
                hour: m.hour || m.time || m.heure || ""
              }))
            : DEFAULT_BONUS
        };
      }
    }
  }

  return {
    matchs: DEFAULT_MATCHS,
    bonus: DEFAULT_BONUS
  };
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

export default function Pronos() {
  const [clubFavori, setClubFavori] = useState(() => {
    return localStorage.getItem(CLUB_KEY) || "RC Lens";
  });

  const [pronos, setPronos] = useState(() => loadJson(PRONOS_KEY, {}));

  const [bonusSelected, setBonusSelected] = useState(() => {
    return localStorage.getItem(BONUS_KEY) || "";
  });

  const data = useMemo(() => getImportedData(), []);
  const matchs = data.matchs && data.matchs.length > 0 ? data.matchs : DEFAULT_MATCHS;
  const bonus = data.bonus && data.bonus.length > 0 ? data.bonus.slice(0, 3) : DEFAULT_BONUS;

  useEffect(() => {
    localStorage.setItem(PRONOS_KEY, JSON.stringify(pronos));
  }, [pronos]);

  useEffect(() => {
    localStorage.setItem(CLUB_KEY, clubFavori);
  }, [clubFavori]);

  useEffect(() => {
    localStorage.setItem(BONUS_KEY, bonusSelected);
  }, [bonusSelected]);

  function updateProno(id, patch) {
    setPronos((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...patch
      }
    }));
  }

  function isFavoriteMatch(match) {
    return (
      match.home?.toLowerCase() === clubFavori.toLowerCase() ||
      match.away?.toLowerCase() === clubFavori.toLowerCase()
    );
  }

  return (
    <div className="pronos-page">
      <div className="prono-top">
        <div className="prono-title">
          <h1>Ã°Å¸â€œÂ Mes pronos</h1>
          <p>3 matchs par ligne. Ligue 1 d'abord, puis les 3 bonus ÃƒÂ  la fin.</p>
        </div>

        <div className="prono-actions">
          <select className="prono-select" defaultValue="j1">
            <option value="j1">JournÃƒÂ©e 1</option>
          </select>

          <select
            className="prono-club"
            value={cleanFavoriteClubDisplay(clubFavori)}
            onChange={(e) => setClubFavori(e.target.value)}
          >
            <option>Choisir mon club</option>
            <option>RC Lens</option>
            <option>PSG</option>
            <option>OM</option>
            <option>LOSC</option>
            <option>OL</option>
            <option>Monaco</option>
            <option>Rennes</option>
            <option>Nantes</option>
            <option>Nice</option>
            <option>Strasbourg</option>
          </select>
        </div>
      </div>

      <div className="section-head">
        <h2>Matchs Ligue 1</h2>
        <span>{matchs.length} matchs</span>
      </div>

      <div className="match-grid">
        {matchs.map((match) => {
          const prono = pronos[match.id] || {};
          const favorite = isFavoriteMatch(match);

          return (
            <div key={match.id} className={`match-card ${favorite ? "favorite" : ""}`}>
              <div className="match-meta">
                <span>{match.day || "Date"} Ã¢â‚¬Â¢ {match.hour || "Heure"}</span>
                {favorite && <span className="badge">Club favori</span>}
              </div>

              <div className="teams">
                <div className="team">
                  <span>{match.home}</span>
                  <small>DOM</small>
                </div>
                <div className="team">
                  <span>{match.away}</span>
                  <small>EXT</small>
                </div>
              </div>

              <div className="choices">
                {["1", "N", "2"].map((choice) => (
                  <button
                    key={choice}
                    className={`choice ${prono.result === choice ? "active" : ""}`}
                    onClick={() => updateProno(match.id, { result: choice })}
                  >
                    {choice}
                  </button>
                ))}
              </div>

              {favorite ? (
                <div className="score-box">
                  <div className="score-title">Score exact club favori</div>
                  <div className="score-inputs">
                    <input
                      type="number"
                      min="0"
                      value={prono.homeScore || ""}
                      onChange={(e) => updateProno(match.id, { homeScore: e.target.value })}
                      placeholder="0"
                    />
                    <strong>-</strong>
                    <input
                      type="number"
                      min="0"
                      value={prono.awayScore || ""}
                      onChange={(e) => updateProno(match.id, { awayScore: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              ) : (
                <div className="muted">Score exact uniquement sur ton club favori.</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Les 3 matchs bonus</h2>
        <span>{bonusSelected ? "1/3 choisi" : "0/3"}</span>
      </div>

      <div className="match-grid">
        {bonus.map((match) => {
          const prono = pronos[match.id] || {};
          const selected = bonusSelected === match.id;

          return (
            <div key={match.id} className={`match-card ${selected ? "selected" : ""}`}>
              <div className="match-meta">
                <span>{match.day || "Date"} Ã¢â‚¬Â¢ {match.hour || "Heure"}</span>
                <span className="badge green">{match.league}</span>
              </div>

              <button
                className={`bonus-btn ${selected ? "active" : ""}`}
                onClick={() => {
  const rawJournee =
    (typeof selectedJournee !== "undefined" && selectedJournee
      ? selectedJournee.number || selectedJournee.journee || selectedJournee.id
      : "") ||
    match.journee ||
    localStorage.getItem("selected_prono_journee") ||
    localStorage.getItem("prono_ligue1_lm_selected_journee") ||
    "1";

  const journeeNumber = String(rawJournee).match(/\d+/)?.[0] || "1";

  const bonusId = String(
    match.id ||
    match.matchId ||
    match.match_id ||
    `bonus-${journeeNumber}-${match.home || match.domicile || ""}-${match.away || match.exterieur || ""}`
  );

  const player =
    localStorage.getItem("prono_ligue1_lm_current_player") ||
    localStorage.getItem("currentPlayer") ||
    localStorage.getItem("player") ||
    "Manu";

  const payload = {
    ...match,
    id: bonusId,
    journee: journeeNumber,
    type: match.type || "BONUS",
    selectedBy: player,
    selectedAt: new Date().toISOString()
  };

  setBonusSelected(bonusId);

  localStorage.setItem("prono_lm_bonus_selected", bonusId);
  localStorage.setItem("prono_ligue1_lm_selected_bonus", JSON.stringify(payload));
  localStorage.setItem("prono_ligue1_lm_bonus_selected_home", JSON.stringify(payload));

  try {
    const saved = JSON.parse(localStorage.getItem("prono_ligue1_lm_bonus_choices") || "{}");

    saved[`${player}-J${journeeNumber}`] = bonusId;
    saved[`${player}-${journeeNumber}`] = bonusId;
    saved[`J${journeeNumber}`] = bonusId;
    saved[journeeNumber] = bonusId;

    localStorage.setItem("prono_ligue1_lm_bonus_choices", JSON.stringify(saved));
  } catch {
    localStorage.setItem(
      "prono_ligue1_lm_bonus_choices",
      JSON.stringify({ [`${player}-J${journeeNumber}`]: bonusId })
    );
  }

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("bonus-choice-updated"));
}}
              >
                {selected ? "Bonus sÃƒÂ©lectionnÃƒÂ©" : "Choisir ce bonus"}
              </button>

              <div className="teams">
                <div className="team">
                  <span>{match.home}</span>
                  <small>DOM</small>
                </div>
                <div className="team">
                  <span>{match.away}</span>
                  <small>EXT</small>
                </div>
              </div>

              <div className="choices">
                {["1", "N", "2"].map((choice) => (
                  <button
                    key={choice}
                    className={`choice ${prono.result === choice ? "active" : ""}`}
                    onClick={() => {
                      setBonusSelected(match.id);
                      updateProno(match.id, { result: choice });
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>

              {selected && (
                <div className="score-box">
                  <div className="score-title">Score exact bonus</div>
                  <div className="score-inputs">
                    <input
                      type="number"
                      min="0"
                      value={prono.homeScore || ""}
                      onChange={(e) => updateProno(match.id, { homeScore: e.target.value })}
                      placeholder="0"
                    />
                    <strong>-</strong>
                    <input
                      type="number"
                      min="0"
                      value={prono.awayScore || ""}
                      onChange={(e) => updateProno(match.id, { awayScore: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
