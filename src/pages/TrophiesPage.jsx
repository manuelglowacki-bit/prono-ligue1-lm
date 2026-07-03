import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getDisplayName } from "../utils/displayNames";
import ProfileAvatar from "../components/ProfileAvatar";

const CALENDAR_KEY = "admin_journees";
const PRONOS_KEY = "prono_lm_clean_pronos";
const BONUS_BY_JOURNEE_KEY = "prono_lm_bonus_selected_by_journee";
const OLD_BONUS_KEY = "prono_lm_bonus_selected";
const FAVORITE_TEAM_KEY = "favoriteTeam";

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

function getTeamHome(match) {
  return match?.home || match?.domicile || match?.equipeDomicile || match?.homeTeam || match?.club1 || match?.equipe1 || "";
}

function getTeamAway(match) {
  return match?.away || match?.exterieur || match?.equipeExterieur || match?.awayTeam || match?.club2 || match?.equipe2 || "";
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

function computeNormal(match, prono) {
  if (!get1N2Prono(prono) || !hasScore(match)) {
    return { points: 0, correct: false };
  }

  const realResult = getResult1N2(getScoreHome(match), getScoreAway(match));
  const correct = get1N2Prono(prono) === realResult;

  return { points: correct ? 1 : 0, correct };
}

function computeExactMode(match, prono, type) {
  if (!prono || !hasScore(match) || !isScorePronoFilled(prono)) {
    return { points: 0, exact: false, correct: false };
  }

  const realHome = Number(getScoreHome(match));
  const realAway = Number(getScoreAway(match));
  const pronoHome = Number(getScorePronoHome(prono));
  const pronoAway = Number(getScorePronoAway(prono));

  if ([realHome, realAway, pronoHome, pronoAway].some(Number.isNaN)) {
    return { points: 0, exact: false, correct: false };
  }

  const exact = realHome === pronoHome && realAway === pronoAway;
  const correct = getResult1N2(realHome, realAway) === getResult1N2(pronoHome, pronoAway);

  if (type === "bonus") {
    if (exact) return { points: 3, exact: true, correct: true };
    if (correct) return { points: 2, exact: false, correct: true };
    return { points: 0, exact: false, correct: false };
  }

  if (exact) return { points: 2, exact: true, correct: true };
  if (correct) return { points: 1, exact: false, correct: true };

  return { points: 0, exact: false, correct: false };
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

function getLevel(value, levels) {
  let level = null;

  levels.forEach((item) => {
    if (value >= item.value) {
      level = item;
    }
  });

  return level;
}

function getNextLevel(value, levels) {
  return levels.find((item) => value < item.value) || null;
}

function buildTrophy(trophy) {
  const currentLevel = getLevel(trophy.value, trophy.levels);
  const nextLevel = getNextLevel(trophy.value, trophy.levels);
  const target = nextLevel ? nextLevel.value : trophy.levels[trophy.levels.length - 1].value;
  const progress = target ? Math.min(100, Math.round((trophy.value / target) * 100)) : 0;

  return {
    ...trophy,
    currentLevel,
    nextLevel,
    target,
    progress,
    status: currentLevel ? "unlocked" : trophy.value > 0 ? "progress" : "locked"
  };
}

function rate(correct, attempts) {
  if (!attempts) return 0;
  return Math.round((correct / attempts) * 100);
}

export default function TrophiesPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [journees, setJournees] = useState([]);
  const [store, setStore] = useState({});
  const [filter, setFilter] = useState("Tous");
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
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

      if (user?.id) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id,email,player_name,account_status")
          .eq("id", user.id)
          .maybeSingle();

        setProfile(profileData || null);

        const { data: rows, error } = await supabase
          .from("user_prono_storage")
          .select("storage_key,storage_value")
          .eq("user_id", user.id);

        if (error) throw error;

        const nextStore = {};
        (rows || []).forEach((row) => {
          nextStore[row.storage_key] = row.storage_value;
        });

        setStore(nextStore);
      }
    } catch (err) {
      setMessage(err.message || "Erreur chargement trophees.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const interval = setInterval(() => loadData(true), 3000);

    function refresh() {
      loadData(true);
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("pronos-updated", refresh);
    window.addEventListener("favorite-team-updated", refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pronos-updated", refresh);
      window.removeEventListener("favorite-team-updated", refresh);
    };
  }, []);

  const playerName =
    profile?.player_name ||
    currentUser?.email?.split("@")[0] ||
    "Joueur";

  const stats = useMemo(() => {
    const pronos = parseJson(store[PRONOS_KEY], {});
    const bonusByJournee = parseJson(store[BONUS_BY_JOURNEE_KEY], {});
    const oldBonus = store[OLD_BONUS_KEY] || "";
    const favoriteTeam = getFavoriteTeamValue(store[FAVORITE_TEAM_KEY]);

    let totalPoints = 0;
    let normalPoints = 0;
    let favoritePoints = 0;
    let bonusPoints = 0;

    let bonsResultats = 0;
    let normalCorrect = 0;
    let favoriteCorrect = 0;
    let bonusCorrect = 0;

    let scoresExacts = 0;
    let favoriteExacts = 0;
    let bonusExacts = 0;

    let pronosJoues = 0;
    const pointsByDay = {};

    journees.forEach((journee) => {
      const playerJourneePronos = getJourneePronos(pronos, journee);
      let dayPoints = 0;
      let playedThisDay = false;

      (journee.matches || []).forEach((match) => {
        if (!hasScore(match)) return;

        const prono = getPronoForMatch(playerJourneePronos, match);
        const favorite = isFavoriteMatch(match, favoriteTeam);

        if (favorite) {
          if (!isScorePronoFilled(prono)) return;

          const result = computeExactMode(match, prono, "favorite");

          pronosJoues += 1;
          playedThisDay = true;

          totalPoints += result.points;
          favoritePoints += result.points;
          dayPoints += result.points;

          if (result.correct) {
            bonsResultats += 1;
            favoriteCorrect += 1;
          }

          if (result.exact) {
            scoresExacts += 1;
            favoriteExacts += 1;
          }
        } else {
          if (!get1N2Prono(prono)) return;

          const result = computeNormal(match, prono);

          pronosJoues += 1;
          playedThisDay = true;

          totalPoints += result.points;
          normalPoints += result.points;
          dayPoints += result.points;

          if (result.correct) {
            bonsResultats += 1;
            normalCorrect += 1;
          }
        }
      });

      (journee.bonus || []).forEach((match) => {
        if (!hasScore(match)) return;

        const selectedBonusId = bonusByJournee[journee.id] || oldBonus;
        if (!isSelectedBonusMatch(selectedBonusId, match)) return;

        const prono = getPronoForMatch(playerJourneePronos, match);
        if (!isScorePronoFilled(prono)) return;

        const result = computeExactMode(match, prono, "bonus");

        pronosJoues += 1;
        playedThisDay = true;

        totalPoints += result.points;
        bonusPoints += result.points;
        dayPoints += result.points;

        if (result.correct) {
          bonsResultats += 1;
          bonusCorrect += 1;
        }

        if (result.exact) {
          scoresExacts += 1;
          bonusExacts += 1;
        }
      });

      if (playedThisDay) {
        pointsByDay[journee.number] = (pointsByDay[journee.number] || 0) + dayPoints;
      }
    });

    const dayValues = Object.values(pointsByDay);
    const meilleureJournee = dayValues.length ? Math.max(...dayValues) : 0;
    const grossesJournees = dayValues.filter((points) => points >= 8).length;
    const journeesJouees = Object.keys(pointsByDay).length;
    const successRate = rate(bonsResultats, pronosJoues);

    return {
      totalPoints,
      normalPoints,
      favoritePoints,
      bonusPoints,
      bonsResultats,
      normalCorrect,
      favoriteCorrect,
      bonusCorrect,
      scoresExacts,
      favoriteExacts,
      bonusExacts,
      pronosJoues,
      meilleureJournee,
      grossesJournees,
      journeesJouees,
      successRate
    };
  }, [journees, store]);

  const trophies = useMemo(() => {
    const list = [
      {
        icon: "🏆",
        title: "Machine a points",
        category: "Points",
        description: "Accumuler des points sur plusieurs saisons.",
        value: stats.totalPoints,
        unit: "pts",
        levels: [
          { name: "Bronze", value: 100 },
          { name: "Argent", value: 300 },
          { name: "Or", value: 800 },
          { name: "Legende", value: 1600 }
        ]
      },
      {
        icon: "🔥",
        title: "Grosse journee",
        category: "Points",
        description: "Faire des journees a 8 points ou plus.",
        value: stats.grossesJournees,
        unit: "J",
        levels: [
          { name: "Bronze", value: 1 },
          { name: "Argent", value: 5 },
          { name: "Or", value: 15 },
          { name: "Legende", value: 40 }
        ]
      },
      {
        icon: "💎",
        title: "Oeil de lynx",
        category: "Scores exacts",
        description: "Trouver des scores exacts bonus ou club favori.",
        value: stats.scoresExacts,
        unit: "exact",
        levels: [
          { name: "Bronze", value: 5 },
          { name: "Argent", value: 20 },
          { name: "Or", value: 50 },
          { name: "Legende", value: 100 }
        ]
      },
      {
        icon: "⚽",
        title: "Maitre du 1N2",
        category: "1N2",
        description: "Trouver les bons resultats classiques.",
        value: stats.normalCorrect,
        unit: "OK",
        levels: [
          { name: "Bronze", value: 20 },
          { name: "Argent", value: 100 },
          { name: "Or", value: 250 },
          { name: "Legende", value: 600 }
        ]
      },
      {
        icon: "🎯",
        title: "Roi du bonus",
        category: "Bonus",
        description: "Marquer des points sur les matchs bonus.",
        value: stats.bonusPoints,
        unit: "pts",
        levels: [
          { name: "Bronze", value: 10 },
          { name: "Argent", value: 50 },
          { name: "Or", value: 150 },
          { name: "Legende", value: 350 }
        ]
      },
      {
        icon: "⭐",
        title: "Club de coeur",
        category: "Favori",
        description: "Marquer des points avec son club favori.",
        value: stats.favoritePoints,
        unit: "pts",
        levels: [
          { name: "Bronze", value: 10 },
          { name: "Argent", value: 75 },
          { name: "Or", value: 200 },
          { name: "Legende", value: 500 }
        ]
      },
      {
        icon: "✅",
        title: "Toujours present",
        category: "Regularite",
        description: "Participer aux journees de pronostics.",
        value: stats.journeesJouees,
        unit: "J",
        levels: [
          { name: "Bronze", value: 5 },
          { name: "Argent", value: 34 },
          { name: "Or", value: 100 },
          { name: "Legende", value: 200 }
        ]
      },
      {
        icon: "📋",
        title: "Pronos joues",
        category: "Regularite",
        description: "Remplir un maximum de pronostics.",
        value: stats.pronosJoues,
        unit: "pronos",
        levels: [
          { name: "Bronze", value: 50 },
          { name: "Argent", value: 300 },
          { name: "Or", value: 900 },
          { name: "Legende", value: 2000 }
        ]
      }
    ];

    return list.map(buildTrophy);
  }, [stats]);

  const earnedTrophies = trophies.filter((trophy) => trophy.currentLevel);

  const unlockedLevels = trophies.reduce((total, trophy) => {
    return total + trophy.levels.filter((level) => trophy.value >= level.value).length;
  }, 0);

  const totalLevels = trophies.length * 4;
  const globalProgress = totalLevels ? Math.round((unlockedLevels / totalLevels) * 100) : 0;

  const filters = ["Tous", "Points", "Scores exacts", "1N2", "Bonus", "Favori", "Regularite", "Debloques", "En cours", "Verrouilles"];

  const filteredTrophies = trophies.filter((trophy) => {
    if (filter === "Tous") return true;
    if (filter === "Debloques") return trophy.currentLevel;
    if (filter === "En cours") return trophy.status === "progress";
    if (filter === "Verrouilles") return trophy.status === "locked";
    return trophy.category === filter;
  });

  if (loading) {
    return (
      <div className="trophies-page-final">
        <section className="trophies-header-final">
          <h1>Trophees</h1>
          <p>Chargement de la collection...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="trophies-page-final">
      <style>{`
        .trophies-page-final {
          color: #f8fafc;
        }

        .trophies-header-final {
          margin-bottom: 18px;
          padding: 28px;
          border-radius: 30px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.34));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 24px 70px rgba(0,0,0,.28);
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
        }

        .trophies-header-final h1 {
          margin: 0;
          font-size: 40px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .trophies-header-final p {
          margin: 10px 0 0;
          color: #cbd5e1;
          font-weight: 800;
        }

        .trophies-avatar {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .trophies-progress-card {
          min-width: 170px;
          padding: 18px;
          border-radius: 22px;
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.12);
          text-align: right;
        }

        .trophies-progress-card span {
          display: block;
          color: #9fb0ca;
          font-weight: 950;
          font-size: 12px;
          text-transform: uppercase;
        }

        .trophies-progress-card strong {
          display: block;
          margin-top: 4px;
          color: #baff00;
          font-size: 34px;
          font-weight: 950;
        }

        .trophies-progress-card small {
          display: block;
          margin-top: 4px;
          color: #cbd5e1;
          font-weight: 900;
        }

        .trophies-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .trophies-kpi {
          padding: 18px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.22);
        }

        .trophies-kpi span {
          display: block;
          color: #9fb0ca;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 8px;
        }

        .trophies-kpi strong {
          display: block;
          color: #ffffff;
          font-size: 26px;
          font-weight: 950;
          line-height: 1.05;
        }

        .trophies-kpi small {
          display: block;
          margin-top: 9px;
          color: #baff00;
          font-weight: 900;
        }

        .trophies-filters-final {
          margin-bottom: 18px;
          padding: 14px;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .trophies-filters-final button {
          min-height: 44px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 999px;
          padding: 0 16px;
          background: rgba(255,255,255,.07);
          color: #e5e7eb;
          font-weight: 950;
          cursor: pointer;
        }

        .trophies-filters-final button.active {
          background: #22c55e;
          border-color: #22c55e;
          color: #07111f;
        }

        .trophies-grid-final {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }

        .trophy-card-final {
          padding: 20px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.22);
        }

        .trophy-card-final.locked {
          opacity: .58;
        }

        .trophy-card-final.unlocked {
          border-color: rgba(186,255,0,.45);
          box-shadow:
            0 0 0 1px rgba(186,255,0,.14),
            0 18px 42px rgba(0,0,0,.28);
        }

        .trophy-top-final {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }

        .trophy-icon-final {
          width: 52px;
          height: 52px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: rgba(186,255,0,.12);
          border: 1px solid rgba(186,255,0,.20);
          font-size: 26px;
        }

        .trophy-level-final {
          padding: 8px 11px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 950;
        }

        .trophy-card-final.unlocked .trophy-level-final {
          background: rgba(186,255,0,.16);
          color: #d9ff66;
          border: 1px solid rgba(186,255,0,.32);
        }

        .trophy-card-final h2 {
          margin: 0;
          color: #ffffff;
          font-size: 22px;
          line-height: 1.1;
          font-weight: 950;
        }

        .trophy-card-final p {
          min-height: 42px;
          margin: 10px 0 16px;
          color: #94a3b8;
          font-weight: 850;
          line-height: 1.35;
        }

        .trophy-levels-final {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .trophy-levels-final button {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.08);
          color: #94a3b8;
          font-weight: 950;
          cursor: pointer;
        }

        .trophy-levels-final button.done {
          background: #22c55e;
          border-color: #22c55e;
          color: #07111f;
        }

        .trophy-detail-final {
          margin-bottom: 14px;
          padding: 12px;
          border-radius: 16px;
          background: rgba(186,255,0,.08);
          border: 1px solid rgba(186,255,0,.22);
          color: #ecfccb;
          font-weight: 850;
        }

        .trophy-detail-final strong,
        .trophy-detail-final span,
        .trophy-detail-final small {
          display: block;
        }

        .trophy-meta-final {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
          color: #cbd5e1;
          font-weight: 900;
        }

        .trophy-meta-final strong {
          color: #baff00;
          text-align: right;
        }

        .trophy-bar-final {
          height: 11px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          overflow: hidden;
        }

        .trophy-bar-final div {
          height: 100%;
          border-radius: 999px;
          background: #baff00;
        }

        .trophy-footer-final {
          margin-top: 10px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          color: #94a3b8;
          font-weight: 900;
          font-size: 13px;
        }

        .trophy-footer-final strong {
          color: #ffffff;
        }

        .trophies-empty-final {
          padding: 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.05);
          border: 1px dashed rgba(255,255,255,.16);
          color: #94a3b8;
          font-weight: 850;
        }

        @media (max-width: 1250px) {
          .trophies-grid-final {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 850px) {
          .trophies-header-final {
            align-items: flex-start;
            flex-direction: column;
          }

          .trophies-progress-card {
            width: 100%;
            text-align: left;
          }

          .trophies-kpi-grid,
          .trophies-grid-final {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className="trophies-header-final">
        <div>
          <div className="trophies-avatar">
            <ProfileAvatar player={playerName} size={56} />
            <div>
              <h1>Collection de {getDisplayName(playerName)}</h1>
              <p>Badges evolutifs : Bronze / Argent / Or / Legende</p>
            </div>
          </div>
        </div>

        <div className="trophies-progress-card">
          <span>Progression</span>
          <strong>{globalProgress}%</strong>
          <small>{unlockedLevels}/{totalLevels} niveaux</small>
        </div>
      </section>

      {message && <div className="trophies-empty-final" style={{ marginBottom: 16 }}>{message}</div>}

      <section className="trophies-kpi-grid">
        <article className="trophies-kpi">
          <span>Points actuels</span>
          <strong>{stats.totalPoints} pts</strong>
          <small>Points gagnes sur la saison</small>
        </article>

        <article className="trophies-kpi">
          <span>Scores exacts</span>
          <strong>{stats.scoresExacts}</strong>
          <small>{stats.favoriteExacts} favori - {stats.bonusExacts} bonus</small>
        </article>

        <article className="trophies-kpi">
          <span>Meilleure journee</span>
          <strong>{stats.meilleureJournee} pts</strong>
          <small>Record actuel</small>
        </article>

        <article className="trophies-kpi">
          <span>Reussite</span>
          <strong>{stats.successRate}%</strong>
          <small>{stats.bonsResultats}/{stats.pronosJoues} bons pronos</small>
        </article>
      </section>

      <section className="trophies-filters-final">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </section>

      <section className="trophies-grid-final">
        {filteredTrophies.length ? (
          filteredTrophies.map((trophy) => (
            <article
              key={trophy.title}
              className={`trophy-card-final ${trophy.status}`}
              title={trophy.description}
            >
              <div className="trophy-top-final">
                <div className="trophy-icon-final">{trophy.icon}</div>
                <div className="trophy-level-final">
                  {trophy.currentLevel ? trophy.currentLevel.name : "Verrouille"}
                </div>
              </div>

              <h2>{trophy.title}</h2>
              <p>{trophy.description}</p>

              <div className="trophy-levels-final">
                {trophy.levels.map((level) => (
                  <button
                    key={level.name}
                    type="button"
                    className={trophy.value >= level.value ? "done" : ""}
                    onClick={() =>
                      setSelectedLevel((current) =>
                        current?.trophy === trophy.title && current?.name === level.name
                          ? null
                          : {
                              trophy: trophy.title,
                              name: level.name,
                              value: level.value,
                              unit: trophy.unit,
                              currentValue: trophy.value
                            }
                      )
                    }
                    title={`${level.name} : ${level.value} ${trophy.unit}`}
                  >
                    {level.name[0]}
                  </button>
                ))}
              </div>

              {selectedLevel?.trophy === trophy.title && (
                <div className="trophy-detail-final">
                  <strong>{selectedLevel.name}</strong>
                  <span>Objectif : {selectedLevel.value} {selectedLevel.unit}</span>
                  <small>Actuel : {selectedLevel.currentValue} {selectedLevel.unit}</small>
                </div>
              )}

              <div className="trophy-meta-final">
                <span>{trophy.category}</span>
                <strong>{trophy.value}/{trophy.target} {trophy.unit}</strong>
              </div>

              <div className="trophy-bar-final">
                <div style={{ width: `${trophy.progress}%` }} />
              </div>

              <div className="trophy-footer-final">
                {trophy.nextLevel ? (
                  <span>Prochain : {trophy.nextLevel.name}</span>
                ) : (
                  <span>Niveau max atteint</span>
                )}

                <strong>{trophy.progress}%</strong>
              </div>
            </article>
          ))
        ) : (
          <div className="trophies-empty-final">Aucun trophee dans ce filtre.</div>
        )}
      </section>
    </div>
  );
}
