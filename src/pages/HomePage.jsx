import React, { useEffect, useMemo, useState } from "react";

const CLUB_KEY = "favoriteTeam";
const VALIDATED_KEY = "favoriteTeamValidated";
const DEADLINE_KEY = "favoriteTeamDeadline";
const JOURNEES_KEY = "admin_journees";
const MATCHS_KEY = "prono_ligue1_lm_matchs_admin";
const PLAYER_KEY = "prono_ligue1_lm_current_player";
const FAVORITE_TEAM_KEY = "prono_ligue1_lm_favorite_team";
const BONUS_CHOICES_KEY = "prono_ligue1_lm_bonus_choices";
const SELECTED_JOURNEE_KEY = "selected_prono_journee";
const BONUS_SELECTED_KEY = "prono_lm_bonus_selected";

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCurrentPlayer() {
  return (
    localStorage.getItem(PLAYER_KEY) ||
    localStorage.getItem("currentPlayer") ||
    localStorage.getItem("player") ||
    "Manu"
  );
}

function getFavoriteTeam(player) {
  const direct = localStorage.getItem(CLUB_KEY);
  if (direct) return direct;

  const saved = loadJson(FAVORITE_TEAM_KEY, "");
  if (typeof saved === "string") return saved;

  if (saved && typeof saved === "object") {
    return (
      saved[player] ||
      saved.team ||
      saved.club ||
      saved.favoriteTeam ||
      saved.equipe ||
      ""
    );
  }

  return "";
}

function getFavoriteValidated(player) {
  if (localStorage.getItem(VALIDATED_KEY) === "true") return true;

  const saved = loadJson("prono_ligue1_lm_favorite_team_validated", {});
  if (typeof saved === "boolean") return saved;

  if (saved && typeof saved === "object") {
    return Boolean(saved[player] || saved.validated || saved.valide);
  }

  return false;
}

function getDeadline() {
  return (
    localStorage.getItem(DEADLINE_KEY) ||
    localStorage.getItem("prono_ligue1_lm_favorite_deadline") ||
    ""
  );
}

function formatDate(value) {
  if (!value) return "Aucune date";

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

function isPassed(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return new Date() >= date;
}

function getHome(match) {
  return (
    match?.home ||
    match?.domicile ||
    match?.equipeDomicile ||
    match?.équipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    ""
  );
}

function getAway(match) {
  return (
    match?.away ||
    match?.exterieur ||
    match?.extérieur ||
    match?.equipeExterieur ||
    match?.equipeExtérieur ||
    match?.teamAway ||
    match?.awayTeam ||
    ""
  );
}

function getLeague(match) {
  return (
    match?.league ||
    match?.championnat ||
    match?.competition ||
    match?.compétition ||
    "Ligue 1"
  );
}

function getJournee(match) {
  return Number(
    match?.journee ||
    match?.journée ||
    match?.round ||
    match?.matchday ||
    1
  );
}

function getMatchId(match) {
  return String(match?.id || match?.matchId || match?.idMatch || match?.match_id || "");
}

function isBonus(match) {
  const type = getText(match?.type || match?.categorie || match?.catégorie || "");
  const league = getText(getLeague(match));

  return (
    type.includes("bonus") ||
    (!league.includes("ligue 1") && !league.includes("ligue1"))
  );
}

function buildJournees() {
  const adminJournees = loadJson(JOURNEES_KEY, []);
  if (Array.isArray(adminJournees) && adminJournees.length > 0) {
    return adminJournees.map((j, index) => ({
      id: String(j.id || j.journee || j.numero || index + 1),
      number: Number(j.journee || j.numero || index + 1),
      title: j.title || j.nom || `Journée ${j.journee || j.numero || index + 1}`,
      matches: Array.isArray(j.matches) ? j.matches : [],
      bonus: Array.isArray(j.bonus) ? j.bonus : []
    }));
  }

  const matches = loadJson(MATCHS_KEY, []);
  const byRound = {};

  if (Array.isArray(matches)) {
    matches.forEach((match) => {
      const round = getJournee(match);
      if (!byRound[round]) {
        byRound[round] = {
          id: String(round),
          number: round,
          title: `Journée ${round}`,
          matches: [],
          bonus: []
        };
      }

      if (isBonus(match)) {
        byRound[round].bonus.push(match);
      } else {
        byRound[round].matches.push(match);
      }
    });
  }

  return Object.values(byRound).sort((a, b) => a.number - b.number);
}

function getSelectedBonus(player, journee, bonusList) {
  const directId = localStorage.getItem(BONUS_SELECTED_KEY) || "";

  const choices = loadJson(BONUS_CHOICES_KEY, {});
  const choiceId =
    directId ||
    choices?.[`${player}-J${journee}`] ||
    choices?.[`${player}-${journee}`] ||
    choices?.[`J${journee}`] ||
    choices?.[journee] ||
    "";

  return bonusList.find((b) => getMatchId(b) === String(choiceId)) || null;
}

function goToPage(page) {
  const aliases = {
    pronos: ["pronos", "pronostics", "prono"],
    classement: ["classement", "ranking"],
    stats: ["stats", "statistiques"],
    profil: ["profil", "profile"],
    admin: ["admin"]
  };

  const wanted = aliases[page] || [page];

  localStorage.setItem("prono_ligue1_lm_active_page", page);
  window.dispatchEvent(new CustomEvent("prono:navigate", { detail: page }));
  window.dispatchEvent(new CustomEvent("navigate", { detail: page }));
  window.location.hash = page;

  const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));

  const found = buttons.find((element) => {
    const content = getText([
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("href"),
      element.dataset?.page,
      element.dataset?.tab,
      element.dataset?.view
    ].join(" "));

    return wanted.some((name) => content.includes(getText(name)));
  });

  if (found) {
    found.click();
    return;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function HomePage() {
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    function update() {
      setRefresh((v) => v + 1);
    }

    window.addEventListener("storage", update);
    window.addEventListener("favorite-team-updated", update);
    window.addEventListener("favorite-deadline-updated", update);
    window.addEventListener("bonus-choice-updated", update);

    const interval = setInterval(update, 1500);

    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("favorite-team-updated", update);
      window.removeEventListener("favorite-deadline-updated", update);
      window.removeEventListener("bonus-choice-updated", update);
      clearInterval(interval);
    };
  }, []);

  const data = useMemo(() => {
    const player = getCurrentPlayer();
    const club = getFavoriteTeam(player);
    const validated = getFavoriteValidated(player);
    const deadline = getDeadline();
    const deadlinePassed = isPassed(deadline);

    const journees = buildJournees();
    const selectedJourneeId =
      localStorage.getItem(SELECTED_JOURNEE_KEY) ||
      localStorage.getItem("prono_ligue1_lm_selected_journee") ||
      journees?.[0]?.id ||
      "";

    const selectedJournee =
      journees.find((j) => String(j.id) === String(selectedJourneeId)) ||
      journees.find((j) => String(j.number) === String(selectedJourneeId)) ||
      journees?.[0] ||
      null;

    const bonusList = selectedJournee?.bonus || [];
    const selectedBonus = selectedJournee
      ? getSelectedBonus(player, selectedJournee.number, bonusList)
      : null;

    return {
      player,
      club,
      validated,
      deadline,
      deadlinePassed,
      selectedJournee,
      selectedBonus,
      matchesCount: selectedJournee?.matches?.length || 0,
      bonusCount: bonusList.length
    };
  }, [refresh]);

  return (
    <div className="home-page-clean">
      <style>{`
        .home-page-clean {
          color: #f8fafc;
        }

        .home-hero-clean {
          margin-bottom: 20px;
          padding: 28px;
          border-radius: 28px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.18), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.35));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 24px 70px rgba(0,0,0,.28);
        }

        .home-hero-clean h1 {
          margin: 0;
          font-size: 40px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .home-hero-clean p {
          margin: 10px 0 0;
          color: #cbd5e1;
          font-weight: 750;
        }

        .home-grid-clean {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .home-card-clean,
        .home-panel-clean {
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.24);
        }

        .home-card-clean {
          padding: 20px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
        }

        .home-card-clean span {
          display: block;
          color: #9fb0ca;
          font-size: 13px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 8px;
        }

        .home-card-clean strong {
          display: block;
          font-size: 25px;
          line-height: 1.05;
          font-weight: 950;
          color: #fff;
        }

        .home-card-clean small {
          display: block;
          margin-top: 10px;
          color: #86efac;
          font-size: 13px;
          font-weight: 900;
        }

        .home-card-clean.warning small {
          color: #fecaca;
        }

        .home-wide-clean {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 18px;
        }

        .home-panel-clean {
          padding: 22px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(15,23,42,.92), rgba(2,6,23,.96));
        }

        .home-panel-clean h2 {
          margin: 0 0 12px;
          font-size: 26px;
          font-weight: 950;
        }

        .home-line-clean {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255,255,255,.08);
          color: #cbd5e1;
          font-weight: 850;
        }

        .home-line-clean:last-child {
          border-bottom: 0;
        }

        .home-line-clean strong {
          color: #fff;
          text-align: right;
        }

        .home-pill-clean {
          display: inline-flex;
          margin-top: 12px;
          padding: 9px 12px;
          border-radius: 999px;
          background: rgba(34,197,94,.13);
          border: 1px solid rgba(34,197,94,.30);
          color: #bbf7d0;
          font-weight: 950;
        }

        .home-pill-clean.red {
          background: rgba(239,68,68,.13);
          border-color: rgba(239,68,68,.30);
          color: #fecaca;
        }

        .home-pill-clean.gold {
          background: rgba(255,210,31,.13);
          border-color: rgba(255,210,31,.30);
          color: #fde68a;
        }

        .home-quick-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .home-quick-btn {
          cursor: pointer;
          border: 1px solid rgba(255,255,255,.13);
          border-radius: 20px;
          padding: 16px;
          background: linear-gradient(180deg, rgba(30,41,59,.96), rgba(15,23,42,.98));
          color: #f8fafc;
          text-align: left;
          transition: transform .16s ease, border-color .16s ease, background .16s ease;
        }

        .home-quick-btn:hover {
          transform: translateY(-2px);
          border-color: rgba(186,255,0,.55);
          background: linear-gradient(180deg, rgba(51,65,85,.98), rgba(15,23,42,.98));
        }

        .home-quick-btn span {
          display: block;
          font-size: 24px;
          margin-bottom: 8px;
        }

        .home-quick-btn strong {
          display: block;
          font-size: 15px;
          font-weight: 950;
        }

        .home-quick-btn small {
          display: block;
          margin-top: 5px;
          color: #94a3b8;
          font-weight: 800;
        }

        @media (max-width: 1100px) {
          .home-grid-clean {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .home-wide-clean,
          .home-quick-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .home-grid-clean {
            grid-template-columns: 1fr;
          }

          .home-hero-clean h1 {
            font-size: 32px;
          }
        }
      `}</style>

      <section className="home-hero-clean">
        <h1>Accueil</h1>
        <p>Tableau de bord de la saison Prono Ligue 1 LM.</p>
      </section>

      <div className="home-grid-clean">
        <div className="home-card-clean">
          <span>Journée active</span>
          <strong>{data.selectedJournee?.title || "Aucune"}</strong>
          <small>{data.matchesCount} match(s) Ligue 1</small>
        </div>

        <div className={data.selectedBonus ? "home-card-clean" : "home-card-clean warning"}>
          <span>Bonus choisi</span>
          <strong>
            {data.selectedBonus
              ? `${getHome(data.selectedBonus)} vs ${getAway(data.selectedBonus)}`
              : "À choisir"}
          </strong>
          <small>
            {data.selectedBonus
              ? getLeague(data.selectedBonus)
              : `${data.bonusCount} proposé(s)`}
          </small>
        </div>

        <div className={data.validated ? "home-card-clean" : "home-card-clean warning"}>
          <span>Club favori</span>
          <strong>{data.club || "Aucun club"}</strong>
          <small>{data.validated ? "Club validé" : "Club non validé"}</small>
        </div>

        <div className={data.deadlinePassed ? "home-card-clean warning" : "home-card-clean"}>
          <span>Date butoir</span>
          <strong>{data.deadlinePassed ? "Bloquée" : "Ouverte"}</strong>
          <small>{formatDate(data.deadline)}</small>
        </div>
      </div>

      <div className="home-wide-clean">
        <section className="home-panel-clean">
          <h2>Mon choix</h2>

          <div className="home-line-clean">
            <span>Joueur</span>
            <strong>{data.player}</strong>
          </div>

          <div className="home-line-clean">
            <span>Équipe favorite</span>
            <strong>{data.club || "Non choisie"}</strong>
          </div>

          <div className="home-line-clean">
            <span>Validation</span>
            <strong>{data.validated ? "Validée" : "Non validée"}</strong>
          </div>

          <div className="home-line-clean">
            <span>Limite de choix</span>
            <strong>{formatDate(data.deadline)}</strong>
          </div>

          <div className={data.validated ? "home-pill-clean" : "home-pill-clean red"}>
            {data.validated
              ? "Équipe favorite bien validée"
              : "Va valider ton équipe favorite"}
          </div>
        </section>

        <section className="home-panel-clean">
          <h2>Match bonus</h2>

          <div className="home-line-clean">
            <span>Journée</span>
            <strong>{data.selectedJournee?.title || "Aucune"}</strong>
          </div>

          <div className="home-line-clean">
            <span>Bonus sélectionné</span>
            <strong>
              {data.selectedBonus
                ? `${getHome(data.selectedBonus)} vs ${getAway(data.selectedBonus)}`
                : "Aucun"}
            </strong>
          </div>

          <div className="home-line-clean">
            <span>Compétition</span>
            <strong>{data.selectedBonus ? getLeague(data.selectedBonus) : "-"}</strong>
          </div>

          <div className={data.selectedBonus ? "home-pill-clean" : "home-pill-clean gold"}>
            {data.selectedBonus
              ? "Bonus choisi"
              : "Va choisir ton bonus dans la page Pronos"}
          </div>
        </section>
      </div>

      <section className="home-panel-clean">
        <h2>Accès rapide</h2>

        <div className="home-quick-grid">
          <button type="button" className="home-quick-btn" onClick={() => goToPage("pronos")}>
            <span>⚽</span>
            <strong>Pronos</strong>
            <small>Faire ou modifier mes pronostics</small>
          </button>

          <button type="button" className="home-quick-btn" onClick={() => goToPage("classement")}>
            <span>🏆</span>
            <strong>Classement</strong>
            <small>Voir le classement général</small>
          </button>

          <button type="button" className="home-quick-btn" onClick={() => goToPage("stats")}>
            <span>📊</span>
            <strong>Stats</strong>
            <small>Voir les statistiques</small>
          </button>

          <button type="button" className="home-quick-btn" onClick={() => goToPage("profil")}>
            <span>👤</span>
            <strong>Profil</strong>
            <small>Équipe favorite et joueur</small>
          </button>

          <button type="button" className="home-quick-btn" onClick={() => goToPage("admin")}>
            <span>⚙️</span>
            <strong>Admin</strong>
            <small>Gérer journées et résultats</small>
          </button>
        </div>
      </section>
    </div>
  );
}