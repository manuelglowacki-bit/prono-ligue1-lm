import React, { useState } from "react";

import HomePage from "./pages/HomePage.jsx";
import PronosPage from "./pages/PronosPage.jsx";
import RankingPage from "./pages/RankingPage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import TrophiesPage from "./pages/TrophiesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

import FavoriteTeamBox from "./components/FavoriteTeamBox.jsx";
import FavoriteDeadlineAdmin from "./components/FavoriteDeadlineAdmin.jsx";

import "./styles/layout.css";

const NAV_ITEMS = [
  { id: "home", label: "Accueil", short: "AC" },
  { id: "pronos", label: "Pronos", short: "PR" },
  { id: "ranking", label: "Classement", short: "CL" },
  { id: "stats", label: "Stats", short: "ST" },
  { id: "trophies", label: "Trophees", short: "TR" },
  { id: "profile", label: "Profil", short: "PF" },
  { id: "admin", label: "Admin", short: "AD" }
];

export default function App() {
  const [activePage, setActivePage] = useState("home");

  function renderPage() {
    switch (activePage) {
      case "home":
        return (
          <>
            <FavoriteTeamBox />
            <HomePage />
          </>
        );

      case "pronos":
        return <PronosPage />;

      case "ranking":
        return <RankingPage />;

      case "stats":
        return <StatsPage />;

      case "trophies":
        return <TrophiesPage />;

      case "profile":
        return <ProfilePage />;

      case "admin":
        return (
          <>
            <FavoriteDeadlineAdmin />
            <AdminPage />
          </>
        );

      default:
        return (
          <>
            <FavoriteTeamBox />
            <HomePage />
          </>
        );
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">LM</div>
          <div className="brand-text">
            <strong>Prono Ligue 1</strong>
            <span>Saison 2026/2027</span>
          </div>
        </div>

        <nav className="nav-menu">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}
            >
              <span className="nav-icon">{item.short}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}