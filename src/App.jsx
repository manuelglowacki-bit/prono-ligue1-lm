import AdminOnly from "./components/AdminOnly.jsx";
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

import HomePage from "./pages/HomePage.jsx";
import PronosPage from "./pages/PronosPage.jsx";
import RankingPage from "./pages/RankingPage.jsx";
import GazettePage from "./pages/GazettePage.jsx";
import StatsPage from "./pages/StatsPage.jsx";
import TrophiesPage from "./pages/TrophiesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

import FavoriteTeamBox from "./components/FavoriteTeamBox.jsx";
import FavoriteDeadlineAdmin from "./components/FavoriteDeadlineAdmin.jsx";
import CalendarAutoSync from "./components/CalendarAutoSync.jsx";
import CalendarOnlineAdmin from "./components/CalendarOnlineAdmin.jsx";
import RegisteredPlayersAdmin from "./components/RegisteredPlayersAdmin.jsx";

import "./styles/layout.css";

const ADMIN_EMAIL = "manuelglowacki@gmail.com";

function cleanFavoriteTeamValue(value) {
  if (!value) return value;

  if (typeof value === "string") {
    const raw = value.trim();

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        return cleanFavoriteTeamValue(parsed);
      } catch {
        return raw;
      }
    }

    return raw;
  }

  if (typeof value === "object") {
    return (
      value.favoriteTeam ||
      value.club ||
      value.clubFavori ||
      value.team ||
      value.Manu ||
      Object.values(value).find((item) => typeof item === "string" && item.trim()) ||
      ""
    );
  }

  return String(value);
}

function cleanFavoriteTeamStorage() {
  try {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }

    keys.forEach((key) => {
      const lower = key.toLowerCase();

      const isFavoriteKey =
        lower.includes("favorite") ||
        lower.includes("favori") ||
        lower.includes("club") ||
        lower.includes("team");

      if (!isFavoriteKey) return;

      const raw = localStorage.getItem(key);
      if (!raw) return;

      const cleaned = cleanFavoriteTeamValue(raw);

      if (cleaned && cleaned !== raw && !String(cleaned).trim().startsWith("{")) {
        localStorage.setItem(key, cleaned);
      }
    });
  } catch {
    // ignore
  }
}

const NAV_ITEMS = [
  { id: "home", label: "Accueil", short: "AC" },
  { id: "pronos", label: "Pronos", short: "PR" },
  { id: "ranking", label: "Classement", short: "CL" },
  { id: "gazette", label: "Gazette", short: "GZ" },
  { id: "stats", label: "Stats", short: "ST" },
  { id: "trophies", label: "Trophees", short: "TR" },
  { id: "profile", label: "Profil", short: "PF" },
  { id: "admin", label: "Admin", short: "AD" }
];

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        if (!supabase) {
          if (mounted) setIsAdmin(false);
          return;
        }

        const { data } = await supabase.auth.getUser();
        const email = data?.user?.email?.toLowerCase().trim();

        if (mounted) {
          setIsAdmin(email === ADMIN_EMAIL);
        }
      } catch {
        if (mounted) setIsAdmin(false);
      }
    }

    checkAdmin();

    const sub = supabase?.auth?.onAuthStateChange?.((_event, session) => {
      const email = session?.user?.email?.toLowerCase().trim();
      setIsAdmin(email === ADMIN_EMAIL);
    });

    return () => {
      mounted = false;
      sub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (activePage === "admin" && !isAdmin) {
      setActivePage("home");
    }
  }, [activePage, isAdmin]);

  useEffect(() => {
    cleanFavoriteTeamStorage();
  }, []);

  const visibleNavItems = isAdmin
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id !== "admin");

  function renderHome() {
    return (
      <>
        <FavoriteTeamBox />
        <HomePage />
      </>
    );
  }

  function renderPage() {
    switch (activePage) {
      case "home":
        return renderHome();

      case "pronos":
        return <PronosPage />;

      case "ranking":
        return <RankingPage />;

      case "gazette":
        return <GazettePage />;

      case "stats":
        return <StatsPage />;

      case "trophies":
        return <TrophiesPage />;

      case "profile":
        return <ProfilePage />;

      case "admin":
        if (!isAdmin) return renderHome();

        return (
          <AdminOnly>
            <RegisteredPlayersAdmin />
            <CalendarOnlineAdmin />
            <FavoriteDeadlineAdmin />
            <AdminPage />
          </AdminOnly>
        );

      default:
        return renderHome();
    }
  }

  return (
    <div className="app-shell">
      <CalendarAutoSync />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">LM</div>
          <div className="brand-text">
            <strong>Prono Ligue 1</strong>
            <span>Saison 2026/2027</span>
          </div>
        </div>

        <nav className="nav-menu">
          {visibleNavItems.map((item) => (
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





