import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getDisplayName } from "../utils/displayNames";
import ProfileAvatar from "../components/ProfileAvatar";

const CALENDAR_KEY = "admin_journees";
const PRONOS_KEY = "prono_lm_clean_pronos";
const BONUS_BY_JOURNEE_KEY = "prono_lm_bonus_selected_by_journee";
const OLD_BONUS_KEY = "prono_lm_bonus_selected";
const FAVORITE_TEAM_KEY = "favoriteTeam";
const FAVORITE_VALIDATED_KEY = "favoriteTeamValidated";
const FAVORITE_DEADLINE_KEY = "favoriteTeamDeadline";
const FAVORITE_DEADLINE_ALT_KEY = "prono_ligue1_lm_favorite_deadline";

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

function parseJson(value, fallback) {
  try {
    if (!value) return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

function clean(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function sameClub(a, b) {
  const aliases = {
    lens: "lens",
    rclens: "lens",
    racingclublens: "lens",
    psg: "psg",
    parissg: "psg",
    parissaintgermain: "psg",
    om: "marseille",
    marseille: "marseille",
    olympiquedemarseille: "marseille",
    ol: "lyon",
    lyon: "lyon",
    olympiquelyonnais: "lyon",
    losc: "lille",
    lille: "lille",
    lilleosc: "lille",
    rcstrasbourg: "strasbourg",
    strasbourg: "strasbourg"
  };

  const ca = clean(a);
  const cb = clean(b);

  return (aliases[ca] || ca) === (aliases[cb] || cb);
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

function getRawScore(match, names) {
  for (const name of names) {
    const value = match?.[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function getScoreHome(match) {
  return getRawScore(match, [
    "scoreDomicile",
    "scoreHome",
    "homeScore",
    "score1",
    "resultHome",
    "resultatDomicile"
  ]);
}

function getScoreAway(match) {
  return getRawScore(match, [
    "scoreExterieur",
    "scoreAway",
    "awayScore",
    "score2",
    "resultAway",
    "resultatExterieur"
  ]);
}

function hasScore(match) {
  return getScoreHome(match) !== "" && getScoreAway(match) !== "";
}

function getResult1N2(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function computeNormalPoints(match, prono) {
  if (!get1N2Prono(prono) || !hasScore(match)) return 0;

  const realResult = getResult1N2(getScoreHome(match), getScoreAway(match));

  return get1N2Prono(prono) === realResult ? 1 : 0;
}

function computeExactModePoints(match, prono, type) {
  if (!prono || !hasScore(match)) {
    return { points: 0, exact: 0 };
  }

  const realHome = Number(getScoreHome(match));
  const realAway = Number(getScoreAway(match));
  const pronoHome = Number(getScorePronoHome(prono));
  const pronoAway = Number(getScorePronoAway(prono));

  if ([realHome, realAway, pronoHome, pronoAway].some(Number.isNaN)) {
    return { points: 0, exact: 0 };
  }

  const exact = realHome === pronoHome && realAway === pronoAway;
  const good1N2 =
    getResult1N2(realHome, realAway) === getResult1N2(pronoHome, pronoAway);

  if (type === "bonus") {
    if (exact) return { points: 3, exact: 1 };
    if (good1N2) return { points: 2, exact: 0 };
    return { points: 0, exact: 0 };
  }

  if (exact) return { points: 2, exact: 1 };
  if (good1N2) return { points: 1, exact: 0 };

  return { points: 0, exact: 0 };
}

function isFavoriteMatch(match, favoriteTeam) {
  return (
    favoriteTeam &&
    favoriteTeam !== "Non choisi" &&
    (sameClub(getTeamHome(match), favoriteTeam) || sameClub(getTeamAway(match), favoriteTeam))
  );
}

function normalizeJournees(data) {
  if (!Array.isArray(data)) return [];

  return data.map((j, index) => ({
    ...j,
    id: j.id || `j${index + 1}`,
    number: j.number || j.numero || index + 1,
    title: j.title || `J${j.number || j.numero || index + 1}`,
    matches: Array.isArray(j.matches) ? j.matches : Array.isArray(j.matchs) ? j.matchs : [],
    bonus: Array.isArray(j.bonus) ? j.bonus : []
  }));
}

function sortRanking(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  if (b.specialExacts !== a.specialExacts) return b.specialExacts - a.specialExacts;
  return String(a.playerName || "").localeCompare(String(b.playerName || ""), "fr");
}

function getShortMatchTitle(match) {
  if (!match) return "-";
  return `${match.home || "?"} - ${match.away || "?"}`;
}

function isPronoDone(match, prono, favorite) {
  if (!prono) return false;

  if (favorite) {
    return prono.homeScore !== "" && prono.homeScore !== undefined && prono.awayScore !== "" && prono.awayScore !== undefined;
  }

  return Boolean(prono.result);
}


/* points-engine-safe-final */
function getTeamHome(match) {
  return match?.home || match?.domicile || match?.equipeDomicile || match?.homeTeam || match?.club1 || match?.equipe1 || "";
}

function getTeamAway(match) {
  return match?.away || match?.exterieur || match?.equipeExterieur || match?.awayTeam || match?.club2 || match?.equipe2 || "";
}

function getFavoriteTeamValue(value) {
  if (!value) return "Non choisi";

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    if (typeof parsed === "string") return parsed;

    if (parsed && typeof parsed === "object") {
      return parsed.favoriteTeam || parsed.club || parsed.team || parsed.equipe || Object.values(parsed).find(Boolean) || "Non choisi";
    }
  } catch {
    return value;
  }

  return value || "Non choisi";
}

function getJourneePronos(pronos, journee) {
  const keys = [
    journee?.id,
    String(journee?.id || ""),
    journee?.number,
    String(journee?.number || ""),
    `j${journee?.number}`,
    `J${journee?.number}`,
    journee?.title
  ].filter(Boolean);

  for (const key of keys) {
    if (pronos?.[key] && typeof pronos[key] === "object") {
      return pronos[key];
    }
  }

  return {};
}

function getMatchKeyCandidates(match) {
  const home = getTeamHome(match);
  const away = getTeamAway(match);

  const values = [
    match?.id,
    match?.matchId,
    match?.idMatch,
    match?.match_id,
    match?.key,
    match?.slug,
    `${home}-${away}`,
    `${home} vs ${away}`,
    `${home} - ${away}`,
    `${clean(home)}-${clean(away)}`,
    `${clean(home)}vs${clean(away)}`
  ]
    .filter(Boolean)
    .map((value) => String(value));

  return [...new Set(values)];
}

function getPronoForMatch(playerJourneePronos, match) {
  if (!playerJourneePronos || typeof playerJourneePronos !== "object") return null;

  for (const key of getMatchKeyCandidates(match)) {
    if (playerJourneePronos[key]) {
      return playerJourneePronos[key];
    }
  }

  const home = clean(getTeamHome(match));
  const away = clean(getTeamAway(match));

  for (const [key, value] of Object.entries(playerJourneePronos)) {
    const cleanedKey = clean(key);

    if (home && away && cleanedKey.includes(home) && cleanedKey.includes(away)) {
      return value;
    }
  }

  return null;
}

function getScorePronoHome(prono) {
  const value =
    prono?.homeScore ??
    prono?.home ??
    prono?.scoreHome ??
    prono?.pronoHome ??
    prono?.domicile ??
    prono?.scoreDomicile ??
    "";

  return value === null || value === undefined ? "" : String(value);
}

function getScorePronoAway(prono) {
  const value =
    prono?.awayScore ??
    prono?.away ??
    prono?.scoreAway ??
    prono?.pronoAway ??
    prono?.exterieur ??
    prono?.scoreExterieur ??
    "";

  return value === null || value === undefined ? "" : String(value);
}

function isScorePronoFilled(prono) {
  return getScorePronoHome(prono) !== "" && getScorePronoAway(prono) !== "";
}

function get1N2Prono(prono) {
  const value =
    prono?.result ??
    prono?.value ??
    prono?.prediction ??
    prono?.pronostic ??
    prono?.choice ??
    "";

  return value === null || value === undefined ? "" : String(value);
}

function normalizeBonusChoice(value) {
  if (!value) return "";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    return String(
      value.id ||
      value.matchId ||
      value.match_id ||
      value.bonusId ||
      value.selectedBonusId ||
      value.title ||
      value.label ||
      value.match ||
      ""
    );
  }

  return "";
}

function isSelectedBonusMatch(selectedBonusId, match) {
  const selected = clean(normalizeBonusChoice(selectedBonusId));
  if (!selected) return false;

  return getMatchKeyCandidates(match).some((key) => {
    const cleanedKey = clean(key);
    return cleanedKey === selected || cleanedKey.includes(selected) || selected.includes(cleanedKey);
  });
}
export default function HomePage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [journees, setJournees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [storageRows, setStorageRows] = useState([]);
  const [favoriteDraft, setFavoriteDraft] = useState(DEFAULT_TEAM);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user || null;
      setCurrentUser(user);

      let calendar = parseJson(localStorage.getItem(CALENDAR_KEY), []);

      if ((!calendar || calendar.length === 0) && supabase) {
        const { data } = await supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", CALENDAR_KEY)
          .maybeSingle();

        calendar = parseJson(data?.setting_value, []);
      }

      setJournees(normalizeJournees(calendar));

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,player_name,account_status")
        .order("player_name", { ascending: true });

      if (profileError) throw profileError;

      const { data: pronoData, error: pronoError } = await supabase
        .from("user_prono_storage")
        .select("user_id,storage_key,storage_value");

      if (pronoError) throw pronoError;

      setProfiles(profileData || []);
      setStorageRows(pronoData || []);
    } catch (err) {
      setMessage(err.message || "Erreur chargement accueil.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    function refresh() {
      loadData();
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("pronos-updated", refresh);
    window.addEventListener("favorite-team-updated", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pronos-updated", refresh);
      window.removeEventListener("favorite-team-updated", refresh);
    };
  }, []);

  const storageByUser = useMemo(() => {
    const map = {};

    storageRows.forEach((row) => {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.storage_key] = row.storage_value;
    });

    return map;
  }, [storageRows]);

  const scoredMatches = useMemo(() => {
    const rows = [];

    journees.forEach((journee) => {
      [...(journee.matches || []), ...(journee.bonus || [])].forEach((match) => {
        if (hasScore(match)) {
          rows.push({
            ...match,
            journeeId: journee.id,
            journeeTitle: journee.title,
            journeeNumber: journee.number
          });
        }
      });
    });

    return rows;
  }, [journees]);

  const scoredJournees = useMemo(() => {
    return [...new Set(scoredMatches.map((m) => Number(m.journeeNumber || 0)).filter(Boolean))]
      .sort((a, b) => a - b);
  }, [scoredMatches]);

  const lastJournee = scoredJournees[scoredJournees.length - 1] || 1;

  function calculatePlayer(profile, onlyBeforeLast = false) {
    const store = storageByUser[profile.id] || {};
    const pronos = parseJson(store[PRONOS_KEY], {});
    const bonusByJournee = parseJson(store[BONUS_BY_JOURNEE_KEY], {});
    const oldBonus = store[OLD_BONUS_KEY] || "";
    const favoriteTeam = getFavoriteTeamValue(store[FAVORITE_TEAM_KEY]);

    let total = 0;
    let favoriteExact = 0;
    let bonusExact = 0;
    let lastPoints = 0;

    journees.forEach((journee) => {
      const isLast = Number(journee.number) === Number(lastJournee);
      if (onlyBeforeLast && isLast) return;

      const playerJourneePronos = getJourneePronos(pronos, journee);

      (journee.matches || []).forEach((match) => {
        if (!hasScore(match)) return;

        const prono = getPronoForMatch(playerJourneePronos, match);
        const favorite = isFavoriteMatch(match, favoriteTeam);

        let result;

        if (favorite) {
          result = computeExactModePoints(match, prono, "favorite");
          favoriteExact += result.exact;
        } else {
          result = { points: computeNormalPoints(match, prono), exact: 0 };
        }

        total += result.points;
        if (isLast) lastPoints += result.points;
      });

      (journee.bonus || []).forEach((match) => {
        if (!hasScore(match)) return;

        const selectedBonusId = bonusByJournee[journee.id] || oldBonus;
        if (!isSelectedBonusMatch(selectedBonusId, match)) return;

        const prono = getPronoForMatch(playerJourneePronos, match);
        const result = computeExactModePoints(match, prono, "bonus");

        total += result.points;
        bonusExact += result.exact;
        if (isLast) lastPoints += result.points;
      });
    });

    const playerName = profile.player_name || profile.email?.split("@")[0] || "Joueur";

    return {
      playerName,
      total,
      favoriteExact,
      bonusExact,
      specialExacts: favoriteExact + bonusExact,
      lastPoints,
      favoriteTeam
    };
  }

  const ranking = useMemo(() => {
    const activeProfiles = profiles.filter((p) => {
      const status = p.account_status || "active";
      return status === "active";
    });

    const current = activeProfiles
      .map((profile) => calculatePlayer(profile, false))
      .sort(sortRanking)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const beforeLast = activeProfiles
      .map((profile) => calculatePlayer(profile, true))
      .sort(sortRanking)
      .map((item, index) => ({ playerName: item.playerName, oldRank: index + 1 }));

    return current.map((item) => {
      const old = beforeLast.find((entry) => entry.playerName === item.playerName);
      const oldRank = old?.oldRank || item.rank;
      const evolution = oldRank - item.rank;

      return { ...item, oldRank, evolution };
    });
  }, [profiles, storageByUser, journees, lastJournee]);

  const currentProfile = useMemo(() => {
    if (!currentUser) return null;
    return profiles.find((profile) => profile.id === currentUser.id) || null;
  }, [profiles, currentUser]);

  const currentPlayerName =
    currentProfile?.player_name ||
    currentUser?.email?.split("@")[0] ||
    "Joueur";

  const currentStore = currentUser ? storageByUser[currentUser.id] || {} : {};
  const currentFavorite =
    currentStore[FAVORITE_TEAM_KEY] ||
    localStorage.getItem(FAVORITE_TEAM_KEY) ||
    localStorage.getItem("clubFavori") ||
    localStorage.getItem("selectedClub") ||
    DEFAULT_TEAM;

  useEffect(() => {
    setFavoriteDraft(currentFavorite || DEFAULT_TEAM);
  }, [currentFavorite]);

  const deadline = getDeadline();
  const deadlinePassed = isDeadlinePassed(deadline);
  const favoriteValidated =
    currentStore[FAVORITE_VALIDATED_KEY] === "true" ||
    localStorage.getItem(FAVORITE_VALIDATED_KEY) === "true" ||
    Boolean(currentStore[FAVORITE_TEAM_KEY]);

  const activeJournee = useMemo(() => {
    const firstOpen = journees.find((journee) => {
      const all = [...(journee.matches || []), ...(journee.bonus || [])];
      if (!all.length) return false;
      return all.some((match) => !hasScore(match));
    });

    return firstOpen || journees[0] || {
      id: "j1",
      number: 1,
      title: "J1",
      matches: [],
      bonus: []
    };
  }, [journees]);

  const currentPlayerRecap = useMemo(() => {
    return ranking.find((player) => clean(player.playerName) === clean(currentPlayerName)) || {
      playerName: currentPlayerName,
      total: 0,
      specialExacts: 0,
      lastPoints: 0,
      rank: "-"
    };
  }, [ranking, currentPlayerName]);

  const pronosStatus = useMemo(() => {
    const pronos = parseJson(currentStore[PRONOS_KEY], {});
    const bonusByJournee = parseJson(currentStore[BONUS_BY_JOURNEE_KEY], {});
    const oldBonus = currentStore[OLD_BONUS_KEY] || "";

    const journeePronos = pronos[activeJournee.id] || {};
    let totalNeeded = 0;
    let done = 0;

    (activeJournee.matches || []).forEach((match) => {
      totalNeeded += 1;

      const prono = journeePronos[match.id];
      const favorite = isFavoriteMatch(match, currentFavorite);

      if (isPronoDone(match, prono, favorite)) {
        done += 1;
      }
    });

    if ((activeJournee.bonus || []).length > 0) {
      totalNeeded += 1;

      const selectedBonusId = bonusByJournee[activeJournee.id] || oldBonus;
      const selectedBonus = (activeJournee.bonus || []).find((match) => match.id === selectedBonusId);
      const prono = selectedBonus ? journeePronos[selectedBonus.id] : null;

      if (
        selectedBonus &&
        prono &&
        prono.homeScore !== "" &&
        prono.homeScore !== undefined &&
        prono.awayScore !== "" &&
        prono.awayScore !== undefined
      ) {
        done += 1;
      }
    }

    return {
      done,
      totalNeeded,
      complete: totalNeeded > 0 && done === totalNeeded
    };
  }, [currentStore, activeJournee, currentFavorite]);

  async function handleValidateFavorite() {
    if (!favoriteDraft) {
      setMessage("Choisis une equipe avant de valider.");
      return;
    }

    if (deadlinePassed) {
      setMessage("La date limite est passee. Le choix ne peut plus etre modifie.");
      return;
    }

    localStorage.setItem(FAVORITE_TEAM_KEY, favoriteDraft);
    localStorage.setItem("clubFavori", favoriteDraft);
    localStorage.setItem("selectedClub", favoriteDraft);
    localStorage.setItem(FAVORITE_VALIDATED_KEY, "true");

    if (currentUser) {
      const rows = [
        {
          user_id: currentUser.id,
          storage_key: FAVORITE_TEAM_KEY,
          storage_value: favoriteDraft,
          updated_at: new Date().toISOString()
        },
        {
          user_id: currentUser.id,
          storage_key: FAVORITE_VALIDATED_KEY,
          storage_value: "true",
          updated_at: new Date().toISOString()
        }
      ];

      const { error } = await supabase
        .from("user_prono_storage")
        .upsert(rows, { onConflict: "user_id,storage_key" });

      if (error) {
        setMessage(error.message || "Erreur sauvegarde equipe favorite.");
        return;
      }
    }

    setMessage(`Equipe favorite validee : ${favoriteDraft}`);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("favorite-team-updated"));
    loadData();
  }

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);



  if (loading) {
    return (
      <div className="home-page-final">
        <section className="home-hero-final">
          <h1>Accueil</h1>
          <p>Chargement du tableau de bord...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="home-page-final">
      <style>{`
        .home-page-final {
          color: #f8fafc;
        }

        .home-hero-final {
          margin-bottom: 18px;
          padding: 28px;
          border-radius: 30px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.34));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 24px 70px rgba(0,0,0,.28);
        }

        .home-hero-row-final {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
        }

        .home-hero-final h1 {
          margin: 0;
          font-size: 40px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .home-hero-final p {
          margin: 10px 0 0;
          color: #cbd5e1;
          font-weight: 800;
        }

        .home-avatar-box {
          display: grid;
          place-items: center;
          width: 74px;
          height: 74px;
          border-radius: 24px;
          background: rgba(186,255,0,.12);
          border: 1px solid rgba(186,255,0,.28);
        }

        .home-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .home-kpi {
          padding: 18px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.22);
        }

        .home-kpi span {
          display: block;
          color: #9fb0ca;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 8px;
        }

        .home-kpi strong {
          display: block;
          color: #ffffff;
          font-size: 25px;
          font-weight: 950;
          line-height: 1.05;
        }

        .home-kpi small {
          display: block;
          margin-top: 9px;
          color: #baff00;
          font-weight: 900;
        }

        .home-main-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: start;
        }

        .home-card {
          padding: 22px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(15,23,42,.94), rgba(2,6,23,.96));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.24);
        }

        .home-card h2 {
          margin: 0 0 14px;
          font-size: 25px;
          font-weight: 950;
        }

        .home-line {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255,255,255,.08);
          color: #cbd5e1;
          font-weight: 850;
        }

        .home-line:last-child {
          border-bottom: 0;
        }

        .home-line strong {
          color: #ffffff;
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
          color: #ffffff;
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

        .home-btn:disabled,
        .home-select:disabled {
          opacity: .55;
          cursor: not-allowed;
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

        .home-message {
          margin-top: 12px;
          padding: 11px 13px;
          border-radius: 14px;
          background: rgba(186,255,0,.12);
          border: 1px solid rgba(186,255,0,.22);
          color: #ecfccb;
          font-weight: 900;
        }

        .home-podium-list,
        .home-match-list {
          display: grid;
          gap: 10px;
        }

        .home-podium-row,
        .home-match-row {
          display: grid;
          grid-template-columns: 46px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
        }

        .home-rank {
          width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: rgba(186,255,0,.14);
          color: #baff00;
          font-weight: 950;
        }

        .home-player-name {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 950;
        }

        .home-sub {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 850;
        }

        .home-points {
          color: #d9ff66;
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

        .home-second-row {
          margin-top: 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: start;
        }

        @media (max-width: 1050px) {
          .home-kpi-grid,
          .home-main-grid,
          .home-second-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .home-hero-row-final {
            align-items: flex-start;
            flex-direction: column;
          }

          .home-hero-final h1 {
            font-size: 32px;
          }

          .home-favorite-control {
            grid-template-columns: 1fr;
          }

          .home-podium-row,
          .home-match-row {
            grid-template-columns: 42px 1fr;
          }

          .home-points {
            grid-column: 2;
          }
        }
      `}</style>

      <section className="home-hero-final">
        <div className="home-hero-row-final">
          <div>
            <h1>Bienvenue {getDisplayName(currentPlayerName)}</h1>
            <p>Tableau de bord de la saison Prono Ligue 1 LM.</p>
          </div>

          <div className="home-avatar-box">
            <ProfileAvatar player={currentPlayerName} size={56} />
          </div>
        </div>
      </section>

      {message && <div className="home-message" style={{ marginBottom: 16 }}>{message}</div>}

      <section className="home-kpi-grid">
        <article className="home-kpi">
          <span>Mes points</span>
          <strong>{currentPlayerRecap.total} pts</strong>
          <small>{currentPlayerRecap.specialExacts} exact(s) bonus/favori</small>
        </article>

        <article className="home-kpi">
          <span>Mon rang</span>
          <strong>{currentPlayerRecap.rank}</strong>
          <small>Classement general</small>
        </article>

        <article className="home-kpi">
          <span>Journee active</span>
          <strong>{activeJournee.title}</strong>
          <small>{activeJournee.matches.length} match(s) Ligue 1</small>
        </article>

        <article className="home-kpi">
          <span>Mes pronos</span>
          <strong>{pronosStatus.complete ? "Complet" : "A faire"}</strong>
          <small>{pronosStatus.done}/{pronosStatus.totalNeeded} selection(s)</small>
        </article>
      </section>

      <section className="home-main-grid">
        <article className="home-card">
          <h2>Mon espace joueur</h2>

          <div className="home-line">
            <span>Joueur</span>
            <strong>{getDisplayName(currentPlayerName)}</strong>
          </div>

          <div className="home-line">
            <span>Equipe favorite</span>
            <strong>{currentFavorite || "Non choisi"}</strong>
          </div>

          <div className="home-line">
            <span>Date limite</span>
            <strong>{formatDeadline(deadline)}</strong>
          </div>

          <div className="home-favorite-control">
            <select
              className="home-select"
              value={favoriteDraft || DEFAULT_TEAM}
              onChange={(event) => setFavoriteDraft(event.target.value)}
              disabled={deadlinePassed}
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
              onClick={handleValidateFavorite}
              disabled={deadlinePassed}
            >
              Valider
            </button>
          </div>

          <div className={favoriteValidated ? "home-status ok" : "home-status wait"}>
            {favoriteValidated ? "Equipe favorite validee" : "Equipe favorite non validee"}
          </div>
        </article>

        <article className="home-card">
          <h2>Podium actuel</h2>

          {podium.length ? (
            <div className="home-podium-list">
              {podium.map((player) => (
                <div className="home-podium-row" key={player.playerName}>
                  <div className="home-rank">{player.rank}</div>

                  <div>
                    <div className="home-player-name">
                      <ProfileAvatar player={player.playerName} size={24} />
                      <span>{getDisplayName(player.playerName)}</span>
                    </div>
                    <div className="home-sub">
                      {player.specialExacts} exact(s) bonus/favori
                    </div>
                  </div>

                  <div className="home-points">{player.total} pts</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="home-empty">
              Le podium apparaitra quand les premiers resultats seront saisis.
            </div>
          )}
        </article>
      </section>

    </div>
  );
}



