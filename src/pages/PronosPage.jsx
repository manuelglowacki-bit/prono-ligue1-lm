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

function normalizeJournees(data) {
  if (!Array.isArray(data) || data.length === 0) return DEFAULT_JOURNEES;

  return data.map((j, index) => ({
    id: j.id || `j${index + 1}`,
    number: j.number || index + 1,
    title: j.title || `J${index + 1}`,
    locked: Boolean(j.locked),
    lockAt: j.lockAt || "",
    matches: Array.isArray(j.matches)
      ? j.matches.map((m, i) => ({
          id: m.id || `${j.id || `j${index + 1}`}-m${i + 1}`,
          home: m.home || "",
          away: m.away || "",
          date: m.date || "",
          time: m.time || "",
          status: m.status || "Ouvert"
        }))
      : [],
    bonus: Array.isArray(j.bonus)
      ? j.bonus.slice(0, 3).map((b, i) => ({
          id: b.id || `${j.id || `j${index + 1}`}-b${i + 1}`,
          league: b.league || "Bonus",
          home: b.home || "",
          away: b.away || "",
          date: b.date || "",
          time: b.time || "",
          status: b.status || "Ouvert"
        }))
      : []
  }));
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

    setPronos((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [match.id]: {
          ...((prev[key] || {})[match.id] || {}),
          ...patch
        }
      }
    }));
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
                  <span>{match.home}</span>
                  <small>DOM</small>
                </div>
                <div className="team">
                  <span>{match.away}</span>
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
                      value={prono.homeScore || ""}
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
                      value={prono.awayScore || ""}
                      onChange={(e) =>
                        updateProno(match, {
                          awayScore: e.target.value,
                          result: ""
                        })
                      }
                      placeholder="0"
                    />
                  </div>
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
              <button
                className="match-valid-btn"
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
                    <span>{match.home}</span>
                    <small>DOM</small>
                  </div>
                  <div className="team">
                    <span>{match.away}</span>
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
                        value={prono.homeScore || ""}
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
                        value={prono.awayScore || ""}
                        onChange={(e) =>
                          updateProno(match, {
                            awayScore: e.target.value,
                            result: ""
                          })
                        }
                        placeholder="0"
                      />
                    </div>
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


