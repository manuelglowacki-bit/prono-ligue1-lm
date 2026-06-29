import React, { useEffect, useState } from "react";

const MATCHS_LIGUE_1 = [
  ["RC Lens", "OL", "Vendredi", "20:45"],
  ["PSG", "Nantes", "Samedi", "17:00"],
  ["OM", "Rennes", "Samedi", "21:00"],
  ["LOSC", "Nice", "Dimanche", "15:00"],
  ["Monaco", "Strasbourg", "Dimanche", "17:15"],
  ["Toulouse", "Brest", "Dimanche", "17:15"],
  ["Angers", "Metz", "Dimanche", "17:15"],
  ["Le Havre", "Auxerre", "Dimanche", "17:15"],
  ["Paris FC", "Lorient", "Dimanche", "20:45"]
];

const MATCHS_BONUS = [
  ["Premier League", "Liverpool", "Arsenal", "Samedi", "18:30"],
  ["Liga", "Real Madrid", "Atlético Madrid", "Dimanche", "21:00"],
  ["Serie A", "Inter", "Juventus", "Dimanche", "20:45"]
];

const STORAGE_KEY = "prono_ligue1_lm_page_prono";

export default function App() {
  const [clubFavori, setClubFavori] = useState(() => {
    return localStorage.getItem("favoriteTeam") || "RC Lens";
  });

  const [pronos, setPronos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  });

  const [bonusChoisi, setBonusChoisi] = useState(() => {
    return localStorage.getItem("bonusChoisi") || "";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pronos));
  }, [pronos]);

  useEffect(() => {
    localStorage.setItem("favoriteTeam", clubFavori);
  }, [clubFavori]);

  useEffect(() => {
    localStorage.setItem("bonusChoisi", bonusChoisi);
  }, [bonusChoisi]);

  function updateProno(id, data) {
    setPronos((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        ...data
      }
    }));
  }

  function resetPronos() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("bonusChoisi");
    setPronos({});
    setBonusChoisi("");
  }

  return (
    <div className="page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #07111f;
          font-family: Inter, Arial, sans-serif;
        }

        .page {
          min-height: 100vh;
          padding: 28px;
          color: #f8fafc;
          background:
            radial-gradient(circle at top left, rgba(250, 204, 21, 0.18), transparent 32%),
            linear-gradient(135deg, #07111f 0%, #101827 50%, #050814 100%);
        }

        .top {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          margin-bottom: 22px;
        }

        .kicker {
          color: #facc15;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        h1 {
          margin: 0;
          font-size: 36px;
          line-height: 1;
          font-weight: 950;
        }

        .subtitle {
          color: #cbd5e1;
          margin-top: 10px;
          font-size: 15px;
        }

        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .input,
        .button {
          border-radius: 14px;
          border: 1px solid rgba(250, 204, 21, 0.35);
          background: rgba(15, 23, 42, 0.85);
          color: #f8fafc;
          padding: 12px 14px;
          font-weight: 900;
          outline: none;
        }

        .button {
          cursor: pointer;
        }

        .button.gold {
          background: #facc15;
          color: #111827;
          border-color: #facc15;
        }

        .rules {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .rule {
          background: rgba(15, 23, 42, 0.72);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 18px;
          padding: 15px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.24);
        }

        .rule strong {
          color: #facc15;
          display: block;
          margin-bottom: 5px;
        }

        .rule span {
          color: #cbd5e1;
          font-size: 13px;
        }

        .section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 28px 0 14px;
        }

        .section h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 950;
        }

        .section small {
          color: #94a3b8;
          font-weight: 800;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .card {
          background: linear-gradient(180deg, rgba(30,41,59,0.94), rgba(15,23,42,0.96));
          border: 1px solid rgba(255,255,255,0.11);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 18px 46px rgba(0,0,0,0.28);
        }

        .card.favorite {
          border-color: rgba(250,204,21,0.7);
          box-shadow: 0 0 0 1px rgba(250,204,21,0.18), 0 18px 46px rgba(0,0,0,0.28);
        }

        .card.bonus-selected {
          border-color: rgba(34,197,94,0.72);
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 15px;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 900;
        }

        .badge {
          padding: 6px 9px;
          border-radius: 999px;
          background: rgba(250,204,21,0.14);
          color: #fde68a;
          font-size: 12px;
          font-weight: 950;
        }

        .badge.green {
          background: rgba(34,197,94,0.16);
          color: #bbf7d0;
        }

        .teams {
          display: grid;
          gap: 8px;
          margin-bottom: 15px;
        }

        .team {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          font-size: 17px;
          font-weight: 950;
        }

        .team span:last-child {
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
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.07);
          color: #e2e8f0;
          border-radius: 13px;
          padding: 11px 0;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
        }

        .choice.active {
          background: #facc15;
          border-color: #facc15;
          color: #111827;
        }

        .score-box {
          margin-top: 9px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(250,204,21,0.22);
          background: rgba(250,204,21,0.09);
        }

        .score-title {
          color: #fde68a;
          font-size: 12px;
          font-weight: 950;
          margin-bottom: 9px;
        }

        .score-inputs {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .score-inputs input {
          width: 56px;
          text-align: center;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(15,23,42,0.9);
          color: #f8fafc;
          padding: 10px 6px;
          font-size: 16px;
          font-weight: 950;
          outline: none;
        }

        .muted {
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.35;
          margin-top: 9px;
        }

        .bonus-button {
          width: 100%;
          border: 1px solid rgba(34,197,94,0.28);
          background: rgba(34,197,94,0.13);
          color: #bbf7d0;
          border-radius: 14px;
          padding: 11px;
          font-weight: 950;
          cursor: pointer;
          margin-bottom: 13px;
        }

        .bonus-button.active {
          background: #22c55e;
          color: #052e16;
        }

        @media (max-width: 1100px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .rules {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .page {
            padding: 16px;
          }

          .top {
            flex-direction: column;
          }

          .actions,
          .input,
          .button {
            width: 100%;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          h1 {
            font-size: 29px;
          }
        }
      `}</style>

      <div className="top">
        <div>
          <div className="kicker">Prono Ligue 1 LM</div>
          <h1>Page Pronostics</h1>
          <div className="subtitle">
            3 matchs par ligne, 1/N/2, score exact sur ton club favori, puis les 3 matchs bonus à la fin.
          </div>
        </div>

        <div className="actions">
          <input
            className="input"
            value={clubFavori}
            onChange={(e) => setClubFavori(e.target.value)}
            placeholder="Club favori"
          />

          <button className="button gold" onClick={resetPronos}>
            Réinitialiser
          </button>
        </div>
      </div>

      <div className="rules">
        <div className="rule">
          <strong>Ligue 1 classique</strong>
          <span>1/N/2 correct = 1 point. Faux = 0.</span>
        </div>

        <div className="rule">
          <strong>Club favori</strong>
          <span>Score exact = 2 points. Résultat correct = 1 point.</span>
        </div>

        <div className="rule">
          <strong>Match bonus</strong>
          <span>1 seul choix. Score exact = 3 points. Résultat correct = 2 points.</span>
        </div>
      </div>

      <div className="section">
        <h2>Journée 1</h2>
        <small>9 matchs Ligue 1</small>
      </div>

      <div className="grid">
        {MATCHS_LIGUE_1.map(([home, away, day, hour], index) => {
          const id = `match-${index}`;
          const prono = pronos[id] || {};
          const isFavorite = home.toLowerCase() === clubFavori.toLowerCase() || away.toLowerCase() === clubFavori.toLowerCase();

          return (
            <div key={id} className={`card ${isFavorite ? "favorite" : ""}`}>
              <div className="card-top">
                <span>{day} • {hour}</span>
                {isFavorite && <span className="badge">Club favori</span>}
              </div>

              <div className="teams">
                <div className="team">
                  <strong>{home}</strong>
                  <span>DOM</span>
                </div>

                <div className="team">
                  <strong>{away}</strong>
                  <span>EXT</span>
                </div>
              </div>

              <div className="choices">
                {["1", "N", "2"].map((choice) => (
                  <button
                    key={choice}
                    className={`choice ${prono.result === choice ? "active" : ""}`}
                    onClick={() => updateProno(id, { result: choice })}
                  >
                    {choice}
                  </button>
                ))}
              </div>

              {isFavorite ? (
                <div className="score-box">
                  <div className="score-title">Score exact club favori</div>
                  <div className="score-inputs">
                    <input
                      type="number"
                      min="0"
                      value={prono.homeScore || ""}
                      onChange={(e) => updateProno(id, { homeScore: e.target.value })}
                      placeholder="0"
                    />
                    <strong>-</strong>
                    <input
                      type="number"
                      min="0"
                      value={prono.awayScore || ""}
                      onChange={(e) => updateProno(id, { awayScore: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="muted">Score exact disponible uniquement pour ton club favori.</div>
                </div>
              ) : (
                <div className="muted">Score exact masqué : uniquement sur le club favori.</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section">
        <h2>Matchs bonus</h2>
        <small>Choisis 1 seul match</small>
      </div>

      <div className="grid">
        {MATCHS_BONUS.map(([league, home, away, day, hour], index) => {
          const id = `bonus-${index}`;
          const prono = pronos[id] || {};
          const selected = bonusChoisi === id;

          return (
            <div key={id} className={`card ${selected ? "bonus-selected" : ""}`}>
              <div className="card-top">
                <span>{day} • {hour}</span>
                <span className="badge green">{league}</span>
              </div>

              <button
                className={`bonus-button ${selected ? "active" : ""}`}
                onClick={() => setBonusChoisi(id)}
              >
                {selected ? "Bonus sélectionné" : "Choisir ce bonus"}
              </button>

              <div className="teams">
                <div className="team">
                  <strong>{home}</strong>
                  <span>DOM</span>
                </div>

                <div className="team">
                  <strong>{away}</strong>
                  <span>EXT</span>
                </div>
              </div>

              <div className="choices">
                {["1", "N", "2"].map((choice) => (
                  <button
                    key={choice}
                    className={`choice ${prono.result === choice ? "active" : ""}`}
                    onClick={() => {
                      setBonusChoisi(id);
                      updateProno(id, { result: choice });
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
                      onChange={(e) => updateProno(id, { homeScore: e.target.value })}
                      placeholder="0"
                    />
                    <strong>-</strong>
                    <input
                      type="number"
                      min="0"
                      value={prono.awayScore || ""}
                      onChange={(e) => updateProno(id, { awayScore: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="muted">Score exact bonus = 3 points, résultat correct = 2 points.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
