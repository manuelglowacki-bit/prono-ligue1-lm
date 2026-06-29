import React, { useMemo, useState } from "react";

const DEFAULT_PLAYERS = [
  "Laurent",
  "Quentin",
  "Jo B",
  "Jonathan",
  "Eric L",
  "Yannis",
  "Giovani",
  "Manu",
  "David J",
  "Samuel",
];

const MATCH_KEYS = [
  "matches",
  "allMatches",
  "ligue1Matches",
  "matchs",
  "journees",
  "calendar",
  "fixtures",
  "bonusMatches",
  "adminBonusMatches",
  "bonus",
];

const PRONO_KEYS = [
  "pronos",
  "pronostics",
  "predictions",
  "userPronos",
  "userPredictions",
  "allPronos",
];

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("paris saint-germain", "psg")
    .replace("paris saint germain", "psg")
    .replace("paris sg", "psg")
    .replace("olympique de marseille", "marseille")
    .replace("om", "marseille")
    .replace("olympique lyonnais", "lyon")
    .replace("ol", "lyon")
    .replace("rc lens", "lens")
    .replace("losc lille", "lille")
    .replace("lille osc", "lille")
    .replace(/\s+/g, " ")
    .trim();
}

function flatten(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flatten(item));
  }

  if (typeof value === "object") {
    const looksLikeMatch =
      getHome(value) && getAway(value);

    const looksLikeProno =
      value.matchId ||
      value.idMatch ||
      value.match_id ||
      value.scoreDom !== undefined ||
      value.scoreExt !== undefined ||
      value.prono !== undefined ||
      value.prediction !== undefined;

    const looksLikePlayer =
      value.nom || value.name || value.pseudo || value.joueur || value.player;

    if (looksLikeMatch || looksLikeProno || looksLikePlayer) {
      return [value];
    }

    return Object.values(value).flatMap((item) => flatten(item));
  }

  return [value];
}

function getId(match) {
  return match?.id || match?.matchId || match?.idMatch || match?.match_id || "";
}

function getHome(match) {
  return (
    match?.domicile ||
    match?.home ||
    match?.equipeDomicile ||
    match?.teamHome ||
    match?.homeTeam ||
    ""
  );
}

function getAway(match) {
  return (
    match?.exterieur ||
    match?.extérieur ||
    match?.away ||
    match?.equipeExterieur ||
    match?.equipeExtérieur ||
    match?.teamAway ||
    match?.awayTeam ||
    ""
  );
}

function getRound(match) {
  return (
    match?.journee ||
    match?.journée ||
    match?.round ||
    match?.matchday ||
    match?.numeroJournee ||
    ""
  );
}

function getChampionnat(match) {
  return match?.championnat || match?.competition || match?.compétition || "Ligue 1";
}

function getScoreHome(match) {
  return (
    match?.scoreDom ??
    match?.homeScore ??
    match?.butsDomicile ??
    match?.scoreDomicile ??
    null
  );
}

function getScoreAway(match) {
  return (
    match?.scoreExt ??
    match?.awayScore ??
    match?.butsExterieur ??
    match?.butsExtérieur ??
    match?.scoreExterieur ??
    null
  );
}

function getPlayerName(player) {
  if (typeof player === "string") return player;

  return (
    player?.nom ||
    player?.name ||
    player?.pseudo ||
    player?.joueur ||
    player?.player ||
    player?.userName ||
    ""
  );
}

function getPronoPlayer(prono) {
  return (
    prono?.joueur ||
    prono?.player ||
    prono?.nom ||
    prono?.pseudo ||
    prono?.user ||
    prono?.userName ||
    prono?.participant ||
    ""
  );
}

function getPronoMatchId(prono) {
  return (
    prono?.matchId ||
    prono?.idMatch ||
    prono?.match_id ||
    prono?.match?.id ||
    prono?.id ||
    ""
  );
}

function getPronoHomeScore(prono) {
  return (
    prono?.scoreDom ??
    prono?.homeScore ??
    prono?.pronoDom ??
    prono?.domicileScore ??
    prono?.butsDomicile ??
    null
  );
}

function getPronoAwayScore(prono) {
  return (
    prono?.scoreExt ??
    prono?.awayScore ??
    prono?.pronoExt ??
    prono?.exterieurScore ??
    prono?.butsExterieur ??
    null
  );
}

function resultFromScores(home, away) {
  const h = Number(home);
  const a = Number(away);

  if (Number.isNaN(h) || Number.isNaN(a)) return "";

  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function getPronoResult(prono) {
  const home = getPronoHomeScore(prono);
  const away = getPronoAwayScore(prono);

  if (home !== null && away !== null && home !== "" && away !== "") {
    return resultFromScores(home, away);
  }

  const raw = normalize(
    prono?.resultat ||
      prono?.résultat ||
      prono?.result ||
      prono?.prono ||
      prono?.prediction ||
      ""
  );

  if (raw === "1" || raw.includes("domicile") || raw.includes("home")) return "1";
  if (raw === "2" || raw.includes("exterieur") || raw.includes("away")) return "2";
  if (raw === "n" || raw === "x" || raw.includes("nul") || raw.includes("draw")) return "N";

  return "";
}

function isBonusMatch(match) {
  const type = normalize(match?.type);
  const id = normalize(getId(match));
  const champ = normalize(getChampionnat(match));

  return (
    type.includes("bonus") ||
    id.includes("bonus") ||
    champ.includes("premier league") ||
    champ.includes("liga") ||
    champ.includes("serie a") ||
    champ.includes("bundesliga")
  );
}

function matchKey(match) {
  const id = getId(match);

  if (id) return `id:${id}`;

  return [
    normalize(getRound(match)),
    normalize(match?.date),
    normalize(match?.heure),
    normalize(getHome(match)),
    normalize(getAway(match)),
  ].join("|");
}

function collectMatches() {
  const all = MATCH_KEYS.flatMap((key) => flatten(readJson(key, [])))
    .filter((item) => getHome(item) && getAway(item));

  const seen = new Set();

  return all.filter((match) => {
    const key = matchKey(match);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectPronos() {
  return PRONO_KEYS.flatMap((key) => flatten(readJson(key, [])));
}

function collectPlayers(pronos) {
  const fromStorage = ["players", "joueurs", "users", "participants"]
    .flatMap((key) => flatten(readJson(key, [])))
    .map(getPlayerName)
    .filter(Boolean);

  const fromPronos = pronos
    .map(getPronoPlayer)
    .filter(Boolean);

  const unique = [...new Set([...fromStorage, ...fromPronos])];

  return unique.length > 0 ? unique : DEFAULT_PLAYERS;
}

function getFavoriteTeam(playerName) {
  const keys = ["favoriteTeams", "clubsFavoris", "playerFavoriteTeams"];

  for (const key of keys) {
    const data = readJson(key, null);

    if (data && typeof data === "object") {
      const direct =
        data[playerName] ||
        data[normalize(playerName)] ||
        data[String(playerName).trim()];

      if (direct) return direct;
    }
  }

  const players = ["players", "joueurs", "users", "participants"]
    .flatMap((key) => flatten(readJson(key, [])));

  const player = players.find((item) => normalize(getPlayerName(item)) === normalize(playerName));

  return (
    player?.club ||
    player?.clubFavori ||
    player?.favoriteTeam ||
    player?.team ||
    ""
  );
}

function findProno(playerName, match, pronos) {
  const id = String(getId(match) || "").trim();
  const home = normalize(getHome(match));
  const away = normalize(getAway(match));

  return pronos.find((prono) => {
    const samePlayer = normalize(getPronoPlayer(prono)) === normalize(playerName);
    if (!samePlayer) return false;

    const pronoId = String(getPronoMatchId(prono) || "").trim();

    if (id && pronoId && id === pronoId) return true;

    const pronoHome = normalize(getHome(prono));
    const pronoAway = normalize(getAway(prono));

    return pronoHome === home && pronoAway === away;
  });
}

function calculateRanking() {
  const matches = collectMatches();
  const pronos = collectPronos();
  const players = collectPlayers(pronos);

  const ranking = players.map((playerName) => {
    const favoriteTeam = getFavoriteTeam(playerName);

    return {
      joueur: playerName,
      name: playerName,
      player: playerName,
      clubFavori: favoriteTeam,
      pts: 0,
      points: 0,
      exacts: 0,
      scoresExacts: 0,
      bonsResultats: 0,
      joues: 0,
      details: [],
    };
  });

  matches.forEach((match) => {
    const scoreDom = getScoreHome(match);
    const scoreExt = getScoreAway(match);

    if (scoreDom === null || scoreExt === null || scoreDom === "" || scoreExt === "") {
      return;
    }

    const actualResult = resultFromScores(scoreDom, scoreExt);
    const bonus = isBonusMatch(match);

    ranking.forEach((player) => {
      const prono = findProno(player.joueur, match, pronos);
      if (!prono) return;

      const pronoHome = getPronoHomeScore(prono);
      const pronoAway = getPronoAwayScore(prono);
      const pronoResult = getPronoResult(prono);

      if (!pronoResult) return;

      const exact =
        pronoHome !== null &&
        pronoAway !== null &&
        Number(pronoHome) === Number(scoreDom) &&
        Number(pronoAway) === Number(scoreExt);

      const goodResult = pronoResult === actualResult;

      let earned = 0;
      let exactCount = 0;

      const fav = normalize(player.clubFavori);
      const isFavMatch =
        fav &&
        (normalize(getHome(match)).includes(fav) || normalize(getAway(match)).includes(fav));

      if (bonus) {
        if (exact) {
          earned = 3;
          exactCount = 1;
        } else if (goodResult) {
          earned = 2;
        }
      } else if (isFavMatch) {
        if (exact) {
          earned = 2;
          exactCount = 1;
        } else if (goodResult) {
          earned = 1;
        }
      } else if (goodResult) {
        earned = 1;
      }

      player.pts += earned;
      player.points = player.pts;
      player.exacts += exactCount;
      player.scoresExacts = player.exacts;

      if (goodResult) player.bonsResultats += 1;
      player.joues += 1;

      player.details.push({
        match: `${getHome(match)} - ${getAway(match)}`,
        score: `${scoreDom}-${scoreExt}`,
        prono: exact ? `${pronoHome}-${pronoAway}` : pronoResult,
        points: earned,
        exact,
        bonus,
      });
    });
  });

  ranking.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.exacts !== a.exacts) return b.exacts - a.exacts;
    return a.joueur.localeCompare(b.joueur);
  });

  return ranking.map((player, index) => ({
    ...player,
    rang: index + 1,
    position: index + 1,
  }));
}

function buildGazette(ranking) {
  if (!ranking.length) {
    return "Aucun classement disponible pour générer la gazette.";
  }

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);

  const bestExact = [...ranking].sort((a, b) => b.exacts - a.exacts)[0];

  return [
    "📰 LA GAZETTE DES PRONOS",
    "",
    `👑 Leader actuel : ${leader.joueur} avec ${leader.pts} point(s).`,
    "",
    "🏆 Podium :",
    ...podium.map((p) => `${p.rang}. ${p.joueur} — ${p.pts} pts / ${p.exacts} exact(s)`),
    "",
    `🎯 Maître des scores exacts : ${bestExact.joueur} avec ${bestExact.exacts} score(s) exact(s).`,
    "",
    "📊 Classement complet :",
    ...ranking.map((p) => `${p.rang}. ${p.joueur} — ${p.pts} pts`),
  ].join("\n");
}

export default function AdminRankingGazetteEngine() {
  const [ranking, setRanking] = useState(() => readJson("classement", []));
  const [gazette, setGazette] = useState(() => readJson("gazetteText", "") || "");
  const [message, setMessage] = useState("");

  const podium = useMemo(() => ranking.slice(0, 3), [ranking]);

  function recalculate() {
    const nextRanking = calculateRanking();
    const nextGazette = buildGazette(nextRanking);

    localStorage.setItem("ranking", JSON.stringify(nextRanking));
    localStorage.setItem("classement", JSON.stringify(nextRanking));
    localStorage.setItem("leaderboard", JSON.stringify(nextRanking));
    localStorage.setItem("gazetteText", JSON.stringify(nextGazette));
    localStorage.setItem("gazette", JSON.stringify({ text: nextGazette, updatedAt: new Date().toISOString() }));

    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new CustomEvent("ranking-updated"));
    window.dispatchEvent(new CustomEvent("gazette-updated"));

    setRanking(nextRanking);
    setGazette(nextGazette);
    setMessage(`Classement recalculé : ${nextRanking.length} joueur(s).`);

    alert("Classement + Gazette recalculés ✅");
  }

  return (
    <div className="admin-ranking-gazette-card">
      <div className="ranking-gazette-head">
        <div>
          <h3>🧠 IA classement & Gazette</h3>
          <p>
            Calcule les points avec les règles du jeu puis génère la Gazette.
            Les matchs viennent de l’import Excel et les scores peuvent être corrigés manuellement.
          </p>
        </div>

        <button onClick={recalculate}>Recalculer classement + Gazette</button>
      </div>

      {message && <p className="ranking-gazette-message">{message}</p>}

      {podium.length > 0 && (
        <div className="ranking-gazette-podium">
          {podium.map((player) => (
            <div key={player.joueur}>
              <strong>#{player.rang} {player.joueur}</strong>
              <span>{player.pts} pts — {player.exacts} exact(s)</span>
            </div>
          ))}
        </div>
      )}

      {gazette && (
        <textarea
          className="ranking-gazette-textarea"
          value={gazette}
          readOnly
          onFocus={(event) => event.target.select()}
        />
      )}
    </div>
  );
}
