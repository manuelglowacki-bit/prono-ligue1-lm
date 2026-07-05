import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CALENDAR_KEY = "admin_journees";
const PRONOS_KEY = "prono_lm_clean_pronos";
const BONUS_BY_JOURNEE_KEY = "prono_lm_bonus_selected_by_journee";
const OLD_BONUS_KEY = "prono_lm_bonus_selected";
const FAVORITE_TEAM_KEY = "favoriteTeam";
const PROFILE_PHOTO_KEY = "profilePhoto";

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
  return (
    match?.home ||
    match?.domicile ||
    match?.equipeDomicile ||
    match?.homeTeam ||
    match?.club1 ||
    match?.equipe1 ||
    ""
  );
}

function getTeamAway(match) {
  return (
    match?.away ||
    match?.exterieur ||
    match?.equipeExterieur ||
    match?.awayTeam ||
    match?.club2 ||
    match?.equipe2 ||
    ""
  );
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
      return (
        parsed.favoriteTeam ||
        parsed.club ||
        parsed.team ||
        parsed.equipe ||
        Object.values(parsed).find(Boolean) ||
        "Non choisi"
      );
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
  const correct =
    getResult1N2(realHome, realAway) === getResult1N2(pronoHome, pronoAway);

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

function sortRanking(a, b) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
  if (b.scoresExacts !== a.scoresExacts) return b.scoresExacts - a.scoresExacts;
  return String(a.playerName || "").localeCompare(String(b.playerName || ""), "fr");
}

function rate(correct, attempts) {
  if (!attempts) return 0;
  return Math.round((correct / attempts) * 100);
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 420;

        let width = img.width;
        let height = img.height;

        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }

        if (height > width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const fileInputRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [storageRows, setStorageRows] = useState([]);
  const [journees, setJournees] = useState([]);
  const [photo, setPhoto] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

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
      setMessage(err.message || "Erreur chargement profil.");
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

  const storageByUser = useMemo(() => {
    const map = {};

    storageRows.forEach((row) => {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.storage_key] = row.storage_value;
    });

    return map;
  }, [storageRows]);

  const activeProfiles = useMemo(() => {
    return profiles.filter((p) => (p.account_status || "active") === "active");
  }, [profiles]);

  const currentProfile = useMemo(() => {
    if (!currentUser?.id) return null;
    return profiles.find((p) => p.id === currentUser.id) || null;
  }, [profiles, currentUser]);

  const currentStore = currentUser?.id ? storageByUser[currentUser.id] || {} : {};

  const playerName =
    currentProfile?.player_name ||
    currentUser?.email?.split("@")[0] ||
    "Joueur";

  useEffect(() => {
    setNameDraft(playerName);
  }, [playerName]);

  useEffect(() => {
    const userPhoto = currentStore[PROFILE_PHOTO_KEY] || "";
    setPhoto(userPhoto);
  }, [currentStore]);

  function calculatePlayer(profile) {
    const store = storageByUser[profile.id] || {};
    const pronos = parseJson(store[PRONOS_KEY], {});
    const bonusByJournee = parseJson(store[BONUS_BY_JOURNEE_KEY], {});
    const oldBonus = store[OLD_BONUS_KEY] || "";
    const favoriteTeam = getFavoriteTeamValue(store[FAVORITE_TEAM_KEY]);

    let totalPoints = 0;
    let scoresExacts = 0;
    let bonsResultats = 0;
    let pronosJoues = 0;
    let bonusPoints = 0;
    let points1N2 = 0;
    let favoritePoints = 0;
    const recentDays = {};

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

          if (result.correct) bonsResultats += 1;
          if (result.exact) scoresExacts += 1;
        } else {
          if (!get1N2Prono(prono)) return;

          const result = computeNormal(match, prono);

          pronosJoues += 1;
          playedThisDay = true;

          totalPoints += result.points;
          points1N2 += result.points;
          dayPoints += result.points;

          if (result.correct) bonsResultats += 1;
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

        if (result.correct) bonsResultats += 1;
        if (result.exact) scoresExacts += 1;
      });

      if (playedThisDay) {
        recentDays[journee.number] = (recentDays[journee.number] || 0) + dayPoints;
      }
    });

    const name = profile.player_name || profile.email?.split("@")[0] || "Joueur";

    return {
      id: profile.id,
      playerName: name,
      email: profile.email,
      favoriteTeam,
      totalPoints,
      scoresExacts,
      bonsResultats,
      pronosJoues,
      bonusPoints,
      points1N2,
      favoritePoints,
      successRate: rate(bonsResultats, pronosJoues),
      lastDays: Object.entries(recentDays)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .slice(0, 3)
        .map(([journee, points]) => ({ journee, points }))
    };
  }

  const rankingStats = useMemo(() => {
    return activeProfiles
      .map(calculatePlayer)
      .sort(sortRanking)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }, [activeProfiles, storageByUser, journees]);

  const playerStats =
    rankingStats.find((item) => item.id === currentUser?.id) || {
      playerName,
      favoriteTeam: getFavoriteTeamValue(currentStore[FAVORITE_TEAM_KEY]),
      totalPoints: 0,
      scoresExacts: 0,
      bonsResultats: 0,
      pronosJoues: 0,
      bonusPoints: 0,
      points1N2: 0,
      favoritePoints: 0,
      successRate: 0,
      rank: "-",
      lastDays: []
    };

  const leaderBadges = useMemo(() => {
    const rules = [
      { icon: "🏆", title: "Machine a points", stat: "totalPoints", unit: "pts" },
      { icon: "🎯", title: "Roi du bonus", stat: "bonusPoints", unit: "pts" },
      { icon: "💎", title: "Expert exact", stat: "scoresExacts", unit: "exact" },
      { icon: "⚽", title: "Meilleur 1N2", stat: "points1N2", unit: "pts" }
    ];

    return rules
      .map((rule) => {
        const winner = [...rankingStats].sort((a, b) => {
          const statDiff = b[rule.stat] - a[rule.stat];
          if (statDiff !== 0) return statDiff;
          return b.totalPoints - a.totalPoints;
        })[0];

        if (!winner || winner.id !== currentUser?.id || winner[rule.stat] <= 0) {
          return null;
        }

        return {
          ...rule,
          value: winner[rule.stat]
        };
      })
      .filter(Boolean);
  }, [rankingStats, currentUser]);

  async function saveCustomName() {
    const cleanName = nameDraft.trim();

    if (!cleanName || !currentUser?.id) {
      setMessage("Nom invalide.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ player_name: cleanName })
      .eq("id", currentUser.id);

    if (error) {
      setMessage(error.message || "Erreur sauvegarde nom.");
      return;
    }

    setMessage("Nom affiche enregistre.");
    loadData(true);
  }

  async function resetCustomName() {
    if (!currentUser?.id) return;

    const defaultName = currentUser.email?.split("@")[0] || "Joueur";

    const { error } = await supabase
      .from("profiles")
      .update({ player_name: defaultName })
      .eq("id", currentUser.id);

    if (error) {
      setMessage(error.message || "Erreur reinitialisation nom.");
      return;
    }

    setNameDraft(defaultName);
    setMessage("Nom reinitialise.");
    loadData(true);
  }

  async function saveProfilePhoto(nextPhoto) {
    if (!currentUser?.id) return;

    setPhoto(nextPhoto);

    const { error } = await supabase
      .from("user_prono_storage")
      .upsert(
        {
          user_id: currentUser.id,
          storage_key: PROFILE_PHOTO_KEY,
          storage_value: nextPhoto,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,storage_key" }
      );

    if (error) {
      setMessage(error.message || "Erreur sauvegarde photo.");
      return;
    }

    setMessage("Photo de profil enregistree.");
    window.dispatchEvent(new Event("storage"));
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Choisis une vraie image.");
      return;
    }

    const resizedPhoto = await resizeImage(file);
    await saveProfilePhoto(resizedPhoto);

    event.target.value = "";
  }

  async function removePhoto() {
    if (!currentUser?.id) return;

    setPhoto("");

    const { error } = await supabase
      .from("user_prono_storage")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("storage_key", PROFILE_PHOTO_KEY);

    if (error) {
      setMessage(error.message || "Erreur suppression photo.");
      return;
    }

    setMessage("Photo supprimee.");
    window.dispatchEvent(new Event("storage"));
  }

  if (loading) {
    return (
      <div className="profile-page-final">
        <section className="profile-header-final">
          <h1>Fiche joueur</h1>
          <p>Chargement du profil...</p>
        </section>
      </div>
    );
  }

  return (
    <div className="profile-page-final">
      <style>{`
        .profile-page-final {
          color: #f8fafc;
        }

        .profile-header-final {
          margin-bottom: 18px;
          padding: 28px;
          border-radius: 30px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.16), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.34));
          border: 1px solid rgba(255,255,255,.10);
          box-shadow: 0 24px 70px rgba(0,0,0,.28);
        }

        .profile-header-final p:first-child {
          margin: 0 0 8px;
          color: #22c55e;
          font-weight: 950;
          letter-spacing: .12em;
          text-transform: uppercase;
          font-size: 12px;
        }

        .profile-header-final h1 {
          margin: 0;
          font-size: 40px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .profile-header-final span {
          display: block;
          margin-top: 10px;
          color: #cbd5e1;
          font-weight: 800;
        }

        .profile-hero-final {
          margin-bottom: 18px;
          display: grid;
          grid-template-columns: 330px 1fr;
          gap: 18px;
          align-items: stretch;
        }

        .profile-photo-card,
        .profile-info-card,
        .profile-card {
          padding: 22px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.22);
        }

        .profile-photo-card {
          display: grid;
          place-items: center;
          gap: 16px;
        }

        .profile-photo-main {
          width: 190px;
          height: 190px;
          border-radius: 34px;
          overflow: hidden;
          display: grid;
          place-items: center;
          background: rgba(34,197,94,.15);
          border: 1px solid rgba(34,197,94,.35);
          color: #22c55e;
          font-size: 78px;
          font-weight: 950;
        }

        .profile-photo-main img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .profile-photo-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .profile-btn {
          min-height: 46px;
          border: 0;
          border-radius: 16px;
          padding: 0 16px;
          background: #22c55e;
          color: #07111f;
          cursor: pointer;
          font-weight: 950;
        }

        .profile-btn.secondary {
          background: rgba(255,255,255,.10);
          color: #e5e7eb;
          border: 1px solid rgba(255,255,255,.15);
        }

        .profile-info-card {
          display: grid;
          gap: 16px;
        }

        .profile-name-banner {
          padding: 18px;
          border-radius: 20px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
        }

        .profile-name-banner span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          text-transform: uppercase;
          font-weight: 950;
        }

        .profile-name-banner h2 {
          margin: 4px 0 0;
          color: #ffffff;
          font-size: 30px;
          font-weight: 950;
        }

        .profile-status-pill {
          padding: 9px 13px;
          border-radius: 999px;
          background: rgba(34,197,94,.15);
          border: 1px solid rgba(34,197,94,.35);
          color: #bbf7d0;
          font-weight: 950;
        }

        .profile-identity-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .profile-identity-grid div,
        .profile-kpi {
          padding: 18px;
          border-radius: 20px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
        }

        .profile-identity-grid span,
        .profile-kpi span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
          text-transform: uppercase;
          font-weight: 950;
          margin-bottom: 8px;
        }

        .profile-identity-grid strong,
        .profile-kpi strong {
          display: block;
          color: #ffffff;
          font-size: 24px;
          font-weight: 950;
        }

        .profile-kpi small {
          display: block;
          margin-top: 8px;
          color: #22c55e;
          font-weight: 900;
        }

        .profile-kpi-grid {
          margin-bottom: 18px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .profile-bottom-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          align-items: start;
        }

        .profile-card h3 {
          margin: 0 0 14px;
          font-size: 24px;
          font-weight: 950;
        }

        .profile-card-title {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .profile-card-title span {
          color: #94a3b8;
          font-size: 12px;
          font-weight: 950;
        }

        .profile-empty {
          padding: 15px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.05);
          border: 1px dashed rgba(255,255,255,.16);
          color: #94a3b8;
          font-weight: 850;
        }

        .profile-badge-card,
        .profile-recent-row {
          display: grid;
          grid-template-columns: 46px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          margin-bottom: 10px;
        }

        .profile-badge-card strong:first-child,
        .profile-recent-row span:first-child {
          width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: rgba(186,255,0,.14);
          color: #baff00;
          font-weight: 950;
        }

        .profile-badge-card span,
        .profile-recent-row strong {
          color: #ffffff;
          font-weight: 950;
        }

        .profile-badge-card small {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-weight: 850;
        }

        .profile-name-editor {
          display: grid;
          gap: 12px;
        }

        .profile-name-editor label {
          color: #94a3b8;
          font-weight: 950;
        }

        .profile-name-editor input {
          min-height: 50px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.15);
          background: rgba(255,255,255,.08);
          color: #ffffff;
          padding: 0 14px;
          font-weight: 950;
          outline: none;
        }

        .profile-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .profile-message {
          margin-bottom: 16px;
          padding: 13px 15px;
          border-radius: 16px;
          background: rgba(186,255,0,.10);
          border: 1px solid rgba(186,255,0,.25);
          color: #ecfccb;
          font-weight: 900;
        }

        .profile-account-box {
          min-width: 0;
          overflow: hidden;
        }

        .profile-email {
          max-width: 100%;
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 17px !important;
          line-height: 1.2;
        }

        @media (max-width: 1100px) {
          .profile-hero-final,
          .profile-bottom-grid,
          .profile-kpi-grid,
          .profile-identity-grid {
            grid-template-columns: 1fr;
          }

          .profile-name-banner {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>

      <section className="profile-header-final">
        <p>Profil</p>
        <h1>Fiche joueur</h1>
        <span>Photo, statistiques, badges et preferences du compte connecte.</span>
      </section>

      {message && <div className="profile-message">{message}</div>}

      <section className="profile-hero-final">
        <article className="profile-photo-card">
          <div className="profile-photo-main">
            {photo ? (
              <img src={photo} alt={`Profil ${playerName}`} />
            ) : (
              <span>{String(playerName || "Joueur").slice(0, 1).toUpperCase()}</span>
            )}
          </div>

          <div className="profile-photo-actions">
            <button type="button" className="profile-btn" onClick={() => fileInputRef.current?.click()}>
              Changer la photo
            </button>

            {photo && (
              <button type="button" className="profile-btn secondary" onClick={removePhoto}>
                Supprimer
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              hidden
            />
          </div>
        </article>

        <article className="profile-info-card">
          <div className="profile-name-banner">
            <div>
              <span>Joueur</span>
              <h2>{playerName}</h2>
            </div>

            <div className="profile-status-pill">Profil actif</div>
          </div>

          <div className="profile-identity-grid">
            <div>
              <span>Club favori</span>
              <strong>{playerStats.favoriteTeam || "Non choisi"}</strong>
            </div>

            <div>
              <span>Classement actuel</span>
              <strong>#{playerStats.rank || "-"}</strong>
            </div>

            <div className="profile-account-box">
              <span>Compte</span>
              <strong className="profile-email">{currentUser?.email || "-"}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="profile-kpi-grid">
        <article className="profile-kpi">
          <span>Points</span>
          <strong>{playerStats.totalPoints}</strong>
          <small>Total saison</small>
        </article>

        <article className="profile-kpi">
          <span>Scores exacts</span>
          <strong>{playerStats.scoresExacts}</strong>
          <small>Favori + bonus</small>
        </article>

        <article className="profile-kpi">
          <span>Reussite</span>
          <strong>{playerStats.successRate}%</strong>
          <small>{playerStats.bonsResultats || 0}/{playerStats.pronosJoues || 0} bons</small>
        </article>

        <article className="profile-kpi">
          <span>Badges leader</span>
          <strong>{leaderBadges.length}</strong>
          <small>Attribues automatiquement</small>
        </article>
      </section>

      <section className="profile-bottom-grid">
        <article className="profile-card">
          <div className="profile-card-title">
            <h3>Badges obtenus</h3>
            <span>leaders stats</span>
          </div>

          {leaderBadges.length ? (
            leaderBadges.map((badge) => (
              <div key={badge.title} className="profile-badge-card">
                <strong>{badge.icon}</strong>
                <div>
                  <span>{badge.title}</span>
                  <small>{badge.value} {badge.unit}</small>
                </div>
                <strong>OK</strong>
              </div>
            ))
          ) : (
            <div className="profile-empty">Aucun badge leader pour le moment.</div>
          )}
        </article>

        <article className="profile-card">
          <div className="profile-card-title">
            <h3>Dernieres journees</h3>
            <span>forme recente</span>
          </div>

          {playerStats.lastDays.length ? (
            playerStats.lastDays.map((day) => (
              <div key={day.journee} className="profile-recent-row">
                <span>J{day.journee}</span>
                <strong>{day.points} pts</strong>
                <small>journee</small>
              </div>
            ))
          ) : (
            <div className="profile-empty">Aucun resultat enregistre.</div>
          )}
        </article>

        <article className="profile-card">
          <div className="profile-card-title">
            <h3>Preferences joueur</h3>
            <span>identite</span>
          </div>

          <div className="profile-name-editor">
            <label>Nom affiche</label>

            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Nom affiche"
            />

            <div className="profile-actions">
              <button type="button" className="profile-btn" onClick={saveCustomName}>
                Enregistrer
              </button>

              <button type="button" className="profile-btn secondary" onClick={resetCustomName}>
                Reinitialiser
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
