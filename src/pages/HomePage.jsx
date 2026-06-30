import React, { useEffect, useMemo, useState } from "react";

const CLUB_KEY = "favoriteTeam";
const CLUB_FAVORI_KEY = "clubFavori";
const SELECTED_CLUB_KEY = "selectedClub";
const FAVORITE_TEAM_KEY = "prono_ligue1_lm_favorite_team";

const JOURNEES_KEY = "admin_journees";
const MATCHS_KEY = "prono_ligue1_lm_matchs_admin";
const PLAYER_KEY = "prono_ligue1_lm_current_player";
const BONUS_CHOICES_KEY = "prono_ligue1_lm_bonus_choices";
const SELECTED_JOURNEE_KEY = "selected_prono_journee";
const BONUS_SELECTED_KEY = "prono_lm_bonus_selected";

const RANKING_KEYS = [
  "prono_ligue1_lm_classement",
  "prono_ligue1_lm_ranking",
  "classement",
  "ranking",
  "playersRanking",
  "players",
  "scores"
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hideDuplicateFavoritePanel() {
  try {
    const elements = Array.from(document.querySelectorAll("section, article, div"));

    const candidates = elements.filter((element) => {
      if (element.closest(".home-page-clean")) return false;

      const text = cleanText(element.textContent);

      return (
        text.includes("club favori") &&
        text.includes("choisis ton equipe favorite")
      );
    });

    if (candidates.length === 0) return;

    const target = candidates.sort(
      (a, b) => String(a.textContent || "").length - String(b.textContent || "").length
    )[0];

    if (target) {
      target.style.display = "none";
    }
  } catch {
    // Sécurité : ne bloque jamais la page.
  }
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
  const direct =
    localStorage.getItem(CLUB_KEY) ||
    localStorage.getItem(CLUB_FAVORI_KEY) ||
    localStorage.getItem(SELECTED_CLUB_KEY);

  if (direct) return direct;

  const saved = loadJson(FAVORITE_TEAM_KEY, "");

  if (typeof saved === "string") return saved;

  if (saved && typeof saved === "object") {
    return (
      saved[player] ||
      saved.team ||
      saved.club ||
      saved.favoriteTeam ||
      saved.clubFavori ||
      saved.equipe ||
      ""
    );
  }

  return "";
}

function getHome(match) {
  return (
    match?.home ||
    match?.domicile ||
    match?.equipeDomicile ||
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
  return String(
    match?.id ||
    match?.matchId ||
    match?.idMatch ||
    match?.match_id ||
    ""
  );
}

function getMatchTitle(match) {
  const home = getHome(match);
  const away = getAway(match);

  if (!home || !away) return "";

  return `${home} vs ${away}`;
}

function isBonus(match) {
  const type = cleanText(match?.type || match?.categorie || match?.catégorie || "");
  const league = cleanText(getLeague(match));

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
      title: j.title || j.nom || `J${j.journee || j.numero || index + 1}`,
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
          title: `J${round}`,
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

  if (!choiceId) return null;

  return (
    bonusList.find((b) => getMatchId(b) && getMatchId(b) === String(choiceId)) ||
    null
  );
}

function getPlayerName(item) {
  return (
    item?.player ||
    item?.joueur ||
    item?.name ||
    item?.nom ||
    item?.p ||
    item?.pseudo ||
    "Joueur"
  );
}

function getPlayerPoints(item) {
  return Number(item?.points || item?.pts || item?.total || item?.score || 0);
}

function getPlayerExact(item) {
  return Number(
    item?.exact ||
    item?.exacts ||
    item?.scoresExact ||
    item?.scoresExacts ||
    item?.scoreExact ||
    0
  );
}

function normalizeRankingData(raw) {
  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    if (Array.isArray(raw.players)) return raw.players;
    if (Array.isArray(raw.ranking)) return raw.ranking;
    if (Array.isArray(raw.classement)) return raw.classement;
    if (Array.isArray(raw.data)) return raw.data;

    return Object.entries(raw).map(([name, value]) => ({
      player: name,
      ...(typeof value === "object" ? value : { points: value })
    }));
  }

  return [];
}

function buildPodium() {
  let ranking = [];

  for (const key of RANKING_KEYS) {
    const data = normalizeRankingData(loadJson(key, []));

    if (Array.isArray(data) && data.length > 0) {
      ranking = data;
      break;
    }
  }

  return ranking
    .map((item) => ({
      name: getPlayerName(item),
      points: getPlayerPoints(item),
      exact: getPlayerExact(item)
    }))
    .filter((item) => item.name && item.name !== "Joueur")
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.exact - a.exact;
    })
    .slice(0, 3);
}

export default function HomePage() {
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    function update() {
      hideDuplicateFavoritePanel();
      setRefresh((v) => v + 1);
    }

    hideDuplicateFavoritePanel();
    setTimeout(hideDuplicateFavoritePanel, 250);
    setTimeout(hideDuplicateFavoritePanel, 1000);

    window.addEventListener("storage", update);
    window.addEventListener("favorite-team-updated", update);
    window.addEventListener("bonus-choice-updated", update);

    const interval = setInterval(update, 1500);

    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("favorite-team-updated", update);
      window.removeEventListener("bonus-choice-updated", update);
      clearInterval(interval);
    };
  }, []);

  const data = useMemo(() => {
    const player = getCurrentPlayer();
    const club = getFavoriteTeam(player);

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

    const selectedBonusTitle = getMatchTitle(selectedBonus);
    const hasSelectedBonus = Boolean(selectedBonusTitle);

    return {
      player,
      club,
      selectedJournee,
      selectedBonus,
      selectedBonusTitle,
      hasSelectedBonus,
      selectedBonusLeague: hasSelectedBonus ? getLeague(selectedBonus) : "",
      matchesCount: selectedJournee?.matches?.length || 0,
      bonusCount: bonusList.length,
      podium: buildPodium()
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
            radial-gradient(circle at top left, rgba(186,255,0,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.34));
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .home-wide-clean {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 18px;
          align-items: start;
        }

        .home-card-clean,
        .home-panel-clean {
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.24);
        }

        .home-card-clean {
          min-height: 112px;
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

        .home-panel-clean {
          padding: 22px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(15,23,42,.92), rgba(2,6,23,.96));
        }

        .home-panel-clean.is-empty-compact {
          min-height: 0;
        }

        .home-panel-clean h2 {
          margin: 0 0 14px;
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

        .home-pill-clean.gold {
          background: rgba(255,210,31,.13);
          border-color: rgba(255,210,31,.30);
          color: #fde68a;
        }

        .home-podium {
          display: grid;
          gap: 10px;
        }

        .home-podium-row {
          display: grid;
          grid-template-columns: 48px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
        }

        .home-podium-rank {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,.10);
          font-size: 20px;
          font-weight: 950;
        }

        .home-podium-name {
          display: block;
          color: #fff;
          font-size: 17px;
          font-weight: 950;
        }

        .home-podium-exact {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 850;
        }

        .home-podium-points {
          color: #baff00;
          font-size: 20px;
          font-weight: 950;
          white-space: nowrap;
        }

        .home-empty {
          padding: 15px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.05);
          border: 1px dashed rgba(255,255,255,.16);
          color: #94a3b8;
          font-weight: 850;
        }

        .home-summary-mini {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .home-mini-box {
          padding: 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
        }

        .home-mini-box span {
          display: block;
          color: #94a3b8;
          font-weight: 900;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .home-mini-box strong {
          color: #fff;
          font-size: 28px;
          font-weight: 950;
        }

        @media (max-width: 1100px) {
          .home-grid-clean {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .home-wide-clean {
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

          .home-summary-mini {
            grid-template-columns: 1fr;
          }

          .home-podium-row {
            grid-template-columns: 42px 1fr;
          }

          .home-podium-points {
            grid-column: 2;
            font-size: 17px;
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

        <div className={data.hasSelectedBonus ? "home-card-clean" : "home-card-clean warning"}>
          <span>Bonus choisi</span>
          <strong>
            {data.hasSelectedBonus ? data.selectedBonusTitle : "Aucun bonus"}
          </strong>
          <small>
            {data.hasSelectedBonus
              ? data.selectedBonusLeague
              : `${data.bonusCount} bonus proposé(s)`}
          </small>
        </div>

        <div className="home-card-clean">
          <span>Club favori</span>
          <strong>{data.club || "Aucun club"}</strong>
          <small>Équipe favorite</small>
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
        </section>

        <section className={data.podium.length > 0 ? "home-panel-clean" : "home-panel-clean is-empty-compact"}>
          <h2>Podium du classement</h2>

          {data.podium.length > 0 ? (
            <div className="home-podium">
              {data.podium.map((player, index) => (
                <div className="home-podium-row" key={`${player.name}-${index}`}>
                  <div className="home-podium-rank">
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                  </div>

                  <div>
                    <span className="home-podium-name">{player.name}</span>
                    <span className="home-podium-exact">
                      {player.exact} score(s) exact(s)
                    </span>
                  </div>

                  <div className="home-podium-points">
                    {player.points} pts
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="home-empty">
              Le podium apparaîtra quand le classement sera enregistré.
            </div>
          )}
        </section>
      </div>

      <div className="home-wide-clean">
        <section className="home-panel-clean">
          <h2>Match bonus</h2>

          <div className="home-line-clean">
            <span>Bonus sélectionné</span>
            <strong>
              {data.hasSelectedBonus ? data.selectedBonusTitle : "Aucun"}
            </strong>
          </div>

          <div className="home-line-clean">
            <span>Compétition</span>
            <strong>{data.hasSelectedBonus ? data.selectedBonusLeague : "-"}</strong>
          </div>

          <div className={data.hasSelectedBonus ? "home-pill-clean" : "home-pill-clean gold"}>
            {data.hasSelectedBonus ? "Bonus choisi" : "Bonus pas encore choisi"}
          </div>
        </section>

        <section className="home-panel-clean">
          <h2>Résumé journée</h2>

          <div className="home-summary-mini">
            <div className="home-mini-box">
              <span>Matchs Ligue 1</span>
              <strong>{data.matchesCount}</strong>
            </div>

            <div className="home-mini-box">
              <span>Bonus proposés</span>
              <strong>{data.bonusCount}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}