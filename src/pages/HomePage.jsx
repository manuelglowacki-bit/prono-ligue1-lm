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
const VALIDATIONS_KEY = "prono_ligue1_lm_validations_journees";

const CLUBS = [
  "RC Lens",
  "PSG",
  "OM",
  "LOSC",
  "OL",
  "AS Monaco",
  "Stade Rennais",
  "OGC Nice",
  "FC Nantes",
  "Strasbourg",
  "Toulouse",
  "Brest",
  "Auxerre",
  "Angers",
  "Le Havre",
  "Metz",
  "Lorient",
  "Paris FC"
];

const RANKING_KEYS = [
  "prono_ligue1_lm_classement",
  "prono_ligue1_lm_ranking",
  "classement",
  "ranking",
  "playersRanking"
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getText(value) {
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

function saveFavoriteTeam(player, club) {
  localStorage.setItem(CLUB_KEY, club);
  localStorage.setItem(CLUB_FAVORI_KEY, club);
  localStorage.setItem(SELECTED_CLUB_KEY, club);
  localStorage.setItem("favoriteClub", club);

  const saved = loadJson(FAVORITE_TEAM_KEY, {});
  const next =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...saved, [player]: club, club, favoriteTeam: club }
      : { [player]: club, club, favoriteTeam: club };

  localStorage.setItem(FAVORITE_TEAM_KEY, JSON.stringify(next));

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("favorite-team-updated"));
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
  return String(
    match?.id ||
    match?.matchId ||
    match?.idMatch ||
    match?.match_id ||
    ""
  );
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

function getPronosForPlayer(player) {
  const possibleKeys = [
    `pronos:${player}`,
    "pronos",
    "pronostics",
    "userPronos",
    "prono_ligue1_lm_pronos_joueurs"
  ];

  for (const key of possibleKeys) {
    const value = loadJson(key, null);

    if (!value || typeof value !== "object") continue;

    if (value[player] && typeof value[player] === "object") {
      return value[player];
    }

    return value;
  }

  return {};
}

function hasProno(prono) {
  if (!prono || typeof prono !== "object") return false;

  const prediction =
    prono.prediction ||
    prono.resultat ||
    prono.resultat1N2 ||
    prono.winner ||
    "";

  const scoreDom =
    prono.scoreDom ??
    prono.homeScore ??
    prono.scoreHome ??
    prono.domScore ??
    "";

  const scoreExt =
    prono.scoreExt ??
    prono.awayScore ??
    prono.scoreAway ??
    prono.extScore ??
    "";

  return Boolean(prediction) || (scoreDom !== "" && scoreExt !== "");
}

function getPronoByMatch(pronos, match) {
  const id = getMatchId(match);

  if (id && pronos[id]) return pronos[id];

  const home = getText(getHome(match));
  const away = getText(getAway(match));
  const round = String(getJournee(match));

  return Object.values(pronos || {}).find((p) => {
    if (!p || typeof p !== "object") return false;

    const pHome = getText(p.home || p.domicile || p.equipeDomicile);
    const pAway = getText(p.away || p.exterieur || p.equipeExterieur);
    const pRound = String(p.journee || p.round || p.matchday || "");

    return pHome === home && pAway === away && (!pRound || pRound === round);
  });
}

function getValidationKey(player, journee) {
  return `${player}-J${journee}`;
}

function isPronosValidated(player, journee) {
  const validations = loadJson(VALIDATIONS_KEY, {});
  return Boolean(
    validations?.[getValidationKey(player, journee)] ||
    validations?.[`${player}-${journee}`] ||
    validations?.[`J${journee}`]
  );
}

function validatePronos(player, journee) {
  const validations = loadJson(VALIDATIONS_KEY, {});
  const next = {
    ...validations,
    [getValidationKey(player, journee)]: true
  };

  localStorage.setItem(VALIDATIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("pronos-validated"));
}

export default function HomePage() {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    function update() {
      setRefresh((v) => v + 1);
    }

    window.addEventListener("storage", update);
    window.addEventListener("favorite-team-updated", update);
    window.addEventListener("bonus-choice-updated", update);
    window.addEventListener("pronos-updated", update);
    window.addEventListener("pronos-validated", update);

    const interval = setInterval(update, 1500);

    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("favorite-team-updated", update);
      window.removeEventListener("bonus-choice-updated", update);
      window.removeEventListener("pronos-updated", update);
      window.removeEventListener("pronos-validated", update);
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

    const pronos = getPronosForPlayer(player);

    const ligue1Done = selectedJournee?.matches?.filter((match) =>
      hasProno(getPronoByMatch(pronos, match))
    ).length || 0;

    const selectedBonusDone = selectedBonus
      ? hasProno(getPronoByMatch(pronos, selectedBonus))
      : false;

    const totalToDo =
      (selectedJournee?.matches?.length || 0) + (bonusList.length > 0 ? 1 : 0);

    const done = ligue1Done + (selectedBonusDone ? 1 : 0);
    const allPronosDone = totalToDo > 0 && done >= totalToDo;

    const validated = selectedJournee
      ? isPronosValidated(player, selectedJournee.number)
      : false;

    const podium = buildPodium();

    const todo = [];

    if (!club) {
      todo.push("Choisir ton équipe favorite");
    }

    if (!selectedBonus && bonusList.length > 0) {
      todo.push("Choisir ton match bonus");
    }

    if (!allPronosDone) {
      todo.push("Faire tous tes pronos");
    }

    if (allPronosDone && !validated) {
      todo.push("Valider tes pronos");
    }

    return {
      player,
      club,
      selectedJournee,
      selectedBonus,
      matchesCount: selectedJournee?.matches?.length || 0,
      bonusCount: bonusList.length,
      podium,
      todo,
      done,
      totalToDo,
      allPronosDone,
      validated
    };
  }, [refresh]);

  function handleFavoriteChange(event) {
    const value = event.target.value;
    saveFavoriteTeam(data.player, value);
    setMessage(`Équipe favorite validée : ${value}`);
    setRefresh((v) => v + 1);
  }

  function handleValidatePronos() {
    if (!data.selectedJournee) {
      setMessage("Aucune journée active.");
      return;
    }

    if (!data.allPronosDone) {
      setMessage("Il manque encore des pronos avant de valider.");
      return;
    }

    validatePronos(data.player, data.selectedJournee.number);
    setMessage("Pronos validés ✅");
    setRefresh((v) => v + 1);
  }

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
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .home-wide-clean {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 18px;
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

        .home-select-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .home-select {
          width: 100%;
          min-height: 44px;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 14px;
          padding: 0 14px;
          background: rgba(15,23,42,.95);
          color: #fff;
          font-weight: 900;
          outline: none;
        }

        .home-small-btn,
        .home-validate-btn {
          border: 0;
          cursor: pointer;
          border-radius: 14px;
          padding: 0 16px;
          min-height: 44px;
          background: #baff00;
          color: #07111f;
          font-weight: 950;
          box-shadow: 0 12px 28px rgba(186,255,0,.18);
        }

        .home-small-btn:hover,
        .home-validate-btn:hover {
          filter: brightness(1.05);
        }

        .home-validate-btn {
          width: 100%;
          margin-top: 14px;
        }

        .home-validate-btn.is-done {
          background: rgba(34,197,94,.22);
          color: #bbf7d0;
          border: 1px solid rgba(34,197,94,.35);
          box-shadow: none;
        }

        .home-validate-btn:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .home-message {
          margin-bottom: 16px;
          padding: 12px 14px;
          border-radius: 16px;
          background: rgba(186,255,0,.12);
          border: 1px solid rgba(186,255,0,.25);
          color: #ecfccb;
          font-weight: 900;
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

        .home-todo-list {
          display: grid;
          gap: 10px;
        }

        .home-todo-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 13px 14px;
          border-radius: 16px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          color: #e2e8f0;
          font-weight: 900;
        }

        .home-todo-dot {
          width: 11px;
          height: 11px;
          border-radius: 999px;
          background: #facc15;
          box-shadow: 0 0 18px rgba(250,204,21,.50);
          flex: 0 0 auto;
        }

        .home-todo-ok {
          padding: 18px;
          border-radius: 18px;
          background: rgba(34,197,94,.12);
          border: 1px solid rgba(34,197,94,.28);
          color: #bbf7d0;
          font-weight: 950;
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
          padding: 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.05);
          border: 1px dashed rgba(255,255,255,.16);
          color: #94a3b8;
          font-weight: 850;
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

          .home-select-row {
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

      {message && <div className="home-message">{message}</div>}

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

          <div className="home-select-row">
            <select
              className="home-select"
              value={data.club || ""}
              onChange={handleFavoriteChange}
            >
              <option value="">Choisir mon équipe favorite</option>
              {CLUBS.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="home-small-btn"
              onClick={() => {
                if (!data.club) {
                  setMessage("Choisis une équipe favorite avant de valider.");
                  return;
                }

                saveFavoriteTeam(data.player, data.club);
                setMessage(`Équipe favorite validée : ${data.club}`);
                setRefresh((v) => v + 1);
              }}
            >
              Valider
            </button>
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
          <h2>Match bonus</h2>

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

        <section className="home-panel-clean">
          <h2>À faire aujourd’hui</h2>

          {data.todo.length > 0 ? (
            <div className="home-todo-list">
              {data.todo.map((item) => (
                <div className="home-todo-item" key={item}>
                  <span className="home-todo-dot"></span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="home-todo-ok">
              Tout est prêt ✅
            </div>
          )}

          <button
            type="button"
            className={data.validated ? "home-validate-btn is-done" : "home-validate-btn"}
            onClick={handleValidatePronos}
          >
            {data.validated
              ? "Pronos validés ✅"
              : `Valider mes pronos ${data.done}/${data.totalToDo}`}
          </button>
        </section>
      </div>
    </div>
  );
}