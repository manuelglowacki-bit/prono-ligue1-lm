import React, { useState } from "react";
import Pronos from "./pages/Pronos.jsx";

function PlaceholderPage({ title, text }) {
  return (
    <div className="placeholder-page">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("pronos");

  const menu = [
    { id: "accueil", label: "Accueil" },
    { id: "pronos", label: "Pronos" },
    { id: "classement", label: "Classement" },
    { id: "stats", label: "Stats" },
    { id: "gazette", label: "La Gazette" },
    { id: "trophees", label: "Trophées" },
    { id: "profil", label: "Profil" },
    { id: "admin", label: "Admin" }
  ];

  function renderPage() {
    if (page === "pronos") return <Pronos />;

    if (page === "accueil") {
      return (
        <PlaceholderPage
          title="Accueil"
          text="Bienvenue sur Prono Ligue 1 LM. La page pronos est intégrée au site."
        />
      );
    }

    if (page === "classement") {
      return (
        <PlaceholderPage
          title="Classement"
          text="Le classement sera reconnecté ici avec les points des joueurs."
        />
      );
    }

    if (page === "stats") {
      return (
        <PlaceholderPage
          title="Stats"
          text="Les statistiques seront affichées ici."
        />
      );
    }

    if (page === "gazette") {
      return (
        <PlaceholderPage
          title="La Gazette"
          text="Les actus et résumés de la compétition seront ici."
        />
      );
    }

    if (page === "trophees") {
      return (
        <PlaceholderPage
          title="Trophées"
          text="Les trophées et badges seront affichés ici."
        />
      );
    }

    if (page === "profil") {
      return (
        <PlaceholderPage
          title="Profil"
          text="Le profil joueur sera ici."
        />
      );
    }

    if (page === "admin") {
      return (
        <PlaceholderPage
          title="Admin"
          text="L’espace admin sera reconnecté ici."
        />
      );
    }

    return <Pronos />;
  }

  const currentLabel = menu.find((item) => item.id === page)?.label || "Pronos";

  return (
    <div className="app-shell">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #050914;
          color: white;
          font-family: Inter, Arial, sans-serif;
        }

        .app-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 185px 1fr;
          background:
            radial-gradient(circle at top right, rgba(186,255,0,.12), transparent 30%),
            linear-gradient(135deg, #050914 0%, #08111f 55%, #030712 100%);
        }

        .sidebar {
          border-right: 1px solid rgba(255,255,255,.08);
          background: rgba(3, 7, 18, .92);
          padding: 18px;
          position: sticky;
          top: 0;
          height: 100vh;
        }

        .brand {
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(15,23,42,.85);
          border-radius: 18px;
          padding: 16px;
          margin-bottom: 22px;
        }

        .brand strong {
          display: block;
          font-size: 16px;
          font-weight: 950;
          letter-spacing: .04em;
        }

        .brand span {
          display: block;
          margin-top: 4px;
          color: #9fb0ca;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .nav {
          display: grid;
          gap: 8px;
        }

        .nav button {
          border: 0;
          background: transparent;
          color: #9fb0ca;
          text-align: left;
          padding: 13px 14px;
          border-radius: 999px;
          font-weight: 950;
          cursor: pointer;
        }

        .nav button.active {
          background: #baff00;
          color: #06111f;
        }

        .main {
          min-width: 0;
          padding: 18px;
        }

        .page-header {
          background: rgba(15,23,42,.82);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 24px;
          padding: 20px;
          margin-bottom: 18px;
        }

        .page-header small {
          color: #8fb0d8;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .page-header h1 {
          margin: 6px 0 0;
          font-size: 30px;
          font-weight: 950;
        }

        .placeholder-page {
          min-height: 420px;
          background: rgba(15,23,42,.7);
          border: 1px solid rgba(255,255,255,.09);
          border-radius: 24px;
          padding: 24px;
        }

        .placeholder-page h1 {
          margin: 0 0 8px;
          font-size: 32px;
          font-weight: 950;
        }

        .placeholder-page p {
          color: #b6c2d9;
          font-weight: 700;
        }

        .pronos-page {
          color: #ffffff;
          padding: 0;
        }

        .prono-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 22px;
        }

        .prono-title h1 {
          margin: 0;
          font-size: 34px;
          font-weight: 950;
        }

        .prono-title p {
          margin: 8px 0 0;
          color: #b6c2d9;
          font-weight: 700;
        }

        .prono-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .prono-select,
        .prono-club {
          border: 1px solid rgba(255,255,255,.18);
          background: #0f172a;
          color: white;
          border-radius: 14px;
          padding: 12px 14px;
          font-weight: 900;
          outline: none;
        }

        .prono-club {
          border-color: rgba(190,255,0,.45);
        }

        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 24px 0 14px;
        }

        .section-head h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 950;
        }

        .section-head span {
          color: #b6c2d9;
          font-weight: 900;
        }

        .match-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .match-card {
          background: linear-gradient(180deg, #142033, #0b1220);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 16px 38px rgba(0,0,0,.28);
        }

        .match-card.favorite {
          border-color: rgba(190,255,0,.8);
          box-shadow: 0 0 0 1px rgba(190,255,0,.2), 0 16px 38px rgba(0,0,0,.28);
        }

        .match-card.selected {
          border-color: rgba(34,197,94,.9);
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
          background: rgba(190,255,0,.14);
          color: #c6ff00;
          border: 1px solid rgba(190,255,0,.28);
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

        .score-box {
          background: rgba(190,255,0,.08);
          border: 1px solid rgba(190,255,0,.22);
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
          font-weight: 700;
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

        @media (max-width: 760px) {
          .app-shell {
            grid-template-columns: 1fr;
          }

          .sidebar {
            position: relative;
            height: auto;
          }

          .nav {
            grid-template-columns: repeat(2, 1fr);
          }

          .nav button {
            text-align: center;
          }

          .main {
            padding: 12px;
          }

          .prono-top {
            flex-direction: column;
          }

          .prono-actions,
          .prono-select,
          .prono-club {
            width: 100%;
          }

          .match-grid {
            grid-template-columns: 1fr;
          }

          .prono-title h1 {
            font-size: 28px;
          }
        }
      `}</style>

      <aside className="sidebar">
        <div className="brand">
          <strong>PRONO LM</strong>
          <span>Saison 26/27</span>
        </div>

        <nav className="nav">
          {menu.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="page-header">
          <small>Prono Ligue 1 LM</small>
          <h1>{currentLabel}</h1>
        </div>

        {renderPage()}
      </main>
    </div>
  );
}
