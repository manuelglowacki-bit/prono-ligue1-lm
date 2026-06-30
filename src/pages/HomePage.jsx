import React, { useEffect, useMemo, useState } from "react";

const CLUB_KEY = "favoriteTeam";
const CLUB_FAVORI_KEY = "clubFavori";
const SELECTED_CLUB_KEY = "selectedClub";
const FAVORITE_TEAM_KEY = "prono_ligue1_lm_favorite_team";

const MATCHS_KEY = "prono_ligue1_lm_matchs_admin";
const JOURNEES_KEY = "admin_journees";
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
    match?.club1 ||
    match?.equipe1 ||
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
    match?.club2 ||
    match?.equipe2 ||
    ""
  );
}

function getLeague(match) {
  return (
    match?.championnat ||
    match?.league ||
    match?.competition ||
    match?.compétition ||
    match?.categorie ||
    match?.catégorie ||
    ""
  );
}

function getJourneeRaw(match) {
  return (
    match?.journee ||
    match?.journée ||
    match?.round ||
    match?.matchday ||
    match?.j ||
    1
  );
}

function getJourneeNumber(value) {
  const text = String(value || "").trim();
  const found = text.match(/\d+/);
  return found ? Number(found[0]) : 1;
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
  if (!match) return "";

  const label =
    match.label ||
    match.affiche ||
    match.match ||
    match.rencontre ||
    "";

  if (label && String(label).includes("vs")) return String(label);

  const home = getHome(match);
  const away = getAway(match);

  if (!home || !away) return "";

  return `${home} vs ${away}`;
}

function isBonus(match) {
  const type = cleanText(match?.type || match?.categorie || match?.catégorie || "");
  const league = cleanText(getLeague(match));

  return (
    type === "bonus" ||
    type.includes("bonus") ||
    type === "b" ||
    (!league.includes("ligue 1") && !league.includes("ligue1") && league !== "")
  );
}

function readFlatMatches() {
  const flat = loadJson(MATCHS_KEY, []);
  if (Array.isArray(flat) && flat.length > 0) return flat;

  const journees = loadJson(JOURNEES_KEY, []);
  if (!Array.isArray(journees)) return [];

  return journees.flatMap((j, index) => {
    const round = j.journee || j.numero || index + 1;
    const normal = Array.isArray(j.matches) ? j.matches : [];
    const bonus = Array.isArray(j.bonus) ? j.bonus : [];

    return [...normal, ...bonus].map((match) => ({
      ...match,
      journee: match.journee || round
    }));
  });
}

function buildJournees(matches) {
  const byRound = {};

  matches.forEach((match) => {
    const round = getJourneeNumber(getJourneeRaw(match));

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

  return Object.values(byRound).sort((a, b) => a.number - b.number);
}

function getChoiceValue(choices, player, journeeNumber) {
  const keys = [
    `${player}-J${journeeNumber}`,
    `${player}-${journeeNumber}`,
    `${player}-j${journeeNumber}`,
    `J${journeeNumber}`,
    `j${journeeNumber}`,
    String(journeeNumber)
  ];

  for (const key of keys) {
    if (choices && choices[key]) return choices[key];
  }

  return "";
}

function normalizeChoice(value) {
  if (!value) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    return (
      value.id ||
      value.matchId ||
      value.match_id ||
      value.label ||
      value.affiche ||
      value.match ||
      getMatchTitle(value) ||
      ""
    );
  }

  return "";
}

function findBonusMatch(player, journeeNumber, bonusList, allMatches) {
  const choices = loadJson(BONUS_CHOICES_KEY, {});
  const direct = loadJson(BONUS_SELECTED_KEY, "");

  const choiceFromJournee = getChoiceValue(choices, player, journeeNumber);
  const choiceId = normalizeChoice(choiceFromJournee || direct);

  if (!choiceId) return null;

  const allBonus = allMatches.filter(isBonus);
  const pool = [...bonusList, ...allBonus];

  const byId = pool.find((match) => {
    const id = getMatchId(match);
    return id && String(id) === String(choiceId);
  });

  if (byId) return byId;

  const wanted = cleanText(choiceId);

  const byLabel = pool.find((match) => {
    const title = cleanText(getMatchTitle(match));
    const label = cleanText(match?.label || match?.affiche || match?.match || "");
    return title === wanted || label === wanted;
  });

  if (byLabel) return byLabel;

  if (typeof choiceFromJournee === "object" && getMatchTitle(choiceFromJournee)) {
    return choiceFromJournee;
  }

  if (typeof direct === "object" && getMatchTitle(direct)) {
    return direct;
  }

  return null;
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
      setRefresh((value) => value + 1);
    }

    window.addEventListener("storage", update);
    window.addEventListener("favorite-team-updated", update);
    window.addEventListener("bonus-choice-updated", update);
    window.addEventListener("pronos-updated", update);

    const interval = setInterval(update, 1500);

    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("favorite-team-updated", update);
      window.removeEventListener("bonus-choice-updated", update);
      window.removeEventListener("pronos-updated", update);
      clearInterval(interval);
    };
  }, []);

  const data = useMemo(() => {
    const player = getCurrentPlayer();
    const club = getFavoriteTeam(player);
    const allMatches = readFlatMatches();
    const journees = buildJournees(allMatches);

    const storedJournee =
      localStorage.getItem(SELECTED_JOURNEE_KEY) ||
      localStorage.getItem("prono_ligue1_lm_selected_journee") ||
      journees?.[0]?.number ||
      1;

    const journeeNumber = getJourneeNumber(storedJournee);

    const selectedJournee =
      journees.find((j) => Number(j.number) === Number(journeeNumber)) ||
      journees?.[0] ||
      {
        id: "1",
        number: 1,
        title: "J1",
        matches: [],
        bonus: []
      };

    const selectedBonus = findBonusMatch(
      player,
      selectedJournee.number,
      selectedJournee.bonus,
      allMatches
    );

    const selectedBonusTitle = getMatchTitle(selectedBonus);
    const hasSelectedBonus = Boolean(selectedBonus && selectedBonusTitle);

    return {
      player,
      club,
      selectedJournee,
      matchesCount: selectedJournee.matches.length,
      bonusCount: selectedJournee.bonus.length,
      selectedBonus,
      selectedBonusTitle,
      selectedBonusLeague: hasSelectedBonus ? getLeague(selectedBonus) || "Bonus" : "",
      hasSelectedBonus,
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
          <span>Club favori</span>
          <strong>{data.club || "Aucun club"}</strong>
          <small>Équipe favorite</small>
        </div>

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

        <section className="home-panel-clean">
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
      </div>
    </div>
  );
}