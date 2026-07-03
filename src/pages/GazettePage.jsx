import React, { useEffect, useMemo, useState } from "react";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;

  if (Array.isArray(value?.ranking)) return value.ranking;
  if (Array.isArray(value?.classement)) return value.classement;
  if (Array.isArray(value?.players)) return value.players;
  if (Array.isArray(value?.joueurs)) return value.joueurs;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.profiles)) return value.profiles;

  return [];
}

function getName(player) {
  return (
    player?.name ||
    player?.displayName ||
    player?.player ||
    player?.joueur ||
    player?.pseudo ||
    player?.username ||
    player?.nom ||
    player?.p ||
    ""
  );
}

function getPoints(player) {
  const value =
    player?.points ??
    player?.pts ??
    player?.total ??
    player?.totalPoints ??
    player?.score ??
    player?.seasonPoints ??
    player?.pointsTotal ??
    0;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getExact(player) {
  const value =
    player?.exact ??
    player?.exacts ??
    player?.scoresExact ??
    player?.scoresExacts ??
    player?.scoreExact ??
    player?.exactScores ??
    player?.perfectScores ??
    0;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getPreviousRank(player) {
  const value =
    player?.previousRank ??
    player?.oldRank ??
    player?.lastRank ??
    player?.rankBefore ??
    player?.previousPlace ??
    player?.oldPlace ??
    player?.anciennePlace ??
    player?.lastPlace;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getRank(player) {
  const value =
    player?.rank ??
    player?.place ??
    player?.position ??
    player?.classement ??
    player?.currentRank ??
    player?.currentPlace;

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function looksLikePlayer(item) {
  if (!item || typeof item !== "object") return false;

  const name = getName(item);
  const hasPoints =
    item.points !== undefined ||
    item.pts !== undefined ||
    item.total !== undefined ||
    item.totalPoints !== undefined ||
    item.score !== undefined ||
    item.seasonPoints !== undefined ||
    item.pointsTotal !== undefined;

  return Boolean(name) && hasPoints;
}

function collectArraysFromObject(value, depth = 0) {
  if (depth > 3 || !value || typeof value !== "object") return [];

  let found = [];

  if (Array.isArray(value)) {
    if (value.some(looksLikePlayer)) found.push(value);
    return found;
  }

  for (const key of Object.keys(value)) {
    const child = value[key];

    if (Array.isArray(child) && child.some(looksLikePlayer)) {
      found.push(child);
    } else if (child && typeof child === "object") {
      found = found.concat(collectArraysFromObject(child, depth + 1));
    }
  }

  return found;
}

function findRankingData() {
  const priorityKeys = [
    "ranking",
    "classement",
    "classement_joueurs",
    "players_ranking",
    "ranking_players",
    "prono_ranking",
    "admin_ranking",
    "home_ranking",
    "players",
    "joueurs",
    "prono_players",
    "user_profiles",
    "profiles",
    "profile_players"
  ];

  for (const key of priorityKeys) {
    const data = readJson(key, null);
    const array = asArray(data);

    if (array.some(looksLikePlayer)) {
      return array;
    }

    const nested = collectArraysFromObject(data);
    if (nested.length) return nested[0];
  }

  let best = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const data = readJson(key, null);
    const direct = asArray(data);

    if (direct.some(looksLikePlayer) && direct.length > best.length) {
      best = direct;
    }

    const nested = collectArraysFromObject(data);
    for (const array of nested) {
      if (array.length > best.length) {
        best = array;
      }
    }
  }

  return best;
}

function buildRanking() {
  const raw = findRankingData();

  const normalized = raw
    .map((player) => ({
      name: getName(player),
      points: getPoints(player),
      exact: getExact(player),
      previousRank: getPreviousRank(player),
      originalRank: getRank(player),
      club: player?.club || player?.favoriteTeam || player?.team || player?.equipe || ""
    }))
    .filter((player) => player.name)
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name))
    .map((player, index) => {
      const rank = index + 1;
      const previousRank = player.previousRank || player.originalRank || null;
      const evolution = previousRank ? previousRank - rank : 0;

      return {
        ...player,
        rank,
        previousRank,
        evolution
      };
    });

  return normalized;
}

function moveText(value) {
  if (value > 0) return "+" + value;
  if (value < 0) return String(value);
  return "0";
}

function moveClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

function moveWord(value) {
  if (value > 0) return "progresse";
  if (value < 0) return "recule";
  return "reste stable";
}

function buildArticle(ranking) {
  if (!ranking.length) {
    return {
      title: "Aucun classement trouvé pour le moment",
      lead:
        "Dès que le classement sera alimenté, la Gazette affichera automatiquement le leader, le podium, les joueurs qui montent et ceux qui reculent.",
      analysis:
        "Va d'abord dans la page Classement ou sauvegarde les données joueurs."
    };
  }

  const leader = ranking[0];
  const second = ranking[1];
  const third = ranking[2];

  const bestRise = ranking
    .filter((player) => player.evolution > 0)
    .sort((a, b) => b.evolution - a.evolution)[0];

  const biggestFall = ranking
    .filter((player) => player.evolution < 0)
    .sort((a, b) => a.evolution - b.evolution)[0];

  const gap = second ? leader.points - second.points : 0;

  let title = `${leader.name} garde la main sur la course au titre`;
  let lead = `${leader.name} mène le classement avec ${leader.points} points.`;

  if (second) {
    lead += ` Derrière, ${second.name} reste en embuscade à ${gap} point(s).`;
  }

  if (third) {
    lead += ` Le podium est complété par ${third.name}, toujours bien placé.`;
  }

  let analysis = "La journée confirme que la régularité fait la différence.";

  if (bestRise) {
    analysis += ` Le gros coup vient de ${bestRise.name}, qui ${moveWord(bestRise.evolution)} de ${Math.abs(bestRise.evolution)} place(s).`;
  }

  if (biggestFall) {
    analysis += ` Attention à ${biggestFall.name}, qui perd ${Math.abs(biggestFall.evolution)} place(s) et devra réagir vite.`;
  }

  if (!bestRise && !biggestFall) {
    analysis += " Pour le moment, aucune évolution de place n'est enregistrée, mais le prochain résultat peut déjà tout changer.";
  }

  return { title, lead, analysis };
}

export default function GazettePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    function refresh() {
      setRefreshKey((value) => value + 1);
    }

    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const ranking = useMemo(() => buildRanking(), [refreshKey]);
  const article = useMemo(() => buildArticle(ranking), [ranking]);

  const leader = ranking[0];
  const podium = ranking.slice(0, 3);
  const rises = ranking.filter((p) => p.evolution > 0).sort((a, b) => b.evolution - a.evolution).slice(0, 3);
  const falls = ranking.filter((p) => p.evolution < 0).sort((a, b) => a.evolution - b.evolution).slice(0, 3);
  const fullRanking = ranking.slice(0, 10);

  return (
    <div className="gazette-page">
      <style>{`
        .gazette-page {
          color: #ffffff;
          padding: 4px;
        }

        .gazette-hero {
          margin-bottom: 22px;
          padding: 30px;
          border-radius: 30px;
          background:
            radial-gradient(circle at top left, rgba(186,255,0,.18), transparent 34%),
            linear-gradient(135deg, rgba(15,23,42,.98), rgba(29,78,216,.38));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 18px 45px rgba(0,0,0,.28);
        }

        .gazette-kicker {
          color: #baff00;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: .16em;
          font-size: 13px;
          margin-bottom: 10px;
        }

        .gazette-hero-row {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-end;
        }

        .gazette-hero h1 {
          margin: 0;
          font-size: 42px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -.05em;
        }

        .gazette-hero p {
          margin: 12px 0 0;
          color: #cbd5e1;
          font-weight: 800;
        }

        .gazette-season {
          text-align: right;
          color: #dbeafe;
          font-weight: 950;
        }

        .gazette-grid {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 18px;
        }

        .gazette-card {
          padding: 22px;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(20,32,51,.96), rgba(11,18,32,.98));
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 38px rgba(0,0,0,.24);
        }

        .gazette-card h2 {
          margin: 0 0 12px;
          font-size: 24px;
          font-weight: 950;
          letter-spacing: -.04em;
        }

        .gazette-card p {
          margin: 0;
          color: #cbd5e1;
          line-height: 1.55;
          font-weight: 750;
        }

        .gazette-big-title {
          font-size: 32px !important;
          line-height: 1.05;
        }

        .gazette-lead {
          margin-top: 14px !important;
          font-size: 17px;
        }

        .gazette-rank-list {
          display: grid;
          gap: 10px;
        }

        .gazette-rank-row {
          display: grid;
          grid-template-columns: 48px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.08);
        }

        .gazette-place {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          background: rgba(186,255,0,.15);
          color: #baff00;
          display: grid;
          place-items: center;
          font-size: 20px;
          font-weight: 950;
        }

        .gazette-player {
          font-weight: 950;
          color: #ffffff;
        }

        .gazette-sub {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 850;
        }

        .gazette-points {
          color: #d9ff66;
          font-weight: 950;
          white-space: nowrap;
        }

        .gazette-move {
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 950;
          background: rgba(255,255,255,.08);
          color: #cbd5e1;
        }

        .gazette-move.up {
          color: #86efac;
          background: rgba(34,197,94,.15);
          border: 1px solid rgba(34,197,94,.28);
        }

        .gazette-move.down {
          color: #fca5a5;
          background: rgba(239,68,68,.14);
          border: 1px solid rgba(239,68,68,.26);
        }

        .gazette-empty {
          padding: 18px;
          border-radius: 20px;
          background: rgba(186,255,0,.08);
          border: 1px solid rgba(186,255,0,.22);
          color: #d9ff66;
          font-weight: 900;
        }

        .gazette-bottom {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .gazette-top10 {
          margin-top: 18px;
        }

        @media (max-width: 1000px) {
          .gazette-grid,
          .gazette-bottom {
            grid-template-columns: 1fr;
          }

          .gazette-hero-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .gazette-season {
            text-align: left;
          }
        }
      `}</style>

      <section className="gazette-hero">
        <div className="gazette-kicker">Edition spéciale classement</div>

        <div className="gazette-hero-row">
          <div>
            <h1>La Gazette des Pronos</h1>
            <p>Le journal sportif qui raconte l'évolution du classement journée après journée.</p>
          </div>

          <div className="gazette-season">
            Saison 2026/2027<br />
            Analyse sportive
          </div>
        </div>
      </section>

      {!ranking.length ? (
        <div className="gazette-card">
          <h2 className="gazette-big-title">{article.title}</h2>
          <p className="gazette-lead">{article.lead}</p>

          <div className="gazette-empty" style={{ marginTop: 18 }}>
            {article.analysis}
          </div>
        </div>
      ) : (
        <>
          <div className="gazette-grid">
            <main className="gazette-card">
              <h2 className="gazette-big-title">{article.title}</h2>
              <p className="gazette-lead">{article.lead}</p>

              <div className="gazette-empty" style={{ marginTop: 18 }}>
                {article.analysis}
              </div>
            </main>

            <aside className="gazette-card">
              <h2>Podium actuel</h2>

              <div className="gazette-rank-list">
                {podium.map((player) => (
                  <div className="gazette-rank-row" key={player.name}>
                    <div className="gazette-place">{player.rank}</div>

                    <div>
                      <div className="gazette-player">{player.name}</div>
                      <div className="gazette-sub">{player.exact} score(s) exact(s)</div>
                    </div>

                    <div className="gazette-points">{player.points} pts</div>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className="gazette-bottom">
            <div className="gazette-card">
              <h2>Leader actuel</h2>

              <div className="gazette-rank-row">
                <div className="gazette-place">1</div>
                <div>
                  <div className="gazette-player">{leader.name}</div>
                  <div className="gazette-sub">Patron du classement</div>
                </div>
                <div className="gazette-points">{leader.points} pts</div>
              </div>
            </div>

            <div className="gazette-card">
              <h2>Ceux qui montent</h2>

              <div className="gazette-rank-list">
                {rises.length ? (
                  rises.map((player) => (
                    <div className="gazette-rank-row" key={player.name}>
                      <div className="gazette-place">{player.rank}</div>
                      <div className="gazette-player">{player.name}</div>
                      <div className={`gazette-move ${moveClass(player.evolution)}`}>
                        {moveText(player.evolution)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="gazette-empty">Pas encore d'évolution positive enregistrée.</div>
                )}
              </div>
            </div>

            <div className="gazette-card">
              <h2>Ceux qui reculent</h2>

              <div className="gazette-rank-list">
                {falls.length ? (
                  falls.map((player) => (
                    <div className="gazette-rank-row" key={player.name}>
                      <div className="gazette-place">{player.rank}</div>
                      <div className="gazette-player">{player.name}</div>
                      <div className={`gazette-move ${moveClass(player.evolution)}`}>
                        {moveText(player.evolution)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="gazette-empty">Aucune chute marquante pour l'instant.</div>
                )}
              </div>
            </div>
          </div>

          <div className="gazette-card gazette-top10">
            <h2>Top 10 du classement</h2>

            <div className="gazette-rank-list">
              {fullRanking.map((player) => (
                <div className="gazette-rank-row" key={player.name}>
                  <div className="gazette-place">{player.rank}</div>

                  <div>
                    <div className="gazette-player">{player.name}</div>
                    <div className="gazette-sub">
                      {player.exact} exact(s)
                      {player.previousRank ? ` · avant ${player.previousRank}e` : ""}
                    </div>
                  </div>

                  <div className="gazette-points">{player.points} pts</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

