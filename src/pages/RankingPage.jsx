import React, { useEffect, useMemo, useState } from "react";
import "../styles/ranking.css";
import { supabase } from "../lib/supabaseClient";
import { getDisplayName } from "../utils/displayNames";
import PlayerBadges from "../components/PlayerBadges";
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
  if (!prono?.result || !hasScore(match)) return 0;

  const realResult = getResult1N2(getScoreHome(match), getScoreAway(match));

  return prono.result === realResult ? 1 : 0;
}

function computeExactModePoints(match, prono, type) {
  if (!prono || !hasScore(match)) {
    return { points: 0, exact: 0 };
  }

  const realHome = Number(getScoreHome(match));
  const realAway = Number(getScoreAway(match));
  const pronoHome = Number(prono.homeScore ?? prono.home);
  const pronoAway = Number(prono.awayScore ?? prono.away);

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
    (sameClub(match.home, favoriteTeam) || sameClub(match.away, favoriteTeam))
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

function getRankIcon(index) {
  if (index === 0) return "1";
  if (index === 1) return "2";
  if (index === 2) return "3";
  return index + 1;
}

function getEvolutionLabel(evo) {
  if (evo > 0) return `+${evo}`;
  if (evo < 0) return `${evo}`;
  return "0";
}

function getEvolutionClass(evo) {
  if (evo > 0) return "up";
  if (evo < 0) return "down";
  return "same";
}

function sortRanking(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  if (b.specialExacts !== a.specialExacts) return b.specialExacts - a.specialExacts;
  return String(a.playerName || "").localeCompare(String(b.playerName || ""), "fr");
}

export default function RankingPage() {
  const [journees, setJournees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [storageRows, setStorageRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadRankingData() {
    setLoading(true);
    setMessage("");

    try {
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
      setMessage(err.message || "Erreur chargement classement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRankingData();
  }, []);

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

  const storageByUser = useMemo(() => {
    const map = {};

    storageRows.forEach((row) => {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.storage_key] = row.storage_value;
    });

    return map;
  }, [storageRows]);

  function calculatePlayer(profile, onlyBeforeLast = false) {
    const store = storageByUser[profile.id] || {};
    const pronos = parseJson(store[PRONOS_KEY], {});
    const bonusByJournee = parseJson(store[BONUS_BY_JOURNEE_KEY], {});
    const oldBonus = store[OLD_BONUS_KEY] || "";
    const favoriteTeam = store[FAVORITE_TEAM_KEY] || "Non choisi";

    let total = 0;
    let favoriteExact = 0;
    let bonusExact = 0;
    let lastPoints = 0;

    journees.forEach((journee) => {
      const isLast = Number(journee.number) === Number(lastJournee);
      if (onlyBeforeLast && isLast) return;

      const playerJourneePronos = pronos[journee.id] || {};

      (journee.matches || []).forEach((match) => {
        if (!hasScore(match)) return;

        const prono = playerJourneePronos[match.id];
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
        if (selectedBonusId !== match.id) return;

        const prono = playerJourneePronos[match.id];
        const result = computeExactModePoints(match, prono, "bonus");

        total += result.points;
        bonusExact += result.exact;
        if (isLast) lastPoints += result.points;
      });
    });

    const playerName = profile.player_name || profile.email?.split("@")[0] || "Joueur";

    return {
      player: playerName,
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

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);
  const leaderPoints = leader?.total || 0;

  const bestLastDay = ranking.reduce((best, player) => {
    if (!best || player.lastPoints > best.lastPoints) return player;
    return best;
  }, null);

  const bestProgress = ranking.reduce((best, player) => {
    if (!best || player.evolution > best.evolution) return player;
    return best;
  }, null);

  if (loading) {
    return (
      <div className="ranking-page">
        <section className="ranking-header">
          <div>
            <p>CLASSEMENT</p>
            <h1>Classement general</h1>
            <span>Chargement du classement automatique...</span>
          </div>
        </section>
      </div>
    );
  }

  if (message) {
    return (
      <div className="ranking-page">
        <section className="ranking-header">
          <div>
            <p>CLASSEMENT</p>
            <h1>Classement general</h1>
            <span>{message}</span>
          </div>
        </section>
      </div>
    );
  }

  if (journees.length === 0) {
    return (
      <div className="ranking-page">
        <section className="ranking-header">
          <div>
            <p>CLASSEMENT</p>
            <h1>Classement general</h1>
            <span>Aucun calendrier charge.</span>
          </div>
        </section>

        <div className="ranking-empty">
          Va dans Admin, importe les matchs puis sauvegarde le calendrier en ligne.
        </div>
      </div>
    );
  }

  return (
    <div className="ranking-page">
      <section className="ranking-header">
        <div>
          <p>CLASSEMENT</p>
          <h1>Classement general</h1>
          <span>
            Journee analysee : J{lastJournee} - {ranking.length} joueurs
          </span>
        </div>

        <div className="ranking-header-badge">
          {leader ? `Leader : ${leader.playerName}` : "Aucun leader"}
        </div>
      </section>

      <section className="ranking-kpis">
        <article>
          <span>Leader</span>
          <strong>{leader?.playerName || "-"}</strong>
          <small>{leader?.total || 0} pts</small>
        </article>

        <article>
          <span>Meilleure J{lastJournee}</span>
          <strong>{bestLastDay?.playerName || "-"}</strong>
          <small>+{bestLastDay?.lastPoints || 0} pts</small>
        </article>

        <article>
          <span>Progression</span>
          <strong>{bestProgress?.playerName || "-"}</strong>
          <small>{getEvolutionLabel(bestProgress?.evolution || 0)} place(s)</small>
        </article>
      </section>

      <section className="ranking-podium">
        {podium.map((player, index) => (
          <article key={player.playerName} className={`podium-card rank-${index + 1}`}>
            <div className="podium-medal">{getRankIcon(index)}</div>

            <div className="podium-player-photo">
              <ProfileAvatar player={player.playerName} size={58} />
            </div>

            <h2>{getDisplayName(player.playerName)}</h2>
            <strong>{player.total} pts</strong>
            <span>{player.specialExacts} exact(s) bonus/favori</span>
          </article>
        ))}
      </section>

      <section className="ranking-table-card">
        <div className="ranking-table-title">
          <h2>Tableau complet</h2>
          <span>Departage : points puis exacts bonus/favori</span>
        </div>

        <div className="ranking-table">
          <div className="ranking-row ranking-row-head">
            <span>Place</span>
            <span>Evo</span>
            <span>Joueur</span>
            <span>Points</span>
            <span>Exacts bonus/favori</span>
            <span>J{lastJournee}</span>
            <span>Ecart leader</span>
          </div>

          {ranking.map((player, index) => {
            const gap = leaderPoints - player.total;

            return (
              <div key={player.playerName} className="ranking-row">
                <span className="rank-place">{getRankIcon(index)}</span>

                <span className={`rank-evo ${getEvolutionClass(player.evolution)}`}>
                  {getEvolutionLabel(player.evolution)}
                </span>

                <span className="rank-player">
                  <span className="rank-player-name">
                    <ProfileAvatar player={player.playerName} size={28} />
                    <span>{getDisplayName(player.playerName)}</span>
                  </span>

                  <PlayerBadges player={player.playerName} compact />
                </span>

                <span className="rank-points">{player.total} pts</span>

                <span className="rank-exacts">{player.specialExacts}</span>

                <span className="rank-last">+{player.lastPoints}</span>

                <span className="rank-gap">
                  {gap === 0 ? "Leader" : `-${gap} pts`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

