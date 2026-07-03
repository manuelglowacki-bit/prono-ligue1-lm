import React, { useEffect, useState } from "react";

const DEADLINE_KEY = "favoriteTeamDeadline";

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

export default function FavoriteDeadlineAdmin() {
  const [draftDeadline, setDraftDeadline] = useState(() => {
    return localStorage.getItem(DEADLINE_KEY) || "";
  });

  const [savedDeadline, setSavedDeadline] = useState(() => {
    return localStorage.getItem(DEADLINE_KEY) || "";
  });

  const [message, setMessage] = useState("Date butoir non modifiee.");

  useEffect(() => {
    function refresh() {
      const value = localStorage.getItem(DEADLINE_KEY) || "";
      setDraftDeadline(value);
      setSavedDeadline(value);
    }

    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function validateDeadline() {
    localStorage.setItem(DEADLINE_KEY, draftDeadline);
    setSavedDeadline(draftDeadline);
    setMessage("Date butoir validee.");
    window.dispatchEvent(new Event("favorite-deadline-updated"));
  }

  function clearDeadline() {
    localStorage.removeItem(DEADLINE_KEY);
    setDraftDeadline("");
    setSavedDeadline("");
    setMessage("Date butoir effacee.");
    window.dispatchEvent(new Event("favorite-deadline-updated"));
  }

  const expired = isDeadlinePassed(savedDeadline);

  return (
    <section className="favorite-deadline-admin">
      <style>{`
        .favorite-deadline-admin {
          margin-bottom: 18px;
          padding: 22px;
          border-radius: 24px;
          background:
            radial-gradient(circle at top left, rgba(255,210,31,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.96), rgba(2,6,23,.96));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 18px 44px rgba(0,0,0,.22);
          color: #f8fafc;
        }

        .favorite-deadline-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }

        .favorite-deadline-title h2 {
          margin: 0;
          font-size: 26px;
          font-weight: 950;
        }

        .favorite-deadline-title p {
          margin: 8px 0 0;
          color: #cbd5e1;
          font-weight: 750;
        }

        .favorite-deadline-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
        }

        .favorite-deadline-input {
          background: #111827;
          color: #f8fafc;
          border: 1px solid rgba(255,210,31,.45);
          border-radius: 16px;
          padding: 13px 15px;
          font-weight: 950;
          outline: none;
        }

        .favorite-deadline-btn {
          border: 1px solid rgba(255,255,255,.14);
          background: rgba(255,255,255,.08);
          color: #f8fafc;
          border-radius: 999px;
          padding: 13px 16px;
          font-weight: 950;
          cursor: pointer;
        }

        .favorite-deadline-btn.green {
          background: #baff00;
          border-color: #baff00;
          color: #07111f;
        }

        .favorite-deadline-btn.red {
          background: rgba(239,68,68,.18);
          color: #fecaca;
          border-color: rgba(239,68,68,.35);
        }

        .favorite-deadline-pill {
          display: inline-flex;
          margin-top: 14px;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(34,197,94,.13);
          border: 1px solid rgba(34,197,94,.30);
          color: #bbf7d0;
          font-weight: 950;
        }

        .favorite-deadline-pill.expired {
          background: rgba(239,68,68,.13);
          border-color: rgba(239,68,68,.30);
          color: #fecaca;
        }

        .favorite-deadline-message {
          margin-top: 10px;
          color: #cbd5e1;
          font-weight: 800;
        }

        @media (max-width: 720px) {
          .favorite-deadline-actions,
          .favorite-deadline-input,
          .favorite-deadline-btn {
            width: 100%;
          }
        }
      `}</style>

      <div className="favorite-deadline-head">
        <div className="favorite-deadline-title">
          <h2>Date butoir club favori</h2>
          <p>Definis jusqu'a quand les joueurs peuvent choisir ou modifier leur equipe favorite.</p>
        </div>

        <div className="favorite-deadline-actions">
          <input
            className="favorite-deadline-input"
            type="datetime-local"
            value={draftDeadline}
            onChange={(e) => setDraftDeadline(e.target.value)}
          />

          <button
            className="favorite-deadline-btn green"
            type="button"
            onClick={validateDeadline}
          >
            Valider date butoir
          </button>

          <button
            className="favorite-deadline-btn red"
            type="button"
            onClick={clearDeadline}
          >
            Effacer
          </button>
        </div>
      </div>

      <div className={`favorite-deadline-pill ${expired ? "expired" : ""}`}>
        {savedDeadline
          ? expired
            ? `Choix equipe favorite bloque depuis le ${formatDeadline(savedDeadline)}`
            : `Choix equipe favorite ouvert jusqu'au ${formatDeadline(savedDeadline)}`
          : "Aucune date butoir : choix encore ouvert"}
      </div>

      <div className="favorite-deadline-message">
        {message}
      </div>
    </section>
  );
}
