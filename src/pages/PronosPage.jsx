import React, { useEffect, useMemo, useState } from "react";

const PRONOS_KEY = "prono_ligue1_lm_pronos";
const FAVORITE_KEY = "favoriteTeam";

/* 
  PAGE PRONO CLEAN
  - 3 matchs par ligne
  - 1/N/2 sur tous les matchs Ligue 1
  - Score exact seulement pour le club favori
  - 3 matchs bonus à la fin
  - 1 seul bonus sélectionnable
*/

const DEFAULT_JOURNEES = [
  {
    id: "j1",
    number: 1,
    title: "Journée 1",
    lockAt: "",
    matches: [
      { id: "j1-m1", home: "RC Lens", away: "OL", date: "Vendredi", time: "20:45" },
      { id: "j1-m2", home: "PSG", away: "Nantes", date: "Samedi", time: "17:00" },
      { id: "j1-m3", home: "OM", away: "Rennes", date: "Samedi", time: "21:00" },
      { id: "j1-m4", home: "LOSC", away: "Nice", date: "Dimanche", time: "15:00" },
      { id: "j1-m5", home: "Monaco", away: "Strasbourg", date: "Dimanche", time: "17:15" },
      { id: "j1-m6", home: "Toulouse", away: "Brest", date: "Dimanche", time: "17:15" },
      { id: "j1-m7", home: "Angers", away: "Metz", date: "Dimanche", time: "17:15" },
      { id: "j1-m8", home: "Le Havre", away: "Auxerre", date: "Dimanche", time: "17:15" },
      { id: "j1-m9", home: "Paris FC", away: "Lorient", date: "Dimanche", time: "20:45" },
    ],
    bonus: [
      { id: "j1-b1", league: "Premier League", home: "Liverpool", away: "Arsenal", date: "Samedi", time: "18:30" },
      { id: "j1-b2", league: "Liga", home: "Real Madrid", away: "Atlético Madrid", date: "Dimanche", time: "21:00" },
      { id: "j1-b3", league: "Serie A", home: "Inter", away: "Juventus", date: "Dimanche", time: "20:45" },
    ],
  },
];

function readLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getFavoriteTeam() {
  try {
    return (
      localStorage.getItem(FAVORITE_KEY) ||
      localStorage.getItem("clubFavori") ||
      localStorage.getItem("favorite_team") ||
      "RC Lens"
    );
  } catch {
    return "RC Lens";
  }
}

function getImportedJournees() {
  const possibleKeys = [
    "journees",
    "journees_ligue1",
    "ligue1_journees",
    "prono_ligue1_journees",
    "admin_journees",
    "imported_journees",
  ];

  for (const key of possibleKeys) {
    const data = readLocalStorage(key, null);

    if (Array.isArray(data) && data.length > 0) {
      return data;
    }

    if (data?.journees && Array.isArray(data.journees) && data.journees.length > 0) {
      return data.journees;
    }
  }

  return DEFAULT_JOURNEES;
}

function normalizeJournee(journee, index) {
  const number = journee.number || journee.journee || journee.id || index + 1;

  const matches =
    journee.matches ||
    journee.matchs ||
    journee.ligue1 ||
    journee.games ||
    [];

  const bonus =
    journee.bonus ||
    journee.matchsBonus ||
    journee.bonusMatches ||
    [];

  return {
    id: journee.id || `j${number}`,
    number,
    title: journee.title || journee.nom || `Journée ${number}`,
    lockAt: journee.lockAt || journee.deadline || journee.dateBlocage || "",
    matches: matches.map((m, i) => ({
      id: m.id || `j${number}-m${i + 1}`,
      home: m.home || m.domicile || m.teamHome || m.equipe1 || m.club1 || "",
      away: m.away || m.exterieur || m.teamAway || m.equipe2 || m.club2 || "",
      date: m.date || m.day || "",
      time: m.time || m.heure || "",
    })),
    bonus: bonus.map((m, i) => ({
      id: m.id || `j${number}-b${i + 1}`,
      league: m.league || m.competition || m.ligue || "Bonus",
      home: m.home || m.domicile || m.teamHome || m.equipe1 || m.club1 || "",
      away: m.away || m.exterieur || m.teamAway || m.equipe2 || m.club2 || "",
      date: m.date || m.day || "",
      time: m.time || m.heure || "",
    })),
  };
}

function isLocked(lockAt) {
  if (!lockAt) return false;
  const lockDate = new Date(lockAt);
  if (Number.isNaN(lockDate.getTime())) return false;
  return new Date() >= lockDate;
}

export default function Pronostics() {
  const [journees] = useState(() =>
    getImportedJournees().map((j, i) => normalizeJournee(j, i))
  );

  const [selectedJourneeId, setSelectedJourneeId] = useState(() => {
    const first = getImportedJournees()[0];
    return first?.id || "j1";
  });

  const [favoriteTeam, setFavoriteTeam] = useState(getFavoriteTeam);
  const [pronos, setPronos] = useState(() => readLocalStorage(PRONOS_KEY, {}));

  const selectedJournee = useMemo(() => {
    return journees.find((j) => j.id === selectedJourneeId) || journees[0];
  }, [journees, selectedJourneeId]);

  useEffect(() => {
    writeLocalStorage(PRONOS_KEY, pronos);
  }, [pronos]);

  const journeeKey = selectedJournee?.id || "j1";
  const currentPronos = pronos[journeeKey] || {
    matches: {},
    selectedBonusId: "",
    bonus: {},
  };

  function updateMatchProno(matchId, patch) {
    if (isLocked(selectedJournee.lockAt)) return;

    setPronos((prev) => {
      const oldJournee = prev[journeeKey] || {
        matches: {},
        selectedBonusId: "",
        bonus: {},
      };

      return {
        ...prev,
        [journeeKey]: {
          ...oldJournee,
          matches: {
            ...oldJournee.matches,
            [matchId]: {
              ...(oldJournee.matches?.[matchId] || {}),
              ...patch,
            },
          },
        },
      };
    });
  }

  function selectBonus(bonusId) {
    if (isLocked(selectedJournee.lockAt)) return;

    setPronos((prev) => {
      const oldJournee = prev[journeeKey] || {
        matches: {},
        selectedBonusId: "",
        bonus: {},
      };

      return {
        ...prev,
        [journeeKey]: {
          ...oldJournee,
          selectedBonusId: bonusId,
        },
      };
    });
  }

  function updateBonusProno(bonusId, patch) {
    if (isLocked(selectedJournee.lockAt)) return;

    setPronos((prev) => {
      const oldJournee = prev[journeeKey] || {
        matches: {},
        selectedBonusId: "",
        bonus: {},
      };

      return {
        ...prev,
        [journeeKey]: {
          ...oldJournee,
          bonus: {
            ...oldJournee.bonus,
            [bonusId]: {
              ...(oldJournee.bonus?.[bonusId] || {}),
              ...patch,
            },
          },
        },
      };
    });
  }

  function isFavoriteMatch(match) {
    return match.home === favoriteTeam || match.away === favoriteTeam;
  }

  const locked = isLocked(selectedJournee?.lockAt);

  return (
    <div className="prono-page">
      <style>{`
        .prono-page {
          min-height: 100vh;
          padding: 26px;
          color: #f8fafc;
          background:
            radial-gradient(circle at top left, rgba(255, 215, 0, 0.16), transparent 34%),
            linear-gradient(135deg, #07111f 0%, #101827 48%, #050814 100%);
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .prono-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 22px;
        }

        .prono-kicker {
          color: #facc15;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: .12em;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .prono-title {
          font-size: 34px;
          line-height: 1;
          margin: 0;
          font-weight: 950;
        }

        .prono-subtitle {
          margin: 9px 0 0;
          color: #cbd5e1;
          font-size: 15px;
        }

        .prono-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .prono-select,
        .favorite-input {
          background: rgba(15, 23, 42, .86);
          border: 1px solid rgba(250, 204, 21, .28);
          color: #f8fafc;
          border-radius: 14px;
          padding: 12px 14px;
          outline: none;
          font-weight: 800;
        }

        .favorite-input {
          width: 155px;
        }

        .status-pill {
          border-radius: 999px;
          padding: 11px 14px;
          font-weight: 900;
          font-size: 13px;
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.08);
        }

        .status-pill.locked {
          color: #fecaca;
          border-color: rgba(248,113,113,.3);
          background: rgba(127,29,29,.32);
        }

        .status-pill.open {
          color: #bbf7d0;
          border-color: rgba(34,197,94,.28);
          background: rgba(20,83,45,.32);
        }

        .rules-card {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 22px;
        }

        .rule-box {
          background: rgba(15, 23, 42, .68);
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 14px 38px rgba(0,0,0,.22);
        }

        .rule-box strong {
          display: block;
          color: #facc15;
          margin-bottom: 5px;
        }

        .rule-box span {
          color: #cbd5e1;
          font-size: 13px;
        }

        .section-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 26px 0 14px;
        }

        .section-title h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 950;
        }

        .section-title small {
          color: #94a3b8;
          font-weight: 700;
        }

        .matches-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .match-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, rgba(30, 41, 59, .9), rgba(15, 23, 42, .92));
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 18px 46px rgba(0,0,0,.28);
        }

        .match-card.favorite {
          border-color: rgba(250, 204, 21, .58);
          box-shadow: 0 0 0 1px rgba(250,204,21,.12), 0 18px 46px rgba(0,0,0,.28);
        }

        .match-card.bonus-selected {
          border-color: rgba(34,197,94,.65);
        }

        .match-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 800;
        }

        .badge {
          border-radius: 999px;
          padding: 6px 9px;
          background: rgba(250, 204, 21, .13);
          color: #fde68a;
          font-size: 12px;
          font-weight: 950;
        }

        .bonus-league {
          background: rgba(59, 130, 246, .16);
          color: #bfdbfe;
        }

        .teams {
          display: grid;
          gap: 8px;
          margin-bottom: 15px;
        }

        .team-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 17px;
          font-weight: 950;
        }

        .team-name {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .versus {
          color: #64748b;
          font-size: 12px;
          font-weight: 950;
        }

        .pick-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 13px;
        }

        .pick-btn {
          border: 1px solid rgba(255,255,255,.11);
          background: rgba(255,255,255,.07);
          color: #e2e8f0;
          border-radius: 13px;
          padding: 11px 0;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
          transition: .15s ease;
        }

        .pick-btn:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,.12);
        }

        .pick-btn.active {
          background: #facc15;
          color: #111827;
          border-color: #facc15;
        }

        .exact-box {
          margin-top: 8px;
          border-radius: 16px;
          background: rgba(250, 204, 21, .09);
          border: 1px solid rgba(250, 204, 21, .2);
          padding: 12px;
        }

        .exact-label {
          color: #fde68a;
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
          width: 54px;
          text-align: center;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(15, 23, 42, .85);
          color: #f8fafc;
          padding: 10px 6px;
          font-size: 16px;
          font-weight: 950;
          outline: none;
        }

        .score-separator {
          font-weight: 950;
          color: #facc15;
        }

        .muted-info {
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.35;
          margin-top: 9px;
        }

        .bonus-select-btn {
          width: 100%;
          border: 1px solid rgba(34,197,94,.25);
          background: rgba(34,197,94,.12);
          color: #bbf7d0;
          border-radius: 14px;
          padding: 11px;
          font-weight: 950;
          cursor: pointer;
          margin-bottom: 12px;
        }

        .bonus-select-btn.active {
          background: #22c55e;
          color: #052e16;
        }

        .disabled {
          pointer-events: none;
          opacity: .55;
        }

        .empty-card {
          background: rgba(15, 23, 42, .72);
          border: 1px dashed rgba(255,255,255,.18);
          border-radius: 20px;
          padding: 22px;
          color: #cbd5e1;
        }

        @media (max-width: 1100px) {
          .matches-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rules-card {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .prono-page {
            padding: 16px;
          }

          .prono-header {
            flex-direction: column;
          }

          .prono-toolbar {
            width: 100%;
            justify-content: stretch;
          }

          .prono-select,
          .favorite-input,
          .status-pill {
            width: 100%;
          }

          .matches-grid {
            grid-template-columns: 1fr;
          }

          .prono-title {
            font-size: 28px;
          }
        }
      `}</style>

      <div className="prono-header">
        <div>
          <div className="prono-kicker">Prono Ligue 1 LM</div>
          <h1 className="prono-title">Page Pronostics</h1>
          <p className="prono-subtitle">
            Choisis ton 1/N/2, ton score exact sur ton club favori, puis ton match bonus.
          </p>
        </div>

        <div className="prono-toolbar">
          <select
            className="prono-select"
            value={selectedJournee?.id}
            onChange={(e) => setSelectedJourneeId(e.target.value)}
          >
            {journees.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title || `Journée ${j.number}`}
              </option>
            ))}
          </select>

          <input
            className="favorite-input"
            value={favoriteTeam}
            onChange={(e) => {
              setFavoriteTeam(e.target.value);
              try {
                localStorage.setItem(FAVORITE_KEY, e.target.value);
              } catch {
                // ignore
              }
            }}
            placeholder="Club favori"
          />

          <div className={`status-pill ${locked ? "locked" : "open"}`}>
            {locked ? "Pronostics bloqués" : "Pronostics ouverts"}
          </div>
        </div>
      </div>

      <div className="rules-card">
        <div className="rule-box">
          <strong>Ligue 1 classique</strong>
          <span>1/N/2 correct = 1 point. Faux = 0 point.</span>
        </div>

        <div className="rule-box">
          <strong>Club favori</strong>
          <span>Score exact = 2 points. Résultat correct = 1 point.</span>
        </div>

        <div className="rule-box">
          <strong>Match bonus</strong>
          <span>1 seul choix. Score exact = 3 points. Résultat correct = 2 points.</span>
        </div>
      </div>

      <div className="section-title">
        <h2>{selectedJournee?.title || "Journée"}</h2>
        <small>{selectedJournee?.matches?.length || 0} matchs Ligue 1</small>
      </div>

      {selectedJournee?.matches?.length > 0 ? (
        <div className={`matches-grid ${locked ? "disabled" : ""}`}>
          {selectedJournee.matches.map((match) => {
            const prono = currentPronos.matches?.[match.id] || {};
            const favorite = isFavoriteMatch(match);

            return (
              <div
                key={match.id}
                className={`match-card ${favorite ? "favorite" : ""}`}
              >
                <div className="match-top">
                  <span>
                    {match.date || "Date à définir"} {match.time ? `• ${match.time}` : ""}
                  </span>
                  {favorite && <span className="badge">Club favori</span>}
                </div>

                <div className="teams">
                  <div className="team-line">
                    <span className="team-name">{match.home}</span>
                    <span className="versus">DOM</span>
                  </div>

                  <div className="team-line">
                    <span className="team-name">{match.away}</span>
                    <span className="versus">EXT</span>
                  </div>
                </div>

                <div className="pick-row">
                  {["1", "N", "2"].map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={`pick-btn ${prono.result === choice ? "active" : ""}`}
                      onClick={() => updateMatchProno(match.id, { result: choice })}
                    >
                      {choice}
                    </button>
                  ))}
                </div>

                {favorite ? (
                  <div className="exact-box">
                    <div className="exact-label">Score exact club favori</div>

                    <div className="score-inputs">
                      <input
                        type="number"
                        min="0"
                        value={prono.homeScore ?? ""}
                        onChange={(e) =>
                          updateMatchProno(match.id, { homeScore: e.target.value })
                        }
                        placeholder="0"
                      />
                      <span className="score-separator">-</span>
                      <input
                        type="number"
                        min="0"
                        value={prono.awayScore ?? ""}
                        onChange={(e) =>
                          updateMatchProno(match.id, { awayScore: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="muted-info">
                      Le score exact est disponible car ce match concerne ton club favori.
                    </div>
                  </div>
                ) : (
                  <div className="muted-info">
                    Score exact masqué : uniquement sur le club favori.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-card">
          Aucun match importé pour cette journée.
        </div>
      )}

      <div className="section-title">
        <h2>Matchs bonus</h2>
        <small>Choisis 1 seul match bonus</small>
      </div>

      {selectedJournee?.bonus?.length > 0 ? (
        <div className={`matches-grid ${locked ? "disabled" : ""}`}>
          {selectedJournee.bonus.slice(0, 3).map((bonus) => {
            const selected = currentPronos.selectedBonusId === bonus.id;
            const prono = currentPronos.bonus?.[bonus.id] || {};

            return (
              <div
                key={bonus.id}
                className={`match-card ${selected ? "bonus-selected" : ""}`}
              >
                <div className="match-top">
                  <span>
                    {bonus.date || "Date à définir"} {bonus.time ? `• ${bonus.time}` : ""}
                  </span>
                  <span className="badge bonus-league">{bonus.league}</span>
                </div>

                <button
                  type="button"
                  className={`bonus-select-btn ${selected ? "active" : ""}`}
                  onClick={() => selectBonus(bonus.id)}
                >
                  {selected ? "Bonus sélectionné" : "Choisir ce bonus"}
                </button>

                <div className="teams">
                  <div className="team-line">
                    <span className="team-name">{bonus.home}</span>
                    <span className="versus">DOM</span>
                  </div>

                  <div className="team-line">
                    <span className="team-name">{bonus.away}</span>
                    <span className="versus">EXT</span>
                  </div>
                </div>

                <div className="pick-row">
                  {["1", "N", "2"].map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={`pick-btn ${prono.result === choice ? "active" : ""}`}
                      onClick={() => {
                        selectBonus(bonus.id);
                        updateBonusProno(bonus.id, { result: choice });
                      }}
                    >
                      {choice}
                    </button>
                  ))}
                </div>

                {selected && (
                  <div className="exact-box">
                    <div className="exact-label">Score exact bonus</div>

                    <div className="score-inputs">
                      <input
                        type="number"
                        min="0"
                        value={prono.homeScore ?? ""}
                        onChange={(e) =>
                          updateBonusProno(bonus.id, { homeScore: e.target.value })
                        }
                        placeholder="0"
                      />
                      <span className="score-separator">-</span>
                      <input
                        type="number"
                        min="0"
                        value={prono.awayScore ?? ""}
                        onChange={(e) =>
                          updateBonusProno(bonus.id, { awayScore: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>

                    <div className="muted-info">
                      Score exact bonus = 3 points si bon score, 2 points si bon résultat.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-card">
          Aucun match bonus renseigné pour cette journée.
        </div>
      )}
    </div>
  );
}