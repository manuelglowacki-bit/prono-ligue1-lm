import React, { useEffect, useMemo, useState } from "react";

const CLUB_KEY = "favoriteTeam";
const CLUB_FAVORI_KEY = "clubFavori";
const SELECTED_CLUB_KEY = "selectedClub";
const FAVORITE_TEAM_KEY = "prono_ligue1_lm_favorite_team";
const FAVORITE_VALIDATED_KEY = "favoriteTeamValidated";
const FAVORITE_VALIDATED_BY_PLAYER_KEY = "prono_ligue1_lm_favorite_team_validated";
const FAVORITE_DEADLINE_KEY = "favoriteTeamDeadline";
const FAVORITE_DEADLINE_ALT_KEY = "prono_ligue1_lm_favorite_deadline";

const MATCHS_KEY = "prono_ligue1_lm_matchs_admin";
const JOURNEES_KEY = "admin_journees";
const PLAYER_KEY = "prono_ligue1_lm_current_player";
const SELECTED_JOURNEE_KEY = "selected_prono_journee";

const DEFAULT_TEAM = "RC Lens";
const DEFAULT_DEADLINE = "2026-07-12T23:23";

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

function getProfilePhoto(player) {
  const directKeys = [
    "profilePhoto",
    "profile_photo",
    "avatar",
    "playerAvatar",
    "prono_ligue1_lm_profile_photo",
    "prono_ligue1_lm_avatar"
  ];

  for (const key of directKeys) {
    const value = localStorage.getItem(key);
    if (value && String(value).startsWith("data:image")) return value;
    if (value && String(value).startsWith("http")) return value;
  }

  const maps = [
    "profilePhotos",
    "profile_photos",
    "playerPhotos",
    "playersPhotos",
    "avatars",
    "prono_ligue1_lm_profile_photos",
    "prono_ligue1_lm_player_photos"
  ];

  for (const key of maps) {
    const saved = loadJson(key, {});
    if (saved && typeof saved === "object") {
      const value =
        saved[player] ||
        saved[String(player).toLowerCase()] ||
        saved.current ||
        saved.photo ||
        saved.avatar;

      if (value && String(value).startsWith("data:image")) return value;
      if (value && String(value).startsWith("http")) return value;
    }
  }

  return "";
}

function getInitials(name) {
  return String(name || "Joueur")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getPhotoPosition(player) {
  const saved = loadJson("prono_ligue1_lm_profile_photo_position", {});
  const playerPos = saved && typeof saved === "object" ? saved[player] : null;

  return {
    x: Number(playerPos?.x ?? saved?.x ?? localStorage.getItem("profilePhotoX") ?? 50),
    y: Number(playerPos?.y ?? saved?.y ?? localStorage.getItem("profilePhotoY") ?? 50)
  };
}

function savePhotoPosition(player, axis, value) {
  const saved = loadJson("prono_ligue1_lm_profile_photo_position", {});
  const current = saved[player] || getPhotoPosition(player);

  const next = {
    ...saved,
    [player]: {
      ...current,
      [axis]: Number(value)
    }
  };

  localStorage.setItem("prono_ligue1_lm_profile_photo_position", JSON.stringify(next));

  if (axis === "x") localStorage.setItem("profilePhotoX", String(value));
  if (axis === "y") localStorage.setItem("profilePhotoY", String(value));

  window.dispatchEvent(new Event("storage"));
}

function getDeadline() {
  return (
    localStorage.getItem(FAVORITE_DEADLINE_KEY) ||
    localStorage.getItem(FAVORITE_DEADLINE_ALT_KEY) ||
    DEFAULT_DEADLINE
  );
}

function isDeadlinePassed(deadline) {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return false;
  return new Date() > date;
}

function formatDeadline(deadline) {
  const date = new Date(deadline);

  if (Number.isNaN(date.getTime())) {
    return "Date non definie";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getValidatedStatus(player) {
  if (localStorage.getItem(FAVORITE_VALIDATED_KEY) === "true") return true;

  const saved = loadJson(FAVORITE_VALIDATED_BY_PLAYER_KEY, {});

  if (typeof saved === "boolean") return saved;

  if (saved && typeof saved === "object") {
    return Boolean(saved[player] || saved.validated || saved.valide);
  }

  return false;
}

function setValidatedStatus(player, value) {
  localStorage.setItem(FAVORITE_VALIDATED_KEY, value ? "true" : "false");

  const saved = loadJson(FAVORITE_VALIDATED_BY_PLAYER_KEY, {});
  const next =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...saved, [player]: value }
      : { [player]: value };

  localStorage.setItem(FAVORITE_VALIDATED_BY_PLAYER_KEY, JSON.stringify(next));
}

function readFavoriteTeam(player) {
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

function saveFavoriteTeam(player, club, validated = false) {
  const finalClub = club || DEFAULT_TEAM;

  localStorage.setItem(CLUB_KEY, finalClub);
  localStorage.setItem(CLUB_FAVORI_KEY, finalClub);
  localStorage.setItem(SELECTED_CLUB_KEY, finalClub);
  localStorage.setItem("favoriteClub", finalClub);

  const saved = loadJson(FAVORITE_TEAM_KEY, {});
  const next =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...saved, [player]: finalClub, club: finalClub, favoriteTeam: finalClub }
      : { [player]: finalClub, club: finalClub, favoriteTeam: finalClub };

  localStorage.setItem(FAVORITE_TEAM_KEY, JSON.stringify(next));

  if (validated) {
    setValidatedStatus(player, true);
  }

  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("favorite-team-updated"));
}

function getFavoriteTeam(player, deadline) {
  const validated = getValidatedStatus(player);
  const passed = isDeadlinePassed(deadline);

  if (!validated && passed) {
    saveFavoriteTeam(player, DEFAULT_TEAM, true);
    return DEFAULT_TEAM;
  }

  return readFavoriteTeam(player) || DEFAULT_TEAM;
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
    match?.homeName ||
    ""
  );
}

function getAway(match) {
  return (
    match?.away ||
    match?.exterieur ||
    match?.equipeExterieur ||
    match?.teamAway ||
    match?.awayTeam ||
    match?.club2 ||
    match?.equipe2 ||
    match?.awayName ||
    ""
  );
}

function getLeague(match) {
  return (
    match?.championnat ||
    match?.league ||
    match?.competition ||
    match?.categorie ||
    ""
  );
}

function getJourneeRaw(match) {
  return (
    match?.journee ||
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
    match.name ||
    match.title ||
    "";

  const cleanLabel = String(label || "").trim();

  if (cleanLabel && cleanText(cleanLabel) !== "vs") {
    return cleanLabel;
  }

  const home = getHome(match);
  const away = getAway(match);

  if (!home || !away) return "";

  return `${home} vs ${away}`;
}

function isBonus(match) {
  const type = cleanText(match?.type || match?.categorie || "");
  const league = cleanText(getLeague(match));

  if (type === "bonus" || type.includes("bonus") || type === "b") return true;

  if (!league) return false;

  return !league.includes("ligue 1") && !league.includes("ligue1");
}

function readFlatMatches() {
  const flat = loadJson(MATCHS_KEY, []);

  if (Array.isArray(flat) && flat.length > 0) {
    return flat;
  }

  const journees = loadJson(JOURNEES_KEY, []);

  if (!Array.isArray(journees)) {
    return [];
  }

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

function getBonusChoiceCandidates(player, journeeNumber) {
  const candidates = [];

  const directKeys = [
    "prono_ligue1_lm_bonus_choices",
    "prono_lm_bonus_selected",
    "prono_ligue1_lm_selected_bonus",
    "prono_ligue1_lm_bonus_selected_home",
    "selectedBonus",
    "bonusSelected",
    "selected_bonus",
    "bonus_choice",
    "bonusChoice",
    "matchBonus",
    "selectedMatchBonus"
  ];

  const wantedKeys = [
    `${player}-J${journeeNumber}`,
    `${player}-${journeeNumber}`,
    `${player}-j${journeeNumber}`,
    `${player}_${journeeNumber}`,
    `${player}_J${journeeNumber}`,
    `J${journeeNumber}`,
    `j${journeeNumber}`,
    String(journeeNumber)
  ];

  function pushValue(value) {
    if (!value) return;

    candidates.push(value);

    if (typeof value === "object" && !Array.isArray(value)) {
      wantedKeys.forEach((key) => {
        if (value[key]) candidates.push(value[key]);
      });

      if (value[player]) {
        candidates.push(value[player]);

        if (typeof value[player] === "object") {
          wantedKeys.forEach((key) => {
            if (value[player][key]) candidates.push(value[player][key]);
          });
        }
      }

      [
        "selectedBonus",
        "bonus",
        "matchBonus",
        "selectedMatch",
        "match",
        "choice",
        "value",
        "id",
        "matchId",
        "match_id"
      ].forEach((key) => {
        if (value[key]) candidates.push(value[key]);
      });
    }
  }

  directKeys.forEach((key) => {
    pushValue(loadJson(key, localStorage.getItem(key)));
  });

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    const cleanKey = cleanText(key);

    if (
      cleanKey.includes("bonus") ||
      cleanKey.includes("matchbonus") ||
      cleanKey.includes("selectedmatch")
    ) {
      pushValue(loadJson(key, localStorage.getItem(key)));
    }
  }

  return candidates;
}

function normalizeChoice(value) {
  if (!value) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    return String(
      value.id ||
      value.matchId ||
      value.match_id ||
      value.bonusId ||
      value.selectedBonusId ||
      value.label ||
      value.affiche ||
      value.match ||
      value.name ||
      value.title ||
      getMatchTitle(value) ||
      ""
    ).trim();
  }

  return "";
}

function sameBonus(candidate, match) {
  const candidateText = cleanText(normalizeChoice(candidate));
  const matchId = cleanText(getMatchId(match));
  const matchTitle = cleanText(getMatchTitle(match));
  const matchLabel = cleanText(match?.label || match?.affiche || match?.match || match?.title || "");

  if (!candidateText) return false;

  return (
    candidateText === matchId ||
    candidateText === matchTitle ||
    candidateText === matchLabel ||
    matchTitle.includes(candidateText) ||
    candidateText.includes(matchTitle)
  );
}

function findBonusMatch(player, journeeNumber, bonusList, allMatches) {
  const candidates = getBonusChoiceCandidates(player, journeeNumber);
  const allBonus = allMatches.filter(isBonus);
  const pool = [...bonusList, ...allBonus];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && getMatchTitle(candidate)) {
      return candidate;
    }

    const found = pool.find((match) => sameBonus(candidate, match));

    if (found) {
      return found;
    }
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

function buildFullRanking() {
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
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

function buildPlayerRecap(player) {
  const ranking = buildFullRanking();

  const found = ranking.find((item) => {
    return cleanText(item.name) === cleanText(player);
  });

  return (
    found || {
      name: player,
      points: 0,
      exact: 0,
      rank: "-"
    }
  );
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

export default function HomePage() {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");

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
    const deadline = getDeadline();
    const deadlinePassed = isDeadlinePassed(deadline);
    const club = getFavoriteTeam(player, deadline);
    const playerRecap = buildPlayerRecap(player);
    const profilePhoto = getProfilePhoto(player);
    const photoPosition = getPhotoPosition(player);

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
      profilePhoto,
      photoPosition,
      deadline,
      deadlinePassed,
      validated: getValidatedStatus(player),
      selectedJournee,
      matchesCount: selectedJournee.matches.length,
      bonusCount: selectedJournee.bonus.length,
      selectedBonus,
      selectedBonusTitle,
      selectedBonusLeague: hasSelectedBonus ? getLeague(selectedBonus) || "Bonus" : "",
      hasSelectedBonus,
      podium: buildPodium(),
      playerRecap
    };
  }, [refresh]);

  function handleClubChange(event) {
    const nextClub = event.target.value;
    saveFavoriteTeam(data.player, nextClub, false);
    setValidatedStatus(data.player, false);
    setMessage("");
    setRefresh((value) => value + 1);
  }

  function handleValidateClub() {
    if (!data.club) {
      setMessage("Choisis une equipe avant de valider.");
      return;
    }

    if (data.deadlinePassed) {
      saveFavoriteTeam(data.player, DEFAULT_TEAM, true);
      setMessage("Date limite passee : RC Lens est automatiquement valide.");
      setRefresh((value) => value + 1);
      return;
    }

    saveFavoriteTeam(data.player, data.club, true);
    setMessage(`Equipe favorite validee : ${cleanFavoriteClubDisplay(data.club)}`);
    setRefresh((value) => value + 1);
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

        .home-hero-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .home-player-photo {
          width: 86px;
          height: 86px;
          border-radius: 28px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          background: linear-gradient(135deg, rgba(186,255,0,.22), rgba(29,78,216,.18));
          border: 1px solid rgba(186,255,0,.38);
          box-shadow: 0 16px 34px rgba(0,0,0,.28);
          overflow: hidden;
          color: #baff00;
          font-size: 28px;
          font-weight: 950;
        }

        .home-player-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .home-grid-clean {
          display: grid;
          grid-template-columns: 1fr;
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

        .home-favorite-control {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          margin-top: 16px;
        }

        .home-select {
          width: 100%;
          min-height: 48px;
          border-radius: 16px;
          border: 1px solid rgba(186,255,0,.38);
          background: rgba(15,23,42,.96);
          color: #fff;
          padding: 0 14px;
          font-weight: 950;
          outline: none;
        }

        .home-btn {
          min-height: 48px;
          border: 0;
          border-radius: 16px;
          padding: 0 18px;
          background: #baff00;
          color: #07111f;
          cursor: pointer;
          font-weight: 950;
          box-shadow: 0 12px 26px rgba(186,255,0,.18);
        }

        .home-status {
          display: inline-flex;
          margin-top: 14px;
          padding: 9px 13px;
          border-radius: 999px;
          font-weight: 950;
        }

        .home-status.ok {
          background: rgba(34,197,94,.13);
          border: 1px solid rgba(34,197,94,.30);
          color: #bbf7d0;
        }

        .home-status.wait {
          background: rgba(239,68,68,.13);
          border: 1px solid rgba(239,68,68,.30);
          color: #fecaca;
        }

        .home-deadline {
          margin-top: 10px;
          color: #cbd5e1;
          font-weight: 850;
        }

        .home-message {
          margin-top: 12px;
          padding: 11px 13px;
          border-radius: 14px;
          background: rgba(186,255,0,.12);
          border: 1px solid rgba(186,255,0,.22);
          color: #ecfccb;
          font-weight: 900;
        }

        .home-photo-settings {
          margin-top: 16px;
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
        }

        .home-photo-settings h3 {
          margin: 0 0 12px;
          font-size: 15px;
          color: #fff;
          font-weight: 950;
        }

        .home-photo-range {
          display: grid;
          grid-template-columns: 90px 1fr 42px;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 900;
        }

        .home-photo-range input {
          width: 100%;
          accent-color: #baff00;
        }

        .home-photo-range strong {
          color: #baff00;
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
            grid-template-columns: 1fr;
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

          .home-favorite-control {
            grid-template-columns: 1fr;
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
      `}
      </style>

      <section className="home-hero-clean">
        <div className="home-hero-top">
          <div>
            <h1>Accueil</h1>
            <p>Tableau de bord de la saison Prono Ligue 1 LM.</p>
          </div>

          <div className="home-player-photo" title={data.player}>
            {data.profilePhoto ? (
              <img src={data.profilePhoto} alt={data.player} style={{ objectPosition: `${data.photoPosition.x}% ${data.photoPosition.y}%` }} />
            ) : (
              <span>{getInitials(data.player)}</span>
            )}
          </div>
        </div>
      </section>

                  <div className="home-grid-clean">
        <div className="home-card-clean">
          <span>Club favori</span>
          <strong>{data.club || "Aucun club"}</strong>
          <small>{data.validated ? "Equipe validee" : "En attente de validation"}</small>
        </div>

        <div className="home-card-clean">
          <span>Journee active</span>
          <strong>{data.selectedJournee?.title || "Aucune"}</strong>
          <small>{data.matchesCount} match(s) Ligue 1</small>
        </div>
<div className="home-card-clean">
          <span>Mes points</span>
          <strong>{data.playerRecap.points} pts</strong>
          <small>Rang : {data.playerRecap.rank} | Exact : {data.playerRecap.exact}</small>
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
            <span>Equipe favorite</span>
            <strong>{data.club || "Non choisie"}</strong>
          </div>

          <div className="home-favorite-control">
            <select
              className="home-select"
              value={data.club || DEFAULT_TEAM}
              onChange={handleClubChange}
              disabled={data.deadlinePassed}
            >
              {CLUBS.map((club) => (
                <option key={club} value={club}>
                  {club}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="home-btn"
              onClick={handleValidateClub}
            >
              Valider
            </button>
          </div>

          <div className={data.validated ? "home-status ok" : "home-status wait"}>
            {data.validated
              ? `Equipe favorite validee : ${cleanFavoriteClubDisplay(data.club)}`
              : `Equipe favorite non validee : ${cleanFavoriteClubDisplay(data.club)}`}
          </div>

          <div className="home-deadline">
            Date limite : {formatDeadline(data.deadline)}
          </div>

          <div className="home-deadline">
            Si aucune equipe est validee avant la date limite, RC Lens sera selectionne automatiquement.
          </div>

          {message && <div className="home-message">{message}</div>}

          
        </section>

        <section className="home-panel-clean">
          <h2>Podium du classement</h2>

          {data.podium.length > 0 ? (
            <div className="home-podium">
              {data.podium.map((player, index) => (
                <div className="home-podium-row" key={`${player.name}-${index}`}>
                  <div className="home-podium-rank">
                    {index === 0 ? "1" : index === 1 ? "2" : "3"}
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
              Le podium apparaitra quand le classement sera enregistre.
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
