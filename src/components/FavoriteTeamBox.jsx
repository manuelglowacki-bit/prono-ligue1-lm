import React, { useEffect, useState } from "react";

const CLUB_KEY = "favoriteTeam";
const VALIDATED_KEY = "favoriteTeamValidated";
const DEADLINE_KEY = "favoriteTeamDeadline";

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

function formatDeadline(value) {
  if (!value) return "Aucune date butoir definie";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date invalide";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isDeadlinePassed(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return new Date() >= date;
}

export default function FavoriteTeamBox() {
  const [club, setClub] = useState(() => {
    return localStorage.getItem(CLUB_KEY) || "RC Lens";
  });

  const [validated, setValidated] = useState(() => {
    return localStorage.getItem(VALIDATED_KEY) === "true";
  });

  const [deadline, setDeadline] = useState(() => {
    return localStorage.getItem(DEADLINE_KEY) || "";
  });

  const expired = isDeadlinePassed(deadline);
  const locked = expired;

  useEffect(() => {
    function refreshDeadline() {
      setDeadline(localStorage.getItem(DEADLINE_KEY) || "");
    }

    window.addEventListener("favorite-deadline-updated", refreshDeadline);
    window.addEventListener("storage", refreshDeadline);

    return () => {
      window.removeEventListener("favorite-deadline-updated", refreshDeadline);
      window.removeEventListener("storage", refreshDeadline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CLUB_KEY, club);
    window.dispatchEvent(new Event("favorite-team-updated"));
  }, [club]);

  useEffect(() => {
    localStorage.setItem(VALIDATED_KEY, validated ? "true" : "false");
    window.dispatchEvent(new Event("favorite-team-updated"));
  }, [validated]);

  function handleClubChange(value) {
    if (locked) return;

    setClub(value);
    setValidated(false);
  }

  function validateClub() {
    if (locked) return;

    setValidated(true);
  }

  function editClub() {
    if (locked) return;

    setValidated(false);
  }

  return (
    <section className="favorite-home-box">
      <style>{`
        .favorite-home-box {
          margin-bottom: 20px;
          padding: 22px;
          border-radius: 24px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.18), transparent 32%),
            linear-gradient(135deg, rgba(15,23,42,.95), rgba(2,6,23,.96));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 18px 44px rgba(0,0,0,.22);
        }

        .favorite-home-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .favorite-home-title h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 950;
          color: #fff;
        }

        .favorite-home-title p {
          margin: 7px 0 0;
          color: #cbd5e1;
          font-weight: 750;
        }

        .favorite-home-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .favorite-home-select {
          min-width: 220px;
          border: 1px solid rgba(186,255,0,.45);
          background: #111827;
          color: white;
          border-radius: 16px;
          padding: 13px 15px;
          font-weight: 950;
          outline: none;
        }

        .favorite-home-select:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .favorite-home-btn {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.08);
          color: #f8fafc;
          border-radius: 999px;
          padding: 13px 16px;
          font-weight: 950;
          cursor: pointer;
        }

        .favorite-home-btn:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .favorite-home-btn.green {
          background: #baff00;
          border-color: #baff00;
          color: #07111f;
        }

        .favorite-home-btn.gold {
          background: #ffd21f;
          border-color: #ffd21f;
          color: #07111f;
        }

        .favorite-home-pill {
          display: inline-flex;
          margin-top: 14px;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(239,68,68,.13);
          border: 1px solid rgba(239,68,68,.28);
          color: #fecaca;
          font-weight: 950;
        }

        .favorite-home-pill.validated {
          background: rgba(34,197,94,.13);
          border-color: rgba(34,197,94,.30);
          color: #bbf7d0;
        }

        .favorite-home-deadline {
          margin-top: 10px;
          color: #cbd5e1;
          font-weight: 800;
          font-size: 14px;
        }

        .favorite-home-deadline.expired {
          color: #fecaca;
        }

        @media (max-width: 720px) {
          .favorite-home-actions,
          .favorite-home-select,
          .favorite-home-btn {
            width: 100%;
          }
        }
      `}</style>

      <div className="favorite-home-head">
        <div className="favorite-home-title">
          <h2>Club favori</h2>
          <p>Choisis ton equipe favorite puis valide ton choix.</p>
        </div>

        <div className="favorite-home-actions">
          <select
            className="favorite-home-select"
            value={club}
            disabled={validated || locked}
            onChange={(e) => handleClubChange(e.target.value)}
          >
            {CLUBS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {validated ? (
            <button
              className="favorite-home-btn gold"
              type="button"
              disabled={locked}
              onClick={editClub}
            >
              Modifier
            </button>
          ) : (
            <button
              className="favorite-home-btn green"
              type="button"
              disabled={locked}
              onClick={validateClub}
            >
              Valider mon equipe
            </button>
          )}
        </div>
      </div>

      <div className={`favorite-home-pill ${validated ? "validated" : ""}`}>
        {validated
          ? `Equipe favorite validee : ${club}`
          : locked
            ? `Choix bloque : ${club}`
            : `Equipe favorite non validee : ${club}`}
      </div>

      <div className={`favorite-home-deadline ${locked ? "expired" : ""}`}>
        {deadline
          ? locked
            ? `Date butoir depassee depuis le ${formatDeadline(deadline)}`
            : `Tu peux choisir ton equipe jusqu'au ${formatDeadline(deadline)}`
          : "Aucune date butoir pour le moment"}
      </div>
    </section>
  );
}